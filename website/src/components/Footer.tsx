import { BrandLogo } from "./BrandLogo";

export function Footer() {
  return (
    <footer>
      <div className="wrap foot-grid">
        <div className="foot-brand">
          <a className="brand" href="#top">
            <BrandLogo />
            FlowCapture
          </a>
          <p>
            The local-first, open-source way to turn real workflows into
            documentation. Built for developers.
          </p>
        </div>
        <div className="foot-cols">
          <div className="foot-col">
            <h5>Product</h5>
            <a href="#how">How it works</a>
            <a href="#features">Features</a>
            <a href="#formats">Exports</a>
            <a href="#replay">AI Replay</a>
          </div>
          <div className="foot-col">
            <h5>Open source</h5>
            <a href="#">GitHub</a>
            <a href="#">Contributing</a>
            <a href="#">Roadmap</a>
            <a href="#">Changelog</a>
          </div>
          <div className="foot-col">
            <h5>Resources</h5>
            <a href="#">Documentation</a>
            <a href="#">Providers</a>
            <a href="#">Privacy</a>
            <a href="#">Discord</a>
          </div>
        </div>
      </div>
      <div className="wrap foot-base">
        <span>© 2026 FlowCapture · MIT Licensed</span>
        <span className="mono">Local-first · BYOK · Open source</span>
      </div>
    </footer>
  );
}
