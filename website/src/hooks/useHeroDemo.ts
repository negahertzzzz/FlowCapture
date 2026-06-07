import { useEffect, useRef, useState } from "react";
import { DEMO_EVENTS } from "../data/landing";

type VisibleEvent = (typeof DEMO_EVENTS)[number] & { id: number };

export function useHeroDemo(demoRef: React.RefObject<HTMLElement | null>) {
  const [events, setEvents] = useState<VisibleEvent[]>([]);
  const [docHeaderVisible, setDocHeaderVisible] = useState(false);
  const [visibleSteps, setVisibleSteps] = useState<number[]>([]);
  const [phaseTag, setPhaseTag] = useState("● CAPTURING EVENTS");
  const [phaseColor, setPhaseColor] = useState("var(--mint)");
  const [recLabel, setRecLabel] = useState("Recording session");
  const [footLeft, setFootLeft] = useState("0 raw events");
  const [footRight, setFootRight] = useState("capturing →");
  const [footBarWidth, setFootBarWidth] = useState(0);

  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const demoEl = demoRef.current;
    if (!demoEl) return;

    const clearTimers = () => {
      timersRef.current.forEach((id) => window.clearTimeout(id));
      timersRef.current = [];
    };

    const after = (ms: number, fn: () => void) => {
      timersRef.current.push(window.setTimeout(fn, ms));
    };

    const reset = () => {
      setEvents([]);
      setDocHeaderVisible(false);
      setVisibleSteps([]);
      setFootBarWidth(0);
      setPhaseTag("● CAPTURING EVENTS");
      setPhaseColor("var(--mint)");
      setRecLabel("Recording session");
      setFootLeft("0 raw events");
      setFootRight("capturing →");
    };

    const runDemo = () => {
      clearTimers();
      reset();

      let count = 0;
      DEMO_EVENTS.forEach((event, i) => {
        after(300 + i * 360, () => {
          setEvents((prev) => {
            const next = [...prev, { ...event, id: i }];
            return next.slice(-6);
          });
          count += Math.floor(4000 + Math.random() * 5000);
          setFootLeft(`${count.toLocaleString()} raw events`);
        });
      });

      const capEnd = 300 + DEMO_EVENTS.length * 360 + 300;

      after(capEnd, () => {
        setPhaseTag("◌ COMPRESSING");
        setPhaseColor("var(--ice)");
        setRecLabel("Processing with Claude");
        setFootRight("compressing →");

        let progress = 0;
        const tick = () => {
          progress += 7 + Math.random() * 9;
          if (progress > 100) progress = 100;
          setFootBarWidth(progress);
          if (progress < 100) after(90, tick);
        };
        tick();
      });

      after(capEnd + 1300, () => {
        setPhaseTag("✓ DOCUMENTATION READY");
        setPhaseColor("var(--mint)");
        setFootLeft("52,418 → 15 steps");
        setFootRight("ready ✓");
        setDocHeaderVisible(true);
        [0, 1, 2].forEach((step, i) => {
          after(i * 420, () => {
            setVisibleSteps((prev) => [...prev, step]);
          });
        });
      });

      after(capEnd + 4600, runDemo);
    };

    if (reduce) {
      setDocHeaderVisible(true);
      setVisibleSteps([0, 1, 2]);
      setFootBarWidth(100);
      setPhaseTag("✓ DOCUMENTATION READY");
      setEvents(
        DEMO_EVENTS.slice(0, 5).map((event, id) => ({ ...event, id })),
      );
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) runDemo();
          else clearTimers();
        });
      },
      { threshold: 0.25 },
    );

    observer.observe(demoEl);
    return () => {
      clearTimers();
      observer.disconnect();
    };
  }, [demoRef]);

  return {
    events,
    docHeaderVisible,
    visibleSteps,
    phaseTag,
    phaseColor,
    recLabel,
    footLeft,
    footRight,
    footBarWidth,
  };
}
