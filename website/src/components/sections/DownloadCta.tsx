import { GITHUB_REPO_URL } from "../../lib/site";
import { DownloadButton } from "../DownloadButton";
import { usePlatformDownload } from "../../hooks/usePlatformDownload";

export function DownloadCta() {
  const download = usePlatformDownload();

  return (
    <section className="final wrap" id="download">
      <div className="final-card reveal">
        <span className="eyebrow">Get started</span>
        <h2>Your next doc writes itself.</h2>
        <p>
          Install FlowCapture, hit record, and let your AI handle the writing.
          Free, open source, and it never phones home.
        </p>
        <div className="cta">
          <DownloadButton />
          <a
            className="btn btn-ghost"
            href={GITHUB_REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            <svg viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 0a8 8 0 0 0-2.53 15.59c.4.07.55-.17.55-.38v-1.34c-2.23.49-2.7-1.07-2.7-1.07-.36-.93-.89-1.18-.89-1.18-.73-.5.05-.49.05-.49.8.06 1.23.83 1.23.83.72 1.23 1.87.87 2.33.67.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.01.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.03 2.2-.82 2.2-.82.44 1.11.16 1.92.08 2.12.51.56.82 1.28.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48v2.19c0 .21.15.46.55.38A8 8 0 0 0 8 0Z" />
            </svg>
            View on GitHub
          </a>
        </div>
        <p className="download-note">{download.shortNote}</p>
      </div>
    </section>
  );
}
