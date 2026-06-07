import { Link } from "react-router-dom";
import { BrandLogo } from "./BrandLogo";

type FooterProps = {
  variant?: "landing" | "docs";
};

export function Footer({ variant = "landing" }: FooterProps) {
  const root = variant === "docs" ? "/" : "";

  return (
    <footer>
      <div className="wrap foot-grid">
        <div className="foot-brand">
          <Link className="brand" to={variant === "docs" ? "/" : "/#top"}>
            <BrandLogo />
            FlowCapture
          </Link>
          <p>
            The local-first, open-source way to turn real workflows into
            documentation. Built for developers.
          </p>
        </div>
        <div className="foot-cols">
          <div className="foot-col">
            <h5>Product</h5>
            <a href={`${root}#how`}>How it works</a>
            <a href={`${root}#features`}>Features</a>
            <a href={`${root}#formats`}>Exports</a>
            <a href={`${root}#replay`}>AI Replay</a>
          </div>
          <div className="foot-col">
            <h5>Open source</h5>
            <a href="https://github.com/flowcapture/flowcapture">GitHub</a>
            <a href="/docs/development/local-setup">Contributing</a>
            <a href="/docs/project/product-requirements">Roadmap</a>
            <a href="/docs/intro">Changelog</a>
          </div>
          <div className="foot-col">
            <h5>Resources</h5>
            <Link to="/docs/intro">Documentation</Link>
            <Link to="/docs/reference/ai-providers">Providers</Link>
            <Link to="/docs/guide/settings-and-privacy">Privacy</Link>
            <a href={`${root}#opensource`}>Discord</a>
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
