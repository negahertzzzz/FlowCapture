import { useEffect, useRef } from "react";
import { DOC_STEPS, EVENT_ICONS } from "../../data/landing";
import { useHeroDemo } from "../../hooks/useHeroDemo";
import { MACOS_DMG_URL } from "../../lib/site";

export function Hero() {
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
          <a
            className="btn btn-primary"
            href={MACOS_DMG_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M16.36 12.6c-.02-2.06 1.68-3.05 1.76-3.1-.96-1.4-2.46-1.6-2.99-1.62-1.27-.13-2.48.75-3.13.75-.64 0-1.64-.73-2.7-.71-1.39.02-2.67.81-3.38 2.05-1.44 2.5-.37 6.2 1.04 8.23.69.99 1.51 2.1 2.59 2.06 1.04-.04 1.43-.67 2.69-.67 1.25 0 1.6.67 2.7.65 1.11-.02 1.82-1.01 2.5-2.01.79-1.15 1.11-2.27 1.13-2.33-.02-.01-2.17-.83-2.2-3.3Zm-2.06-6.06c.57-.69.95-1.65.85-2.61-.82.03-1.81.55-2.4 1.23-.52.61-.98 1.58-.86 2.51.91.07 1.84-.46 2.41-1.13Z" />
            </svg>
            Download for macOS
          </a>
          <a className="btn btn-ghost" href="#how">
            See how it works
          </a>
        </div>
        <div className="micro">
          macOS · Apple Silicon · v0.1.0 · free forever
        </div>
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
