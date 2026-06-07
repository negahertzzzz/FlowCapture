export function BeforeAfter() {
  return (
    <section className="blk wrap" id="problem">
      <div className="sec-head reveal">
        <span className="eyebrow">The hard problem</span>
        <h2>Noisy behavior in. Clean workflow out.</h2>
        <p>
          A 10-minute task becomes 1–2 hours of documentation work. FlowCapture
          compresses tens of thousands of raw signals into the handful of steps a
          human actually needs to follow.
        </p>
      </div>
      <div className="ba-grid reveal">
        <div className="ba-card ba-before">
          <div className="ba-tag">● Raw session</div>
          <div className="raw-line">
            <span>mouse_move</span>
            <span>x:418 y:90</span>
          </div>
          <div className="raw-line faint">
            <span>mouse_move</span>
            <span>x:420 y:92</span>
          </div>
          <div className="raw-line faint">
            <span>mouse_move</span>
            <span>x:423 y:95</span>
          </div>
          <div className="raw-line">
            <span>mouse_click</span>
            <span>right · 736,140</span>
          </div>
          <div className="raw-line">
            <span>key_down</span>
            <span>⌘</span>
          </div>
          <div className="raw-line faint">
            <span>scroll</span>
            <span>Δ -120</span>
          </div>
          <div className="raw-line">
            <span>window_focus</span>
            <span>Software Update</span>
          </div>
          <div className="ba-count">52,418 events · unreadable</div>
        </div>
        <div className="ba-mid">
          <svg
            width="26"
            height="26"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12h14m0 0-6-6m6 6-6 6" />
          </svg>
        </div>
        <div className="ba-card ba-after">
          <div className="ba-tag">✓ FlowCapture output</div>
          <div className="ba-step">
            <div className="n">1</div>
            <div>
              <div className="s-t">Open the Software Update pane</div>
              <div className="s-d">
                In System Settings, navigate to Software Update.
              </div>
            </div>
          </div>
          <div className="ba-step">
            <div className="n">2</div>
            <div>
              <div className="s-t">Check available version</div>
              <div className="s-d">
                macOS Tahoe 26.5.1 is available (2.14 GB).
              </div>
            </div>
          </div>
          <div className="ba-step">
            <div className="n">3</div>
            <div>
              <div className="s-t">Confirm network & install</div>
              <div className="s-d">Connect to Wi-Fi, then start the update.</div>
            </div>
          </div>
          <div className="ba-count ok">15 clear steps · ready to publish</div>
        </div>
      </div>
    </section>
  );
}
