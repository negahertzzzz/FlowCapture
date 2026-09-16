import { convertFileSrc } from "@tauri-apps/api/core";
import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { AppButton } from "@/components/ui/AppButton";
import { Icon } from "@/components/ui/Icon";
import { Logo } from "@/components/ui/Logo";
import type { ExportRecord, Session, Screenshot, WorkflowStep } from "@/lib/api";
import {
  ACCENT_COLORS,
  DEFAULT_EXPORT_OPTIONS,
  exportAccentColor,
  exportAccentInk,
  toApiExportOptions,
  type ExportAccent,
  type ExportFormat,
  type ExportOptions,
  type ExportPageSize,
  type ExportTheme,
} from "@/lib/exportOptions";
import { exportTypeClass } from "@/lib/icons";
import { formatDuration } from "@/lib/utils";

type ExportPanelProps = {
  session: Session;
  steps: WorkflowStep[];
  screenshots: Screenshot[];
  exports: ExportRecord[];
  busy: boolean;
  onExport: (format: string, options?: ReturnType<typeof toApiExportOptions>) => Promise<void>;
  onRevealExport: (path: string) => void;
};

function mdInline(text: string) {
  const parts: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    parts.push(<b key={match.index}>{match[0].slice(2, -2)}</b>);
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function sessionStartMs(startedAt: string) {
  const value = Date.parse(startedAt);
  return Number.isNaN(value) ? 0 : value;
}

function stepTime(stepMs: number, startMs: number) {
  const secs = Math.max(0, Math.floor((stepMs - startMs) / 1000));
  return `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;
}

function sessionDate(startedAt: string) {
  return new Date(startedAt).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function Toggle({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className={`tg${active ? " on" : ""}`}
      aria-pressed={active}
      onClick={onClick}
    />
  );
}

export function ExportPanel({
  session,
  steps,
  screenshots,
  exports,
  busy,
  onExport,
  onRevealExport,
}: ExportPanelProps) {
  const [format, setFormat] = useState<ExportFormat>("pdf");
  const [options, setOptions] = useState<ExportOptions>(DEFAULT_EXPORT_OPTIONS);
  const [copied, setCopied] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const startMs = sessionStartMs(session.started_at);
  const accentColor = exportAccentColor(options.accent, options.theme);
  const accentInk = exportAccentInk(options.theme);
  const docTitle = session.title || "Workflow Documentation";
  const overview =
    "A step-by-step guide generated from your recorded session with screenshots and workflow context.";

  const screenshotMap = useMemo(
    () => new Map(screenshots.map((shot) => [shot.id, shot])),
    [screenshots],
  );

  function patchOptions(patch: Partial<ExportOptions>) {
    setOptions((current) => ({ ...current, ...patch }));
  }

  async function handlePrimaryExport() {
    await onExport(format, toApiExportOptions(options));
  }

  async function handleCopyPath() {
    const latest = exports[0];
    if (!latest) return;
    await navigator.clipboard.writeText(latest.path);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  const docClass = [
    "export-doc",
    `theme-${options.theme}`,
    `mode-${format}`,
    options.pageSize === "a4" ? "size-a4" : "size-letter",
    options.branding ? "" : "no-brand",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={`export-studio${sidebarOpen ? "" : " sidebar-collapsed"}`}>
      <aside className="config" aria-hidden={!sidebarOpen}>
        <div className="cfg-head">
          <Logo size={34} />
          <div>
            <div className="lt">Export</div>
            <div className="ls">Configure your document</div>
          </div>
        </div>

        <div className="cfg-body">
          <div className="cfg-sec">
            <h4>Format</h4>
            <div className="seg">
              {(["pdf", "html"] as ExportFormat[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  className={format === value ? "on" : ""}
                  onClick={() => setFormat(value)}
                >
                  <Icon name={value === "pdf" ? "file" : "edit"} size={15} />
                  {value.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div className="cfg-sec">
            <h4>Theme</h4>
            <div className="seg">
              {(["dark", "light"] as ExportTheme[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  className={options.theme === value ? "on" : ""}
                  onClick={() => patchOptions({ theme: value })}
                >
                  {value === "dark" ? "Dark" : "Light"}
                </button>
              ))}
            </div>
          </div>

          <div className="cfg-sec">
            <h4>Accent</h4>
            <div className="swatches">
              {(Object.keys(ACCENT_COLORS) as ExportAccent[]).map((accent) => (
                <button
                  key={accent}
                  type="button"
                  className={`sw${options.accent === accent ? " on" : ""}`}
                  style={{ background: ACCENT_COLORS[accent].dark }}
                  aria-label={`${accent} accent`}
                  onClick={() => patchOptions({ accent })}
                />
              ))}
            </div>
          </div>

          <div className={`cfg-sec${format === "html" ? " dimmed" : ""}`}>
            <h4>Page size</h4>
            <select
              className="selectish"
              value={options.pageSize}
              disabled={format === "html"}
              onChange={(event) =>
                patchOptions({ pageSize: event.target.value as ExportPageSize })
              }
            >
              <option value="letter">US Letter · 8.5 × 11 in</option>
              <option value="a4">A4 · 210 × 297 mm</option>
            </select>
          </div>

          <div className="cfg-sec">
            <h4>Include</h4>
            <div className="row">
              <span className="cfg-label">Cover page</span>
              <Toggle active={options.cover} onClick={() => patchOptions({ cover: !options.cover })} />
            </div>
            <div className="row">
              <span className="cfg-label">Screenshots</span>
              <Toggle
                active={options.screenshots}
                onClick={() => patchOptions({ screenshots: !options.screenshots })}
              />
            </div>
            <div className="row">
              <span className="cfg-label">Step numbers</span>
              <Toggle
                active={options.stepNumbers}
                onClick={() => patchOptions({ stepNumbers: !options.stepNumbers })}
              />
            </div>
            <div className="row">
              <span className="cfg-label">Timestamps</span>
              <Toggle
                active={options.timestamps}
                onClick={() => patchOptions({ timestamps: !options.timestamps })}
              />
            </div>
            <div className="row">
              <div>
                <span className="cfg-label">Annotazioni grafiche</span>
                <div style={{ fontSize: "11px", color: "var(--dim)" }}>
                  Includi evidenziazioni, click e badge disegnati
                </div>
              </div>
              <Toggle
                active={options.annotations}
                onClick={() => patchOptions({ annotations: !options.annotations })}
              />
            </div>
          </div>

          <div className="cfg-sec">
            <h4>Branding</h4>
            <div className="row">
              <span className="cfg-label">FlowCapture watermark</span>
              <Toggle
                active={options.branding}
                onClick={() => patchOptions({ branding: !options.branding })}
              />
            </div>
            <div style={{ fontSize: 12, color: "var(--dim)", lineHeight: 1.5, marginTop: 4 }}>
              Turn off to export a clean, white-label document with no FlowCapture logo or footer.
            </div>
          </div>
        </div>

        <div className="cfg-foot">
          <AppButton kind="primary" icon="download" disabled={busy} onClick={handlePrimaryExport}>
            {format === "pdf" ? "Save as PDF" : "Download HTML"}
          </AppButton>
          <div className="btn-row">
            <AppButton
              disabled={busy}
              onClick={() => onExport("markdown", toApiExportOptions(options))}
            >
              Markdown
            </AppButton>
            <AppButton disabled={busy} onClick={() => onExport("video")}>
              Video
            </AppButton>
          </div>
          <AppButton icon="copy" disabled={!exports.length} onClick={handleCopyPath}>
            {copied ? "Copied path" : "Copy latest path"}
          </AppButton>
        </div>
      </aside>

      <div className="stage">
        <button
          type="button"
          className="sidebar-toggle"
          aria-label={sidebarOpen ? "Hide export settings" : "Show export settings"}
          aria-expanded={sidebarOpen}
          onClick={() => setSidebarOpen((open) => !open)}
        >
          <Icon name={sidebarOpen ? "chevronLeft" : "chevronRight"} size={16} />
        </button>
        <div className="stage-scroll">
          <div className="stage-inner">
            <div className="doc-fit">
          <div
            className={docClass}
            style={
              {
                "--p-accent": accentColor,
                "--p-accent-ink": accentInk,
                "--p-accent-soft": `color-mix(in srgb, ${accentColor} 13%, transparent)`,
                "--p-accent-line": `color-mix(in srgb, ${accentColor} 32%, transparent)`,
              } as CSSProperties
            }
          >
            <section className="export-sheet">
              {options.cover ? (
                <div className="cover">
                  <div className="cover-band">
                    <div className="cover-brand" data-brand>
                      <Logo size={32} variant="accent" />
                      <div>
                        <div className="bn">FlowCapture</div>
                        <div className="bt">Workflow documentation</div>
                      </div>
                    </div>
                    <div className="cover-kicker">Standard Operating Procedure</div>
                    <h1>{docTitle}</h1>
                    <p className="lede">{overview}</p>
                    <div className="cover-meta">
                      <span className="cmeta">
                        <Icon name="file" size={14} />
                        {sessionDate(session.started_at)}
                      </span>
                      <span className="cmeta">
                        <Icon name="edit" size={14} />
                        {steps.length || "No"} steps
                      </span>
                      <span className="cmeta">
                        <Icon name="monitor" size={14} />
                        {formatDuration(session.duration)} recording
                      </span>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="sheet-pad">
                <div className="callout">
                  <Icon name="shield" size={20} />
                  <div className="ct">
                    This guide was generated automatically
                    {options.branding ? (
                      <>
                        {" "}
                        by <b>FlowCapture</b>
                      </>
                    ) : null}{" "}
                    from screen, mouse, keyboard and window events.
                  </div>
                </div>

                <div className="steps-title">Steps</div>

                {steps.length === 0 ? (
                  <div className="step" style={{ gridTemplateColumns: "1fr" }}>
                    <div>
                      <p>Generate documentation first to populate export steps.</p>
                    </div>
                  </div>
                ) : (
                  steps.map((step, index) => {
                    const shot = step.screenshot_ids[0]
                      ? screenshotMap.get(step.screenshot_ids[0])
                      : screenshots[index];
                    return (
                      <div
                        key={`${step.step}-${index}`}
                        className="step"
                        style={{
                          gridTemplateColumns: options.stepNumbers ? "44px 1fr" : "1fr",
                        }}
                      >
                        {options.stepNumbers ? (
                          <div className="step-n">{index + 1}</div>
                        ) : null}
                        <div>
                          <div className="step-head">
                            <h3>{step.title}</h3>
                            {options.timestamps ? (
                              <span className="ts">{stepTime(step.timestamp_ms, startMs)}</span>
                            ) : null}
                          </div>
                          <p>{mdInline(step.description)}</p>
                          {options.screenshots && shot ? (
                            <div className="shot">
                              <div className="shot-img">
                                <img
                                  src={convertFileSrc(
                                    !options.annotations && shot.path.replace(/(\.[a-zA-Z0-9]+)$/, "_clean$1")
                                      ? shot.path
                                      : shot.path
                                  )}
                                  alt={step.title}
                                  onError={(event) => {
                                    (event.target as HTMLImageElement).style.display = "none";
                                  }}
                                />
                              </div>
                              <div className="shot-cap">
                                <Icon name="window" size={14} />
                                {shot.trigger ?? "capture"}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="run-foot">
                <span>
                  {options.branding ? "FlowCapture · " : ""}
                  Generated documentation
                </span>
                <span>1 / 1</span>
              </div>
            </section>
          </div>
            </div>
          </div>
        </div>
      </div>

      <div className="export-history">
        <h3>Export history</h3>
        <div className="pd" style={{ color: "var(--muted)", fontSize: 14, marginBottom: 14 }}>
          Open exported files in Finder from here.
        </div>
        <div className="exp-list">
          {exports.length === 0 ? (
            <div className="pd">No exports yet. Configure your document and save it below.</div>
          ) : (
            exports.map((record) => (
              <div className="exp" key={record.id}>
                <div className="eh">
                  <span className={`etype ${exportTypeClass(record.format)}`}>
                    {record.format}
                  </span>
                </div>
                <div className="epath">{record.path}</div>
                <div className="ef">
                  <span className="et">{record.created_at}</span>
                  <button
                    type="button"
                    className="show-folder"
                    onClick={() => onRevealExport(record.path)}
                  >
                    <Icon name="folder" size={15} /> Show in Folder
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
