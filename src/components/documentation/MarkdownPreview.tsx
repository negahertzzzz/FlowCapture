import { useCallback, useMemo, useRef, useState, type CSSProperties } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Screenshot } from "@/lib/api";
import { ContextMenu, type ContextMenuItem } from "@/components/ui/ContextMenu";
import { ImageLightbox } from "@/components/ui/ImageLightbox";

export type PreviewImageInfo = {
  /** 1-based Markdown line of the image, used to rewrite its target. */
  line?: number;
  screenshot?: Screenshot;
  alt?: string;
};

export type PreviewImageActions = {
  onChange?: (info: PreviewImageInfo) => void;
  onAnnotate?: (info: PreviewImageInfo) => void;
};

/** Keeps screenshot paths working (they are resolved by `resolveImageSrc`) but drops script URLs. */
function safeUrl(url: string): string {
  return /^\s*(javascript|vbscript|data:text\/html)/i.test(url) ? "" : url;
}

interface MarkdownPreviewProps {
  markdown: string;
  screenshots: Screenshot[];
  editable?: boolean;
  onTextChange?: (oldText: string, newText: string) => void;
  zoom?: number;
  imageActions?: PreviewImageActions;
  /** Bump after an image was annotated so the browser reloads the cached file. */
  imageVersion?: number;
}

function screenshotFilename(path: string) {
  return path.split(/[/\\]/).pop() ?? path;
}

/** `foo.png` → `foo_annotated.png`: the render saved by the annotation editor. */
export function annotatedVariantPath(path: string) {
  return path.replace(/(\.[a-zA-Z0-9]+)$/, "_annotated$1");
}

/** `path@version` keys whose annotated variant does not exist, to avoid re-requesting a 404. */
const missingAnnotated = new Set<string>();

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
  className,
  "data-source-line": dataSourceLine,
}: {
  as: any;
  children: React.ReactNode;
  editable?: boolean;
  onTextChange?: (oldText: string, newText: string) => void;
  className?: string;
  "data-source-line"?: number;
}) {
  const elementRef = useRef<HTMLElement | null>(null);

  if (!editable || !onTextChange) {
    return (
      <Component data-source-line={dataSourceLine} className={className}>
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
      onBlur={() => {
        if (elementRef.current) {
          const currentText = elementRef.current.innerText.trim();
          if (currentText && currentText !== initialText) {
            onTextChange(initialText, currentText);
          }
        }
      }}
      title="Clicca per modificare direttamente questo testo"
      className={["md-editable", className].filter(Boolean).join(" ")}
    >
      {children}
    </Component>
  );
}

function resolveScreenshot(src: string | undefined, screenshots: Screenshot[]): Screenshot | undefined {
  if (!src) return undefined;
  const normalized = src.trim();
  if (!normalized) return undefined;

  const byExactPath = screenshots.find((shot) => normalized === shot.path);
  if (byExactPath) return byExactPath;

  const filename = screenshotFilename(normalized);
  const byFilename = screenshots.find(
    (shot) =>
      filename === screenshotFilename(shot.path) ||
      normalized === `screenshots/${screenshotFilename(shot.path)}`,
  );
  if (byFilename) return byFilename;

  const uuidMatch = normalized.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  if (uuidMatch) return screenshots.find((shot) => shot.id === uuidMatch[0]);
  return undefined;
}

function PreviewImage({
  src,
  alt,
  line,
  screenshots,
  imageActions,
  imageVersion,
}: {
  src?: string;
  alt?: string;
  line?: number;
  screenshots: Screenshot[];
  imageActions?: PreviewImageActions;
  imageVersion: number;
}) {
  const screenshot = resolveScreenshot(src, screenshots);
  const rawPath =
    screenshot?.path ?? (src && (src.startsWith("/") || src.includes(":\\")) ? src : undefined);
  const annotatedKey = screenshot ? `${screenshot.path}@${imageVersion}` : "";
  const [useAnnotated, setUseAnnotated] = useState(() => !missingAnnotated.has(annotatedKey));
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const closeMenu = useCallback(() => setMenu(null), []);

  if (!rawPath) return null;

  const cacheKey = `?t=${screenshot?.timestamp_ms ?? 0}-${imageVersion}`;
  const resolved =
    screenshot && useAnnotated
      ? `${convertFileSrc(annotatedVariantPath(screenshot.path))}${cacheKey}`
      : `${convertFileSrc(rawPath)}${cacheKey}`;
  const info: PreviewImageInfo = { line, screenshot, alt };
  const canChange = Boolean(imageActions?.onChange && line);
  const canAnnotate = Boolean(imageActions?.onAnnotate && screenshot);

  const menuItems: ContextMenuItem[] = [
    { label: "Ingrandisci a schermo intero", icon: "⛶", onSelect: () => setFullscreen(true) },
  ];
  if (canChange) {
    menuItems.push({ label: "Cambia immagine…", icon: "🖼️", onSelect: () => imageActions?.onChange?.(info) });
  }
  if (canAnnotate) {
    menuItems.push({ label: "Annota / evidenzia…", icon: "🎨", onSelect: () => imageActions?.onAnnotate?.(info) });
  }

  return (
    <span className="md-img" data-source-line={line} contentEditable={false}>
      <span
        className="md-img-frame"
        onContextMenu={(event) => {
          event.preventDefault();
          setMenu({ x: event.clientX, y: event.clientY });
        }}
        onDoubleClick={() => setFullscreen(true)}
        title="Tasto destro: schermo intero, cambia immagine o annota"
      >
        <img
          src={resolved}
          alt={alt ?? "Workflow screenshot"}
          onError={() => {
            if (useAnnotated) {
              missingAnnotated.add(annotatedKey);
              setUseAnnotated(false);
            }
          }}
        />
        <span className="md-img-actions">
          <button type="button" onClick={() => setFullscreen(true)} title="Schermo intero">
            ⛶
          </button>
          {canChange ? (
            <button type="button" onClick={() => imageActions?.onChange?.(info)} title="Cambia immagine">
              🖼️ Cambia
            </button>
          ) : null}
          {canAnnotate ? (
            <button type="button" onClick={() => imageActions?.onAnnotate?.(info)} title="Annota / evidenzia">
              🎨 Annota
            </button>
          ) : null}
        </span>
      </span>
      {alt && alt !== "Workflow screenshot" ? <span className="md-img-caption">{alt}</span> : null}
      {menu ? <ContextMenu position={menu} items={menuItems} onClose={closeMenu} /> : null}
      {fullscreen ? (
        <ImageLightbox src={resolved} alt={alt} onClose={() => setFullscreen(false)} />
      ) : null}
    </span>
  );
}

export function MarkdownPreview({
  markdown,
  screenshots,
  editable = false,
  onTextChange,
  zoom = 100,
  imageActions,
  imageVersion = 0,
}: MarkdownPreviewProps) {
  const zoomFactor = zoom / 100;

  // ReactMarkdown treats every `components` entry as a component type: recreating them on each
  // render would remount every block and image (reloading images and dropping their menu state)
  // on each keystroke. Keep them stable and read the latest props through a ref.
  const latest = useRef({ screenshots, imageActions, imageVersion, editable, onTextChange });
  latest.current = { screenshots, imageActions, imageVersion, editable, onTextChange };

  const components = useMemo(() => {
    const getLine = (node: any) => node?.position?.start?.line;
    const editableBlock = (as: string, className?: string) =>
      function Block({ children, node }: any) {
        const { editable: isEditable, onTextChange: onChange } = latest.current;
        return (
          <EditableBlock
            as={as}
            data-source-line={getLine(node)}
            className={className}
            editable={isEditable}
            onTextChange={onChange}
          >
            {children}
          </EditableBlock>
        );
      };
    const Paragraph = editableBlock("p");
    return {
      // Links open in the system browser: navigating the app window would replace the app.
      a: ({ href, children }: any) => (
        <a
          href={href}
          className="md-link"
          onClick={(event) => {
            event.preventDefault();
            if (typeof href === "string" && /^(https?:|mailto:)/i.test(href)) {
              openUrl(href).catch(() => undefined);
            }
          }}
        >
          {children}
        </a>
      ),
      img: function Img({ src, alt, node }: any) {
        const ctx = latest.current;
        return (
          <PreviewImage
            src={typeof src === "string" ? src : undefined}
            alt={alt}
            line={getLine(node)}
            screenshots={ctx.screenshots}
            imageActions={ctx.imageActions}
            imageVersion={ctx.imageVersion}
          />
        );
      },
      h1: editableBlock("h1"),
      h2: editableBlock("h2"),
      h3: editableBlock("h3"),
      h4: editableBlock("h4"),
      p: function P(props: any) {
        // Paragraphs holding a screenshot stay non-editable so the image controls never end up
        // inside a contentEditable region (their labels would leak into the text).
        if (props.node?.children?.some((child: any) => child.tagName === "img")) {
          return (
            <div data-source-line={getLine(props.node)} className="md-img-block">
              {props.children}
            </div>
          );
        }
        return <Paragraph {...props} />;
      },
      li: editableBlock("li"),
      blockquote: editableBlock("blockquote", "md-quote"),
      ul: ({ children, node }: any) => (
        <ul data-source-line={getLine(node)} className="md-list">
          {children}
        </ul>
      ),
      ol: ({ children, node }: any) => (
        <ol data-source-line={getLine(node)} className="md-list">
          {children}
        </ol>
      ),
      table: ({ children, node }: any) => (
        <table data-source-line={getLine(node)} className="md-table">
          {children}
        </table>
      ),
      pre: ({ children, node }: any) => (
        <pre data-source-line={getLine(node)} className="md-pre">
          {children}
        </pre>
      ),
      code: ({ children }: any) => <code className="md-code">{children}</code>,
      strong: ({ children }: any) => <strong>{children}</strong>,
    };
  }, []);

  if (!markdown.trim()) {
    return (
      <div className="doc-render">
        <p className="md-empty">
          Nessun contenuto da visualizzare. Genera la documentazione per visualizzare la guida qui.
        </p>
      </div>
    );
  }

  return (
    <div className="doc-render md-preview" style={{ "--doc-zoom": String(zoomFactor) } as CSSProperties}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={safeUrl}
        components={components}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
