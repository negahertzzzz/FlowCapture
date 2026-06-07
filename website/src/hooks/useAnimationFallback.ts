import { useEffect } from "react";

function forceReveal() {
  document.documentElement.classList.add("no-anim-fallback");
}

export function useAnimationFallback() {
  useEffect(() => {
    try {
      const t0 = (document.timeline && document.timeline.currentTime) || 0;
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const t1 = (document.timeline && document.timeline.currentTime) || 0;
          if (t1 === t0) forceReveal();
        }),
      );
    } catch {
      /* noop */
    }

    const timeout = window.setTimeout(() => {
      const h1 = document.querySelector(".hero h1");
      if (h1 && parseFloat(getComputedStyle(h1).opacity) < 0.9) {
        forceReveal();
      }
    }, 1400);

    return () => window.clearTimeout(timeout);
  }, []);
}
