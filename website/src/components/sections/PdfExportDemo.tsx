import { useState, type CSSProperties, type ReactNode } from "react";
import { BrandLogo } from "../BrandLogo";
import {
  ACCENT_COLORS,
  DEFAULT_EXPORT_OPTIONS,
  DEMO_DOC_OVERVIEW,
  DEMO_DOC_TITLE,
  DEMO_EXPORT_STEPS,
  exportAccentColor,
  exportAccentInk,
  type ExportAccent,
  type ExportFormat,
  type ExportOptions,
  type ExportPageSize,
  type ExportTheme,
} from "../../data/exportDemo";

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

function mdInline(text: string) {
  const parts: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const token = match[0];
    if (token.startsWith("`")) {
      parts.push(<code key={match.index}>{token.slice(1, -1)}</code>);
    } else {
      parts.push(<b key={match.index}>{token.slice(2, -2)}</b>);
    }
    last = match.index + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export function PdfExportDemo() {
  const [format, setFormat] = useState<ExportFormat>("pdf");
  const [options, setOptions] = useState<ExportOptions>(DEFAULT_EXPORT_OPTIONS);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const accentColor = exportAccentColor(options.accent, options.theme);
  const accentInk = exportAccentInk(options.theme);

  function patchOptions(patch: Partial<ExportOptions>) {
    setOptions((current) => ({ ...current, ...patch }));
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
    <section className="blk wrap" id="pdf-export">
      <div className="sec-head reveal">
        <span className="eyebrow">PDF Export Studio</span>
        <h2>Configure. Preview. Export.</h2>
        <p>
          The same export studio from the desktop app — live on the web. Toggle
          theme, accent, cover page, screenshots, and branding to preview your
          export.
        </p>
      </div>

      <div className={`export-studio reveal${sidebarOpen ? "" : " sidebar-collapsed"}`}>
        <aside className="config" aria-hidden={!sidebarOpen}>
          <div className="cfg-head">
            <BrandLogo className="ico" />
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
                <Toggle
                  active={options.cover}
                  onClick={() => patchOptions({ cover: !options.cover })}
                />
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
                <span className="cfg-label">Annotations</span>
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
              <p className="cfg-hint">
                Turn off for a clean, white-label document with no logo or footer.
              </p>
            </div>
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
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d={sidebarOpen ? "M15 18l-6-6 6-6" : "M9 18l6-6-6-6"} />
            </svg>
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
                            <BrandLogo className="ico" />
                            <div>
                              <div className="bn">FlowCapture</div>
                              <div className="bt">Workflow documentation</div>
                            </div>
                          </div>
                          <div className="cover-kicker">Standard Operating Procedure</div>
                          <h1>{DEMO_DOC_TITLE}</h1>
                          <p className="lede">{DEMO_DOC_OVERVIEW}</p>
                          <div className="cover-meta">
                            <span className="cmeta">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                                <path d="M14 3v4a1 1 0 0 0 1 1h4M5 3h9l5 5v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
                              </svg>
                              June 9, 2026
                            </span>
                            <span className="cmeta">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                                <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
                                <rect x="9" y="3" width="6" height="4" rx="1" />
                              </svg>
                              {DEMO_EXPORT_STEPS.length} steps
                            </span>
                            <span className="cmeta">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                                <rect x="2" y="3" width="20" height="14" rx="2" />
                                <path d="M8 21h8M12 17v4" />
                              </svg>
                              0:23 recording
                            </span>
                          </div>
                        </div>
                      </div>
                    ) : null}

                    <div className="sheet-pad">
                      <div className="callout">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
                        </svg>
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

                      {DEMO_EXPORT_STEPS.map((step, index) => (
                        <div
                          key={step.title}
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
                                <span className="ts">{step.timestamp}</span>
                              ) : null}
                            </div>
                            <p>{mdInline(step.description)}</p>
                            {options.screenshots ? (
                              <div className="shot">
                                <div className="shot-img">
                                  <img src={step.image} alt={step.title} />
                                  {options.annotations ? (
                                    <>
                                      <div
                                        className="ring"
                                        style={{ left: step.ring.x, top: step.ring.y }}
                                      />
                                      <svg
                                        className="cur"
                                        style={{
                                          left: step.cursor.x,
                                          top: step.cursor.y,
                                          stroke: accentInk,
                                        }}
                                        viewBox="0 0 24 24"
                                        fill="#fff"
                                        strokeWidth="1.2"
                                      >
                                        <path d="m4 2 16 10-6.5 1.5L11 21 4 2Z" />
                                      </svg>
                                    </>
                                  ) : null}
                                </div>
                                <div className="shot-cap">
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                                    <rect x="3" y="4" width="18" height="16" rx="2" />
                                    <path d="M3 9h18" />
                                  </svg>
                                  {step.trigger}
                                </div>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="run-foot">
                      <span>{options.branding ? "FlowCapture · " : ""}Generated documentation</span>
                      <span>1 / 1</span>
                    </div>
                  </section>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
