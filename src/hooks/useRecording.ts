import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type Session } from "@/lib/api";

export function useRecording() {
  const navigate = useNavigate();
  const [recording, setRecording] = useState<Session | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refreshRecording() {
    const sessions = await api.listSessions();
    setRecording(sessions.find((session) => session.status === "recording") ?? null);
  }

  useEffect(() => {
    refreshRecording().catch((err) => setError(String(err)));
  }, []);

  async function start(title?: string) {
    setLoading(true);
    setError(null);
    try {
      const permissions = await api.prepareRecordingPermissions();
      if (!permissions.can_record) {
        throw new Error(
          `${permissions.message} Enable \`${permissions.process_name}\` in System Settings, then quit and reopen FlowCapture before trying again.`,
        );
      }
      const session = await api.startRecording(title ?? "New Workflow Session");
      setRecording(session);
      return session;
    } catch (err) {
      setError(String(err));
      throw err;
    } finally {
      setLoading(false);
    }
  }

  async function stop() {
    setLoading(true);
    setError(null);
    try {
      const session = await api.stopRecording();
      setRecording(null);
      navigate(`/sessions/${session.id}`);
      return session;
    } catch (err) {
      setRecording(null);
      await refreshRecording().catch(() => undefined);
      setError(String(err));
      throw err;
    } finally {
      setLoading(false);
    }
  }

  async function markStep() {
    setError(null);
    try {
      await api.captureManualScreenshot();
    } catch (err) {
      setError(String(err));
      throw err;
    }
  }

  return {
    recording,
    loading,
    error,
    setError,
    start,
    stop,
    markStep,
    refreshRecording,
  };
}
