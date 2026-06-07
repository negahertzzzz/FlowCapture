export function HowItWorks() {
  return (
    <section className="blk wrap" id="how">
      <div className="sec-head center reveal">
        <span className="eyebrow">How it works</span>
        <h2>Three steps. Zero manual writing.</h2>
      </div>
      <div className="steps3">
        <div className="card step3 reveal">
          <div className="glyph">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="3.2" />
              <rect x="3" y="6" width="18" height="13" rx="3" />
              <path d="M9 6 10.2 4h3.6L15 6" />
            </svg>
          </div>
          <div className="sn">01 — RECORD</div>
          <h3>Hit record, do your thing</h3>
          <p>
            FlowCapture captures the screen plus the real signals — clicks,
            keystrokes, window switches, scrolls and terminal commands — that
            screenshot tools miss entirely.
          </p>
        </div>
        <div className="card step3 reveal">
          <div className="glyph">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 3v3m0 12v3m9-9h-3M6 12H3" />
              <circle cx="12" cy="12" r="4.2" />
              <path d="M12 8v4l2.5 1.5" />
            </svg>
          </div>
          <div className="sn">02 — UNDERSTAND</div>
          <h3>AI compresses & reasons</h3>
          <p>
            A multi-agent pipeline filters the noise, detects meaningful steps,
            ranks the best screenshots, and writes the prose — all with the
            model you choose.
          </p>
        </div>
        <div className="card step3 reveal">
          <div className="glyph">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14 3v4a1 1 0 0 0 1 1h4" />
              <path d="M5 3h9l5 5v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
              <path d="M8 13h8M8 17h5" />
            </svg>
          </div>
          <div className="sn">03 — EXPORT</div>
          <h3>Ship docs in any format</h3>
          <p>
            Export polished Markdown, HTML, PDF, video, or an interactive AI
            Replay. Review and edit before publishing — every export stays on
            disk.
          </p>
        </div>
      </div>
    </section>
  );
}
