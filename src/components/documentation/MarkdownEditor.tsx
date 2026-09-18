import { useCallback, useEffect, useRef, useState } from "react";
import type { Screenshot } from "@/lib/api";
import { MarkdownPreview } from "./MarkdownPreview";
import { useLanguage } from "@/i18n";

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  screenshots: Screenshot[];
  disabled?: boolean;
  minHeight?: string;
  maxHeight?: string;
  hideStepTemplate?: boolean;
  compact?: boolean;
  showSaveButton?: boolean;
  saving?: boolean;
  onSave?: () => void;
  onCancel?: () => void;
}

export function MarkdownEditor({
  value,
  onChange,
  screenshots,
  disabled = false,
  minHeight = "580px",
  maxHeight = "850px",
  hideStepTemplate = false,
  compact = false,
  showSaveButton = false,
  saving = false,
  onSave,
  onCancel,
}: MarkdownEditorProps) {
  const { t } = useLanguage();
  const [viewMode, setViewMode] = useState<"split" | "edit" | "preview">("split");
  const [zoom, setZoom] = useState<number>(100);
  const [editablePreview, setEditablePreview] = useState<boolean>(true);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const previewContainerRef = useRef<HTMLDivElement | null>(null);
  const mirrorRef = useRef<HTMLDivElement | null>(null);
  const isSyncingScroll = useRef<boolean>(false);
  const [textareaWidth, setTextareaWidth] = useState<number>(0);

  const [showScreenshotPicker, setShowScreenshotPicker] = useState(false);

  // Keep mirror div width aligned with textarea clientWidth
  useEffect(() => {
    if (!textareaRef.current) return;
    const updateWidth = () => {
      if (textareaRef.current) {
        setTextareaWidth(textareaRef.current.clientWidth);
      }
    };
    updateWidth();
    const ro = new ResizeObserver(updateWidth);
    ro.observe(textareaRef.current);
    return () => ro.disconnect();
  }, [viewMode]);

  // Non-linear, element-aware landmark mapping between Editor and Preview
  const getLandmarks = useCallback(() => {
    const textarea = textareaRef.current;
    const preview = previewContainerRef.current;
    const mirror = mirrorRef.current;
    if (!textarea || !preview) return [];

    const maxScrollEditor = Math.max(0, textarea.scrollHeight - textarea.clientHeight);
    const maxScrollPreview = Math.max(0, preview.scrollHeight - preview.clientHeight);

    const previewRect = preview.getBoundingClientRect();
    const previewScrollTop = preview.scrollTop;

    const elements = preview.querySelectorAll<HTMLElement>("[data-source-line]");
    const rawLandmarks: { line: number; editorY: number; previewY: number }[] = [];

    // Top anchor
    rawLandmarks.push({ line: 1, editorY: 0, previewY: 0 });

    elements.forEach((el) => {
      const lineAttr = el.getAttribute("data-source-line");
      if (!lineAttr) return;
      const line = parseInt(lineAttr, 10);
      if (isNaN(line) || line < 1) return;

      const elRect = el.getBoundingClientRect();
      const previewY = elRect.top - previewRect.top + previewScrollTop;

      let editorY = 0;
      if (mirror && mirror.children[line - 1]) {
        const lineNode = mirror.children[line - 1] as HTMLElement;
        editorY = lineNode.offsetTop;
      } else {
        editorY = Math.max(0, (line - 1) * 21.6);
      }

      rawLandmarks.push({ line, editorY, previewY });
    });

    // Sort by editorY ascending
    rawLandmarks.sort((a, b) => a.editorY - b.editorY);

    // Filter out duplicates and non-increasing entries to keep monotonic progression
    const landmarks: { line: number; editorY: number; previewY: number }[] = [];
    for (const lm of rawLandmarks) {
      if (
        landmarks.length === 0 ||
        (lm.editorY > landmarks[landmarks.length - 1].editorY &&
          lm.previewY >= landmarks[landmarks.length - 1].previewY)
      ) {
        landmarks.push(lm);
      }
    }

    // Bottom anchor
    landmarks.push({
      line: 999999,
      editorY: maxScrollEditor,
      previewY: maxScrollPreview,
    });

    return landmarks;
  }, []);

  // Synchronized scroll from Editor to Preview taking into account different heights and images
  function handleEditorScroll() {
    if (isSyncingScroll.current || viewMode !== "split") return;
    const textarea = textareaRef.current;
    const preview = previewContainerRef.current;
    if (!textarea || !preview) return;

    const maxScrollEditor = textarea.scrollHeight - textarea.clientHeight;
    const maxScrollPreview = preview.scrollHeight - preview.clientHeight;
    if (maxScrollEditor <= 0 || maxScrollPreview <= 0) return;

    isSyncingScroll.current = true;

    const scrollTop = textarea.scrollTop;
    if (scrollTop <= 3) {
      preview.scrollTop = 0;
    } else if (scrollTop >= maxScrollEditor - 3) {
      preview.scrollTop = maxScrollPreview;
    } else {
      const landmarks = getLandmarks();
      if (landmarks.length < 2) {
        const scrollPercentage = scrollTop / maxScrollEditor;
        preview.scrollTop = scrollPercentage * maxScrollPreview;
      } else {
        let i = 0;
        while (i < landmarks.length - 1 && landmarks[i + 1].editorY <= scrollTop) {
          i++;
        }
        const l1 = landmarks[i];
        const l2 = landmarks[Math.min(i + 1, landmarks.length - 1)];
        const editorSpan = l2.editorY - l1.editorY;
        const previewSpan = l2.previewY - l1.previewY;
        const ratio = editorSpan > 0 ? (scrollTop - l1.editorY) / editorSpan : 0;
        const targetPreviewScroll = l1.previewY + ratio * previewSpan;
        preview.scrollTop = Math.max(0, Math.min(maxScrollPreview, targetPreviewScroll));
      }
    }

    requestAnimationFrame(() => {
      isSyncingScroll.current = false;
    });
  }

  // Synchronized scroll from Preview to Editor taking into account different heights and images
  function handlePreviewScroll() {
    if (isSyncingScroll.current || viewMode !== "split") return;
    const textarea = textareaRef.current;
    const preview = previewContainerRef.current;
    if (!textarea || !preview) return;

    const maxScrollEditor = textarea.scrollHeight - textarea.clientHeight;
    const maxScrollPreview = preview.scrollHeight - preview.clientHeight;
    if (maxScrollEditor <= 0 || maxScrollPreview <= 0) return;

    isSyncingScroll.current = true;

    const scrollTop = preview.scrollTop;
    if (scrollTop <= 3) {
      textarea.scrollTop = 0;
    } else if (scrollTop >= maxScrollPreview - 3) {
      textarea.scrollTop = maxScrollEditor;
    } else {
      const landmarks = getLandmarks();
      if (landmarks.length < 2) {
        const scrollPercentage = scrollTop / maxScrollPreview;
        textarea.scrollTop = scrollPercentage * maxScrollEditor;
      } else {
        let i = 0;
        while (i < landmarks.length - 1 && landmarks[i + 1].previewY <= scrollTop) {
          i++;
        }
        const l1 = landmarks[i];
        const l2 = landmarks[Math.min(i + 1, landmarks.length - 1)];
        const previewSpan = l2.previewY - l1.previewY;
        const editorSpan = l2.editorY - l1.editorY;
        const ratio = previewSpan > 0 ? (scrollTop - l1.previewY) / previewSpan : 0;
        const targetEditorScroll = l1.editorY + ratio * editorSpan;
        textarea.scrollTop = Math.max(0, Math.min(maxScrollEditor, targetEditorScroll));
      }
    }

    requestAnimationFrame(() => {
      isSyncingScroll.current = false;
    });
  }

  function handlePreviewTextChange(oldText: string, newText: string) {
    if (!oldText || !newText || oldText === newText) return;
    if (value.includes(oldText)) {
      onChange(value.replace(oldText, newText));
    } else if (value.includes(oldText.trim())) {
      onChange(value.replace(oldText.trim(), newText.trim()));
    } else {
      // Find matching line by stripping common markdown prefixes
      const lines = value.split("\n");
      const trimmedOld = oldText.trim();
      let matchedIdx = -1;
      for (let i = 0; i < lines.length; i++) {
        const stripped = lines[i].replace(/^(\s*#+\s*|\s*[-*+]\s*|\s*\d+\.\s*|\s*>\s*)/, "").trim();
        if (stripped === trimmedOld || lines[i].includes(trimmedOld)) {
          matchedIdx = i;
          break;
        }
      }
      if (matchedIdx !== -1) {
        const line = lines[matchedIdx];
        const matchPrefix = line.match(/^(\s*#+\s*|\s*[-*+]\s*|\s*\d+\.\s*|\s*>\s*)/);
        const prefix = matchPrefix ? matchPrefix[0] : "";
        lines[matchedIdx] = `${prefix}${newText.trim()}`;
        onChange(lines.join("\n"));
      }
    }
  }

  function insertFormatting(prefix: string, suffix = "", defaultText = "") {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = value.substring(start, end) || defaultText;
    const replacement = `${prefix}${selectedText}${suffix}`;

    const nextValue = value.substring(0, start) + replacement + value.substring(end);
    onChange(nextValue);

    setTimeout(() => {
      textarea.focus();
      const newCursor = start + prefix.length + selectedText.length;
      textarea.setSelectionRange(
        selectedText ? start + prefix.length : newCursor,
        newCursor,
      );
    }, 10);
  }

  function insertLinePrefix(prefix: string) {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    const nextValue = value.substring(0, lineStart) + prefix + value.substring(lineStart);
    onChange(nextValue);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + prefix.length, start + prefix.length);
    }, 10);
  }

  function insertScreenshotMarkdown(shot: Screenshot, index: number) {
    const filename = shot.path.split(/[/\\]/).pop() ?? `screenshot_${index + 1}.jpg`;
    const snippet = `\n\n![{t("md.step", "Step")} ${index + 1} - ${shot.trigger || "Screenshot"}](${filename})\n`;
    insertFormatting(snippet, "", "");
    setShowScreenshotPicker(false);
  }

  function insertStepTemplate() {
    const snippet = `\n\n### {t("md.step", "Step")}: [Titolo {t("md.step", "Step")}]\n{t("md.step_desc", "Describe in detail what the user needs to do in this step.")}\n\n- **{t("md.action", "Action")}**: {t("md.click_on", "Click on...")}\n- **{t("md.expected", "Expected result")}**: {t("md.window_opens", "The window opens...")}\n`;
    insertFormatting(snippet, "", "");
  }

  function insertTable() {
    const tableSnippet = `\n\n| {t("md.param", "Parameter")} | {t("md.desc", "Description")} | {t("md.required", "Required")} |\n| :--- | :--- | :--- |\n| {t("md.val1", "Value 1")} | {t("md.desc1", "Explanation of the first field")} | {t("md.yes", "Yes")} |\n| {t("md.val2", "Value 2")} | {t("md.desc2", "Explanation of the second field")} | No |\n`;
    insertFormatting(tableSnippet, "", "");
  }

  return (
    <div
      className="fc-markdown-editor"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: "580px",
        border: "1px solid var(--hair)",
        borderRadius: "8px",
        overflow: "hidden",
        background: "var(--surface)",
      }}
    >
      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "6px",
          padding: "8px 12px",
          background: "var(--bg-2, #18202c)",
          borderBottom: "1px solid var(--hair)",
        }}
      >
        {/* Formatting actions */}
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "4px" }}>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => insertFormatting("**", "**", t("md.bold_text", "bold text"))}
            title={t("md.bold_title", "Bold (Ctrl+B)")}
            style={{ fontWeight: "bold", padding: "4px 8px" }}
          >
            B
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => insertFormatting("*", "*", t("md.italic_text", "italic text"))}
            title={t("md.italic_title", "Italic (Ctrl+I)")}
            style={{ fontStyle: "italic", padding: "4px 8px" }}
          >
            I
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => insertFormatting("~~", "~~", t("md.strike_text", "strikethrough text"))}
            title={t("md.strike_title", "Strikethrough")}
            style={{ textDecoration: "line-through", padding: "4px 8px" }}
          >
            S
          </button>

          <span style={{ width: 1, height: 18, background: "var(--hair)", margin: "0 4px" }} />

          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => insertLinePrefix("# ")}
            title={t("md.h1_title", "Heading 1")}
            style={{ fontWeight: "bold", fontSize: "11px", padding: "4px 6px" }}
          >
            H1
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => insertLinePrefix("## ")}
            title={t("md.h2_title", "Heading 2")}
            style={{ fontWeight: "bold", fontSize: "11px", padding: "4px 6px" }}
          >
            H2
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => insertLinePrefix("### ")}
            title={t("md.h3_title", "Heading 3")}
            style={{ fontWeight: "bold", fontSize: "11px", padding: "4px 6px" }}
          >
            H3
          </button>

          <span style={{ width: 1, height: 18, background: "var(--hair)", margin: "0 4px" }} />

          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => insertLinePrefix("- ")}
            title={t("md.ul_title", "Bulleted list")}
            style={{ padding: "4px 7px" }}
          >
            • {t("md.list", "List")}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => insertLinePrefix("1. ")}
            title={t("md.ol_title", "Numbered list")}
            style={{ padding: "4px 7px" }}
          >
            1. {t("md.list", "List")}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => insertLinePrefix("- [ ] ")}
            title={t("md.task_title", "Task list")}
            style={{ padding: "4px 7px" }}
          >
            ☑ {t("md.task", "Task")}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => insertLinePrefix("> ")}
            title={t("md.quote_title", "Quote / Callout")}
            style={{ padding: "4px 7px" }}
          >
            ❝ {t("md.quote", "Quote")}
          </button>

          <span style={{ width: 1, height: 18, background: "var(--hair)", margin: "0 4px" }} />

          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => insertFormatting("`", "`", "codice")}
            title="Codice inline"
            style={{ fontFamily: "monospace", padding: "4px 7px" }}
          >
            `code`
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => insertFormatting("```\n", "\n```", "blocco di codice")}
            title="Blocco di codice"
            style={{ fontFamily: "monospace", padding: "4px 7px" }}
          >
            ```
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={insertTable}
            title="Inserisci tabella Markdown"
            style={{ padding: "4px 7px" }}
          >
            ⊞ Tabella
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => insertFormatting("[", "](https://example.com)", "Testo Link")}
            title="Inserisci Link"
            style={{ padding: "4px 7px" }}
          >
            🔗 Link
          </button>

          <span style={{ width: 1, height: 18, background: "var(--hair)", margin: "0 4px" }} />

          {/* Screenshot dropdown selector */}
          <div style={{ position: "relative" }}>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setShowScreenshotPicker(!showScreenshotPicker)}
              title="Inserisci immagine screenshot nella posizione del cursore"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
                padding: "4px 9px",
                borderColor: "var(--hair)",
              }}
            >
              🖼️ Inserisci Screenshot {screenshots.length > 0 ? `(${screenshots.length})` : ""} ▾
            </button>

            {showScreenshotPicker && (
              <div
                style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  marginTop: "4px",
                  background: "var(--surface)",
                  border: "1px solid var(--hair)",
                  borderRadius: "6px",
                  boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
                  zIndex: 50,
                  width: "280px",
                  maxHeight: "320px",
                  overflowY: "auto",
                  padding: "6px",
                }}
              >
                {screenshots.length === 0 ? (
                  <div style={{ padding: "10px", fontSize: "12px", color: "var(--dim)" }}>
                    Nessuno screenshot disponibile in questa sessione.
                  </div>
                ) : (
                  screenshots.map((shot, idx) => {
                    const fname = shot.path.split(/[/\\]/).pop();
                    return (
                      <button
                        key={shot.id}
                        type="button"
                        onClick={() => insertScreenshotMarkdown(shot, idx)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          width: "100%",
                          textAlign: "left",
                          padding: "6px 8px",
                          borderRadius: "4px",
                          background: "transparent",
                          border: "none",
                          color: "var(--text)",
                          cursor: "pointer",
                          fontSize: "12px",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "var(--surface)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "transparent";
                        }}
                      >
                        <span style={{ fontWeight: "bold", color: "var(--mint)", minWidth: "22px" }}>
                          #{idx + 1}
                        </span>
                        <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          <div>{shot.trigger || "Screenshot"}</div>
                          <div style={{ fontSize: "10px", color: "var(--dim)" }}>{fname}</div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {!hideStepTemplate && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={insertStepTemplate}
              title="Aggiungi struttura step"
              style={{ padding: "4px 8px", color: "var(--mint)" }}
            >
              + Aggiungi {t("md.step", "Step")}
            </button>
          )}
        </div>

        {/* Right side controls: Zoom, Editable Toggle, View mode toggle, Save/Cancel */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          {/* Zoom controls for Preview */}
          {(viewMode === "split" || viewMode === "preview") && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                background: "rgba(255,255,255,0.04)",
                borderRadius: "6px",
                padding: "2px",
                border: "1px solid var(--hair)",
              }}
              title="Regola la dimensione del testo dell'anteprima (Zoom In / Out)"
            >
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setZoom((z) => Math.max(70, z - 10))}
                style={{ padding: "2px 6px", fontSize: "11px", fontWeight: 700 }}
                title="Riduci dimensione testo (Zoom Out)"
              >
                A−
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setZoom(100)}
                style={{ padding: "2px 5px", fontSize: "10.5px", color: zoom === 100 ? "var(--dim)" : "var(--mint)" }}
                title="Reimposta dimensione predefinita (100%)"
              >
                {zoom}%
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setZoom((z) => Math.min(160, z + 10))}
                style={{ padding: "2px 6px", fontSize: "11px", fontWeight: 700 }}
                title="Aumenta dimensione testo (Zoom In)"
              >
                A+
              </button>
            </div>
          )}

          {/* Editable Preview toggle */}
          {(viewMode === "split" || viewMode === "preview") && (
            <button
              type="button"
              onClick={() => setEditablePreview(!editablePreview)}
              style={{
                background: editablePreview ? "rgba(56, 189, 248, 0.15)" : "transparent",
                border: editablePreview ? "1px solid #38bdf8" : "1px solid var(--hair)",
                color: editablePreview ? "#38bdf8" : "var(--dim)",
                borderRadius: "6px",
                padding: "3px 8px",
                fontSize: "11.5px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "4px",
                fontWeight: editablePreview ? 600 : 400,
              }}
              title="Quando attiva, puoi cliccare e modificare il testo direttamente sull'anteprima formattata"
            >
              <span>✏️</span>
              <span>{compact ? "Anteprima Modificabile" : "Anteprima Diretta Modificabile"}</span>
            </button>
          )}

          {/* View mode toggle: Always shows all 3 options */}
          <div className="seg" style={{ display: "flex" }}>
            <button
              type="button"
              className={viewMode === "split" ? "on" : ""}
              onClick={() => setViewMode("split")}
              style={{ fontSize: "11.5px", padding: "3px 8px" }}
              title="Vista affiancata: Editor e Anteprima Live sincronizzati"
            >
              Split View
            </button>
            <button
              type="button"
              className={viewMode === "edit" ? "on" : ""}
              onClick={() => setViewMode("edit")}
              style={{ fontSize: "11.5px", padding: "3px 8px" }}
              title="Mostra solo l'editor sorgente Markdown"
            >
              Solo Editor
            </button>
            <button
              type="button"
              className={viewMode === "preview" ? "on" : ""}
              onClick={() => setViewMode("preview")}
              style={{ fontSize: "11.5px", padding: "3px 8px" }}
              title="Mostra solo l'anteprima formattata con supporto alla modifica diretta"
            >
              Solo Anteprima
            </button>
          </div>

          {saving && (
            <span
              style={{
                fontSize: "11.5px",
                color: "var(--dim)",
                fontStyle: "italic",
                display: "flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  width: "10px",
                  height: "10px",
                  border: "2px solid #38bdf8",
                  borderTopColor: "transparent",
                  borderRadius: "50%",
                  animation: "spin 0.8s linear infinite",
                }}
              />
              Salvataggio...
            </span>
          )}

          {showSaveButton && (
            <div style={{ display: "flex", gap: "6px", marginLeft: "4px" }}>
              {onCancel && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={onCancel}
                  disabled={saving}
                  style={{ fontSize: "11.5px", padding: "3px 8px" }}
                >
                  Annulla
                </button>
              )}
              {onSave && (
                <button
                  type="button"
                  onClick={onSave}
                  disabled={saving}
                  style={{
                    background: "var(--color-primary, #0284c7)",
                    border: "none",
                    borderRadius: "6px",
                    color: "#fff",
                    padding: "3px 10px",
                    fontSize: "11.5px",
                    fontWeight: 600,
                    cursor: saving ? "wait" : "pointer",
                    opacity: saving ? 0.7 : 1,
                  }}
                >
                  {saving ? "Salvataggio..." : "💾 Salva"}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Editor Body */}
      <div
        style={{
          display: "flex",
          flex: 1,
          minHeight,
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Off-screen mirror to measure exact textarea line heights and word wraps */}
        <div
          ref={mirrorRef}
          aria-hidden="true"
          style={{
            position: "absolute",
            visibility: "hidden",
            pointerEvents: "none",
            top: -99999,
            left: -99999,
            width: textareaWidth ? `${textareaWidth}px` : "100%",
            padding: "16px",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            fontSize: "13.5px",
            lineHeight: "1.6",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            boxSizing: "border-box",
          }}
        >
          {value.split("\n").map((line, idx) => (
            <div key={idx} data-line={idx + 1}>
              {line || "\u00A0"}
            </div>
          ))}
        </div>

        {/* Left: Raw Markdown Editor */}
        {(viewMode === "split" || viewMode === "edit") && (
          <div
            style={{
              flex: viewMode === "split" ? "1 1 50%" : "1 1 100%",
              display: "flex",
              flexDirection: "column",
              borderRight: viewMode === "split" ? "1px solid var(--hair)" : "none",
              background: "var(--surface)",
              overflow: "hidden",
            }}
          >
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onScroll={handleEditorScroll}
              disabled={disabled}
              placeholder="Scrivi qui il markdown della documentazione o usa la toolbar sopra..."
              style={{
                flex: 1,
                width: "100%",
                height: "100%",
                minHeight,
                padding: "16px",
                border: "none",
                outline: "none",
                background: "transparent",
                color: "var(--text-1, #f0f6fc)",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                fontSize: "13.5px",
                lineHeight: "1.6",
                resize: "none",
                whiteSpace: "pre-wrap",
                overflowY: "auto",
              }}
            />
          </div>
        )}

        {/* Right: Live Rendered Preview (Directly Editable) */}
        {(viewMode === "split" || viewMode === "preview") && (
          <div
            ref={previewContainerRef}
            onScroll={handlePreviewScroll}
            style={{
              flex: viewMode === "split" ? "1 1 50%" : "1 1 100%",
              overflowY: "auto",
              padding: "16px 24px",
              background: "var(--surface)",
              minHeight,
              maxHeight,
            }}
          >
            <MarkdownPreview
              markdown={value}
              screenshots={screenshots}
              editable={editablePreview}
              onTextChange={handlePreviewTextChange}
              zoom={zoom}
            />
          </div>
        )}
      </div>
    </div>
  );
}
