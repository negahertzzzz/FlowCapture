import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import type { AnnotationItem } from "@/components/sessions/ImageAnnotationModal";
import { api, type Screenshot, type WorkflowStep } from "@/lib/api";

type UseReplayEditorOptions = {
  sessionId: string;
  steps: WorkflowStep[];
  setSteps: Dispatch<SetStateAction<WorkflowStep[]>>;
  screenshots: Screenshot[];
  refresh: (options?: { syncMarkdown?: boolean }) => Promise<void>;
  onToast: (message: string) => void;
  onError: (message: string) => void;
};

const MARKDOWN_PREFIX_RE = /^(\s*#+\s*|\s*[-*+]\s*|\s*\d+\.\s*|\s*>\s*)/;

/** Applies an edit made directly on the rendered description back onto its Markdown source. */
export function applyInlineEdit(markdown: string, oldText: string, newText: string): string {
  if (markdown.includes(oldText)) return markdown.replace(oldText, newText);
  if (markdown.includes(oldText.trim())) return markdown.replace(oldText.trim(), newText.trim());

  const lines = markdown.split("\n");
  const trimmedOld = oldText.trim();
  for (let i = 0; i < lines.length; i++) {
    const stripped = lines[i].replace(MARKDOWN_PREFIX_RE, "").trim();
    if (stripped === trimmedOld || lines[i].includes(trimmedOld)) {
      const prefix = lines[i].match(MARKDOWN_PREFIX_RE)?.[0] ?? "";
      lines[i] = `${prefix}${newText.trim()}`;
      return lines.join("\n");
    }
  }
  return newText;
}

/**
 * State and actions behind the Replay tab: step navigation, text editing (form or inline),
 * screenshot swapping, annotations and the full-screen viewer.
 */
export function useReplayEditor({
  sessionId,
  steps,
  setSteps,
  screenshots,
  refresh,
  onToast,
  onError,
}: UseReplayEditorOptions) {
  const [index, setIndex] = useState(0);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [naturalDims, setNaturalDims] = useState<{ w: number; h: number }>({ w: 1920, h: 1080 });
  const [pickingScreenshot, setPickingScreenshot] = useState(false);
  const [annotating, setAnnotating] = useState(false);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);

  // Keep the index valid when steps are removed or re-synced.
  useEffect(() => {
    if (steps.length > 0 && index > steps.length - 1) setIndex(steps.length - 1);
  }, [steps.length, index]);

  const step: WorkflowStep | undefined = steps[index];

  const screenshot = useMemo<Screenshot | null>(() => {
    if (!step) return null;
    const screenshotId = step.screenshot_ids[0];
    return screenshots.find((shot) => shot.id === screenshotId) ?? screenshots[index] ?? null;
  }, [step, screenshots, index]);

  const annotations = useMemo<AnnotationItem[]>(() => {
    if (!step) return [];
    const jsonStr = step.annotations_json || screenshot?.annotations_json;
    if (!jsonStr) {
      if (screenshot?.click_x != null && screenshot?.click_y != null) {
        return [
          {
            id: "click_primary",
            type: "click",
            x: screenshot.click_x,
            y: screenshot.click_y,
            color: "#ef4444",
            strokeWidth: 3,
          },
        ];
      }
      return [];
    }
    try {
      const parsed = JSON.parse(jsonStr);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, [step, screenshot]);

  const goTo = useCallback(
    (next: number) => {
      setEditing(false);
      setIndex(Math.max(0, Math.min(steps.length - 1, next)));
    },
    [steps.length],
  );
  const goPrev = useCallback(() => goTo(index - 1), [goTo, index]);
  const goNext = useCallback(() => goTo(index + 1), [goTo, index]);

  const startEditing = useCallback(() => {
    if (!step) return;
    setEditTitle(step.title);
    setEditDesc(step.description);
    setEditing(true);
  }, [step]);

  const cancelEditing = useCallback(() => setEditing(false), []);

  const saveEditing = useCallback(async () => {
    if (!step) return;
    setSaving(true);
    try {
      await api.updateStepContent(sessionId, step.step, editTitle, editDesc);
      setSteps((prev) =>
        prev.map((s) => (s.step === step.step ? { ...s, title: editTitle, description: editDesc } : s)),
      );
      onToast("Passo aggiornato con successo");
      setEditing(false);
      await refresh({ syncMarkdown: true });
    } catch (err) {
      onError(String(err));
    } finally {
      setSaving(false);
    }
  }, [step, sessionId, editTitle, editDesc, setSteps, onToast, onError, refresh]);

  const applyInlineTextChange = useCallback(
    async (oldText: string, newText: string) => {
      if (!step || !oldText || oldText === newText) return;
      const updatedDesc = applyInlineEdit(step.description, oldText, newText);
      setSteps((prev) => prev.map((s) => (s.step === step.step ? { ...s, description: updatedDesc } : s)));
      try {
        await api.updateStepContent(sessionId, step.step, step.title, updatedDesc);
        onToast("Passo aggiornato con successo");
        await refresh({ syncMarkdown: true });
      } catch (err) {
        onError(String(err));
        await refresh({ syncMarkdown: false });
      }
    },
    [step, sessionId, setSteps, onToast, onError, refresh],
  );

  const changeScreenshot = useCallback(
    async (screenshotId: string) => {
      if (!step) return;
      await api.updateStepScreenshot(sessionId, step.step, screenshotId);
      onToast("Screenshot del passo aggiornato con successo!");
      await refresh({ syncMarkdown: true });
    },
    [step, sessionId, onToast, refresh],
  );

  const syncStepsFromDoc = useCallback(async () => {
    setSyncing(true);
    try {
      const synced = await api.getReplaySteps(sessionId);
      setSteps(synced);
      onToast(
        synced.length > 0
          ? `Recuperati ${synced.length} passi dalla documentazione`
          : "Nessun passo trovato nella documentazione",
      );
    } catch (err) {
      onError(String(err));
    } finally {
      setSyncing(false);
    }
  }, [sessionId, setSteps, onToast, onError]);

  const openAnnotations = useCallback((annotationId: string | null = null) => {
    setSelectedAnnotationId(annotationId);
    setAnnotating(true);
  }, []);

  const closeAnnotations = useCallback(() => {
    setAnnotating(false);
    setSelectedAnnotationId(null);
  }, []);

  const onAnnotationsSaved = useCallback(async () => {
    onToast("Screenshot aggiornato con successo!");
    await refresh();
  }, [onToast, refresh]);

  const onImageLoad = useCallback((img: HTMLImageElement) => {
    if (img.naturalWidth && img.naturalHeight) {
      setNaturalDims({ w: img.naturalWidth, h: img.naturalHeight });
    }
  }, []);

  const modalOpen = pickingScreenshot || annotating || fullscreen;

  // ←/→ move between steps unless the user is typing or a modal owns the keyboard.
  useEffect(() => {
    if (editing || modalOpen) return;
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
      ) {
        return;
      }
      if (event.key === "ArrowLeft") goPrev();
      else if (event.key === "ArrowRight") goNext();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, modalOpen, goPrev, goNext]);

  return {
    index,
    step,
    screenshot,
    annotations,
    naturalDims,
    onImageLoad,
    goTo,
    goPrev,
    goNext,
    hasPrev: index > 0,
    hasNext: index < steps.length - 1,

    editing,
    editTitle,
    setEditTitle,
    editDesc,
    setEditDesc,
    saving,
    startEditing,
    cancelEditing,
    saveEditing,
    applyInlineTextChange,

    syncing,
    syncStepsFromDoc,

    pickingScreenshot,
    openScreenshotPicker: () => setPickingScreenshot(true),
    closeScreenshotPicker: () => setPickingScreenshot(false),
    changeScreenshot,

    annotating,
    selectedAnnotationId,
    openAnnotations,
    closeAnnotations,
    onAnnotationsSaved,

    fullscreen,
    openFullscreen: () => setFullscreen(true),
    closeFullscreen: () => setFullscreen(false),
  };
}
