import { convertFileSrc } from "@tauri-apps/api/core";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { save } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ProcessingPanel } from "@/components/ai/ProcessingPanel";
import { MarkdownEditor } from "@/components/documentation/MarkdownEditor";
import { ImageAnnotationModal } from "@/components/sessions/ImageAnnotationModal";
import { ExportPanel } from "@/components/export/ExportPanel";
import { AppButton } from "@/components/ui/AppButton";
import { Icon } from "@/components/ui/Icon";
import { Toast } from "@/components/ui/Toast";
import { useSessionTitle } from "@/hooks/useSessionTitle";
import { useAiJob } from "@/context/AiJobContext";
import { useSessionsContext } from "@/context/SessionsContext";
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
  "Audio",
  "Replay",
  "Recording",
  "Exports",
] as const;

type TabName = (typeof TABS)[number];

export function SessionPage() {
  const { sessionId = "" } = useParams();
  const navigate = useNavigate();
  const { refreshSessions } = useSessionsContext();
  const { activeJob, startJob, cancelJob } = useAiJob();

  const [session, setSession] = useState<Session | null>(null);
  const [events, setEvents] = useState<SessionEvent[]>([]);
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
  const [exports, setExports] = useState<ExportRecord[]>([]);
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [markdown, setMarkdown] = useState("");
  const [busy, setBusy] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [translationLogs, setTranslationLogs] = useState<string[]>([]);
  const [showTranslationLog, setShowTranslationLog] = useState(false);
  const [translationStatus, setTranslationStatus] = useState<"idle" | "translating" | "success" | "error">("idle");

  const [audioLogs, setAudioLogs] = useState<string[]>([]);
  const [showAudioLog, setShowAudioLog] = useState(false);
  const [audioStatus, setAudioStatus] = useState<"idle" | "transcribing" | "success" | "error">("idle");
  const [annotatingScreenshot, setAnnotatingScreenshot] = useState<Screenshot | null>(null);
  const [exportingBundle, setExportingBundle] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [redactionSummary, setRedactionSummary] = useState<RedactionSummary | null>(null);
  const [replayIndex, setReplayIndex] = useState(0);
  const [tab, setTab] = useState<TabName>("Timeline");

  const isCurrentSessionGenerating =
    activeJob?.sessionId === sessionId && !activeJob.isDone;

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

  // When activeJob completes for this session, refresh data
  useEffect(() => {
    if (activeJob?.sessionId === sessionId && activeJob.isDone && activeJob.result) {
      setMarkdown(activeJob.result.markdown);
      setTab("Documentation");
      setRedactionSummary(activeJob.result.redaction_summary);
      setToast("Documentation generated");
      refresh().catch(() => undefined);
    }
  }, [activeJob?.sessionId, activeJob?.isDone, activeJob?.result, sessionId]);

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
    setError(null);
    setToast(null);
    try {
      await startJob(sessionId, title || session?.title || "Session");
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteSession() {
    if (!session) return;
    if (
      window.confirm(
        `Sei sicuro di voler eliminare definitivamente la sessione "${session.title}"? Tutti i dati e gli screenshot verranno cancellati.`
      )
    ) {
      setBusy(true);
      try {
        await api.deleteSession(sessionId);
        await refreshSessions();
        navigate("/");
      } catch (err) {
        setError(String(err));
        setBusy(false);
      }
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

  async function handleTranscribeAudio() {
    setTranscribing(true);
    setError(null);
    setToast(null);
    setShowAudioLog(true);
    setAudioStatus("transcribing");
    setAudioLogs([`[${new Date().toLocaleTimeString()}] Avvio richiesta di trascrizione vocale...`]);

    let unlisten: (() => void) | undefined;
    try {
      unlisten = await api.onAiLog(sessionId, (evt) => {
        setAudioLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${evt.message}`]);
      });

      await api.transcribeSessionAudio(sessionId);
      setAudioStatus("success");
      setToast("Audio trascritto con successo!");
      await refresh();
    } catch (err) {
      const msg = String(err);
      setError(msg);
      setAudioStatus("error");
      setAudioLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ❌ ERRORE: ${msg}`]);
    } finally {
      if (unlisten) unlisten();
      setTranscribing(false);
    }
  }

  async function handleTranslateDocumentation(targetLanguage = "Italian") {
    setTranslating(true);
    setError(null);
    setToast(null);
    setShowTranslationLog(true);
    setTranslationStatus("translating");
    setTranslationLogs([`[${new Date().toLocaleTimeString()}] Avvio richiesta di traduzione in ${targetLanguage}...`]);

    let unlisten: (() => void) | undefined;
    try {
      unlisten = await api.onAiLog(sessionId, (evt) => {
        setTranslationLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${evt.message}`]);
      });

      const translated = await api.translateDocumentation(sessionId, targetLanguage);
      setMarkdown(translated);
      setTranslationStatus("success");
      setToast("Documentazione tradotta in italiano con successo!");
      await refresh();
    } catch (err) {
      const msg = String(err);
      setError(msg);
      setTranslationStatus("error");
      setTranslationLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ❌ ERRORE: ${msg}`]);
    } finally {
      if (unlisten) unlisten();
      setTranslating(false);
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

  async function handleExportBundle() {
    if (!session) return;
    try {
      const sanitizedTitle = (session.title || "session").replace(/[/\\?%*:|"<>]/g, "_");
      const defaultName = `${sanitizedTitle}.flowcapture`;
      const targetPath = await save({
        defaultPath: defaultName,
        title: "Salva archivio completo sessione FlowCapture",
        filters: [
          {
            name: "FlowCapture Session (*.flowcapture)",
            extensions: ["flowcapture", "zip"],
          },
        ],
      });

      if (!targetPath) return;

      setExportingBundle(true);
      setError(null);
      await api.exportSessionBundle(session.id, targetPath);
      setToast(`Sessione esportata con successo in: ${targetPath}`);
    } catch (err) {
      setError(`Errore durante l'esportazione: ${err}`);
    } finally {
      setExportingBundle(false);
    }
  }

  if (!session) {
    return (
      <div className="page">
        <p style={{ color: "var(--muted)" }}>Loading session…</p>
      </div>
    );
  }

  if (isCurrentSessionGenerating && activeJob) {
    return (
      <div className="page">
        <ProcessingPanel
          activeStage={activeJob.stage}
          completedStages={activeJob.completedStages}
          failedStage={activeJob.failedStage}
          logs={activeJob.logs}
          onCancel={() => cancelJob(sessionId)}
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

      <div className="sd-actions" style={{ display: "flex", gap: "10px", alignItems: "center" }}>
        <AppButton kind="primary" icon="sparkles" disabled={busy} onClick={handleGenerate}>
          Generate Documentation
        </AppButton>
        <AppButton icon="download" disabled={busy} onClick={() => setTab("Exports")}>
          Export
        </AppButton>
        <AppButton
          icon="folder"
          disabled={busy || exportingBundle}
          onClick={handleExportBundle}
          title="Esporta l'intera sessione (eventi, screenshot, audio, video e documenti) in un file compresso trasferibile"
        >
          {exportingBundle ? "Esportazione…" : "Esporta Sessione (.flowcapture)"}
        </AppButton>
        <AppButton
          kind="ghost"
          icon="trash"
          disabled={busy}
          onClick={handleDeleteSession}
          style={{ marginLeft: "auto", color: "#ef4444", borderColor: "rgba(239, 68, 68, 0.3)" }}
        >
          Elimina Sessione
        </AppButton>
      </div>

      {error ? (
        <div
          className="card set-card"
          style={{
            marginTop: 18,
            borderColor: "rgba(255,138,138,.45)",
            background: "rgba(255,100,100,0.06)",
            color: "var(--rose)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "12px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <Icon name="alert" size={18} />
            <span style={{ fontSize: "13px", lineHeight: "1.4" }}>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            style={{
              background: "rgba(255, 255, 255, 0.08)",
              border: "none",
              borderRadius: "6px",
              color: "var(--rose)",
              cursor: "pointer",
              padding: "4px 8px",
              fontSize: "13px",
              fontWeight: "bold",
              flexShrink: 0,
            }}
            title="Chiudi messaggio di errore"
          >
            ✕
          </button>
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
                        objectFit: "contain",
                        objectPosition: "center",
                        backgroundColor: "rgba(0,0,0,0.4)",
                      }}
                      onError={(event) => {
                        (event.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  </div>
                  <div className="scap" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span className="sn">{shot.trigger ?? "capture"}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        style={{ padding: "2px 6px", fontSize: "11px", display: "flex", alignItems: "center", gap: "4px" }}
                        onClick={() => setAnnotatingScreenshot(shot)}
                        title="Modifica screenshot, sposta click o aggiungi annotazioni"
                      >
                        🎨 Modifica
                      </button>
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
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}

      {tab === "Documentation" ? (
        <div className="card panel">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px", flexWrap: "wrap", gap: "10px" }}>
            <div>
              <h3>Documentazione Generata</h3>
              <div className="pd">
                Modifica il Markdown con la barra degli strumenti avanzata, inserisci screenshot o passaggi e visualizza l'anteprima live.
              </div>
            </div>
            <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
              <AppButton
                size="sm"
                kind="ghost"
                icon="sparkles"
                disabled={!markdown || translating || busy}
                onClick={() => handleTranslateDocumentation("Italian")}
                title="Traduci il solo testo della guida in Italiano (le immagini vengono isolate e ripristinate intatte)"
              >
                {translating ? "Traduzione in corso…" : "🌐 Traduci in Italiano (AI)"}
              </AppButton>
              <AppButton
                size="sm"
                icon="copy"
                disabled={!markdown}
                onClick={handleCopyMarkdown}
              >
                Copia Markdown
              </AppButton>
              <AppButton size="sm" kind="primary" icon="save" disabled={busy || translating} onClick={handleSaveDocumentation}>
                Salva Modifiche
              </AppButton>
            </div>
          </div>

          {showTranslationLog && (
            <div
              style={{
                marginTop: "12px",
                marginBottom: "16px",
                background: "#0d1117",
                border: `1px solid ${
                  translationStatus === "error"
                    ? "rgba(239, 68, 68, 0.45)"
                    : translationStatus === "success"
                    ? "rgba(52, 211, 153, 0.45)"
                    : "rgba(96, 165, 250, 0.4)"
                }`,
                borderRadius: "10px",
                padding: "14px 16px",
                boxShadow: "0 6px 20px rgba(0, 0, 0, 0.35)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "8px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    fontWeight: 600,
                    fontSize: "13px",
                    color:
                      translationStatus === "error"
                        ? "#f87171"
                        : translationStatus === "success"
                        ? "#34d399"
                        : "#60a5fa",
                  }}
                >
                  {translationStatus === "translating" && (
                    <span
                      style={{
                        display: "inline-block",
                        width: "12px",
                        height: "12px",
                        border: "2px solid #60a5fa",
                        borderTopColor: "transparent",
                        borderRadius: "50%",
                        animation: "spin 0.8s linear infinite",
                      }}
                    />
                  )}
                  {translationStatus === "success" && <Icon name="check" size={15} />}
                  {translationStatus === "error" && <Icon name="alert" size={15} />}
                  <span>
                    {translationStatus === "translating"
                      ? "Traduzione AI in corso (invio solo testo, immagini protette)..."
                      : translationStatus === "success"
                      ? "Traduzione completata con successo!"
                      : "Errore durante la traduzione con il server AI"}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowTranslationLog(false)}
                  style={{
                    background: "rgba(255, 255, 255, 0.08)",
                    border: "none",
                    borderRadius: "6px",
                    color: "#8b949e",
                    cursor: "pointer",
                    padding: "3px 8px",
                    fontSize: "11px",
                  }}
                >
                  Chiudi log ✕
                </button>
              </div>

              <div
                style={{
                  fontFamily: "var(--mono, monospace)",
                  fontSize: "12px",
                  lineHeight: "1.5",
                  color: "#c9d1d9",
                  maxHeight: "160px",
                  overflowY: "auto",
                  background: "rgba(0, 0, 0, 0.4)",
                  borderRadius: "6px",
                  padding: "10px 12px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "4px",
                }}
              >
                {translationLogs.map((log, idx) => (
                  <div
                    key={idx}
                    style={{
                      color: log.includes("ERRORE")
                        ? "#f87171"
                        : log.includes("successo")
                        ? "#34d399"
                        : log.includes("Isolate")
                        ? "#fbbf24"
                        : "#e6edf3",
                    }}
                  >
                    {log}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginTop: "14px" }}>
            <MarkdownEditor
              value={markdown}
              onChange={setMarkdown}
              screenshots={screenshots}
              disabled={busy || translating}
            />
          </div>
        </div>
      ) : null}

      {tab === "Audio" ? (
        <div className="card panel">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "10px" }}>
            <div>
              <h3>Registrazione Audio & Trascrizione Vocale</h3>
              <div className="pd">Riascolta l'audio del microfono catturato e visualizza la trascrizione AI del parlato.</div>
            </div>
            {session.audio_path ? (
              <AppButton
                kind="primary"
                icon="sparkles"
                size="sm"
                disabled={transcribing || busy}
                onClick={handleTranscribeAudio}
              >
                {transcribing ? "Trascrizione in corso…" : session.audio_transcript ? "Ritrascrivi Audio" : "Trascrivi con AI"}
              </AppButton>
            ) : null}
          </div>

          {showAudioLog && (
            <div
              style={{
                marginTop: "12px",
                marginBottom: "16px",
                background: "#0d1117",
                border: `1px solid ${
                  audioStatus === "error"
                    ? "rgba(239, 68, 68, 0.45)"
                    : audioStatus === "success"
                    ? "rgba(52, 211, 153, 0.45)"
                    : "rgba(96, 165, 250, 0.4)"
                }`,
                borderRadius: "10px",
                padding: "14px 16px",
                boxShadow: "0 6px 20px rgba(0, 0, 0, 0.35)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "8px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    fontWeight: 600,
                    fontSize: "13px",
                    color:
                      audioStatus === "error"
                        ? "#f87171"
                        : audioStatus === "success"
                        ? "#34d399"
                        : "#60a5fa",
                  }}
                >
                  {audioStatus === "transcribing" && (
                    <span
                      style={{
                        display: "inline-block",
                        width: "12px",
                        height: "12px",
                        border: "2px solid #60a5fa",
                        borderTopColor: "transparent",
                        borderRadius: "50%",
                        animation: "spin 0.8s linear infinite",
                      }}
                    />
                  )}
                  {audioStatus === "success" && <Icon name="check" size={15} />}
                  {audioStatus === "error" && <Icon name="alert" size={15} />}
                  <span>
                    {audioStatus === "transcribing"
                      ? "Trascrizione audio in corso con servizio AI..."
                      : audioStatus === "success"
                      ? "Trascrizione vocale completata!"
                      : "Errore durante la trascrizione vocale"}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAudioLog(false)}
                  style={{
                    background: "rgba(255, 255, 255, 0.08)",
                    border: "none",
                    borderRadius: "6px",
                    color: "#8b949e",
                    cursor: "pointer",
                    padding: "3px 8px",
                    fontSize: "11px",
                  }}
                >
                  Chiudi log ✕
                </button>
              </div>

              <div
                style={{
                  fontFamily: "var(--mono, monospace)",
                  fontSize: "12px",
                  lineHeight: "1.5",
                  color: "#c9d1d9",
                  maxHeight: "160px",
                  overflowY: "auto",
                  background: "rgba(0, 0, 0, 0.4)",
                  borderRadius: "6px",
                  padding: "10px 12px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "4px",
                }}
              >
                {audioLogs.map((log, idx) => (
                  <div
                    key={idx}
                    style={{
                      color: log.includes("ERRORE")
                        ? "#f87171"
                        : log.includes("successo")
                        ? "#34d399"
                        : "#e6edf3",
                    }}
                  >
                    {log}
                  </div>
                ))}
              </div>
            </div>
          )}

          {session.audio_path ? (
            <div style={{ marginTop: "16px", display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{ padding: "16px", background: "rgba(255,255,255,0.03)", borderRadius: "8px", border: "1px solid var(--border)" }}>
                <div style={{ fontSize: "13px", fontWeight: 500, marginBottom: "8px", color: "var(--text-1)" }}>
                  Traccia Audio Microfono:
                </div>
                <audio
                  controls
                  src={convertFileSrc(session.audio_path)}
                  style={{ width: "100%", height: "40px" }}
                />
              </div>

              <div style={{ padding: "16px", background: "rgba(255,255,255,0.03)", borderRadius: "8px", border: "1px solid var(--border)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                  <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-1)" }}>
                    Trascrizione del Parlato (Speech-to-Text):
                  </div>
                  {session.audio_transcript ? (
                    <span style={{ fontSize: "11px", color: "var(--color-primary)", fontWeight: 600 }}>
                      ● Trascritto
                    </span>
                  ) : null}
                </div>
                {session.audio_transcript ? (
                  <div
                    style={{
                      whiteSpace: "pre-wrap",
                      fontSize: "14px",
                      lineHeight: "1.6",
                      color: "var(--text-1)",
                      background: "var(--bg-3, #0d1117)",
                      padding: "14px 16px",
                      borderRadius: "6px",
                      border: "1px solid var(--border)",
                    }}
                  >
                    {session.audio_transcript}
                  </div>
                ) : (
                  <div style={{ color: "var(--dim)", fontSize: "13.5px" }}>
                    Nessuna trascrizione generata finora. Clicca sul pulsante in alto a destra "Trascrivi con AI" per convertire la voce in testo.
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="pd" style={{ marginTop: "16px" }}>
              Nessun audio del microfono registrato per questa sessione. Per registrare l'audio, attiva l'opzione "Registra audio microfono" prima di avviare la registrazione.
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
                        objectFit: "contain",
                        backgroundColor: "rgba(0, 0, 0, 0.4)",
                      }}
                      onError={(event) => {
                        (event.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <div className="rwin" />
                  )}
                </div>
                {replayScreenshot && (
                  <div style={{ marginTop: "10px", display: "flex", justifyContent: "flex-end" }}>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setAnnotatingScreenshot(replayScreenshot)}
                      style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px" }}
                      title="Modifica questo screenshot, sposta click o aggiungi annotazioni grafiche"
                    >
                      🎨 Modifica / Evidenzia questo Step
                    </button>
                  </div>
                )}
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

      {annotatingScreenshot && (
        <ImageAnnotationModal
          sessionId={sessionId}
          screenshot={annotatingScreenshot}
          onClose={() => setAnnotatingScreenshot(null)}
          onSaved={async () => {
            setToast("Screenshot aggiornato con successo!");
            await refresh();
          }}
        />
      )}

      <Toast message={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
