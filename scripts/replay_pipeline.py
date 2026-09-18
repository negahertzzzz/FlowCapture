#!/usr/bin/env python3
"""
FlowCapture Pipeline Replay Harness

Reads stored session data (events + audio segments) from the SQLite database
and replays the deterministic alignment + LLM call pipeline with arbitrary prompt
variants — without needing to re-record sessions.

Usage:
    python replay_pipeline.py --session <session_id> [options]

Examples:
    # List available sessions
    python replay_pipeline.py --list

    # Replay a session with default settings
    python replay_pipeline.py --session abc123

    # Replay with a custom prompt override file
    python replay_pipeline.py --session abc123 --prompt-file my_prompt.txt

    # Replay and save output to a file
    python replay_pipeline.py --session abc123 --output result.md
"""

import argparse
import json
import os
import platform
import sqlite3
import sys
from pathlib import Path
from typing import Optional


# ────────────────────────────────────────────────────────────────────────────
# Locate the FlowCapture SQLite database
# ────────────────────────────────────────────────────────────────────────────

def get_default_db_path() -> Path:
    system = platform.system()
    if system == "Windows":
        base = Path(os.environ.get("APPDATA", "~")).expanduser()
        return base / "com.flowcapture.app" / "flowcapture.db"
    elif system == "Darwin":
        return Path("~/Library/Application Support/com.flowcapture.app/flowcapture.db").expanduser()
    else:
        return Path("~/.local/share/com.flowcapture.app/flowcapture.db").expanduser()


# ────────────────────────────────────────────────────────────────────────────
# Database helpers
# ────────────────────────────────────────────────────────────────────────────

def open_db(db_path: Path) -> sqlite3.Connection:
    if not db_path.exists():
        print(f"[ERROR] Database not found at {db_path}", file=sys.stderr)
        print("  Use --db to specify a custom path.", file=sys.stderr)
        sys.exit(1)
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    return conn


def list_sessions(conn: sqlite3.Connection):
    cur = conn.execute(
        "SELECT id, title, status, started_at, audio_transcript IS NOT NULL as has_audio, "
        "audio_segments_json IS NOT NULL as has_segments "
        "FROM sessions ORDER BY started_at DESC LIMIT 20"
    )
    rows = cur.fetchall()
    print(f"\n{'ID':<38} {'Title':<35} {'Status':<12} {'Audio':<6} {'Segs':<5} Started")
    print("-" * 110)
    for r in rows:
        print(
            f"{r['id']:<38} {r['title'][:34]:<35} {r['status']:<12} "
            f"{'yes' if r['has_audio'] else 'no':<6} {'yes' if r['has_segments'] else 'no':<5} {r['started_at']}"
        )


def load_session(conn: sqlite3.Connection, session_id: str) -> dict:
    cur = conn.execute(
        "SELECT id, title, audio_transcript, audio_segments_json, compressed_events_json "
        "FROM sessions WHERE id = ?", (session_id,)
    )
    row = cur.fetchone()
    if not row:
        print(f"[ERROR] Session '{session_id}' not found.", file=sys.stderr)
        sys.exit(1)
    return dict(row)


def load_events(conn: sqlite3.Connection, session_id: str) -> list:
    cur = conn.execute(
        "SELECT event_type, app_name, payload, timestamp_ms FROM events "
        "WHERE session_id = ? ORDER BY timestamp_ms ASC LIMIT 120",
        (session_id,)
    )
    rows = cur.fetchall()
    result = []
    for r in rows:
        try:
            payload = json.loads(r["payload"])
        except Exception:
            payload = {}
        result.append({
            "event_type": r["event_type"],
            "app": r["app_name"],
            "payload": payload,
            "timestamp_ms": r["timestamp_ms"],
        })
    return result


# ────────────────────────────────────────────────────────────────────────────
# Alignment: deterministic audio-event pairing (mirrors Rust logic)
# ────────────────────────────────────────────────────────────────────────────

def align_audio_to_events(events: list, segments: list,
                           pre_ms: int = 3000, post_ms: int = 2000) -> list:
    """
    For each event, find audio segments whose time window overlaps
    [event_offset_ms - pre_ms, event_offset_ms + post_ms]. Mirrors align_audio_to_events() in pipeline.rs.
    """
    if not events:
        return []

    first_ts = events[0].get("timestamp_ms", 0)
    is_epoch = first_ts > 1_000_000_000_000
    t0 = first_ts if is_epoch else 0

    aligned = []
    for event in events:
        ts = event["timestamp_ms"]
        offset_ms = (ts - t0) if is_epoch else ts
        window_start = max(0, offset_ms - pre_ms)
        window_end = offset_ms + post_ms
        nearby = [
            seg["text"]
            for seg in segments
            if seg["start_ms"] <= window_end and seg["end_ms"] >= window_start
        ]
        aligned.append({**event, "nearby_audio": nearby})
    return aligned


# ────────────────────────────────────────────────────────────────────────────
# LLM call helpers
# ────────────────────────────────────────────────────────────────────────────

def call_openai(api_key: str, base_url: str, model: str,
                system: str, prompt: str) -> str:
    """Call an OpenAI-compatible chat endpoint."""
    import urllib.request
    payload = json.dumps({
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.3,
    }).encode()
    req = urllib.request.Request(
        f"{base_url.rstrip('/')}/chat/completions",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        data = json.loads(resp.read())
    return data["choices"][0]["message"]["content"]


# ────────────────────────────────────────────────────────────────────────────
# Prompt building (mirrors pipeline.rs prompt logic)
# ────────────────────────────────────────────────────────────────────────────

PROMPT_VERSION = "v2"

DEFAULT_SYSTEM = (
    "You consolidate noisy desktop recordings into concise, instructive workflow steps. "
    "Return a JSON array ONLY. Each element must have exactly these fields: "
    "step (integer), title (string), description (string), reason (string or null), timestamp_ms (integer). "
    "Rules: "
    "- Merge duplicate navigation and repeated clicks. Keep at most 15 steps. "
    "- 'description': explain WHAT to do, WHERE (app/window/UI element), and HOW. "
    "- 'reason': explain WHY this step is needed in the overall workflow, using the spoken audio if available. "
    "  If no reason can be inferred, set reason to null. "
    "- When pre-aligned audio is provided, use 'nearby_audio' phrases to fill 'reason'. "
    "- Do not invent actions not supported by the events. Do not use placeholders."
)


def build_audio_section(transcript: Optional[str], aligned: Optional[list]) -> str:
    if aligned:
        with_audio = [e for e in aligned if e.get("nearby_audio")]
        if with_audio:
            pairs = [
                {
                    "event_type": e["event_type"],
                    "app": e["app"],
                    "timestamp_ms": e["timestamp_ms"],
                    "nearby_audio": e["nearby_audio"],
                }
                for e in with_audio
            ]
            return (
                "\nPre-aligned Audio-Event pairs "
                "(audio already matched to the nearest event by timestamp):\n"
                + json.dumps(pairs, indent=2, ensure_ascii=False)
                + "\n\n"
            )
    if transcript and transcript.strip():
        return f'\nUser\'s Spoken Microphone Explanation:\n"""\n{transcript.strip()}\n"""\n'
    return ""


# ────────────────────────────────────────────────────────────────────────────
# Main replay logic
# ────────────────────────────────────────────────────────────────────────────

def replay(args):
    db_path = Path(args.db) if args.db else get_default_db_path()
    conn = open_db(db_path)

    if args.list:
        list_sessions(conn)
        return

    if not args.session:
        print("[ERROR] --session <id> is required (or use --list to browse sessions).", file=sys.stderr)
        sys.exit(1)

    session = load_session(conn, args.session)
    events = load_events(conn, args.session)

    print(f"\n[INFO] Session: {session['id']}")
    print(f"       Title:   {session['title']}")
    print(f"       Events:  {len(events)}")

    # Load audio segments
    segments = []
    if session["audio_segments_json"]:
        segments = json.loads(session["audio_segments_json"])
        print(f"       Segments: {len(segments)} timed audio segments loaded from DB")
    else:
        print("       Segments: none stored (old session or cloud transcription)")

    transcript = session.get("audio_transcript") or ""

    # Deterministic alignment
    aligned = None
    if segments:
        aligned = align_audio_to_events(events, segments, args.pre_ms, args.post_ms)
        matched = sum(1 for e in aligned if e["nearby_audio"])
        print(f"       Aligned:  {matched}/{len(aligned)} events have nearby audio")

    # Build prompt
    audio_section = build_audio_section(transcript, aligned)
    system_prompt = DEFAULT_SYSTEM
    if args.prompt_file:
        system_prompt = Path(args.prompt_file).read_text(encoding="utf-8")
        print(f"       Prompt:   loaded from {args.prompt_file}")
    else:
        print(f"       Prompt:   built-in {PROMPT_VERSION}")

    user_prompt = (
        f"Session title: {session['title']}\n"
        f"{audio_section}"
        f"Events:\n{json.dumps(events, indent=2, ensure_ascii=False)}"
    )

    print("\n[INFO] Calling LLM...")
    api_key = args.api_key or os.environ.get("OPENAI_API_KEY", "not-needed")
    base_url = args.base_url or "https://api.openai.com/v1"
    model = args.model or "gpt-4o-mini"

    try:
        response = call_openai(api_key, base_url, model, system_prompt, user_prompt)
    except Exception as e:
        print(f"[ERROR] LLM call failed: {e}", file=sys.stderr)
        sys.exit(1)

    print(f"[INFO] Response received ({len(response)} chars)")

    # Parse and pretty-print
    try:
        start = response.find("[")
        end = response.rfind("]")
        steps = json.loads(response[start:end + 1]) if start != -1 else []
        print(f"\n[RESULT] {len(steps)} steps parsed:\n")
        for step in steps:
            reason = step.get("reason") or "(no reason)"
            print(f"  Step {step.get('step', '?')}: {step.get('title', '?')}")
            print(f"    Desc:   {step.get('description', '')}")
            print(f"    Reason: {reason}")
            print()
    except Exception:
        print("[WARN] Could not parse steps JSON, showing raw response:")
        print(response)

    if args.output:
        Path(args.output).write_text(response, encoding="utf-8")
        print(f"[INFO] Raw response saved to {args.output}")


# ────────────────────────────────────────────────────────────────────────────
# CLI
# ────────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="FlowCapture pipeline replay harness",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("--list", action="store_true", help="List recent sessions and exit")
    parser.add_argument("--session", metavar="ID", help="Session ID to replay")
    parser.add_argument("--db", metavar="PATH", help="Path to flowcapture.db (default: auto-detect)")
    parser.add_argument("--api-key", metavar="KEY", help="OpenAI API key (or set OPENAI_API_KEY env var)")
    parser.add_argument("--base-url", metavar="URL", help="LLM base URL (default: https://api.openai.com/v1)")
    parser.add_argument("--model", metavar="MODEL", help="LLM model name (default: gpt-4o-mini)")
    parser.add_argument("--prompt-file", metavar="FILE", help="Path to a custom system prompt text file")
    parser.add_argument("--output", metavar="FILE", help="Save LLM raw response to this file")
    parser.add_argument("--pre-ms", type=int, default=3000, help="Audio alignment pre-window in ms (default: 3000)")
    parser.add_argument("--post-ms", type=int, default=2000, help="Audio alignment post-window in ms (default: 2000)")
    args = parser.parse_args()
    replay(args)


if __name__ == "__main__":
    main()
