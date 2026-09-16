import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Routes, Route, useNavigate } from "react-router-dom";
import { Sidebar } from "@/components/layout/Sidebar";
import { RecordingHUD } from "@/components/recording/RecordingHUD";
import { RecordingProvider, useRecordingContext } from "@/context/RecordingContext";
import { SessionsProvider } from "@/context/SessionsContext";
import { AiJobProvider, useAiJob } from "@/context/AiJobContext";
import { HomePage } from "@/pages/HomePage";
import { SessionPage } from "@/pages/SessionPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { formatDuration } from "@/lib/utils";

function FloatingAiProgress() {
  const { activeJob, cancelJob, clearJob } = useAiJob();
  const navigate = useNavigate();

  if (!activeJob) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: "20px",
        right: "20px",
        zIndex: 9999,
        background: "rgba(23, 23, 23, 0.95)",
        border: activeJob.error ? "1px solid #ef4444" : activeJob.isDone ? "1px solid #22c55e" : "1px solid rgba(255, 255, 255, 0.15)",
        boxShadow: "0 8px 32px rgba(0, 0, 0, 0.5)",
        backdropFilter: "blur(12px)",
        borderRadius: "10px",
        padding: "12px 16px",
        width: "320px",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        color: "#fff",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 600, fontSize: "13px" }}>
          {activeJob.isDone ? (
            activeJob.error ? (
              <span style={{ color: "#ef4444" }}>❌ Errore AI</span>
            ) : (
              <span style={{ color: "#22c55e" }}>✨ Documento Pronto!</span>
            )
          ) : (
            <>
              <span className="pulse" style={{ width: "8px", height: "8px" }} />
              <span>Generazione AI in corso...</span>
            </>
          )}
        </div>
        {activeJob.isDone && (
          <button
            type="button"
            onClick={clearJob}
            style={{
              background: "transparent",
              border: "none",
              color: "#aaa",
              cursor: "pointer",
              fontSize: "14px",
            }}
          >
            ✕
          </button>
        )}
      </div>

      <div style={{ fontSize: "12px", color: "#ccc", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {activeJob.sessionTitle}
      </div>

      <div style={{ fontSize: "11px", color: "#888" }}>
        Fase: <span style={{ color: "#eee" }}>{activeJob.stage.replaceAll("_", " ")}</span>
      </div>

      <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
        <button
          type="button"
          onClick={() => navigate(`/sessions/${activeJob.sessionId}`)}
          style={{
            flex: 1,
            padding: "5px 10px",
            fontSize: "12px",
            borderRadius: "6px",
            background: "rgba(255, 255, 255, 0.1)",
            border: "none",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          Vai alla sessione
        </button>
        {!activeJob.isDone && (
          <button
            type="button"
            onClick={() => cancelJob(activeJob.sessionId)}
            style={{
              padding: "5px 10px",
              fontSize: "12px",
              borderRadius: "6px",
              background: "rgba(239, 68, 68, 0.2)",
              border: "1px solid rgba(239, 68, 68, 0.4)",
              color: "#f87171",
              cursor: "pointer",
            }}
          >
            Annulla
          </button>
        )}
      </div>
    </div>
  );
}

function AppShell() {
  const {
    recording,
    loading,
    stop,
    markStep,
    recordAudio,
    selectedMicId,
    audioDevices,
    highlightClicks,
    selectedMonitorName,
    monitors,
    selectedMonitorId,
    switchMonitor,
    isPaused,
    isMuted,
    pause,
    resume,
    toggleMute,
    switchMicrophone,
  } = useRecordingContext();
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!recording) {
      setElapsed(0);
      return;
    }

    const startedAt = new Date(recording.started_at).getTime();
    function tick() {
      setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    }

    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [recording]);

  useEffect(() => {
    const appWindow = getCurrentWindow();
    if (recording) {
      void appWindow.setTitle(`REC ${formatDuration(elapsed)} — FlowCapture`);
    } else {
      void appWindow.setTitle("FlowCapture");
    }
  }, [recording, elapsed]);

  return (
    <div className="win">
      <div className="app-body">
        <Sidebar />
        <main className="main">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/sessions/:sessionId" element={<SessionPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>
      </div>
      {recording ? (
        <RecordingHUD
          session={recording}
          loading={loading}
          onStop={() => stop()}
          onMarkStep={() => markStep()}
          recordAudio={recordAudio}
          selectedMicId={selectedMicId}
          audioDevices={audioDevices}
          onSwitchMicrophone={switchMicrophone}
          isMuted={isMuted}
          onToggleMute={toggleMute}
          isPaused={isPaused}
          onPause={pause}
          onResume={resume}
          monitors={monitors}
          selectedMonitorId={selectedMonitorId}
          onSwitchMonitor={switchMonitor}
          highlightClicks={highlightClicks}
          selectedMonitorName={selectedMonitorName}
        />
      ) : null}
      <FloatingAiProgress />
    </div>
  );
}

export default function App() {
  return (
    <RecordingProvider>
      <SessionsProvider>
        <AiJobProvider>
          <AppShell />
        </AiJobProvider>
      </SessionsProvider>
    </RecordingProvider>
  );
}
