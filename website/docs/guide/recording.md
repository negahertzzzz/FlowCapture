---
sidebar_position: 1
title: Recording
---

# Recording

FlowCapture records structured session data, not just a video file.

## What gets captured

| Signal | Examples |
| --- | --- |
| Screen | Frames / video (platform-dependent) |
| Mouse | Clicks, scrolls, position |
| Keyboard | Key presses (with redaction options) |
| Windows | Open, close, focus changes |
| Screenshots | On clicks, window changes, manual marks |

## Starting and stopping

- **Start Recording** from Home begins a new session.
- The floating overlay provides **Mark Step**, **Screenshot**, and **Stop**.
- Stopping finalizes the session and returns you to the session detail view.

## Manual marks

Use **Mark Step** when you want the AI to treat a moment as a explicit step boundary — useful before long waits or off-screen work.

Shortcut: `Cmd+Shift+M` (macOS) / `Ctrl+Shift+M` (Windows/Linux).

## Platform behavior

| Platform | Video | Notes |
| --- | --- | --- |
| macOS | In-app screen recording ~15 fps | Uses Screen Recording permission |
| Windows | ffmpeg MP4 when available | Periodic frame capture |
| Linux | ffmpeg MP4 when available | PipeWire/X11 dependent |

## Tips for better docs

1. **Narrate with actions** — click deliberately, pause briefly after important steps.
2. **One workflow per session** — avoid unrelated detours.
3. **Mark steps** at phase changes (install → configure → verify).
4. **Close unrelated windows** to reduce timeline noise.

Next: [Sessions & Timeline](./sessions-and-timeline)
