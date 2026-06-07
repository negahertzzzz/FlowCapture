export function Features() {
  return (
    <section className="blk wrap" id="features">
      <div className="sec-head reveal">
        <span className="eyebrow">Why FlowCapture</span>
        <h2>Built for workflows software actually has.</h2>
        <p>
          Most tools document what a browser shows. FlowCapture understands
          terminals, IDEs, and full desktop flows — the things developers
          actually work in.
        </p>
      </div>
      <div className="bento">
        <div className="feat span3 reveal">
          <div className="ic">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <path d="m7 9 3 3-3 3M13 15h4" />
            </svg>
          </div>
          <h3>Deep event capture, not just pixels</h3>
          <p>
            Clicks, keystrokes, shortcuts, scrolls, window focus, app switches
            and terminal commands — the rich context that makes docs accurate.
          </p>
          <div className="chips">
            <span className="chip on">mouse</span>
            <span className="chip on">keyboard</span>
            <span className="chip on">windows</span>
            <span className="chip on">terminal</span>
            <span className="chip">
              browser <span style={{ opacity: 0.6 }}>· v2</span>
            </span>
          </div>
        </div>
        <div className="feat span3 reveal">
          <div className="ic">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 3 4 6v6c0 4.5 3.2 7.8 8 9 4.8-1.2 8-4.5 8-9V6l-8-3Z" />
              <path d="m9 12 2 2 4-4" />
            </svg>
          </div>
          <h3>Local-first & private by default</h3>
          <p>
            Sessions, screenshots and exports live in SQLite on your machine.
            Passwords, API keys and tokens are redacted before any prompt leaves.
          </p>
          <div className="redact">
            $ export API_KEY=<span className="mask">sk-live-9f2a7c4e10</span>{" "}
            <span style={{ color: "var(--mint)" }}>redacted ✓</span>
          </div>
        </div>
        <div className="feat span2 reveal">
          <div className="ic">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg>
          </div>
          <h3>Bring your own key</h3>
          <p>
            Claude, OpenAI, Gemini, OpenRouter, Ollama or LM Studio. No lock-in,
            no markup.
          </p>
        </div>
        <div className="feat span2 reveal">
          <div className="ic">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 7V5a1 1 0 0 1 1-1h2m10 0h2a1 1 0 0 1 1 1v2m0 10v2a1 1 0 0 1-1 1h-2M7 20H5a1 1 0 0 1-1-1v-2" />
              <rect x="8" y="8" width="8" height="8" rx="1" />
            </svg>
          </div>
          <h3>Smart screenshots</h3>
          <p>
            The pipeline ranks frames by relevance, clarity and uniqueness — then
            auto-annotates the click.
          </p>
        </div>
        <div className="feat span2 reveal">
          <div className="ic">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M16 18 22 12 16 6M8 6 2 12 8 18" />
            </svg>
          </div>
          <h3>Open source core</h3>
          <p>
            The Community Edition is free and open. Inspect it, fork it,
            self-host it.
          </p>
        </div>
      </div>
    </section>
  );
}
