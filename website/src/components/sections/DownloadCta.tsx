import { GITHUB_REPO_URL, MACOS_DMG_URL } from "../../lib/site";

export function DownloadCta() {
  return (
    <section className="final wrap" id="download">
      <div className="final-card reveal">
        <span className="eyebrow">Get started</span>
        <h2>Your next doc writes itself.</h2>
        <p>
          Install FlowCapture on macOS, hit record, and let your AI handle the
          writing. Free, open source, and it never phones home.
        </p>
        <div className="cta">
          <a
            className="btn btn-primary"
            href={MACOS_DMG_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M16.36 12.6c-.02-2.06 1.68-3.05 1.76-3.1-.96-1.4-2.46-1.6-2.99-1.62-1.27-.13-2.48.75-3.13.75-.64 0-1.64-.73-2.7-.71-1.39.02-2.67.81-3.38 2.05-1.44 2.5-.37 6.2 1.04 8.23.69.99 1.51 2.1 2.59 2.06 1.04-.04 1.43-.67 2.69-.67 1.25 0 1.6.67 2.7.65 1.11-.02 1.82-1.01 2.5-2.01.79-1.15 1.11-2.27 1.13-2.33-.02-.01-2.17-.83-2.2-3.3Zm-2.06-6.06c.57-.69.95-1.65.85-2.61-.82.03-1.81.55-2.4 1.23-.52.61-.98 1.58-.86 2.51.91.07 1.84-.46 2.41-1.13Z" />
            </svg>
            Download for macOS
          </a>
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
        <p className="download-note">macOS · Apple Silicon · v0.1.0</p>
      </div>
    </section>
  );
}
