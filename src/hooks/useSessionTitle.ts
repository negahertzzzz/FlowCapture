import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useDebouncedEffect } from "@/hooks/useDebouncedEffect";
import { useSessionsContext } from "@/context/SessionsContext";

const SAVE_DELAY_MS = 450;

type UseSessionTitleOptions = {
  sessionId: string;
  initialTitle: string;
  onError: (message: string) => void;
  onSaved?: (title: string) => void;
};

export function useSessionTitle({
  sessionId,
  initialTitle,
  onError,
  onSaved,
}: UseSessionTitleOptions) {
  const { patchSession } = useSessionsContext();
  const [title, setTitle] = useState(initialTitle);
  const [saving, setSaving] = useState(false);
  const lastSavedTitle = useRef(initialTitle);
  const saveRequestId = useRef(0);
  const titleRef = useRef(title);
  const onErrorRef = useRef(onError);
  const onSavedRef = useRef(onSaved);

  titleRef.current = title;
  onErrorRef.current = onError;
  onSavedRef.current = onSaved;

  useEffect(() => {
    setTitle(initialTitle);
    lastSavedTitle.current = initialTitle;
    saveRequestId.current += 1;
    setSaving(false);
  }, [sessionId]);

  useEffect(() => {
    if (!initialTitle) {
      return;
    }

    setTitle((current) => {
      if (current !== "" && current !== lastSavedTitle.current) {
        return current;
      }
      lastSavedTitle.current = initialTitle;
      return initialTitle;
    });
  }, [initialTitle]);

  useDebouncedEffect(() => {
    const trimmed = title.trim();
    if (!trimmed || trimmed === lastSavedTitle.current) {
      return;
    }

    const requestId = ++saveRequestId.current;
    setSaving(true);

    api
      .updateSessionTitle(sessionId, trimmed)
      .then(() => {
        if (requestId !== saveRequestId.current) {
          return;
        }
        lastSavedTitle.current = trimmed;
        patchSession(sessionId, { title: trimmed });
        onSavedRef.current?.(trimmed);
      })
      .catch((err) => onErrorRef.current(String(err)))
      .finally(() => {
        if (requestId === saveRequestId.current) {
          setSaving(false);
        }
      });
  }, [title, sessionId, patchSession], SAVE_DELAY_MS);

  useEffect(() => {
    return () => {
      const trimmed = titleRef.current.trim();
      if (!trimmed || trimmed === lastSavedTitle.current) {
        return;
      }

      const requestId = ++saveRequestId.current;
      void api
        .updateSessionTitle(sessionId, trimmed)
        .then(() => {
          if (requestId !== saveRequestId.current) {
            return;
          }
          patchSession(sessionId, { title: trimmed });
        })
        .catch(() => undefined);
    };
  }, [sessionId, patchSession]);

  return { title, setTitle, saving };
}
