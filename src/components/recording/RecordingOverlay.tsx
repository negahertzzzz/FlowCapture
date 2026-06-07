import { useEffect, useState } from "react";
import { Circle, Flag, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDuration } from "@/lib/utils";
import type { Session } from "@/lib/api";

interface RecordingOverlayProps {
  session: Session;
  loading: boolean;
  onStop: () => void;
  onMarkStep: () => void;
}

export function RecordingOverlay({
  session,
  loading,
  onStop,
  onMarkStep,
}: RecordingOverlayProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const startedAt = new Date(session.started_at).getTime();

    function tick() {
      setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    }

    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [session.started_at]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "m") {
        event.preventDefault();
        onMarkStep();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onMarkStep]);

  return (
    <div className="fixed bottom-6 right-6 z-50 w-[min(92vw,360px)] rounded-2xl border border-[var(--color-primary)]/30 bg-[rgba(10,14,20,0.92)] p-4 shadow-2xl shadow-black/40 backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-[var(--color-primary)]">
            <Circle className="h-3 w-3 fill-[var(--color-destructive)] text-[var(--color-destructive)]" />
            Recording
          </div>
          <div className="mt-1 text-lg font-semibold">{session.title}</div>
          <div className="mt-1 text-sm text-[var(--color-muted-foreground)]">
            {formatDuration(elapsed)} elapsed
          </div>
        </div>
        <div className="rounded-lg bg-[var(--color-muted)] px-3 py-2 font-mono text-lg">
          {formatDuration(elapsed)}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="destructive" size="sm" onClick={onStop} disabled={loading}>
          <Square className="h-4 w-4" />
          Stop
        </Button>
        <Button variant="secondary" size="sm" onClick={onMarkStep} disabled={loading}>
          <Flag className="h-4 w-4" />
          Mark Step
        </Button>
      </div>

      <p className="mt-3 text-xs text-[var(--color-muted-foreground)]">
        Shortcut: Cmd/Ctrl + Shift + M to mark a manual step.
      </p>
    </div>
  );
}
