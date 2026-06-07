export function OpenSource() {
  return (
    <section className="blk wrap" id="opensource">
      <div className="sec-head center reveal">
        <span className="eyebrow">Open core</span>
        <h2>Free and open. Forever.</h2>
        <p>
          The Community Edition is fully open source and runs entirely on your
          machine. Pro adds the team layer when you&apos;re ready.
        </p>
      </div>
      <div className="os-grid">
        <div className="price featured reveal">
          <div className="pname">
            Community <span className="ptag">OPEN SOURCE</span>
          </div>
          <div className="pprice">
            $0 <span>/ forever</span>
          </div>
          <div className="pdesc">
            Everything you need to capture and document, solo.
          </div>
          <ul>
            <PricingFeature>Screen + full event recording</PricingFeature>
            <PricingFeature>Bring your own AI key (all providers)</PricingFeature>
            <PricingFeature>Markdown, HTML, PDF & video export</PricingFeature>
            <PricingFeature>Interactive AI Replay</PricingFeature>
            <PricingFeature>Local SQLite storage & redaction</PricingFeature>
          </ul>
          <a className="btn btn-primary" href="#download">
            Download free
          </a>
        </div>
        <div className="price soon reveal">
          <div className="pname">
            Pro{" "}
            <span
              className="ptag"
              style={{
                background: "var(--ice-12)",
                color: "var(--ice)",
                borderColor: "rgba(108,198,255,.3)",
              }}
            >
              COMING SOON
            </span>
          </div>
          <div className="pprice">
            Team <span>/ when you scale</span>
          </div>
          <div className="pdesc">
            Collaboration on top of the local-first core.
          </div>
          <ul>
            <PricingFeature>Shared team workspaces</PricingFeature>
            <PricingFeature>Cloud sync & shared libraries</PricingFeature>
            <PricingFeature>Notion & Confluence export</PricingFeature>
            <PricingFeature>Templates marketplace</PricingFeature>
            <PricingFeature>Enterprise SSO</PricingFeature>
          </ul>
          <a className="btn btn-ghost" href="#download">
            Join the waitlist
          </a>
        </div>
      </div>
    </section>
  );
}

function PricingFeature({ children }: { children: React.ReactNode }) {
  return (
    <li>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m5 12 5 5L20 7" />
      </svg>
      {children}
    </li>
  );
}
