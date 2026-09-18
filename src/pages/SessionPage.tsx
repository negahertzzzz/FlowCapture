import { convertFileSrc } from "@tauri-apps/api/core";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { save } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ProcessingPanel } from "@/components/ai/ProcessingPanel";
import { MarkdownEditor } from "@/components/documentation/MarkdownEditor";
import { MarkdownPreview } from "@/components/documentation/MarkdownPreview";
import { ImageAnnotationModal, type AnnotationItem } from "@/components/sessions/ImageAnnotationModal";
import { ScreenshotPickerModal } from "@/components/sessions/ScreenshotPickerModal";
import { DuplicateScreenshotsModal } from "@/components/sessions/DuplicateScreenshotsModal";
import { AnnotationOverlay } from "@/components/sessions/AnnotationOverlay";
import { ExportPanel } from "@/components/export/ExportPanel";
import { AppButton } from "@/components/ui/AppButton";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { Icon } from "@/components/ui/Icon";
import { Toast } from "@/components/ui/Toast";
import { useDebouncedEffect } from "@/hooks/useDebouncedEffect";
import { useSessionTitle } from "@/hooks/useSessionTitle";
import { useAiJob } from "@/context/AiJobContext";
import { useSessionsContext } from "@/context/SessionsContext";
import {
  api,
  type AudioSegment,
  type DuplicateScreenshotGroup,
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
  const [busy, setBusy] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [translationLogs, setTranslationLogs] = useState<string[]>([]);
  const [showTranslationLog, setShowTranslationLog] = useState(false);
  const [translationStatus, setTranslationStatus] = useState<"idle" | "translating" | "success" | "error">("idle");

  const [audioLogs, setAudioLogs] = useState<string[]>([]);
  const [showAudioLog, setShowAudioLog] = useState(false);
  const [audioStatus, setAudioStatus] = useState<"idle" | "transcribing" | "success" | "error">("idle");
  const [audioViewMode, setAudioViewMode] = useState<"segments" | "text">("segments");
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  const audioSegments: AudioSegment[] = useMemo(() => {
    if (!session?.audio_segments_json) return [];
    try {
      const parsed = JSON.parse(session.audio_segments_json);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, [session?.audio_segments_json]);
  const [annotatingScreenshot, setAnnotatingScreenshot] = useState<Screenshot | null>(null);
  const [exportingBundle, setExportingBundle] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [redactionSummary, setRedactionSummary] = useState<RedactionSummary | null>(null);
  const [replayIndex, setReplayIndex] = useState(0);
  const [tab, setTab] = useState<TabName>("Timeline");

  const [scanningDuplicates, setScanningDuplicates] = useState(false);
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateScreenshotGroup[] | null>(null);

  const [pickingScreenshotForStep, setPickingScreenshotForStep] = useState<number | null>(null);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [editingStep, setEditingStep] = useState(false);
  const [editStepTitle, setEditStepTitle] = useState("");
  const [editStepDesc, setEditStepDesc] = useState("");
  const [savingStep, setSavingStep] = useState(false);
  const [imgNaturalDims, setImgNaturalDims] = useState<{ w: number; h: number }>({ w: 1920, h: 1080 });
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    kind?: "danger" | "warning" | "primary";
    action: () => Promise<void> | void;
  } | null>(null);

  const [hideAllScreenshots, setHideAllScreenshots] = useState(false);
  const [collapsedEvents, setCollapsedEvents] = useState<Record<number, boolean>>({});

  const eventScreenshotsMap = useMemo(() => {
    const map = new Map<number, Screenshot[]>();
    if (!events.length) return map;

    for (let i = 0; i < events.length; i++) {
      map.set(i, []);
    }

    for (const shot of screenshots) {
      let targetIdx = -1;
      for (let i = 0; i < events.length; i++) {
        const currentStart = i === 0 ? -Infinity : events[i].timestamp_ms - 150;
        const nextStart = i < events.length - 1 ? events[i + 1].timestamp_ms - 150 : Infinity;
        if (shot.timestamp_ms >= currentStart && shot.timestamp_ms < nextStart) {
          targetIdx = i;
          break;
        }
      }
      if (targetIdx === -1) {
        targetIdx = events.length - 1;
      }
      map.get(targetIdx)?.push(shot);
    }
    return map;
  }, [events, screenshots]);

  const isEventCollapsed = useCallback(
    (index: number) => {
      if (collapsedEvents[index] !== undefined) {
        return collapsedEvents[index];
      }
      return hideAllScreenshots;
    },
    [collapsedEvents, hideAllScreenshots],
  );

  const toggleEventScreenshots = useCallback(
    (index: number) => {
      setCollapsedEvents((prev) => {
        const current = prev[index] !== undefined ? prev[index] : hideAllScreenshots;
        return { ...prev, [index]: !current };
      });
    },
    [hideAllScreenshots],
  );

  const toggleAllScreenshots = useCallback(() => {
    setHideAllScreenshots((prev) => {
      const next = !prev;
      setCollapsedEvents({});
      return next;
    });
  }, []);

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

  const [markdown, setMarkdown] = useState("");
  const [savingMarkdown, setSavingMarkdown] = useState(false);
  const lastSavedMarkdown = useRef<string>("");
  const isEditingMarkdown = useRef<boolean>(false);

  const refresh = useCallback(async (options?: { syncMarkdown?: boolean }) => {
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

    const dbMd = nextSession?.documentation_md ?? "";
    if (options?.syncMarkdown || (!isEditingMarkdown.current && lastSavedMarkdown.current === "")) {
      lastSavedMarkdown.current = dbMd;
      setMarkdown(dbMd);
    }
  }, [sessionId]);

  const handleSaveDocumentation = useCallback(async (textToSave?: string) => {
    const md = textToSave !== undefined ? textToSave : markdown;
    if (!sessionId) return;
    setSavingMarkdown(true);
    try {
      await api.updateDocumentation(sessionId, md);
      lastSavedMarkdown.current = md;
      isEditingMarkdown.current = false;
      setToast("Documentazione salvata con successo");
    } catch (err) {
      setError(String(err));
    } finally {
      setSavingMarkdown(false);
    }
  }, [sessionId, markdown]);

  const handleMarkdownChange = useCallback((newMd: string) => {
    isEditingMarkdown.current = true;
    setMarkdown(newMd);
  }, []);

  useDebouncedEffect(() => {
    if (markdown && isEditingMarkdown.current && markdown !== lastSavedMarkdown.current) {
      handleSaveDocumentation(markdown);
    }
  }, [markdown, handleSaveDocumentation], 800);

  useEffect(() => {
    refresh({ syncMarkdown: true }).catch((err) => setError(String(err)));
  }, [sessionId, refresh]);

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

  const replayStep = steps[replayIndex];

  const replayScreenshot = useMemo(() => {
    if (!replayStep) return null;
    const screenshotId = replayStep.screenshot_ids[0];
    return (
      screenshots.find((shot) => shot.id === screenshotId) ??
      screenshots[replayIndex] ??
      null
    );
  }, [steps, screenshots, replayIndex, replayStep]);

  const currentStepAnnotations: AnnotationItem[] = useMemo(() => {
    if (!replayStep) return [];
    const jsonStr = replayStep.annotations_json || replayScreenshot?.annotations_json;
    if (!jsonStr) {
      if (replayScreenshot?.click_x != null && replayScreenshot?.click_y != null) {
        return [{
          id: "click_primary",
          type: "click",
          x: replayScreenshot.click_x,
          y: replayScreenshot.click_y,
          color: "#ef4444",
          strokeWidth: 3,
        }];
      }
      return [];
    }
    try {
      const parsed = JSON.parse(jsonStr);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, [replayStep, replayScreenshot]);

  const [selectedVideoMode, setSelectedVideoMode] = useState<"full" | "timelapse">("full");

  const fullVideoSrc = useMemo(() => {
    if (!session?.full_video_path?.endsWith(".mp4")) {
      return null;
    }
    return convertFileSrc(session.full_video_path);
  }, [session?.full_video_path]);

  const timelapseVideoSrc = useMemo(() => {
    if (!session?.video_path?.endsWith(".mp4")) {
      return null;
    }
    return convertFileSrc(session.video_path);
  }, [session?.video_path]);

  const activeVideoSrc = selectedVideoMode === "full"
    ? (fullVideoSrc ?? timelapseVideoSrc)
    : (timelapseVideoSrc ?? fullVideoSrc);

  const videoEncoding = Boolean(
    session &&
      session.duration > 0 &&
      !session.full_video_path?.endsWith(".mp4") &&
      !session.video_path?.endsWith(".mp4"),
  );

  useEffect(() => {
    if (!sessionId) return;
    if (session?.video_path?.endsWith(".mp4") && session?.full_video_path?.endsWith(".mp4")) {
      return;
    }

    let unlistenTime: (() => void) | undefined;
    let unlistenFull: (() => void) | undefined;

    api
      .onVideoReady(sessionId, () => {
        refresh({ syncMarkdown: false }).catch((err) => setError(String(err)));
      })
      .then((fn) => {
        unlistenTime = fn;
      });

    api
      .onFullVideoReady(sessionId, () => {
        refresh({ syncMarkdown: false }).catch((err) => setError(String(err)));
      })
      .then((fn) => {
        unlistenFull = fn;
      });

    const interval = window.setInterval(async () => {
      if ((!session?.full_video_path || !session?.video_path) && session && session.duration > 0) {
        try {
          const updated = await api.getSession(sessionId);
          if (updated && (updated.video_path !== session.video_path || updated.full_video_path !== session.full_video_path)) {
            setSession((prev) =>
              prev
                ? { ...prev, video_path: updated.video_path, full_video_path: updated.full_video_path }
                : updated,
            );
          }
        } catch {
          // ignore
        }
      }
    }, 3000);

    return () => {
      unlistenTime?.();
      unlistenFull?.();
      window.clearInterval(interval);
    };
  }, [sessionId, session?.video_path, session?.full_video_path]);

  function handleGenerate() {
    if (session?.documentation_md && session.documentation_md.trim().length > 0) {
      setConfirmModal({
        isOpen: true,
        title: "Sovrascrivere la Documentazione Esistente?",
        message: "Per questa sessione esiste già una documentazione generata.\n\nAvviando una nuova generazione con l'AI, la documentazione attuale e i passaggi salvati verranno sovrascritti con i nuovi contenuti.\n\nDesideri procedere comunque?",
        confirmLabel: "Rigenera e Sovrascrivi",
        cancelLabel: "Annulla",
        kind: "warning",
        action: () => executeGenerate(),
      });
    } else {
      executeGenerate();
    }
  }

  async function executeGenerate() {
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

  function handleDeleteSession() {
    if (!session) return;
    setConfirmModal({
      isOpen: true,
      title: "Elimina Sessione",
      message: `Sei sicuro di voler eliminare definitivamente la sessione "${session.title}"?\n\nTutti gli eventi registrati, gli screenshot e i file associati verranno cancellati in modo permanente. Questa operazione non può essere annullata.`,
      confirmLabel: "Elimina Sessione",
      cancelLabel: "Annulla",
      kind: "danger",
      action: async () => {
        setBusy(true);
        try {
          await api.deleteSession(sessionId);
          await refreshSessions();
          navigate("/");
        } catch (err) {
          setError(String(err));
          setBusy(false);
        }
      },
    });
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

  function handleTranscribeAudio() {
    if (session?.audio_transcript && session.audio_transcript.trim().length > 0) {
      setConfirmModal({
        isOpen: true,
        title: "Sovrascrivere la Trascrizione Audio?",
        message: "Questa sessione possiede già una trascrizione audio salvata.\n\nAvviando una nuova trascrizione con Whisper AI, il testo e i segmenti temporali attuali verranno sostituiti.\n\nDesideri procedere?",
        confirmLabel: "Ritrascrivi Audio",
        cancelLabel: "Annulla",
        kind: "warning",
        action: () => executeTranscribeAudio(),
      });
    } else {
      executeTranscribeAudio();
    }
  }

  async function executeTranscribeAudio() {
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
      await refresh({ syncMarkdown: false });
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

  function handleTranslateDocumentation(targetLanguage = "Italian") {
    if (markdown && markdown.trim().length > 0) {
      setConfirmModal({
        isOpen: true,
        title: "Tradurre la Documentazione in Italiano?",
        message: "Il testo attuale della guida verrà inviato al modello AI per essere tradotto in lingua italiana.\n\nI tag delle immagini e gli screenshot associati rimarranno intatti.\n\nDesideri avviare la traduzione?",
        confirmLabel: "Avvia Traduzione",
        cancelLabel: "Annulla",
        kind: "primary",
        action: () => executeTranslateDocumentation(targetLanguage),
      });
    } else {
      executeTranslateDocumentation(targetLanguage);
    }
  }

  async function executeTranslateDocumentation(targetLanguage = "Italian") {
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
      lastSavedMarkdown.current = translated;
      setTranslationStatus("success");
      setToast("Documentazione tradotta in italiano con successo!");
      await refresh({ syncMarkdown: false });
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


  async function handleFindDuplicates() {
    setScanningDuplicates(true);
    try {
      const groups = await api.findDuplicateScreenshots(sessionId);
      if (groups.length === 0) {
        setToast("Nessun duplicato trovato con somiglianza ≥ 60%");
      } else {
        setDuplicateGroups(groups);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setScanningDuplicates(false);
    }
  }

  async function handleMergeDuplicates(keepId: string, removeIds: string[]) {
    await api.mergeDuplicateScreenshots(sessionId, keepId, removeIds);
    setToast(`Uniti ed eliminati ${removeIds.length} screenshot duplicati`);
    await refresh();
  }

  async function handleSaveStepContent() {
    if (!replayStep) return;
    setSavingStep(true);
    try {
      await api.updateStepContent(sessionId, replayStep.step, editStepTitle, editStepDesc);
      setSteps((prev) =>
        prev.map((s) =>
          s.step === replayStep.step ? { ...s, title: editStepTitle, description: editStepDesc } : s,
        ),
      );
      setToast("Passo aggiornato con successo");
      setEditingStep(false);
      await refresh({ syncMarkdown: false });
    } catch (err) {
      setError(String(err));
    } finally {
      setSavingStep(false);
    }
  }

  async function handleSyncStepsFromDoc() {
    setBusy(true);
    try {
      const synced = await api.getReplaySteps(sessionId);
      setSteps(synced);
      if (synced.length > 0) {
        setToast(`Recuperati ${synced.length} passi dalla documentazione`);
      } else {
        setToast("Nessun passo trovato nella documentazione");
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

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
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "14px",
              flexWrap: "wrap",
              gap: "10px",
            }}
          >
            <div>
              <h3 style={{ margin: 0 }}>Compressed Timeline ({events.length})</h3>
              <div className="pd">
                {events.length} eventi registrati · {screenshots.length} screenshot associati nel workflow.
              </div>
            </div>
            {screenshots.length > 0 && (
              <AppButton
                size="sm"
                kind="ghost"
                icon={hideAllScreenshots ? "eye" : "eyeOff"}
                onClick={toggleAllScreenshots}
                title={hideAllScreenshots ? "Mostra tutti gli screenshot per gli eventi" : "Nascondi tutti gli screenshot per gli eventi"}
              >
                {hideAllScreenshots ? "Mostra tutti gli screenshot" : "Nascondi tutti gli screenshot"}
              </AppButton>
            )}
          </div>

          <div className="tl-list">
            {events.length === 0 ? (
              <div className="pd">No compressed events yet.</div>
            ) : (
              events.map((event, index) => {
                const eventShots = eventScreenshotsMap.get(index) ?? [];
                const isCollapsed = isEventCollapsed(index);

                return (
                  <div
                    key={`${event.timestamp_ms}-${index}`}
                    className={`tl-evt${event.event_type.includes("click") ? " click" : ""}`}
                  >
                    <div className="tl-evt-header">
                      <span className="tk">
                        <Icon name={timelineIcon(event.event_type)} size={17} />
                      </span>
                      <div className="tinfo">
                        <div className="tt">{event.event_type.replaceAll("_", " ")}</div>
                        <div className="td">
                          {event.app_name ?? "Unknown app"} · {JSON.stringify(event.payload)}
                        </div>
                      </div>

                      <div className="tl-evt-meta">
                        {eventShots.length > 0 ? (
                          <button
                            type="button"
                            className={`tl-evt-toggle-btn${isCollapsed ? " collapsed" : ""}`}
                            onClick={() => toggleEventScreenshots(index)}
                            title={isCollapsed ? "Mostra gli screenshot di questo evento" : "Nascondi gli screenshot di questo evento"}
                          >
                            <Icon name="camera" size={13} />
                            <span>
                              {eventShots.length} {eventShots.length === 1 ? "screen" : "screen"}
                            </span>
                            <Icon name={isCollapsed ? "chevronDown" : "chevronUp"} size={12} />
                          </button>
                        ) : (
                          <span className="tl-evt-no-shots">Nessun screenshot</span>
                        )}

                        <div className="ttime">{event.timestamp_ms}ms</div>
                      </div>
                    </div>

                    {!isCollapsed && eventShots.length > 0 && (
                      <div className="tl-evt-shots">
                        {eventShots.map((shot) => {
                          const hasClick = shot.click_x != null && shot.click_y != null;
                          let annotationsCount = 0;
                          if (shot.annotations_json) {
                            try {
                              const parsed = JSON.parse(shot.annotations_json);
                              if (Array.isArray(parsed)) annotationsCount = parsed.length;
                            } catch {}
                          }
                          const deltaMs = shot.timestamp_ms - event.timestamp_ms;
                          const timeLabel =
                            deltaMs === 0
                              ? `${shot.timestamp_ms}ms`
                              : deltaMs > 0
                              ? `+${deltaMs}ms`
                              : `${deltaMs}ms`;

                          return (
                            <div
                              key={shot.id}
                              className="tl-shot-card"
                              onClick={() => setAnnotatingScreenshot(shot)}
                              title="Clicca per aprire lo screenshot a schermo intero o annotare"
                            >
                              <div className="tl-shot-thumb">
                                <img
                                  src={convertFileSrc(shot.path)}
                                  alt={shot.trigger ?? "Screenshot evento"}
                                  loading="lazy"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).style.display = "none";
                                  }}
                                />
                                <div className="tl-shot-badge">
                                  <span>{shot.trigger?.replaceAll("_", " ") ?? "screenshot"}</span>
                                </div>
                                {hasClick && (
                                  <div
                                    className="tl-shot-ann-badge"
                                    style={{ background: "rgba(16, 185, 129, 0.9)" }}
                                    title="Punto di click registrato"
                                  >
                                    🎯 Click
                                  </div>
                                )}
                                {annotationsCount > 0 && (
                                  <div
                                    className="tl-shot-ann-badge"
                                    style={{
                                      left: hasClick ? "65px" : "5px",
                                    }}
                                    title={`${annotationsCount} annotazioni`}
                                  >
                                    ✏️ {annotationsCount}
                                  </div>
                                )}
                                <div className="tl-shot-hover-action">
                                  <span className="tl-shot-hover-btn">
                                    <Icon name="edit" size={12} />
                                    <span>Modifica</span>
                                  </span>
                                </div>
                              </div>
                              <div className="tl-shot-footer">
                                <span className="tl-shot-label" title={shot.trigger ?? "screenshot"}>
                                  {shot.trigger?.replaceAll("_", " ") ?? "screenshot"}
                                </span>
                                <span className="tl-shot-time" title={`Timestamp assoluto: ${shot.timestamp_ms}ms`}>
                                  {timeLabel}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : null}

      {tab === "Screenshots" ? (
        <div className="card panel">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "14px",
              flexWrap: "wrap",
              gap: "10px",
            }}
          >
            <div>
              <h3 style={{ margin: 0 }}>Captured Screenshots ({screenshots.length})</h3>
              <div className="pd">Catture basate sugli eventi registrati durante il workflow.</div>
            </div>
            <AppButton
              size="sm"
              disabled={scanningDuplicates || screenshots.length < 2 || busy}
              onClick={handleFindDuplicates}
              title="Trova immagini con somiglianza ≥ 60% e ti permette di scegliere quali unire o eliminare"
            >
              {scanningDuplicates ? "Scansione duplicati…" : "🔍 Elimina duplicati (≥ 60%)"}
            </AppButton>
          </div>
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
                            .then(() => refresh())
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
              <AppButton
                size="sm"
                kind="primary"
                icon="save"
                disabled={busy || translating || savingMarkdown}
                onClick={() => handleSaveDocumentation(markdown)}
              >
                {savingMarkdown ? "Salvataggio…" : "Salva Modifiche"}
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
              onChange={handleMarkdownChange}
              screenshots={screenshots}
              disabled={busy || translating}
              showSaveButton={true}
              saving={savingMarkdown}
              onSave={() => handleSaveDocumentation(markdown)}
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
              <div style={{ padding: "16px", background: "rgba(255,255,255,0.03)", borderRadius: "8px", border: "1px solid var(--hair)" }}>
                <div style={{ fontSize: "13px", fontWeight: 500, marginBottom: "8px", color: "var(--text)" }}>
                  Traccia Audio Microfono:
                </div>
                <audio
                  ref={audioPlayerRef}
                  controls
                  src={convertFileSrc(session.audio_path)}
                  style={{ width: "100%", height: "40px" }}
                />
              </div>

              <div style={{ padding: "16px", background: "rgba(255,255,255,0.03)", borderRadius: "8px", border: "1px solid var(--hair)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--text)" }}>
                      Trascrizione del Parlato (Speech-to-Text):
                    </div>
                    {session.audio_transcript ? (
                      <span style={{ fontSize: "11px", color: "#34d399", fontWeight: 600, background: "rgba(52, 211, 153, 0.15)", padding: "2px 8px", borderRadius: "10px" }}>
                        ● Trascritto
                      </span>
                    ) : null}
                    {audioSegments.length > 0 ? (
                      <span style={{ fontSize: "11px", color: "#60a5fa", fontWeight: 600, background: "rgba(96, 165, 250, 0.15)", padding: "2px 8px", borderRadius: "10px" }}>
                        {audioSegments.length} segmenti temporizzati
                      </span>
                    ) : null}
                  </div>

                  {session.audio_transcript && audioSegments.length > 0 && (
                    <div style={{ display: "flex", background: "rgba(255, 255, 255, 0.05)", borderRadius: "6px", padding: "2px", border: "1px solid var(--hair)" }}>
                      <button
                        type="button"
                        onClick={() => setAudioViewMode("segments")}
                        style={{
                          background: audioViewMode === "segments" ? "var(--color-primary)" : "transparent",
                          color: audioViewMode === "segments" ? "#fff" : "var(--dim)",
                          border: "none",
                          borderRadius: "4px",
                          padding: "4px 10px",
                          fontSize: "12px",
                          cursor: "pointer",
                          fontWeight: audioViewMode === "segments" ? 600 : 400,
                          transition: "all 0.15s",
                        }}
                      >
                        Segmenti ({audioSegments.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setAudioViewMode("text")}
                        style={{
                          background: audioViewMode === "text" ? "var(--color-primary)" : "transparent",
                          color: audioViewMode === "text" ? "#fff" : "var(--dim)",
                          border: "none",
                          borderRadius: "4px",
                          padding: "4px 10px",
                          fontSize: "12px",
                          cursor: "pointer",
                          fontWeight: audioViewMode === "text" ? 600 : 400,
                          transition: "all 0.15s",
                        }}
                      >
                        Testo Continuo
                      </button>
                    </div>
                  )}
                </div>

                {session.audio_transcript ? (
                  audioViewMode === "segments" && audioSegments.length > 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "480px", overflowY: "auto", paddingRight: "4px" }}>
                      {audioSegments.map((seg, idx) => {
                        const startSec = Math.floor(seg.start_ms / 1000);
                        const endSec = Math.floor(seg.end_ms / 1000);
                        const fmtTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
                        return (
                          <div
                            key={idx}
                            style={{
                              display: "flex",
                              alignItems: "flex-start",
                              gap: "12px",
                              padding: "10px 14px",
                              borderRadius: "6px",
                              background: "var(--surface)",
                              border: "1px solid var(--hair)",
                              transition: "background 0.15s",
                            }}
                          >
                            <button
                              type="button"
                              title="Ascolta questo segmento"
                              onClick={() => {
                                if (audioPlayerRef.current) {
                                  audioPlayerRef.current.currentTime = seg.start_ms / 1000;
                                  audioPlayerRef.current.play();
                                }
                              }}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "5px",
                                background: "rgba(96, 165, 250, 0.12)",
                                border: "1px solid rgba(96, 165, 250, 0.3)",
                                borderRadius: "4px",
                                padding: "3px 8px",
                                color: "#60a5fa",
                                fontSize: "11px",
                                fontFamily: "monospace",
                                cursor: "pointer",
                                flexShrink: 0,
                                marginTop: "1px",
                              }}
                            >
                              <span>▶</span>
                              <span>{fmtTime(startSec)} - {fmtTime(endSec)}</span>
                            </button>
                            <div style={{ flex: 1, fontSize: "13.5px", lineHeight: "1.5", color: "var(--text)" }}>
                              {seg.text}
                            </div>
                            {typeof seg.avg_logprob === "number" && seg.avg_logprob !== 0 && (
                              <span
                                title={`Whisper logprob: ${seg.avg_logprob.toFixed(2)}`}
                                style={{
                                  fontSize: "10px",
                                  padding: "2px 6px",
                                  borderRadius: "4px",
                                  background: seg.avg_logprob > -0.6 ? "rgba(52, 211, 153, 0.1)" : "rgba(251, 191, 36, 0.1)",
                                  color: seg.avg_logprob > -0.6 ? "#34d399" : "#fbbf24",
                                  fontFamily: "monospace",
                                  flexShrink: 0,
                                }}
                              >
                                {Math.round(Math.min(100, Math.max(0, Math.exp(seg.avg_logprob) * 100)))}%
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div>
                      {audioSegments.length === 0 && (
                        <div
                          style={{
                            marginBottom: "12px",
                            padding: "10px 14px",
                            background: "rgba(234, 179, 8, 0.08)",
                            border: "1px solid rgba(234, 179, 8, 0.3)",
                            borderRadius: "6px",
                            fontSize: "12.5px",
                            color: "#fbbf24",
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                          }}
                        >
                          <span>💡</span>
                          <span>
                            Questa sessione contiene una trascrizione solo testuale senza segmenti temporizzati.
                            Clicca sul pulsante <strong>"Ritrascrivi Audio"</strong> in alto a destra per estrarre la segmentazione con il server Whisper aggiornato.
                          </span>
                        </div>
                      )}
                      <div
                        style={{
                          whiteSpace: "pre-wrap",
                          fontSize: "14px",
                          lineHeight: "1.6",
                          color: "var(--text)",
                          background: "var(--surface)",
                          padding: "14px 16px",
                          borderRadius: "6px",
                          border: "1px solid var(--hair)",
                        }}
                      >
                        {session.audio_transcript}
                      </div>
                    </div>
                  )
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
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "10px",
              marginBottom: "8px",
            }}
          >
            <div>
              <h3 style={{ margin: 0 }}>Session Replay</h3>
              <div className="pd">
                Riproduci e modifica i passaggi generati, con rendering Markdown e annotazioni interattive.
              </div>
            </div>
            {steps.length === 0 && session?.documentation_md ? (
              <AppButton
                size="sm"
                kind="primary"
                icon="sparkles"
                onClick={handleSyncStepsFromDoc}
                disabled={busy}
              >
                Sincronizza Passi dalla Guida
              </AppButton>
            ) : null}
          </div>

          {steps.length === 0 ? (
            <div
              style={{
                marginTop: 18,
                padding: "24px",
                background: "rgba(255,255,255,0.02)",
                borderRadius: "8px",
                border: "1px dashed var(--hair)",
                textAlign: "center",
              }}
            >
              <div style={{ color: "var(--dim)", marginBottom: "12px" }}>
                Nessun passaggio strutturato trovato per questa sessione.
              </div>
              {session?.documentation_md ? (
                <AppButton
                  size="sm"
                  kind="primary"
                  onClick={handleSyncStepsFromDoc}
                  disabled={busy}
                >
                  Recupera automaticamente i Passi dal Markdown
                </AppButton>
              ) : (
                <div style={{ fontSize: "12.5px", color: "var(--dim)" }}>
                  Genera la documentazione per popolare i passaggi di replay.
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="rp-progress" style={{ marginTop: 18 }}>
                <i style={{ width: `${((replayIndex + 1) / steps.length) * 100}%` }} />
              </div>
              <div className="rp-step">
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "8px",
                  }}
                >
                  <div className="rpn">
                    Step {replayIndex + 1} of {steps.length}
                  </div>
                  {!editingStep ? (
                    <button
                      type="button"
                      onClick={() => {
                        setEditStepTitle(replayStep.title);
                        setEditStepDesc(replayStep.description);
                        setEditingStep(true);
                      }}
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--mint, #38bdf8)",
                        fontSize: "12px",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                      }}
                    >
                      ✏️ Modifica Testo Passo
                    </button>
                  ) : (
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button
                        type="button"
                        onClick={() => setEditingStep(false)}
                        style={{
                          background: "none",
                          border: "none",
                          color: "var(--dim)",
                          fontSize: "12px",
                          cursor: "pointer",
                        }}
                      >
                        Annulla
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveStepContent}
                        disabled={savingStep}
                        style={{
                          background: "var(--color-primary)",
                          border: "none",
                          borderRadius: "4px",
                          color: "#fff",
                          padding: "2px 8px",
                          fontSize: "12px",
                          cursor: "pointer",
                        }}
                      >
                        {savingStep ? "Salvataggio..." : "Salva"}
                      </button>
                    </div>
                  )}
                </div>

                {editingStep ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "16px" }}>
                    <div>
                      <div style={{ fontSize: "11px", color: "var(--dim)", marginBottom: "4px", fontWeight: 600 }}>
                        Titolo del Passo:
                      </div>
                      <input
                        type="text"
                        value={editStepTitle}
                        onChange={(e) => setEditStepTitle(e.target.value)}
                        placeholder="Titolo del passo..."
                        style={{
                          width: "100%",
                          padding: "8px 12px",
                          borderRadius: "6px",
                          border: "1px solid var(--hair)",
                          background: "var(--bg-2)",
                          color: "var(--text)",
                          fontSize: "14px",
                          fontWeight: 500,
                        }}
                      />
                    </div>
                    <div>
                      <div style={{ fontSize: "11px", color: "var(--dim)", marginBottom: "6px", fontWeight: 600 }}>
                        Descrizione (Editor Markdown completo, anteprima modificabile & zoom):
                      </div>
                      <MarkdownEditor
                        value={editStepDesc}
                        onChange={setEditStepDesc}
                        screenshots={screenshots}
                        minHeight="280px"
                        maxHeight="520px"
                        compact={true}
                        hideStepTemplate={true}
                        showSaveButton={true}
                        onSave={handleSaveStepContent}
                        onCancel={() => setEditingStep(false)}
                      />
                    </div>
                  </div>
                ) : (
                  <>
                    <h3>{replayStep.title}</h3>
                    <div
                      className="rpd"
                      style={{
                        marginTop: "6px",
                        marginBottom: "12px",
                        lineHeight: "1.6",
                      }}
                    >
                      <MarkdownPreview
                        markdown={replayStep.description}
                        screenshots={screenshots}
                        editable={true}
                        onTextChange={async (oldText, newText) => {
                          let updatedDesc = replayStep.description;
                          if (updatedDesc.includes(oldText)) {
                            updatedDesc = updatedDesc.replace(oldText, newText);
                          } else if (updatedDesc.includes(oldText.trim())) {
                            updatedDesc = updatedDesc.replace(oldText.trim(), newText.trim());
                          } else {
                            const lines = updatedDesc.split("\n");
                            const trimmedOld = oldText.trim();
                            let matched = false;
                            for (let i = 0; i < lines.length; i++) {
                              const stripped = lines[i].replace(/^(\s*#+\s*|\s*[-*+]\s*|\s*\d+\.\s*|\s*>\s*)/, "").trim();
                              if (stripped === trimmedOld || lines[i].includes(trimmedOld)) {
                                const matchPrefix = lines[i].match(/^(\s*#+\s*|\s*[-*+]\s*|\s*\d+\.\s*|\s*>\s*)/);
                                const prefix = matchPrefix ? matchPrefix[0] : "";
                                lines[i] = `${prefix}${newText.trim()}`;
                                updatedDesc = lines.join("\n");
                                matched = true;
                                break;
                              }
                            }
                            if (!matched) {
                              updatedDesc = newText;
                            }
                          }
                          try {
                            setSteps((prev) =>
                              prev.map((s) => (s.step === replayStep.step ? { ...s, description: updatedDesc } : s))
                            );
                            await api.updateStepContent(sessionId, replayStep.step, replayStep.title, updatedDesc);
                            setToast("Passo aggiornato con successo");
                          } catch (err) {
                            setError(String(err));
                            await refresh({ syncMarkdown: false });
                          }
                        }}
                      />
                    </div>
                  </>
                )}

                {/* Screenshot with Right-Click support & Interactive Annotation Overlay */}
                <div
                  className="rp-shot"
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setPickingScreenshotForStep(replayStep.step);
                  }}
                  title="Tasto destro per cambiare lo screenshot di questo step"
                  style={{ position: "relative", cursor: "crosshair" }}
                >
                  {replayScreenshot ? (
                    <>
                      <img
                        src={convertFileSrc(replayScreenshot.path)}
                        alt={replayStep.title}
                        onLoad={(e) => {
                          const target = e.currentTarget;
                          if (target.naturalWidth && target.naturalHeight) {
                            setImgNaturalDims({ w: target.naturalWidth, h: target.naturalHeight });
                          }
                        }}
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

                      <AnnotationOverlay
                        items={currentStepAnnotations}
                        naturalWidth={imgNaturalDims.w}
                        naturalHeight={imgNaturalDims.h}
                        onAnnotationClick={(item) => {
                          setSelectedAnnotationId(item.id);
                          setAnnotatingScreenshot(replayScreenshot);
                        }}
                        onOpenEditor={() => {
                          setSelectedAnnotationId(null);
                          setAnnotatingScreenshot(replayScreenshot);
                        }}
                        onChangeScreenshot={() => {
                          setPickingScreenshotForStep(replayStep.step);
                        }}
                      />
                    </>
                  ) : (
                    <div className="rwin" />
                  )}
                </div>

                <div
                  style={{
                    marginTop: "10px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "8px",
                  }}
                >
                  <div style={{ fontSize: "11.5px", color: "var(--dim)" }}>
                    💡 Fai clic con il tasto destro sull'immagine per sostituire lo screenshot di questo passo.
                  </div>
                  {replayScreenshot && (
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setPickingScreenshotForStep(replayStep.step)}
                        style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "12px" }}
                        title="Seleziona un altro screenshot tra quelli acquisiti"
                      >
                        🖼️ Cambia Immagine
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => {
                          setSelectedAnnotationId(null);
                          setAnnotatingScreenshot(replayScreenshot);
                        }}
                        style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px" }}
                        title="Modifica questo screenshot, sposta click o aggiungi annotazioni grafiche"
                      >
                        🎨 Modifica / Evidenzia Step
                      </button>
                    </div>
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
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
            <div>
              <h3>Screen Recording</h3>
              <div className="pd">
                {selectedVideoMode === "full"
                  ? "Video HD fluido a framerate continuo con audio microfono sincronizzato."
                  : "Timelapse leggero a 1 fotogramma al secondo generato dai frame della sessione."}
              </div>
            </div>

            <div className="seg">
              <button
                type="button"
                className={selectedVideoMode === "full" ? "on" : ""}
                onClick={() => setSelectedVideoMode("full")}
                title="Video HD continuo fluido con audio sincronizzato"
              >
                🎥 Video HD (30 FPS) {fullVideoSrc ? "✓" : ""}
              </button>
              <button
                type="button"
                className={selectedVideoMode === "timelapse" ? "on" : ""}
                onClick={() => setSelectedVideoMode("timelapse")}
                title="Video timelapse a 1 fotogramma al secondo"
              >
                ⏱️ Timelapse (1 FPS) {timelapseVideoSrc ? "✓" : ""}
              </button>
            </div>
          </div>

          <div className="video-tab">
            {activeVideoSrc ? (
              <video
                key={activeVideoSrc}
                src={activeVideoSrc}
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
                    ? "Finalizzazione ed elaborazione video in background in corso…"
                    : "Nessun video registrato per questa modalità."}
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

      {pickingScreenshotForStep != null && (
        <ScreenshotPickerModal
          stepIndex={pickingScreenshotForStep}
          currentScreenshotId={replayScreenshot?.id}
          screenshots={screenshots}
          onSelect={async (newId) => {
            await api.updateStepScreenshot(sessionId, pickingScreenshotForStep, newId);
            setToast("Screenshot del passo aggiornato con successo!");
            await refresh();
          }}
          onClose={() => setPickingScreenshotForStep(null)}
        />
      )}

      {duplicateGroups && (
        <DuplicateScreenshotsModal
          groups={duplicateGroups}
          screenshots={screenshots}
          onMerge={handleMergeDuplicates}
          onClose={() => setDuplicateGroups(null)}
        />
      )}

      {annotatingScreenshot && (
        <ImageAnnotationModal
          sessionId={sessionId}
          screenshot={annotatingScreenshot}
          stepIndex={tab === "Replay" ? replayStep?.step : undefined}
          stepAnnotationsJson={tab === "Replay" ? (replayStep?.annotations_json || null) : null}
          initialSelectedId={selectedAnnotationId}
          onClose={() => {
            setAnnotatingScreenshot(null);
            setSelectedAnnotationId(null);
          }}
          onSaved={async () => {
            setToast("Screenshot aggiornato con successo!");
            await refresh();
          }}
        />
      )}

      <ConfirmModal
        isOpen={Boolean(confirmModal?.isOpen)}
        title={confirmModal?.title ?? ""}
        message={confirmModal?.message ?? ""}
        confirmLabel={confirmModal?.confirmLabel}
        cancelLabel={confirmModal?.cancelLabel}
        kind={confirmModal?.kind ?? "warning"}
        onConfirm={async () => {
          if (confirmModal?.action) {
            const act = confirmModal.action;
            setConfirmModal(null);
            await act();
          }
        }}
        onCancel={() => setConfirmModal(null)}
      />

      <Toast message={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
