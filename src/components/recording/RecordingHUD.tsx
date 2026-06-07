import { useEffect, useState } from "react";
import { AppButton } from "@/components/ui/AppButton";
import { Icon } from "@/components/ui/Icon";
import type { Session } from "@/lib/api";
import { formatDuration } from "@/lib/utils";

const FEED_TEMPLATES = [
  { k: "mouse click", v: "Finder · left · 412,288" },
  { k: "window focus", v: "System Settings" },
  { k: "key press", v: "⌘ + Space" },
  { k: "mouse click", v: "System Settings · right · 736,140" },
  { k: "scroll", v: "Δ -240" },
  { k: "window focus", v: "Software Update" },
  { k: "key press", v: "⌘ + F" },
  { k: "mouse click", v: "Wi-Fi · left · 357,338" },
  { k: "terminal cmd", v: "brew install node" },
  { k: "window focus", v: "Terminal" },
];

type FeedItem = {
  id: number;
  ts: string;
  k: string;
  v: string;
};

type RecordingHUDProps = {
  session: Session;
  loading: boolean;
  onStop: () => void;
  onMarkStep: () => void;
};

export function RecordingHUD({
  session,
  loading,
  onStop,
  onMarkStep,
}: RecordingHUDProps) {
  const [elapsed, setElapsed] = useState(0);
  const [events, setEvents] = useState(124);
  const [shots, setShots] = useState(2);
  const [feed, setFeed] = useState<FeedItem[]>([]);

  useEffect(() => {
    const startedAt = new Date(session.started_at).getTime();
    function tick() {
      setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    }

    tick();
    const timer = window.setInterval(tick, 1000);
    const eventTimer = window.setInterval(
      () => setEvents((value) => value + Math.floor(8 + Math.random() * 30)),
      700,
    );

    let index = 0;
    const feedTimer = window.setInterval(() => {
      const template = FEED_TEMPLATES[index % FEED_TEMPLATES.length];
      index += 1;
      if (template.k.startsWith("window") || template.k.startsWith("mouse")) {
        setShots((value) => value + (Math.random() > 0.6 ? 1 : 0));
      }
      setFeed((current) =>
        [
          {
            ...template,
            id: Date.now() + Math.random(),
            ts: new Date().toLocaleTimeString("en-US", { hour12: false }),
          },
          ...current,
        ].slice(0, 4),
      );
    }, 1100);

    return () => {
      window.clearInterval(timer);
      window.clearInterval(eventTimer);
      window.clearInterval(feedTimer);
    };
  }, [session.started_at]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === "r"
      ) {
        event.preventDefault();
        if (!loading) onStop();
      }
      if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === "m"
      ) {
        event.preventDefault();
        onMarkStep();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [loading, onMarkStep, onStop]);

  return (
    <>
      <div className="scrim" />
      <div className="hud">
        <div className="hud-top">
          <div className="hud-rec">
            <span className="pulse" />
            <div>
              <div className="hr-t">Recording session</div>
              <div className="hr-s">Capturing screen, input & windows</div>
            </div>
          </div>
          <div className="hud-timer">{formatDuration(elapsed)}</div>
          <div className="hud-stats">
            <div className="hud-stat">
              <div className="hv">{events.toLocaleString()}</div>
              <div className="hl">events</div>
            </div>
            <div className="hud-stat">
              <div className="hv">{shots}</div>
              <div className="hl">screenshots</div>
            </div>
          </div>
        </div>
        <div className="hud-feed">
          {feed.map((item) => (
            <div className="fl" key={item.id}>
              <span className="ft">{item.ts}</span>
              <span className="fk">{item.k}</span>
              <span className="fv">{item.v}</span>
            </div>
          ))}
          {feed.length === 0 ? (
            <div className="fl">
              <span className="ft">--:--:--</span>
              <span className="fk">listening…</span>
              <span className="fv">waiting for activity</span>
            </div>
          ) : null}
        </div>
        <div className="hud-foot">
          <span className="src">
            <Icon name="monitor" size={15} /> Full screen · Built-in Display
          </span>
          <AppButton
            kind="ghost"
            icon="stop"
            disabled={loading}
            onClick={() => onStop()}
            style={{ marginLeft: "auto", background: "#ff5f57", color: "#3a0b09", border: "none" }}
          >
            Stop & Process
          </AppButton>
        </div>
      </div>
    </>
  );
}
