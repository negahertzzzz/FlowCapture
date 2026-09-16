import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { open } from "@tauri-apps/plugin-dialog";
import { AppButton } from "@/components/ui/AppButton";
import { Icon } from "@/components/ui/Icon";
import { Toast } from "@/components/ui/Toast";
import { PermissionsBanner } from "@/components/recording/PermissionsBanner";
import { SessionThumbnail } from "@/components/sessions/SessionThumbnail";
import { useRecordingContext } from "@/context/RecordingContext";
import { useSessionsContext } from "@/context/SessionsContext";
import { api } from "@/lib/api";
import { statusBadgeClass } from "@/lib/icons";
import { formatDuration, formatTimestamp } from "@/lib/utils";

export function HomePage() {
  const navigate = useNavigate();
  const {
    loading,
    error,
    setError,
    start,
    audioDevices,
    selectedMicId,
    setSelectedMicId,
    recordAudio,
    setRecordAudio,
    transcribeAudio,
    setTranscribeAudio,
    highlightClicks,
    setHighlightClicks,
    refreshAudioDevices,
    monitors,
    selectedMonitorId,
    setSelectedMonitorId,
    refreshMonitors,
  } = useRecordingContext();
  const { sessions, refreshSessions } = useSessionsContext();
  const [platform, setPlatform] = useState("");
  const [canRecord, setCanRecord] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [captureAllEvents, setCaptureAllEvents] = useState(false);
  const [importing, setImporting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  async function handleImportSession() {
    try {
      const selected = await open({
        multiple: false,
        directory: false,
        title: "Seleziona sessione FlowCapture da importare",
        filters: [
          {
            name: "FlowCapture Session (*.flowcapture, *.zip)",
            extensions: ["flowcapture", "zip"],
          },
        ],
      });

      if (!selected) return;
      const filePath = typeof selected === "string" ? selected : selected[0];
      if (!filePath) return;

      setImporting(true);
      setError(null);

      const imported = await api.importSessionBundle(filePath);
      await refreshSessions();
      setToastMessage(`Sessione "${imported.title}" importata con successo!`);
      setTimeout(() => setToastMessage(null), 4000);
      navigate(`/sessions/${imported.id}`);
    } catch (err) {
      setError(`Errore durante l'importazione della sessione: ${err}`);
    } finally {
      setImporting(false);
    }
  }

  useEffect(() => {
    api.getSetting("capture_all_events").then((val) => {
      setCaptureAllEvents(val === "true");
    }).catch(() => undefined);
  }, []);

  function handlePermissionsChange(
    permissions: Awaited<ReturnType<typeof api.getRecordingPermissions>>,
  ) {
    setCanRecord(permissions.can_record);
  }

  async function refresh() {
    setRefreshing(true);
    try {
      const nextPlatform = await api.getPlatformName();
      await refreshSessions();
      setPlatform(nextPlatform);
      await refreshAudioDevices();
    } catch (err) {
      setError(String(err));
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    refresh().catch((err) => setError(String(err)));
  }, [setError]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === "r" &&
        canRecord &&
        !loading
      ) {
        event.preventDefault();
        start().catch(() => undefined);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canRecord, loading, start]);

  return (
    <div className="page">
      <div className="home-hero home-top">
        <div>
          <div className="kick">FLOWCAPTURE</div>
          <h1>Turn workflows into documentation</h1>
          <p className="lead">
            Record screen activity, capture input events, and generate Markdown, HTML,
            PDF and video exports with your own AI provider.
          </p>
        </div>
        <span className="plat">
          <Icon name="monitor" size={15} /> Platform: {platform || "detecting…"}
        </span>
      </div>

      <PermissionsBanner onPermissionsChange={handlePermissionsChange} />

      <div className="card rec-card">
        <h3>Recording</h3>
        <p>
          Start a new session to record your screen, mouse activity, keyboard input, and
          window changes.
        </p>

        <div
          style={{
            margin: "18px 0",
            padding: "14px 16px",
            background: "rgba(255,255,255,0.03)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
          }}
        >
          {/* Schermo da registrare */}
          <div style={{ borderBottom: "1px solid var(--border)", paddingBottom: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "16px" }}>🖥️</span>
                <div>
                  <div style={{ fontWeight: 500, fontSize: "13.5px" }}>
                    Schermo da registrare {monitors.length > 1 ? `(${monitors.length} schermi rilevati)` : ""}
                  </div>
                  <div style={{ fontSize: "12px", color: "var(--dim)" }}>
                    Scegli quale monitor catturare durante la sessione di lavoro
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <select
                  id="home-monitor-select"
                  value={selectedMonitorId}
                  onChange={(e) => setSelectedMonitorId(e.target.value)}
                  style={{
                    background: "var(--bg-3, #151b23)",
                    color: "var(--text-1)",
                    border: "1px solid var(--border)",
                    borderRadius: "6px",
                    padding: "5px 10px",
                    fontSize: "12.5px",
                    maxWidth: "280px",
                  }}
                >
                  {monitors.map((mon, idx) => (
                    <option key={mon.id || idx} value={mon.id}>
                      {mon.name} {mon.is_primary ? "(Principale)" : ""} · {mon.width}x{mon.height}
                    </option>
                  ))}
                  {monitors.length === 0 && (
                    <option value="">Schermo Principale (Predefinito)</option>
                  )}
                </select>
                <AppButton
                  size="sm"
                  kind="ghost"
                  onClick={() => refreshMonitors()}
                  title="Rileva schermi"
                >
                  <Icon name="refresh" size={13} />
                </AppButton>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "16px" }}>🎯</span>
              <div>
                <div style={{ fontWeight: 500, fontSize: "13.5px" }}>Evidenzia click negli screenshot</div>
                <div style={{ fontSize: "12px", color: "var(--dim)" }}>Disegna un indicatore visivo ad alto contrasto dove viene premuto il mouse</div>
              </div>
            </div>
            <div className="seg">
              <button
                type="button"
                className={highlightClicks ? "on" : ""}
                onClick={() => setHighlightClicks(true)}
              >
                On
              </button>
              <button
                type="button"
                className={!highlightClicks ? "on" : ""}
                onClick={() => setHighlightClicks(false)}
              >
                Off
              </button>
            </div>
          </div>

          <div style={{ borderTop: "1px solid var(--border)", paddingTop: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "16px" }}>🎙️</span>
                <div>
                  <div style={{ fontWeight: 500, fontSize: "13.5px" }}>Registra audio microfono</div>
                  <div style={{ fontSize: "12px", color: "var(--dim)" }}>Cattura la tua voce e le spiegazioni durante la registrazione</div>
                </div>
              </div>
              <div className="seg">
                <button
                  type="button"
                  className={recordAudio ? "on" : ""}
                  onClick={() => setRecordAudio(true)}
                >
                  On
                </button>
                <button
                  type="button"
                  className={!recordAudio ? "on" : ""}
                  onClick={() => setRecordAudio(false)}
                >
                  Off
                </button>
              </div>
            </div>

            {recordAudio ? (
              <div style={{ marginTop: "12px", paddingLeft: "26px", display: "flex", flexDirection: "column", gap: "10px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                  <label htmlFor="mic-select" style={{ fontSize: "12.5px", color: "var(--text-2)", minWidth: "120px" }}>
                    Scelta Microfono:
                  </label>
                  <select
                    id="mic-select"
                    value={selectedMicId}
                    onChange={(e) => setSelectedMicId(e.target.value)}
                    style={{
                      background: "var(--bg-3, #151b23)",
                      color: "var(--text-1)",
                      border: "1px solid var(--border)",
                      padding: "6px 12px",
                      borderRadius: "6px",
                      fontSize: "13px",
                      minWidth: "220px",
                    }}
                  >
                    <option value="">Microfono Predefinito</option>
                    {audioDevices.map((device, idx) => (
                      <option key={device.deviceId || idx} value={device.deviceId}>
                        {device.label || `Microfono ${idx + 1}`}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.mediaDevices
                        ?.getUserMedia({ audio: true })
                        .then((stream) => {
                          stream.getTracks().forEach((t) => t.stop());
                          return refreshAudioDevices();
                        })
                        .catch(() => undefined);
                    }}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "var(--color-primary, #60a5fa)",
                      fontSize: "12px",
                      cursor: "pointer",
                      textDecoration: "underline",
                    }}
                  >
                    Aggiorna lista
                  </button>
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
                  <div style={{ fontSize: "12.5px", color: "var(--text-2)" }}>
                    Trascrizione audio automatica (AI):
                  </div>
                  <div className="seg">
                    <button
                      type="button"
                      className={transcribeAudio ? "on" : ""}
                      onClick={() => setTranscribeAudio(true)}
                    >
                      Attiva
                    </button>
                    <button
                      type="button"
                      className={!transcribeAudio ? "on" : ""}
                      onClick={() => setTranscribeAudio(false)}
                    >
                      Disattiva
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div style={{ borderTop: "1px solid var(--border)", paddingTop: "12px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "16px" }}>📸</span>
              <div>
                <div style={{ fontWeight: 500, fontSize: "13.5px" }}>Screenshot su ogni evento (Modalità densa)</div>
                <div style={{ fontSize: "12px", color: "var(--dim)" }}>Cattura uno screenshot non solo ai click ma anche per tastiera e scroll</div>
              </div>
            </div>
            <div className="seg">
              <button
                type="button"
                className={captureAllEvents ? "on" : ""}
                onClick={async () => {
                  setCaptureAllEvents(true);
                  await api.setSetting("capture_all_events", "true");
                }}
              >
                On
              </button>
              <button
                type="button"
                className={!captureAllEvents ? "on" : ""}
                onClick={async () => {
                  setCaptureAllEvents(false);
                  await api.setSetting("capture_all_events", "false");
                }}
              >
                Off
              </button>
            </div>
          </div>
        </div>

        <div className="rec-actions" style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <AppButton
            kind="primary"
            icon="play"
            disabled={loading || !canRecord}
            onClick={() => start().catch(() => undefined)}
          >
            Start Recording
          </AppButton>
          <AppButton
            icon="folder"
            disabled={importing}
            onClick={handleImportSession}
          >
            {importing ? "Importazione…" : "Importa Sessione (.flowcapture)"}
          </AppButton>
          <span style={{ fontFamily: "var(--mono)", fontSize: 12.5, color: "var(--dim)" }}>
            ⌘⇧R
          </span>
        </div>
      </div>

      {error ? (
        <div
          className="card set-card"
          style={{ marginTop: 18, borderColor: "rgba(255,138,138,.35)", color: "var(--rose)" }}
        >
          {error}
        </div>
      ) : null}

      <div className="sec-row">
        <h2>Recent Sessions</h2>
        <AppButton
          size="sm"
          icon="refresh"
          className={refreshing ? "is-spinning" : undefined}
          disabled={refreshing}
          onClick={() => refresh()}
        >
          {refreshing ? "Refreshing…" : "Refresh"}
        </AppButton>
      </div>
      <div className="sess-list">
        {sessions.length === 0 ? (
          <div className="card panel">
            <div className="pd">
              No sessions yet. Start your first recording to build documentation.
            </div>
          </div>
        ) : (
          sessions.map((session) => (
            <div
              key={session.id}
              className="sess"
              role="button"
              tabIndex={0}
              onClick={() => navigate(`/sessions/${session.id}`)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  navigate(`/sessions/${session.id}`);
                }
              }}
              style={{ position: "relative" }}
            >
              <SessionThumbnail path={session.preview_screenshot_path} />
              <div className="sinfo">
                <div className="stt">{session.title}</div>
                <div className="stm">
                  {formatTimestamp(session.started_at)}
                  <span className={`badge ${statusBadgeClass(session.status)}`}>
                    {session.status}
                  </span>
                  <span>{formatDuration(session.duration)}</span>
                </div>
              </div>
              <div className="sdur">{formatDuration(session.duration)}</div>
              <button
                type="button"
                title="Elimina sessione"
                onClick={async (e) => {
                  e.stopPropagation();
                  if (window.confirm(`Sei sicuro di voler eliminare la sessione "${session.title}"?`)) {
                    try {
                      await api.deleteSession(session.id);
                      await refreshSessions();
                    } catch (delErr) {
                      setError(String(delErr));
                    }
                  }
                }}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#ef4444",
                  padding: "6px",
                  cursor: "pointer",
                  borderRadius: "4px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: 0.7,
                  transition: "opacity 0.2s",
                }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.opacity = "1")}
                onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.opacity = "0.7")}
              >
                <Icon name="trash" size={16} />
              </button>
            </div>
          ))
        )}
      </div>

      <Toast message={toastMessage} onDismiss={() => setToastMessage(null)} />
    </div>
  );
}
