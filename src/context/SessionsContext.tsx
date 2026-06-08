import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { api, type Session } from "@/lib/api";
import { useRecordingContext } from "@/context/RecordingContext";

type SessionsContextValue = {
  sessions: Session[];
  refreshSessions: () => Promise<void>;
  patchSession: (sessionId: string, patch: Partial<Session>) => void;
};

const SessionsContext = createContext<SessionsContextValue | null>(null);

export function SessionsProvider({ children }: { children: ReactNode }) {
  const { recording } = useRecordingContext();
  const [sessions, setSessions] = useState<Session[]>([]);

  const refreshSessions = useCallback(async () => {
    const next = await api.listSessions();
    setSessions(next.filter((session) => session.status !== "recording"));
  }, []);

  const patchSession = useCallback((sessionId: string, patch: Partial<Session>) => {
    setSessions((current) =>
      current.map((session) =>
        session.id === sessionId ? { ...session, ...patch } : session,
      ),
    );
  }, []);

  useEffect(() => {
    refreshSessions().catch(() => undefined);
  }, [recording?.id, refreshSessions]);

  useEffect(() => {
    function onFocus() {
      refreshSessions().catch(() => undefined);
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refreshSessions]);

  return (
    <SessionsContext.Provider value={{ sessions, refreshSessions, patchSession }}>
      {children}
    </SessionsContext.Provider>
  );
}

export function useSessionsContext() {
  const context = useContext(SessionsContext);
  if (!context) {
    throw new Error("useSessionsContext must be used within SessionsProvider");
  }
  return context;
}
