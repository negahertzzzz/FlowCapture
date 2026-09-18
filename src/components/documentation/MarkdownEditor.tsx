import { useRef, useState } from "react";
import type { Screenshot } from "@/lib/api";
import { MarkdownPreview } from "./MarkdownPreview";
import { useLanguage } from "@/i18n";

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  screenshots: Screenshot[];
  disabled?: boolean;
}

export function MarkdownEditor({
  value,
  onChange,
  screenshots,
  disabled = false,
}: MarkdownEditorProps) {
  const { t } = useLanguage();
  const [viewMode, setViewMode] = useState<"split" | "edit" | "preview">("split");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [showScreenshotPicker, setShowScreenshotPicker] = useState(false);

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

          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={insertStepTemplate}
            title="Aggiungi struttura step"
            style={{ padding: "4px 8px", color: "var(--mint)" }}
          >
            + Aggiungi {t("md.step", "Step")}
          </button>
        </div>

        {/* View mode toggle */}
        <div className="seg" style={{ display: "flex" }}>
          <button
            type="button"
            className={viewMode === "split" ? "on" : ""}
            onClick={() => setViewMode("split")}
            style={{ fontSize: "11.5px", padding: "3px 8px" }}
            title="Vista affiancata: Editor e Anteprima Live"
          >
            Split View
          </button>
          <button
            type="button"
            className={viewMode === "edit" ? "on" : ""}
            onClick={() => setViewMode("edit")}
            style={{ fontSize: "11.5px", padding: "3px 8px" }}
            title="Mostra solo l'editor"
          >
            Solo Editor
          </button>
          <button
            type="button"
            className={viewMode === "preview" ? "on" : ""}
            onClick={() => setViewMode("preview")}
            style={{ fontSize: "11.5px", padding: "3px 8px" }}
            title="Mostra solo l'anteprima formattata"
          >
            Solo Anteprima
          </button>
        </div>
      </div>

      {/* Editor Body */}
      <div
        style={{
          display: "flex",
          flex: 1,
          minHeight: "520px",
          height: "100%",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Left: Raw Markdown Editor */}
        {(viewMode === "split" || viewMode === "edit") && (
          <div
            style={{
              flex: viewMode === "split" ? "1 1 50%" : "1 1 100%",
              display: "flex",
              flexDirection: "column",
              borderRight: viewMode === "split" ? "1px solid var(--hair)" : "none",
              background: "var(--surface)",
            }}
          >
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              disabled={disabled}
              placeholder="Scrivi qui il markdown della documentazione o usa la toolbar sopra..."
              style={{
                flex: 1,
                width: "100%",
                height: "100%",
                minHeight: "520px",
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
              }}
            />
          </div>
        )}

        {/* Right: Live Rendered Preview */}
        {(viewMode === "split" || viewMode === "preview") && (
          <div
            style={{
              flex: viewMode === "split" ? "1 1 50%" : "1 1 100%",
              overflowY: "auto",
              padding: "16px 24px",
              background: "var(--surface)",
              minHeight: "520px",
              maxHeight: "850px",
            }}
          >
            <MarkdownPreview markdown={value} screenshots={screenshots} />
          </div>
        )}
      </div>
    </div>
  );
}
