import { Link } from "react-router-dom";
import { BrandLogo } from "./BrandLogo";
import { GITHUB_REPO_URL } from "../lib/site";
import { usePlatformDownload } from "../hooks/usePlatformDownload";

type FooterProps = {
  variant?: "landing" | "docs";
};

export function Footer({ variant = "landing" }: FooterProps) {
  const download = usePlatformDownload();
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
            <a href={download.href} target="_blank" rel="noopener noreferrer">
              {download.label}
            </a>
          </div>
          <div className="foot-col">
            <h5>Open source</h5>
            <a href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer">
              GitHub
            </a>
            <a href="/docs/development/local-setup">Contributing</a>
            <a href="/docs/project/product-requirements">Roadmap</a>
          </div>
          <div className="foot-col">
            <h5>Resources</h5>
            <Link to="/docs/intro">Documentation</Link>
            <Link to="/docs/reference/ai-providers">Providers</Link>
            <Link to="/docs/guide/settings-and-privacy">Privacy</Link>
          </div>
        </div>
      </div>
      <div className="wrap foot-base">
        <span>© 2026 FlowCapture · MIT Licensed</span>
        <span className="mono">macOS · Local-first · BYOK · Open source</span>
      </div>
    </footer>
  );
}
