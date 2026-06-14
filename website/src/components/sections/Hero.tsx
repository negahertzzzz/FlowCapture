import { useEffect, useRef } from "react";
import { DOC_STEPS, EVENT_ICONS } from "../../data/landing";
import { useHeroDemo } from "../../hooks/useHeroDemo";
import { DownloadButton } from "../DownloadButton";
import { usePlatformDownload } from "../../hooks/usePlatformDownload";

export function Hero() {
  const download = usePlatformDownload();
  const demoRef = useRef<HTMLDivElement>(null);
  const {
    events,
    docHeaderVisible,
    visibleSteps,
    phaseTag,
    phaseColor,
    recLabel,
    footLeft,
    footRight,
    footBarWidth,
  } = useHeroDemo(demoRef);

  return (
    <section className="hero wrap">
      <div className="stagger">
        <div>
          <span className="pill">
            <span className="dot" /> Open source · Local-first · Bring your
            own AI key
          </span>
        </div>
        <h1>
          Stop writing guides.
          <br />
          <span className="grad">Just do the work.</span>
        </h1>
        <p className="sub">
          FlowCapture records your screen, mouse, keyboard, windows and terminal
          — then your AI turns the raw session into clean step-by-step
          documentation, SOPs, and interactive walkthroughs. Locally, on your
          machine.
        </p>
        <div className="cta">
          <DownloadButton />
          <a className="btn btn-ghost" href="#how">
            See how it works
          </a>
        </div>
        <div className="micro">{download.note}</div>
      </div>

      <div className="demo-shell reveal" id="heroDemo" ref={demoRef}>
        <div className="demo-bar">
          <div className="tl">
            <i />
            <i />
            <i />
          </div>
          <div className="rec">
            <span className="blink" /> {recLabel}
          </div>
          <div className="phase-tag" style={{ color: phaseColor }}>
            {phaseTag}
          </div>
        </div>
        <div className="demo-body">
          <div className="demo-col">
            <h4>Raw capture</h4>
            <div id="evtStream">
              {events.map((event) => (
                <EventRow key={event.id} event={event} />
              ))}
            </div>
          </div>
          <div className="demo-mid">
            <div className="wire" />
            <div className="core">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 3v3m0 12v3m9-9h-3M6 12H3m13.5-6.5-2.1 2.1m-4.8 8.8-2.1 2.1m0-11 2.1 2.1m8.8 4.8-2.1-2.1" />
              </svg>
            </div>
          </div>
          <div className="demo-col">
            <h4>Generated documentation</h4>
            <div className="doc-card" id="docCard">
              <div
                className={`doc-line doc-h${docHeaderVisible ? " show" : ""}`}
              />
              {DOC_STEPS.map((step, i) => (
                <div
                  key={i}
                  className={`doc-step${visibleSteps.includes(i) ? " show" : ""}`}
                  data-i={i}
                >
                  <div className="num">{i + 1}</div>
                  <div className="tx">
                    <div className="t">{step.title}</div>
                    <div className="d">{step.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="demo-foot">
          <span>{footLeft}</span>
          <div className="bar">
            <i style={{ width: `${footBarWidth}%` }} />
          </div>
          <span>{footRight}</span>
        </div>
      </div>
    </section>
  );
}

type EventRowProps = {
  event: {
    ic: keyof typeof EVENT_ICONS;
    lbl: string;
    meta: string;
    dim?: boolean;
  };
};

function EventRow({ event }: EventRowProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    requestAnimationFrame(() => el.classList.add("show"));
  }, []);

  return (
    <div ref={ref} className={`evt${event.dim ? " dim" : ""}`}>
      <span className="k">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          dangerouslySetInnerHTML={{ __html: EVENT_ICONS[event.ic] }}
        />
      </span>
      <span className="lbl">{event.lbl}</span>
      <span className="meta">{event.meta}</span>
    </div>
  );
}
