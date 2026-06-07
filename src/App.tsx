import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Routes, Route } from "react-router-dom";
import { Sidebar } from "@/components/layout/Sidebar";
import { RecordingHUD } from "@/components/recording/RecordingHUD";
import { RecordingProvider, useRecordingContext } from "@/context/RecordingContext";
import { HomePage } from "@/pages/HomePage";
import { SessionPage } from "@/pages/SessionPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { formatDuration } from "@/lib/utils";

function AppShell() {
  const { recording, loading, stop, markStep } = useRecordingContext();
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
        />
      ) : null}
    </div>
  );
}

export default function App() {
  return (
    <RecordingProvider>
      <AppShell />
    </RecordingProvider>
  );
}
