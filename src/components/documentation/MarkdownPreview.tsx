import { useState, useRef } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Screenshot } from "@/lib/api";

interface MarkdownPreviewProps {
  markdown: string;
  screenshots: Screenshot[];
  editable?: boolean;
  onTextChange?: (oldText: string, newText: string) => void;
  zoom?: number;
}

function screenshotFilename(path: string) {
  return path.split(/[/\\]/).pop() ?? path;
}

function getTextContent(node: React.ReactNode): string {
  if (node == null) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(getTextContent).join("");
  if (typeof node === "object" && "props" in node && (node as any).props?.children) {
    return getTextContent((node as any).props.children);
  }
  return "";
}

function EditableBlock({
  as: Component,
  children,
  editable,
  onTextChange,
  style,
  className,
  "data-source-line": dataSourceLine,
}: {
  as: any;
  children: React.ReactNode;
  editable?: boolean;
  onTextChange?: (oldText: string, newText: string) => void;
  style?: React.CSSProperties;
  className?: string;
  "data-source-line"?: number;
}) {
  const [isFocused, setIsFocused] = useState(false);
  const elementRef = useRef<HTMLElement | null>(null);

  if (!editable || !onTextChange) {
    return (
      <Component data-source-line={dataSourceLine} style={style} className={className}>
        {children}
      </Component>
    );
  }

  const initialText = getTextContent(children).trim();

  return (
    <Component
      ref={elementRef}
      data-source-line={dataSourceLine}
      contentEditable={true}
      suppressContentEditableWarning={true}
      onFocus={() => setIsFocused(true)}
      onBlur={() => {
        setIsFocused(false);
        if (elementRef.current) {
          const currentText = elementRef.current.innerText.trim();
          if (currentText && currentText !== initialText) {
            onTextChange(initialText, currentText);
          }
        }
      }}
      title="Clicca per modificare direttamente questo testo nell'anteprima"
      style={{
        ...style,
        outline: isFocused ? "2px solid #38bdf8" : "none",
        outlineOffset: "2px",
        borderRadius: "4px",
        background: isFocused ? "rgba(56, 189, 248, 0.08)" : undefined,
        cursor: "text",
        transition: "background 0.15s, outline 0.15s",
      }}
      className={className}
    >
      {children}
    </Component>
  );
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

export function MarkdownPreview({
  markdown,
  screenshots,
  editable = false,
  onTextChange,
  zoom = 100,
}: MarkdownPreviewProps) {
  if (!markdown.trim()) {
    return (
      <div className="doc-render">
        <p style={{ color: "var(--muted)", textAlign: "center" }}>
          Nessun contenuto da visualizzare. Genera la documentazione per visualizzare la guida qui.
        </p>
      </div>
    );
  }

  const zoomFactor = zoom / 100;
  const getLine = (node: any) => node?.position?.start?.line;

  return (
    <div
      className="doc-render"
      style={{
        ["--doc-zoom" as any]: zoomFactor.toString(),
        fontSize: `calc(15px * ${zoomFactor})`,
        lineHeight: "1.7",
        transition: "font-size 0.15s ease",
      }}
    >
      {editable && onTextChange && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "6px 12px",
            marginBottom: "14px",
            borderRadius: "6px",
            background: "rgba(56, 189, 248, 0.08)",
            border: "1px solid rgba(56, 189, 248, 0.25)",
            fontSize: "12px",
            color: "#38bdf8",
          }}
        >
          <span>✏️</span>
          <span>
            <strong>Modalità Modifica Attiva sull'Anteprima:</strong> Clicca direttamente su titoli, paragrafi o elenchi per modificarli. Le modifiche si sincronizzano istantaneamente con il Markdown.
          </span>
        </div>
      )}

      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={(url) => url}
        components={{
          img: ({ src, alt, node }: any) => {
            const resolved = resolveImageSrc(
              typeof src === "string" ? src : undefined,
              screenshots,
            );
            if (!resolved) {
              return null;
            }

            return (
              <div
                data-source-line={getLine(node)}
                style={{
                  marginTop: 16,
                  marginBottom: 16,
                  width: "100%",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                }}
              >
                <img
                  src={resolved}
                  alt={alt ?? "Workflow screenshot"}
                  style={{
                    maxHeight: 420,
                    width: "100%",
                    borderRadius: 10,
                    border: "1px solid var(--hair-2)",
                    objectFit: "contain",
                    boxShadow: "0 8px 24px rgba(0, 0, 0, 0.3)",
                  }}
                />
                {alt && alt !== "Workflow screenshot" && (
                  <span
                    style={{
                      fontSize: `calc(12px * var(--doc-zoom, 1))`,
                      color: "var(--dim)",
                      marginTop: 6,
                      fontStyle: "italic",
                    }}
                  >
                    {alt}
                  </span>
                )}
              </div>
            );
          },
          h1: ({ children, node }: any) => (
            <EditableBlock as="h1" data-source-line={getLine(node)} editable={editable} onTextChange={onTextChange}>
              {children}
            </EditableBlock>
          ),
          h2: ({ children, node }: any) => (
            <EditableBlock as="h2" data-source-line={getLine(node)} editable={editable} onTextChange={onTextChange}>
              {children}
            </EditableBlock>
          ),
          h3: ({ children, node }: any) => (
            <EditableBlock as="h3" data-source-line={getLine(node)} editable={editable} onTextChange={onTextChange}>
              {children}
            </EditableBlock>
          ),
          h4: ({ children, node }: any) => (
            <EditableBlock as="h4" data-source-line={getLine(node)} editable={editable} onTextChange={onTextChange}>
              {children}
            </EditableBlock>
          ),
          p: ({ children, node }: any) => (
            <EditableBlock as="p" data-source-line={getLine(node)} editable={editable} onTextChange={onTextChange}>
              {children}
            </EditableBlock>
          ),
          li: ({ children, node }: any) => (
            <EditableBlock as="li" data-source-line={getLine(node)} editable={editable} onTextChange={onTextChange}>
              {children}
            </EditableBlock>
          ),
          blockquote: ({ children, node }: any) => (
            <EditableBlock
              as="blockquote"
              data-source-line={getLine(node)}
              editable={editable}
              onTextChange={onTextChange}
              style={{
                borderLeft: "3px solid var(--mint, #38bdf8)",
                paddingLeft: 12,
                margin: "12px 0",
                color: "var(--text-2, #94a3b8)",
                fontStyle: "italic",
              }}
            >
              {children}
            </EditableBlock>
          ),
          ul: ({ children, node }: any) => (
            <ul data-source-line={getLine(node)} style={{ marginTop: 12, paddingLeft: 24, color: "var(--text-2)" }}>
              {children}
            </ul>
          ),
          ol: ({ children, node }: any) => (
            <ol data-source-line={getLine(node)} style={{ marginTop: 12, paddingLeft: 24, color: "var(--text-2)" }}>
              {children}
            </ol>
          ),
          table: ({ children, node }: any) => (
            <table data-source-line={getLine(node)} style={{ width: "100%", margin: "16px 0", borderCollapse: "collapse" }}>
              {children}
            </table>
          ),
          pre: ({ children, node }: any) => (
            <pre data-source-line={getLine(node)} style={{ background: "rgba(0,0,0,0.3)", padding: "12px 16px", borderRadius: 8, overflowX: "auto", margin: "14px 0" }}>
              {children}
            </pre>
          ),
          code: ({ children }: any) => (
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
          strong: ({ children }: any) => <strong>{children}</strong>,
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
