import { convertFileSrc } from "@tauri-apps/api/core";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { ProcessingPanel } from "@/components/ai/ProcessingPanel";
import { MarkdownPreview } from "@/components/documentation/MarkdownPreview";
import { ExportPanel } from "@/components/export/ExportPanel";
import { AppButton } from "@/components/ui/AppButton";
import { Icon } from "@/components/ui/Icon";
import { Toast } from "@/components/ui/Toast";
import { useSessionTitle } from "@/hooks/useSessionTitle";
import {
  api,
  type ExportOptionsPayload,
  type ExportRecord,
  type RedactionSummary,
  type Session,
  type SessionEvent,
  type Screenshot,
  type WorkflowStep,
} from "@/lib/api";
import { timelineIcon } from "@/lib/icons";
import { formatDuration } from "@/lib/utils";

const TABS = [
  "Timeline",
  "Screenshots",
  "Documentation",
  "Replay",
  "Recording",
  "Exports",
] as const;

type TabName = (typeof TABS)[number];

export function SessionPage() {
  const { sessionId = "" } = useParams();
  const [session, setSession] = useState<Session | null>(null);
  const [events, setEvents] = useState<SessionEvent[]>([]);
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
  const [exports, setExports] = useState<ExportRecord[]>([]);
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [markdown, setMarkdown] = useState("");
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [redactionSummary, setRedactionSummary] = useState<RedactionSummary | null>(null);
  const [activeStage, setActiveStage] = useState<string | null>(null);
  const [completedStages, setCompletedStages] = useState<string[]>([]);
  const [failedStage, setFailedStage] = useState<string | null>(null);
  const [replayIndex, setReplayIndex] = useState(0);
  const [tab, setTab] = useState<TabName>("Timeline");
  const [docMode, setDocMode] = useState<"preview" | "edit">("preview");

  const handleTitleError = useCallback((message: string) => {
    setError(message);
  }, []);

  const handleTitleSaved = useCallback((nextTitle: string) => {
    setSession((current) => (current ? { ...current, title: nextTitle } : current));
  }, []);

  const { title, setTitle, saving } = useSessionTitle({
    sessionId,
    initialTitle: session?.id === sessionId ? session.title : "",
    onError: handleTitleError,
    onSaved: handleTitleSaved,
  });

  async function refresh() {
    const [nextSession, nextEvents, nextScreenshots, nextExports, nextSteps] =
      await Promise.all([
        api.getSession(sessionId),
        api.getCompressedTimeline(sessionId),
        api.listScreenshots(sessionId),
        api.listExports(sessionId),
        api.getReplaySteps(sessionId),
      ]);
    setSession(nextSession);
    setEvents(nextEvents);
    setScreenshots(nextScreenshots);
    setExports(nextExports);
    setSteps(nextSteps);
    setMarkdown(nextSession?.documentation_md ?? "");
  }

  useEffect(() => {
    refresh().catch((err) => setError(String(err)));
  }, [sessionId]);

  useEffect(() => {
    if (!generating) return;

    let unlisten: (() => void) | undefined;
    api
      .onAiProgress(sessionId, (event) => {
        if (event.status === "running") {
          setActiveStage(event.stage);
        }
        if (event.status === "completed") {
          setCompletedStages((current) =>
            current.includes(event.stage) ? current : [...current, event.stage],
          );
          setActiveStage(null);
        }
        if (event.status === "failed") {
          setFailedStage(event.stage);
          setActiveStage(null);
        }
      })
      .then((fn) => {
        unlisten = fn;
      });

    return () => {
      unlisten?.();
    };
  }, [generating, sessionId]);

  const replayScreenshot = useMemo(() => {
    const step = steps[replayIndex];
    if (!step) return null;
    const screenshotId = step.screenshot_ids[0];
    return (
      screenshots.find((shot) => shot.id === screenshotId) ??
      screenshots[replayIndex] ??
      null
    );
  }, [steps, screenshots, replayIndex]);

  const recordingVideoSrc = useMemo(() => {
    if (!session?.video_path?.endsWith(".mp4")) {
      return null;
    }
    return convertFileSrc(session.video_path);
  }, [session?.video_path]);

  const videoEncoding = Boolean(
    session && session.duration > 0 && !session.video_path?.endsWith(".mp4"),
  );

  useEffect(() => {
    if (!sessionId || session?.video_path?.endsWith(".mp4")) {
      return;
    }

    let unlisten: (() => void) | undefined;
    api
      .onVideoReady(sessionId, () => {
        refresh().catch((err) => setError(String(err)));
      })
      .then((fn) => {
        unlisten = fn;
      });

    const interval = window.setInterval(() => {
      refresh().catch(() => undefined);
    }, 2500);

    return () => {
      unlisten?.();
      window.clearInterval(interval);
    };
  }, [sessionId, session?.video_path]);

  async function handleGenerate() {
    setBusy(true);
    setGenerating(true);
    setError(null);
    setToast(null);
    setActiveStage(null);
    setCompletedStages([]);
    setFailedStage(null);
    try {
      const result = await api.generateDocumentation(sessionId);
      setMarkdown(result.markdown);
      setDocMode("preview");
      setTab("Documentation");
      setRedactionSummary(result.redaction_summary);
      setToast("Documentation generated");
      await refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
      setGenerating(false);
    }
  }

  async function handleSaveDocumentation() {
    setBusy(true);
    setError(null);
    try {
      await api.updateSessionDocumentation(sessionId, markdown);
      setToast("Saved");
      await refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleCopyMarkdown() {
    setError(null);
    try {
      await navigator.clipboard.writeText(markdown);
      setToast("Markdown copied");
    } catch (err) {
      setError(String(err));
    }
  }

  async function handleExport(format: string, options?: ExportOptionsPayload) {
    setBusy(true);
    setError(null);
    try {
      const record = await api.exportSession(sessionId, format, options);
      setToast(`Exported ${record.format.toUpperCase()}`);
      await refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleRevealExport(path: string) {
    setError(null);
    try {
      await revealItemInDir(path);
      setToast("Revealed in Finder");
    } catch (err) {
      setError(String(err));
    }
  }

  if (!session) {
    return (
      <div className="page">
        <p style={{ color: "var(--muted)" }}>Loading session…</p>
      </div>
    );
  }

  if (generating) {
    return (
      <div className="page">
        <ProcessingPanel
          activeStage={activeStage}
          completedStages={completedStages}
          failedStage={failedStage}
        />
      </div>
    );
  }

  const replayStep = steps[replayIndex];

  return (
    <div className="page">
      <div className="sd-titlebar">
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          aria-label="Session title"
        />
        {saving ? <span className="sd-title-status">Saving…</span> : null}
      </div>
      <div className="sd-meta">
        {session.status} · {formatDuration(session.duration)} · {events.length} timeline
        events
      </div>

      <div className="sd-actions">
        <AppButton kind="primary" icon="sparkles" disabled={busy} onClick={handleGenerate}>
          Generate Documentation
        </AppButton>
        <AppButton icon="download" disabled={busy} onClick={() => setTab("Exports")}>
          Export
        </AppButton>
      </div>

      {error ? (
        <div
          className="card set-card"
          style={{ marginTop: 18, borderColor: "rgba(255,138,138,.35)", color: "var(--rose)" }}
        >
          {error}
        </div>
      ) : null}

      {redactionSummary && redactionSummary.count > 0 ? (
        <div className="banner" style={{ marginTop: 18 }}>
          <span className="bt">
            Applied {redactionSummary.count} redaction pattern(s) before AI processing:{" "}
            {redactionSummary.patterns.join(", ")}
          </span>
        </div>
      ) : null}

      <div className="tabs">
        {TABS.map((name) => (
          <button
            key={name}
            type="button"
            className={`tab${tab === name ? " active" : ""}`}
            onClick={() => setTab(name)}
          >
            {name}
          </button>
        ))}
      </div>

      {tab === "Timeline" ? (
        <div className="card panel">
          <h3>Compressed Timeline</h3>
          <div className="pd">Deterministic event compression before AI processing.</div>
          <div className="tl-list">
            {events.length === 0 ? (
              <div className="pd">No compressed events yet.</div>
            ) : (
              events.map((event, index) => (
                <div
                  key={`${event.timestamp_ms}-${index}`}
                  className={`tl-evt${event.event_type.includes("click") ? " click" : ""}`}
                >
                  <span className="tk">
                    <Icon name={timelineIcon(event.event_type)} size={17} />
                  </span>
                  <div className="tinfo">
                    <div className="tt">{event.event_type.replaceAll("_", " ")}</div>
                    <div className="td">
                      {event.app_name ?? "Unknown app"} · {JSON.stringify(event.payload)}
                    </div>
                  </div>
                  <div className="ttime">{event.timestamp_ms}ms</div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}

      {tab === "Screenshots" ? (
        <div className="card panel">
          <h3>Captured Screenshots</h3>
          <div className="pd">Event-driven captures, ranked by relevance for the docs.</div>
          <div className="shot-grid">
            {screenshots.length === 0 ? (
              <div className="pd">No screenshots captured yet.</div>
            ) : (
              screenshots.map((shot) => (
                <div className="shot" key={shot.id}>
                  <div className="simg">
                    <img
                      src={convertFileSrc(shot.path)}
                      alt={shot.trigger ?? "Screenshot"}
                      style={{
                        position: "absolute",
                        inset: 0,
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        objectPosition: "left top",
                      }}
                      onError={(event) => {
                        (event.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  </div>
                  <div className="scap">
                    <span className="sn">{shot.trigger ?? "capture"}</span>
                    <button
                      type="button"
                      className="del"
                      onClick={() =>
                        api
                          .deleteScreenshot(shot.id)
                          .then(refresh)
                          .catch((err) => setError(String(err)))
                      }
                    >
                      <Icon name="trash" size={16} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}

      {tab === "Documentation" ? (
        <div className="card panel">
          <h3>Generated Documentation</h3>
          <div className="pd">
            Review the rendered guide or edit the Markdown source before exporting.
          </div>
          <div className="doc-toolbar">
            <AppButton size="sm" icon="save" disabled={busy} onClick={handleSaveDocumentation}>
              Save
            </AppButton>
            <AppButton
              size="sm"
              icon="copy"
              disabled={!markdown}
              onClick={handleCopyMarkdown}
            >
              Copy Markdown
            </AppButton>
            <AppButton
              size="sm"
              kind={docMode === "preview" ? "primary" : "ghost"}
              icon="eye"
              onClick={() => setDocMode("preview")}
            >
              Preview
            </AppButton>
            <AppButton
              size="sm"
              kind={docMode === "edit" ? "primary" : "ghost"}
              icon="edit"
              onClick={() => setDocMode("edit")}
            >
              Edit Markdown
            </AppButton>
          </div>
          {docMode === "preview" ? (
            <MarkdownPreview markdown={markdown} screenshots={screenshots} />
          ) : (
            <div className="doc-edit">
              <textarea
                value={markdown}
                onChange={(event) => setMarkdown(event.target.value)}
              />
            </div>
          )}
        </div>
      ) : null}

      {tab === "Replay" ? (
        <div className="card panel">
          <h3>Session Replay</h3>
          <div className="pd">
            Step through generated workflow steps with screenshots and timestamps.
          </div>
          {steps.length === 0 ? (
            <div className="pd" style={{ marginTop: 18 }}>
              Generate documentation to populate replay steps.
            </div>
          ) : (
            <>
              <div className="rp-progress" style={{ marginTop: 18 }}>
                <i style={{ width: `${((replayIndex + 1) / steps.length) * 100}%` }} />
              </div>
              <div className="rp-step">
                <div className="rpn">
                  Step {replayIndex + 1} of {steps.length}
                </div>
                <h3>{replayStep.title}</h3>
                <div className="rpd">{replayStep.description}</div>
                <div className="rp-shot">
                  {replayScreenshot ? (
                    <img
                      src={convertFileSrc(replayScreenshot.path)}
                      alt={replayStep.title}
                      style={{
                        position: "absolute",
                        inset: 0,
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      }}
                      onError={(event) => {
                        (event.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <div className="rwin" />
                  )}
                </div>
                <div className="rp-nav">
                  <AppButton
                    size="sm"
                    disabled={replayIndex === 0}
                    onClick={() => setReplayIndex((value) => Math.max(0, value - 1))}
                  >
                    Previous
                  </AppButton>
                  <AppButton
                    size="sm"
                    kind="primary"
                    disabled={replayIndex >= steps.length - 1}
                    onClick={() =>
                      setReplayIndex((value) => Math.min(steps.length - 1, value + 1))
                    }
                  >
                    Next step
                  </AppButton>
                </div>
              </div>
            </>
          )}
        </div>
      ) : null}

      {tab === "Recording" ? (
        <div className="card panel">
          <h3>Screen Recording</h3>
          <div className="pd">The full session capture, stored locally as MP4.</div>
          <div className="video-tab">
            {recordingVideoSrc ? (
              <video
                src={recordingVideoSrc}
                controls
                playsInline
                className="video-player"
                style={{ width: "100%", display: "block" }}
              />
            ) : (
              <div className="video-player">
                <div className="pbtn">
                  <Icon name="play" size={26} />
                </div>
                <div className="vbar">
                  <span>0:00</span>
                  <div className="track">
                    <i />
                  </div>
                  <span>{formatDuration(session.duration)}</span>
                </div>
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "grid",
                    placeItems: "center",
                    padding: 24,
                    textAlign: "center",
                    color: "var(--muted)",
                    fontSize: 14,
                  }}
                >
                  {videoEncoding
                    ? "Encoding session video in the background…"
                    : "No recording video yet. Record a session and stop it to generate the video."}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {tab === "Exports" ? (
        <ExportPanel
          session={session}
          steps={steps}
          screenshots={screenshots}
          exports={exports}
          busy={busy}
          onExport={handleExport}
          onRevealExport={handleRevealExport}
        />
      ) : null}

      <Toast message={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
