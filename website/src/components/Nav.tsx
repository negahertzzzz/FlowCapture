import { useRef } from "react";
import { BrandLogo } from "./BrandLogo";
import { useNavScroll } from "../hooks/useNavScroll";

export function Nav() {
  const navRef = useRef<HTMLElement>(null);
  useNavScroll(navRef);

  return (
    <nav className="top" id="nav" ref={navRef}>
      <div className="wrap nav-in">
        <a className="brand" href="#top">
          <BrandLogo />
          FlowCapture
        </a>
        <div className="nav-links">
          <a href="#how">How it works</a>
          <a href="#features">Features</a>
          <a href="#formats">Exports</a>
          <a href="#replay">AI Replay</a>
          <a href="#opensource">Open source</a>
        </div>
        <div className="nav-right">
          <a className="gh-star" href="#opensource">
            <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 0a8 8 0 0 0-2.53 15.59c.4.07.55-.17.55-.38v-1.34c-2.23.49-2.7-1.07-2.7-1.07-.36-.93-.89-1.18-.89-1.18-.73-.5.05-.49.05-.49.8.06 1.23.83 1.23.83.72 1.23 1.87.87 2.33.67.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.01.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.03 2.2-.82 2.2-.82.44 1.11.16 1.92.08 2.12.51.56.82 1.28.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48v2.19c0 .21.15.46.55.38A8 8 0 0 0 8 0Z" />
            </svg>{" "}
            <span className="star">★</span> <b>4.2k</b>
          </a>
          <a className="btn btn-primary btn-sm" href="#download">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14" />
            </svg>
            Download
          </a>
        </div>
      </div>
    </nav>
  );
}
