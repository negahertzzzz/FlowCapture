import { convertFileSrc } from "@tauri-apps/api/core";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Screenshot } from "@/lib/api";

interface MarkdownPreviewProps {
  markdown: string;
  screenshots: Screenshot[];
}

function screenshotFilename(path: string) {
  return path.split(/[/\\]/).pop() ?? path;
}

function resolveImageSrc(src: string | undefined, screenshots: Screenshot[]) {
  if (!src) {
    return undefined;
  }

  const normalized = src.trim();

  const byExactPath = screenshots.find((shot) => normalized === shot.path);
  if (byExactPath) {
    return `${convertFileSrc(byExactPath.path)}?t=${byExactPath.timestamp_ms}`;
  }

  const filename = screenshotFilename(normalized);
  const byFilename = screenshots.find(
    (shot) =>
      filename === screenshotFilename(shot.path) ||
      normalized === `screenshots/${screenshotFilename(shot.path)}`,
  );
  if (byFilename) {
    return `${convertFileSrc(byFilename.path)}?t=${byFilename.timestamp_ms}`;
  }

  const uuidMatch = normalized.match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
  );
  if (uuidMatch) {
    const byId = screenshots.find((shot) => shot.id === uuidMatch[0]);
    if (byId) {
      return `${convertFileSrc(byId.path)}?t=${byId.timestamp_ms}`;
    }
  }

  if (normalized.startsWith("/") || normalized.includes(":\\")) {
    return convertFileSrc(normalized);
  }

  return undefined;
}

export function MarkdownPreview({ markdown, screenshots }: MarkdownPreviewProps) {
  if (!markdown.trim()) {
    return (
      <div className="doc-render">
        <p style={{ color: "var(--muted)", textAlign: "center" }}>
          Generate documentation to preview the rendered guide here.
        </p>
      </div>
    );
  }

  return (
    <div className="doc-render">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={(url) => url}
        components={{
          img: ({ src, alt }) => {
            const resolved = resolveImageSrc(
              typeof src === "string" ? src : undefined,
              screenshots,
            );
            if (!resolved) {
              return null;
            }

            return (
              <img
                src={resolved}
                alt={alt ?? "Workflow screenshot"}
                style={{
                  marginTop: 16,
                  maxHeight: 420,
                  width: "100%",
                  borderRadius: 10,
                  border: "1px solid var(--hair-2)",
                  objectFit: "contain",
                }}
              />
            );
          },
          h1: ({ children }) => <h1>{children}</h1>,
          h2: ({ children }) => <h2>{children}</h2>,
          h3: ({ children }) => <h3>{children}</h3>,
          p: ({ children }) => <p>{children}</p>,
          ul: ({ children }) => (
            <ul style={{ marginTop: 12, paddingLeft: 24, color: "var(--text-2)" }}>
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol style={{ marginTop: 12, paddingLeft: 24, color: "var(--text-2)" }}>
              {children}
            </ol>
          ),
          code: ({ children }) => (
            <code
              style={{
                fontFamily: "var(--mono)",
                fontSize: ".9em",
                color: "var(--mint)",
              }}
            >
              {children}
            </code>
          ),
          strong: ({ children }) => <strong>{children}</strong>,
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
