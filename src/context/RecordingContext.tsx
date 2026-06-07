import { createContext, useContext, type ReactNode } from "react";
import { useRecording } from "@/hooks/useRecording";

type RecordingContextValue = ReturnType<typeof useRecording>;

const RecordingContext = createContext<RecordingContextValue | null>(null);

export function RecordingProvider({ children }: { children: ReactNode }) {
  const value = useRecording();
  return (
    <RecordingContext.Provider value={value}>{children}</RecordingContext.Provider>
  );
}

export function useRecordingContext() {
  const context = useContext(RecordingContext);
  if (!context) {
    throw new Error("useRecordingContext must be used within RecordingProvider");
  }
  return context;
}
