import { useState } from "react";
import { REPLAY_STEPS } from "../../data/landing";

export function AiReplay() {
  const [step, setStep] = useState(0);
  const current = REPLAY_STEPS[step];

  const goNext = () => setStep((s) => (s + 1) % REPLAY_STEPS.length);
  const goPrev = () =>
    setStep((s) => (s - 1 + REPLAY_STEPS.length) % REPLAY_STEPS.length);

  return (
    <section className="blk wrap" id="replay">
      <div className="sec-head reveal">
        <span className="eyebrow">Killer feature</span>
        <h2>AI Replay — docs you step through.</h2>
        <p>
          Instead of a static page, FlowCapture builds an interactive
          walkthrough. Click through each step with the exact screenshot and
          context, like a guided product tour of your own workflow.
        </p>
      </div>
      <div className="replay-wrap reveal">
        <div className="replay-demo">
          <div className="replay-top">
            <span className="stepc">
              Step {step + 1} of {REPLAY_STEPS.length}
            </span>
            <span style={{ fontSize: 13, color: "var(--text-2)" }}>
              {current.title}
            </span>
            <div className="replay-progress">
              <i
                style={{
                  width: `${((step + 1) / REPLAY_STEPS.length) * 100}%`,
                }}
              />
            </div>
          </div>
          <div className="replay-shot">
            <div
              className="ring"
              style={{ left: `${current.x + 2}%`, top: `${current.y + 2}%` }}
            />
            <svg
              className="cursor"
              style={{ left: `${current.x}%`, top: `${current.y}%` }}
              viewBox="0 0 24 24"
              fill="#fff"
              stroke="#052b20"
              strokeWidth="1.2"
            >
              <path d="m4 2 16 10-6.5 1.5L11 21 4 2Z" />
            </svg>
          </div>
          <div className="replay-cap">
            <div className="rt">{current.title}</div>
            <div className="rd">{current.desc}</div>
          </div>
          <div className="replay-nav">
            <button className="btn btn-ghost btn-sm" onClick={goPrev}>
              Previous
            </button>
            <button className="btn btn-primary btn-sm" onClick={goNext}>
              Next step
            </button>
          </div>
        </div>
        <div className="replay-list">
          {REPLAY_STEPS.map((item, i) => (
            <div
              key={i}
              role="button"
              tabIndex={0}
              className={`r-item${step === i ? " active" : ""}`}
              onClick={() => setStep(i)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setStep(i);
                }
              }}
            >
              <div className="rn">{i + 1}</div>
              <div>
                <div className="ri-t">{item.listTitle}</div>
                <div className="ri-d">{item.listDesc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
