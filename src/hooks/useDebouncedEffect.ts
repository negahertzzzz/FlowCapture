import { useEffect, useRef } from "react";

export function useDebouncedEffect(
  effect: () => void | (() => void),
  deps: readonly unknown[],
  delayMs: number,
) {
  const effectRef = useRef(effect);
  effectRef.current = effect;

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      effectRef.current();
    }, delayMs);

    return () => window.clearTimeout(timeout);
  }, deps);
}
