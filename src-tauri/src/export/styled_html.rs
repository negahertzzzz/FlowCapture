use std::collections::HashMap;
use std::path::Path;

use base64::Engine;
use chrono::{DateTime, Utc};
use pulldown_cmark::{Options, Parser, html};
use serde::{Deserialize, Serialize};

use crate::ai::documentation::infer_workflow_summary;
use crate::storage::models::{Screenshot, Session, WorkflowStep};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct ExportOptions {
    pub theme: String,
    pub accent: String,
    pub page_size: String,
    pub cover: bool,
    pub screenshots: bool,
    pub step_numbers: bool,
    pub timestamps: bool,
    pub annotations: bool,
    pub branding: bool,
}

impl ExportOptions {
    pub fn normalized(self) -> Self {
        Self {
            theme: if self.theme == "light" { "light" } else { "dark" }.into(),
            accent: match self.accent.as_str() {
                "blue" | "violet" | "amber" => self.accent,
                _ => "mint".into(),
            },
            page_size: if self.page_size == "a4" { "a4" } else { "letter" }.into(),
            ..self
        }
    }
}

#[derive(Debug, Clone)]
pub struct ParsedDocStep {
    #[allow(dead_code)]
    pub step: usize,
    pub title: String,
    pub description: String,
    pub reason: Option<String>,
    pub timestamp_ms: i64,
    pub screenshot_id: Option<String>,
}

#[derive(Debug, Clone)]
pub struct ParsedDoc {
    pub title: String,
    pub overview: String,
    pub prerequisites: Option<String>,
    pub steps: Vec<ParsedDocStep>,
    pub expected_result: Option<String>,
}

pub fn parse_documentation_markdown(
    md: &str,
    screenshots: &[Screenshot],
    session_title: &str,
    fallback_steps: &[WorkflowStep],
) -> ParsedDoc {
    let mut title = session_title.to_string();
    let mut overview_buf = String::new();
    let mut prereq_buf = String::new();
    let mut expected_buf = String::new();
    let mut steps = Vec::new();

    let h1_re = regex::Regex::new(r"^#\s+(.+)$").unwrap();
    let h2_re = regex::Regex::new(r"^##\s+(.+)$").unwrap();
    let step_re = regex::Regex::new(r"(?i)^#{2,4}\s+(?:Step|Passo)?\s*(\d+)[:.]\s*(.*)$").unwrap();
    let why_re = regex::Regex::new(r"(?i)^>\s*\*\*(?:Why|Perch[ée])\s*:\*\*\s*(.*)$").unwrap();
    let img_re = regex::Regex::new(r"!\[.*?\]\((.*?)\)").unwrap();

    #[derive(PartialEq, Clone, Copy)]
    enum Section {
        None,
        Overview,
        Prerequisites,
        Steps,
        ExpectedResult,
        Other,
    }

    let mut current_section = Section::None;
    let mut current_step: Option<ParsedDocStep> = None;

    for line in md.lines() {
        let trimmed = line.trim();

        // 1. Title (# Title)
        if let Some(caps) = h1_re.captures(trimmed) {
            title = caps.get(1).map(|m| m.as_str().trim().to_string()).unwrap_or(title);
            current_section = Section::Overview;
            continue;
        }

        // 2. Section headers (## Header)
        if let Some(caps) = h2_re.captures(trimmed) {
            let h2_text = caps.get(1).map(|m| m.as_str().trim()).unwrap_or("");
            let h2_lower = h2_text.to_lowercase();

            // Flush current step
            if let Some(st) = current_step.take() {
                steps.push(st);
            }

            if h2_lower.contains("prerequisit") || h2_lower.contains("pre-requisit") || h2_lower.contains("requisiti") {
                current_section = Section::Prerequisites;
            } else if h2_lower.contains("step") || h2_lower.contains("passagg") || h2_lower.contains("procedura") || h2_lower.contains("istruzioni") {
                current_section = Section::Steps;
            } else if h2_lower.contains("expected") || h2_lower.contains("risultato") || h2_lower.contains("conclusione") || h2_lower.contains("result") {
                current_section = Section::ExpectedResult;
            } else if h2_lower.contains("overview") || h2_lower.contains("panoramica") || h2_lower.contains("introduzione") {
                current_section = Section::Overview;
            } else {
                current_section = Section::Other;
            }
            continue;
        }

        // 3. Step headers (### Step 1: ...)
        if let Some(caps) = step_re.captures(trimmed) {
            if let Some(prev) = current_step.take() {
                steps.push(prev);
            }
            let num = caps.get(1).and_then(|m| m.as_str().parse::<usize>().ok()).unwrap_or(steps.len() + 1);
            let s_title = caps.get(2).map(|m| m.as_str().trim().to_string()).unwrap_or_else(|| format!("Step {}", num));
            current_step = Some(ParsedDocStep {
                step: num,
                title: s_title,
                description: String::new(),
                reason: None,
                timestamp_ms: 0,
                screenshot_id: None,
            });
            current_section = Section::Steps;
            continue;
        }

        match current_section {
            Section::Overview => {
                if !trimmed.is_empty() {
                    if !overview_buf.is_empty() {
                        overview_buf.push('\n');
                    }
                    overview_buf.push_str(trimmed);
                }
            }
            Section::Prerequisites => {
                if !trimmed.is_empty() {
                    if !prereq_buf.is_empty() {
                        prereq_buf.push('\n');
                    }
                    prereq_buf.push_str(trimmed);
                }
            }
            Section::ExpectedResult => {
                if !trimmed.is_empty() {
                    if !expected_buf.is_empty() {
                        expected_buf.push('\n');
                    }
                    expected_buf.push_str(trimmed);
                }
            }
            Section::Steps => {
                if let Some(step) = &mut current_step {
                    if let Some(why_caps) = why_re.captures(trimmed) {
                        let why_text = why_caps.get(1).map(|m| m.as_str().trim().to_string()).unwrap_or_default();
                        step.reason = Some(why_text);
                    } else if let Some(img_caps) = img_re.captures(trimmed) {
                        let img_path = img_caps.get(1).map(|m| m.as_str().trim()).unwrap_or("");
                        let found_id = screenshots.iter().find(|s| {
                            s.path == img_path
                                || s.path.ends_with(img_path)
                                || (!img_path.is_empty()
                                    && s.path.ends_with(
                                        std::path::Path::new(img_path)
                                            .file_name()
                                            .unwrap_or_default()
                                            .to_str()
                                            .unwrap_or("___none___"),
                                    ))
                        }).map(|s| s.id.clone());

                        if let Some(id) = found_id {
                            step.screenshot_id = Some(id);
                        }
                    } else if !trimmed.is_empty() {
                        if !step.description.is_empty() {
                            step.description.push('\n');
                        }
                        step.description.push_str(trimmed);
                    }
                }
            }
            _ => {}
        }
    }

    if let Some(st) = current_step.take() {
        steps.push(st);
    }

    if steps.is_empty() && !fallback_steps.is_empty() {
        for (i, fs) in fallback_steps.iter().enumerate() {
            steps.push(ParsedDocStep {
                step: i + 1,
                title: fs.title.clone(),
                description: fs.description.clone(),
                reason: fs.reason.clone(),
                timestamp_ms: fs.timestamp_ms,
                screenshot_id: fs.screenshot_ids.first().cloned(),
            });
        }
    }

    for step in &mut steps {
        if step.timestamp_ms == 0 {
            if let Some(ref sid) = step.screenshot_id {
                if let Some(shot) = screenshots.iter().find(|s| &s.id == sid) {
                    step.timestamp_ms = shot.timestamp_ms;
                }
            }
        }
    }

    ParsedDoc {
        title,
        overview: if overview_buf.is_empty() {
            "Guida passo-passo generata da FlowCapture con schermate e spiegazioni contestuali.".to_string()
        } else {
            overview_buf
        },
        prerequisites: if prereq_buf.is_empty() { None } else { Some(prereq_buf) },
        steps,
        expected_result: if expected_buf.is_empty() { None } else { Some(expected_buf) },
    }
}

pub fn render_styled_export_html(
    session: &Session,
    steps: &[WorkflowStep],
    screenshots: &[Screenshot],
    options: &ExportOptions,
    output_mode: &str,
) -> String {
    let options = options.clone().normalized();

    let parsed_doc = if let Some(doc_md) = session.documentation_md.as_deref().filter(|s| !s.trim().is_empty()) {
        parse_documentation_markdown(doc_md, screenshots, &session.title, steps)
    } else {
        let (title, overview) = infer_workflow_summary(&session.title, &[], steps, None);
        ParsedDoc {
            title,
            overview,
            prerequisites: None,
            steps: steps.iter().enumerate().map(|(i, s)| ParsedDocStep {
                step: i + 1,
                title: s.title.clone(),
                description: s.description.clone(),
                reason: s.reason.clone(),
                timestamp_ms: s.timestamp_ms,
                screenshot_id: s.screenshot_ids.first().cloned(),
            }).collect(),
            expected_result: None,
        }
    };

    let title = &parsed_doc.title;
    let overview = &parsed_doc.overview;
    let accent = accent_for(&options.accent, &options.theme);
    let accent_ink = if options.theme == "light" {
        "#ffffff"
    } else {
        "#06231b"
    };
    let mode = if output_mode == "html" { "html" } else { "pdf" };
    let size_class = if options.page_size == "a4" {
        "size-a4"
    } else {
        "size-letter"
    };
    let brand_class = if options.branding { "" } else { " no-brand" };
    let session_date = format_session_date(&session.started_at);
    let step_count = parsed_doc.steps.len();
    let duration_label = format_duration(session.duration);
    let session_start_ms = session_start_ms(&session.started_at);
    let screenshot_map: HashMap<String, &Screenshot> =
        screenshots.iter().map(|shot| (shot.id.clone(), shot)).collect();

    let os_name = match std::env::consts::OS {
        "windows" => "Windows",
        "macos" => "macOS",
        "linux" => "Linux",
        other => other,
    };

    let prereq_html = if let Some(ref prereq) = parsed_doc.prerequisites {
        format!(
            r#"<div class="prereq-card">
  <div class="prereq-header">{icon}<span>Prerequisiti · Prerequisites</span></div>
  <div class="prereq-body">{content}</div>
</div>"#,
            icon = ICON_CLIPBOARD,
            content = markdown_to_html(prereq),
        )
    } else {
        String::new()
    };

    let expected_html = if let Some(ref expected) = parsed_doc.expected_result {
        format!(
            r#"<div class="expected-card">
  <div class="expected-header">{icon}<span>Risultato Atteso · Expected Result</span></div>
  <div class="expected-body">{content}</div>
</div>"#,
            icon = ICON_CHECK,
            content = markdown_to_html(expected),
        )
    } else {
        String::new()
    };

    let mut steps_html = String::new();
    for (index, step) in parsed_doc.steps.iter().enumerate() {
        let step_num = index + 1;
        let timestamp = format_step_time(step.timestamp_ms, session_start_ms);
        let description = markdown_to_html(&step.description);
        let shot_html = if options.screenshots {
            step.screenshot_id
                .as_deref()
                .and_then(|id| screenshot_map.get(id).copied())
                .or_else(|| screenshots.get(index))
                .map(|shot| render_shot(shot, &options))
                .unwrap_or_default()
        } else {
            String::new()
        };

        let why_html = if let Some(ref reason) = step.reason {
            if !reason.trim().is_empty() {
                format!(
                    r#"<div class="step-why"><span class="why-badge">WHY</span><span class="why-text">{}</span></div>"#,
                    markdown_inline(reason.trim())
                )
            } else {
                String::new()
            }
        } else {
            String::new()
        };

        let num_cell = if options.step_numbers {
            format!(r#"<div class="step-n" data-num>{step_num}</div>"#)
        } else {
            String::new()
        };
        let grid = if options.step_numbers {
            "44px 1fr"
        } else {
            "1fr"
        };
        let ts_cell = if options.timestamps {
            format!(r#"<span class="ts" data-ts>{timestamp}</span>"#)
        } else {
            String::new()
        };

        steps_html.push_str(&format!(
            r#"<div class="step" data-step style="grid-template-columns:{grid}">
  {num_cell}
  <div>
    <div class="step-head"><h3>{title}</h3>{ts_cell}</div>
    <div class="step-desc">{description}</div>
    {why_html}
    {shot_html}
  </div>
</div>"#,
            title = html_escape(&step.title),
        ));
    }

    if steps_html.is_empty() {
        steps_html.push_str(
            r#"<div class="step" data-step style="grid-template-columns:1fr"><div><p>No workflow steps were generated for this session yet.</p></div></div>"#,
        );
    }

    let cover_html = if options.cover {
        format!(
            r#"<div class="cover" id="coverBlock">
  <div class="cover-band">
    <div class="cover-brand" data-brand>
      {logo}
      <div><div class="bn">FlowCapture</div><div class="bt">Workflow documentation</div></div>
    </div>
    <div class="cover-kicker">Standard Operating Procedure</div>
    <h1>{title}</h1>
    <p class="lede">{overview}</p>
    <div class="cover-meta">
      <span class="cmeta">{date_icon}{session_date}</span>
      <span class="cmeta">{list_icon}{step_count} steps</span>
      <span class="cmeta">{clock_icon}{duration_label} recording</span>
      <span class="cmeta">{monitor_icon}{os_name}</span>
    </div>
  </div>
</div>"#,
            logo = flowcapture_logo_html(32),
            title = html_escape(title),
            overview = html_escape(overview),
            date_icon = ICON_CALENDAR,
            session_date = session_date,
            list_icon = ICON_LIST,
            step_count = step_count,
            clock_icon = ICON_CLOCK,
            duration_label = duration_label,
            monitor_icon = ICON_MONITOR,
            os_name = os_name,
        )
    } else {
        String::new()
    };

    let intro = format!(
        r#"<div class="callout" id="introCallout">
  {info_icon}
  <div class="ct">This guide was generated automatically<span data-brand> by <b>FlowCapture</b></span> from screen, mouse, keyboard and window events. Sensitive data was redacted before processing.</div>
</div>"#,
        info_icon = ICON_INFO,
    );

    format!(
        r#"<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{doc_title}</title>
  <style>{styles}</style>
</head>
<body>
  <div class="doc theme-{theme} mode-{mode} {size_class}{brand_class}" style="--p-accent:{accent};--p-accent-ink:{accent_ink};">
    <section class="sheet">
      {cover_html}
      <div class="sheet-pad">
        {intro}
        {prereq_html}
        <div class="steps-title">Steps</div>
        {steps_html}
        {expected_html}
      </div>
      <div class="run-foot"><span><span data-brand>FlowCapture · </span>Generated documentation</span><span>1 / 1</span></div>
    </section>
  </div>
</body>
</html>"#,
        doc_title = html_escape(title),
        styles = export_doc_styles(mode),
        theme = options.theme,
        mode = mode,
        size_class = size_class,
        brand_class = brand_class,
        cover_html = cover_html,
        intro = intro,
        prereq_html = prereq_html,
        steps_html = steps_html,
        expected_html = expected_html,
        accent = accent,
        accent_ink = accent_ink,
    )
}

fn render_shot(shot: &Screenshot, options: &ExportOptions) -> String {
    let caption = shot.trigger.clone().unwrap_or_else(|| "capture".to_string());
    let image = image_data_uri(&shot.path).unwrap_or_default();
    let accent_ink = if options.theme == "light" {
        "#ffffff"
    } else {
        "#06231b"
    };
    let image_html = if image.is_empty() {
        r#"<div class="shot-win"><div class="tb"><i></i><i></i><i></i></div><div class="ln a"></div><div class="ln b"></div></div>"#.to_string()
    } else {
        format!(
            r#"<img src="{image}" alt="{caption}" style="width:100%;height:100%;object-fit:cover;object-position:left top;" />"#
        )
    };
    let anno = if options.annotations {
        format!(
            r##"<div class="ring" data-anno style="left:62%;top:40%"></div>
           <svg class="cur" data-anno style="left:60%;top:38%" viewBox="0 0 24 24" fill="#fff" stroke="{accent_ink}" stroke-width="1.2"><path d="m4 2 16 10-6.5 1.5L11 21 4 2Z"/></svg>"##
        )
    } else {
        String::new()
    };

    format!(
        r#"<div class="shot" data-shot>
  <div class="shot-img">{image_html}{anno}</div>
  <div class="shot-cap">{window_icon}{caption}</div>
</div>"#,
        window_icon = ICON_WINDOW,
        caption = html_escape(&caption),
    )
}

fn accent_for(accent: &str, theme: &str) -> &'static str {
    match (accent, theme) {
        ("blue", "light") => "#1d74d1",
        ("blue", _) => "#6cc6ff",
        ("violet", "light") => "#6b46d9",
        ("violet", _) => "#b69bff",
        ("amber", "light") => "#b07d12",
        ("amber", _) => "#f4c66a",
        ("mint", "light") => "#11a87a",
        _ => "#5fe9b8",
    }
}

fn format_session_date(started_at: &str) -> String {
    DateTime::parse_from_rfc3339(started_at)
        .map(|dt| dt.format("%B %d, %Y").to_string())
        .unwrap_or_else(|_| Utc::now().format("%B %d, %Y").to_string())
}

fn session_start_ms(started_at: &str) -> i64 {
    DateTime::parse_from_rfc3339(started_at)
        .map(|dt| dt.timestamp_millis())
        .unwrap_or(0)
}

fn format_step_time(step_ms: i64, session_start_ms: i64) -> String {
    let secs = ((step_ms - session_start_ms).max(0) / 1000) as i64;
    format!("{:02}:{:02}", secs / 60, secs % 60)
}

fn format_duration(seconds: i64) -> String {
    format!("{}:{:02}", seconds / 60, seconds % 60)
}

fn image_data_uri(path: &str) -> Option<String> {
    let bytes = std::fs::read(path).ok()?;
    let ext = Path::new(path)
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("png");
    let mime = match ext.to_ascii_lowercase().as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        _ => "image/png",
    };
    Some(format!(
        "data:{mime};base64,{}",
        base64::engine::general_purpose::STANDARD.encode(bytes)
    ))
}

fn markdown_inline(input: &str) -> String {
    let mut output = html_escape(input);
    while let Some(start) = output.find("**") {
        if let Some(end) = output[start + 2..].find("**") {
            let inner = &output[start + 2..start + 2 + end];
            let replacement = format!("<b>{inner}</b>");
            output.replace_range(start..start + 4 + end, &replacement);
        } else {
            break;
        }
    }
    output = output.replace('`', "");
    output
}

fn markdown_to_html(input: &str) -> String {
    let mut options = Options::empty();
    options.insert(Options::ENABLE_STRIKETHROUGH);
    options.insert(Options::ENABLE_TABLES);
    let parser = Parser::new_ext(input, options);
    let mut html_output = String::new();
    html::push_html(&mut html_output, parser);
    html_output
}

fn html_escape(input: &str) -> String {
    input
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

fn flowcapture_logo_html(size: u32) -> String {
    let data = base64::Engine::encode(
        &base64::engine::general_purpose::STANDARD,
        include_bytes!("../../icons/32x32.png"),
    );
    format!(
        r#"<img src="data:image/png;base64,{data}" width="{size}" height="{size}" alt="FlowCapture" style="display:block;object-fit:contain;border-radius:9px" />"#
    )
}

const ICON_CALENDAR: &str = r#"<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/></svg>"#;
const ICON_LIST: &str = r#"<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/></svg>"#;
const ICON_CLOCK: &str = r#"<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>"#;
const ICON_MONITOR: &str = r#"<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg>"#;
const ICON_INFO: &str = r#"<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/></svg>"#;
const ICON_WINDOW: &str = r#"<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/></svg>"#;
const ICON_CLIPBOARD: &str = r#"<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>"#;
const ICON_CHECK: &str = r#"<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="m9 12 2 2 4-4"/></svg>"#;

const EXPORT_DOC_STYLES_BASE: &str = r#"
:root { --sans:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; --mono:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace; }
body { margin:0; font-family:var(--sans); background:#07090a; }
.doc {
  --p-accent-soft: color-mix(in srgb, var(--p-accent) 13%, transparent);
  --p-accent-line: color-mix(in srgb, var(--p-accent) 32%, transparent);
  width:816px; max-width:100%; margin:0 auto; font-size:15px; line-height:1.6;
}
.doc.size-a4 { width:794px; }
.doc.theme-dark { --p-bg:#0c1113; --p-ink:#eaf1ef; --p-muted:#9aa6a3; --p-dim:#69746f; --p-line:rgba(150,175,170,.14); --p-card:rgba(255,255,255,.022); --p-shadow:0 40px 90px -30px rgba(0,0,0,.8); }
.doc.theme-light { --p-bg:#ffffff; --p-ink:#13201c; --p-muted:#5d6b66; --p-dim:#97a39d; --p-line:#e8ece9; --p-card:#f6f9f7; --p-shadow:0 40px 90px -30px rgba(0,0,0,.5); }
.doc.mode-pdf .sheet { background:var(--p-bg); color:var(--p-ink); border-radius:4px; box-shadow:var(--p-shadow); overflow:hidden; border:1px solid var(--p-line); }
.doc.mode-html { width:760px; background:var(--p-bg); color:var(--p-ink); border:1px solid var(--p-line); border-radius:16px; box-shadow:var(--p-shadow); overflow:hidden; }
.doc.mode-html .sheet { background:transparent; border:none; box-shadow:none; }
.doc.mode-html .run-head { display:none; }
.doc.mode-html .run-foot { display:flex; padding:18px 52px; }
.sheet-pad { padding:56px 60px 40px; }
.doc.mode-html .sheet-pad { padding:48px 52px; }
.run-foot { display:flex; align-items:center; justify-content:space-between; padding:14px 60px; border-top:1px solid var(--p-line); font-family:var(--mono); font-size:11px; color:var(--p-dim); }
.cover-band { background:linear-gradient(135deg,#0c1a16,#0a1411 70%); padding:46px 60px 42px; position:relative; overflow:hidden; }
.cover-band::after { content:""; position:absolute; right:-80px; top:-80px; width:300px; height:300px; border-radius:50%; background:radial-gradient(circle, color-mix(in srgb, var(--p-accent) 22%, transparent), transparent 65%); pointer-events:none; }
.doc.mode-html .cover-band { border-radius:16px 16px 0 0; }
.cover-brand { display:flex; align-items:center; gap:12px; position:relative; }
.cover-brand .bn { font-size:15px; font-weight:650; color:#fff; }
.cover-brand .bt { font-size:11.5px; color:rgba(255,255,255,.5); font-family:var(--mono); }
.cover-kicker { margin-top:30px; font-family:var(--mono); font-size:12px; letter-spacing:.16em; text-transform:uppercase; color:var(--p-accent); position:relative; }
.cover h1 { color:#fff; font-size:38px; line-height:1.08; margin-top:14px; max-width:18ch; letter-spacing:-.025em; position:relative; }
.cover .lede { color:rgba(255,255,255,.7); font-size:15.5px; margin-top:16px; max-width:62ch; line-height:1.6; position:relative; }
.cover-meta { display:flex; flex-wrap:wrap; gap:10px; margin-top:26px; position:relative; }
.cmeta { display:flex; align-items:center; gap:8px; height:30px; padding:0 12px; border-radius:8px; background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.1); font-size:12px; color:rgba(255,255,255,.82); }
.cmeta svg { width:14px; height:14px; color:var(--p-accent); }
.callout { display:flex; gap:14px; padding:18px 20px; border-radius:12px; background:var(--p-accent-soft); border:1px solid var(--p-accent-line); margin-bottom:36px; }
.callout svg { width:20px; height:20px; color:var(--p-accent); flex:none; margin-top:1px; }
.callout .ct { font-size:14px; color:var(--p-ink); line-height:1.55; }
.steps-title { font-size:13px; font-family:var(--mono); letter-spacing:.14em; text-transform:uppercase; color:var(--p-muted); margin-bottom:6px; }
.step { display:grid; gap:18px; padding:26px 0; border-bottom:1px solid var(--p-line); }
.step:last-child { border-bottom:0; }
.step-n { width:36px; height:36px; border-radius:10px; background:var(--p-accent); color:var(--p-accent-ink); font-family:var(--mono); font-weight:600; font-size:15px; display:grid; place-items:center; }
.step-head { display:flex; align-items:baseline; gap:12px; flex-wrap:wrap; }
.step h3 { font-size:19px; color:var(--p-ink); letter-spacing:-.015em; margin:0; }
.step .ts { font-family:var(--mono); font-size:11.5px; color:var(--p-dim); margin-left:auto; }
.step p { color:var(--p-muted); margin-top:10px; font-size:14.5px; line-height:1.65; }
.step p b { color:var(--p-ink); font-weight:600; }
.step code { font-family:var(--mono); font-size:.88em; background:var(--p-accent-soft); color:var(--p-accent); padding:1px 6px; border-radius:5px; }
.shot { margin-top:18px; border-radius:12px; border:1px solid var(--p-line); overflow:hidden; background:#0a0d18; }
.shot-img { aspect-ratio:16/9; background:linear-gradient(135deg,#22245e,#3a3f8f 55%,#1a1b34); position:relative; overflow:hidden; }
.shot-win { position:absolute; inset:13% 16%; border-radius:9px; background:rgba(12,15,24,.86); border:1px solid rgba(255,255,255,.13); }
.shot-win .ln.a { width:60%; background:color-mix(in srgb,var(--p-accent) 50%, transparent); }
.shot .ring { position:absolute; width:34px; height:34px; border-radius:50%; border:2.5px solid var(--p-accent); transform:translate(-50%,-50%); box-shadow:0 0 0 5px color-mix(in srgb,var(--p-accent) 22%, transparent); }
.shot .cur { position:absolute; width:18px; height:18px; filter:drop-shadow(0 2px 3px rgba(0,0,0,.5)); }
.shot-cap { display:flex; align-items:center; gap:8px; padding:11px 14px; background:var(--p-card); border-top:1px solid var(--p-line); font-size:12px; color:var(--p-muted); }
.shot-cap svg { width:14px; height:14px; color:var(--p-accent); }
.prereq-card { margin-top:24px; margin-bottom:28px; border-radius:12px; background:var(--p-card); border:1px solid var(--p-line); overflow:hidden; }
.prereq-header { display:flex; align-items:center; gap:8px; padding:10px 16px; font-family:var(--mono); font-size:12px; letter-spacing:.05em; text-transform:uppercase; color:var(--p-dim); border-bottom:1px solid var(--p-line); background:var(--p-accent-soft); }
.prereq-header svg { width:15px; height:15px; color:var(--p-accent); }
.prereq-body { padding:14px 18px; font-size:14px; color:var(--p-muted); }
.prereq-body ul { margin:0; padding-left:20px; }
.prereq-body li { margin-bottom:6px; }
.prereq-body li:last-child { margin-bottom:0; }
.prereq-body p { margin:0 0 8px 0; }
.prereq-body p:last-child { margin-bottom:0; }
.step-desc { color:var(--p-muted); margin-top:10px; font-size:14.5px; line-height:1.65; }
.step-desc p { margin:0 0 8px 0; }
.step-desc p:last-child { margin-bottom:0; }
.step-desc b { color:var(--p-ink); font-weight:600; }
.step-desc code { font-family:var(--mono); font-size:.88em; background:var(--p-accent-soft); color:var(--p-accent); padding:1px 6px; border-radius:5px; }
.step-why { margin-top:12px; display:inline-flex; align-items:baseline; gap:8px; padding:6px 12px; border-radius:8px; background:var(--p-accent-soft); border:1px solid var(--p-accent-line); font-size:13px; color:var(--p-ink); }
.why-badge { font-family:var(--mono); font-size:10.5px; font-weight:700; letter-spacing:.08em; color:var(--p-accent); padding:1px 5px; border-radius:4px; background:color-mix(in srgb, var(--p-accent) 20%, transparent); }
.why-text { font-style:italic; color:var(--p-ink); }
.expected-card { margin-top:36px; border-radius:12px; background:var(--p-card); border:1px solid var(--p-line); overflow:hidden; }
.expected-header { display:flex; align-items:center; gap:8px; padding:10px 16px; font-family:var(--mono); font-size:12px; letter-spacing:.05em; text-transform:uppercase; color:var(--p-dim); border-bottom:1px solid var(--p-line); background:var(--p-accent-soft); }
.expected-header svg { width:15px; height:15px; color:var(--p-accent); }
.expected-body { padding:14px 18px; font-size:14px; color:var(--p-muted); }
.expected-body p { margin:0 0 8px 0; }
.expected-body p:last-child { margin-bottom:0; }
.expected-body b { color:var(--p-ink); font-weight:600; }
.doc.no-brand [data-brand] { display:none !important; }
@media print {
  @page { size: Letter; margin: 0; }
  body { background:#fff; }
  .doc, .doc.mode-pdf, .doc.mode-html { width:100% !important; }
  .sheet { box-shadow:none !important; border:none !important; border-radius:0 !important; }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
}
"#;

const EXPORT_DOC_STYLES_WEB_FONTS: &str = r#"
@import url('https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500;600&display=swap');
:root { --sans:'Geist',ui-sans-serif,system-ui,sans-serif; --mono:'Geist Mono',ui-monospace,Menlo,monospace; }
"#;

fn export_doc_styles(mode: &str) -> String {
    if mode == "html" {
        format!("{EXPORT_DOC_STYLES_WEB_FONTS}{EXPORT_DOC_STYLES_BASE}")
    } else {
        EXPORT_DOC_STYLES_BASE.to_string()
    }
}
