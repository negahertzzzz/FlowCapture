mod styled_html;

use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use anyhow::{Context, Result};
use chrono::Utc;
use pulldown_cmark::{Options, Parser, html};
use uuid::Uuid;

pub use styled_html::{ExportOptions, render_styled_export_html};
use crate::ai::documentation::{
    export_markdown_image_path, infer_workflow_summary, markdown_image_path,
    render_documentation_markdown, strip_screenshot_references,
};
use crate::media::{ensure_session_mp4, resolve_ffmpeg};
use crate::storage::Database;
use crate::storage::models::{ExportRecord, Session, Screenshot, WorkflowStep};

pub struct ExportEngine {
    db: Arc<Database>,
}

impl ExportEngine {
    pub fn new(db: Arc<Database>) -> Self {
        Self { db }
    }

    pub fn export_markdown(
        &self,
        session_id: &str,
        options: Option<ExportOptions>,
    ) -> Result<ExportRecord> {
        let options = options.unwrap_or_default().normalized();
        let session = self.require_session(session_id)?;
        let screenshots = self.db.list_screenshots(session_id)?;
        prepare_screenshots_for_export(&screenshots);
        let markdown = self.resolve_markdown(session_id, &session, &screenshots)?;
        let export_path = self.export_path(session_id, "md");
        let rewritten = if options.screenshots {
            rewrite_markdown_for_export(&markdown, &screenshots)
        } else {
            strip_screenshot_references(&markdown, &screenshots)
        };
        std::fs::write(&export_path, rewritten)?;
        self.persist_export(session_id, "markdown", export_path)
    }

    pub fn export_html(
        &self,
        session_id: &str,
        options: Option<ExportOptions>,
    ) -> Result<ExportRecord> {
        let session = self.require_session(session_id)?;
        let screenshots = self.db.list_screenshots(session_id)?;
        prepare_screenshots_for_export(&screenshots);
        let steps = self.load_steps(session_id)?;
        let html = render_styled_export_html(
            &session,
            &steps,
            &screenshots,
            &options.unwrap_or_default(),
            "html",
        );
        let path = self.export_path(session_id, "html");
        std::fs::write(&path, html)?;
        self.persist_export(session_id, "html", path)
    }

    pub fn export_pdf(
        &self,
        session_id: &str,
        options: Option<ExportOptions>,
    ) -> Result<ExportRecord> {
        let session = self.require_session(session_id)?;
        let screenshots = self.db.list_screenshots(session_id)?;
        prepare_screenshots_for_export(&screenshots);
        let steps = self.load_steps(session_id)?;
        let html = render_styled_export_html(
            &session,
            &steps,
            &screenshots,
            &options.unwrap_or_default(),
            "pdf",
        );
        let html_path = self.export_path(session_id, "html");
        std::fs::write(&html_path, html)?;
        let pdf_path = self.export_path(session_id, "pdf");
        try_print_pdf(html_path.to_string_lossy().as_ref(), &pdf_path).with_context(|| {
            format!(
                "PDF export failed for {}. Install Google Chrome, Chromium, or Microsoft Edge.",
                html_path.display()
            )
        })?;
        self.persist_export(session_id, "pdf", pdf_path)
    }

    pub fn export_video(&self, session_id: &str) -> Result<ExportRecord> {
        let session = self.require_session(session_id)?;
        let session_dir = self.db.session_dir(session_id);
        let mp4 = match ensure_session_mp4(
            &session_dir,
            session.video_path.as_deref(),
            session.duration,
        )? {
            Some(path) => path,
            None if resolve_ffmpeg().is_none() => {
                anyhow::bail!("Video encoding is unavailable. Rebuild the app to bundle ffmpeg.")
            }
            None => anyhow::bail!("No recorded video found for this session"),
        };
        let path = self.export_path(session_id, "mp4");
        std::fs::copy(&mp4, &path)?;
        self.persist_export(session_id, "video", path)
    }

    fn resolve_markdown(
        &self,
        session_id: &str,
        session: &Session,
        screenshots: &[Screenshot],
    ) -> Result<String> {
        if let Some(value) = &session.documentation_md {
            if !value.trim().is_empty() {
                return Ok(value.clone());
            }
        }
        self.fallback_markdown(session_id, session, screenshots)
    }

    fn require_session(&self, session_id: &str) -> Result<Session> {
        self.db
            .get_session(session_id)?
            .context("session not found")
    }

    fn load_steps(&self, session_id: &str) -> Result<Vec<WorkflowStep>> {
        let session = self.require_session(session_id)?;
        if let Some(steps_json) = session.steps_json {
            Ok(serde_json::from_str(&steps_json)?)
        } else {
            Ok(Vec::new())
        }
    }

    fn fallback_markdown(
        &self,
        session_id: &str,
        session: &Session,
        screenshots: &[Screenshot],
    ) -> Result<String> {
        let steps = self.load_steps(session_id)?;
        let (title, overview) = infer_workflow_summary(&session.title, &[], &steps);
        Ok(render_documentation_markdown(
            &title,
            &overview,
            &steps,
            screenshots,
        ))
    }

    fn export_path(&self, session_id: &str, extension: &str) -> PathBuf {
        self.db
            .session_dir(session_id)
            .join("exports")
            .join(format!("export_{}.{}", Uuid::new_v4(), extension))
    }

    fn persist_export(&self, session_id: &str, format: &str, path: PathBuf) -> Result<ExportRecord> {
        let export = ExportRecord {
            id: Uuid::new_v4().to_string(),
            session_id: session_id.to_string(),
            format: format.to_string(),
            path: path.to_string_lossy().to_string(),
            created_at: Utc::now().to_rfc3339(),
        };
        self.db.create_export(&export)?;
        self.db.update_session_status(
            session_id,
            crate::storage::models::SessionStatus::Exported,
        )?;
        Ok(export)
    }
}

fn rewrite_markdown_for_export(markdown: &str, screenshots: &[Screenshot]) -> String {
    crate::ai::documentation::normalize_screenshot_references(markdown, screenshots)
        .lines()
        .map(|line| {
            let mut output = line.to_string();
            for shot in screenshots {
                let inline = markdown_image_path(shot);
                let export_relative = export_markdown_image_path(shot);
                output = output.replace(&inline, &export_relative);
            }
            output
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn try_print_pdf(html_path: &str, pdf_path: &Path) -> Result<()> {
    let html_url = path_to_file_url(html_path)?;
    let pdf_arg = pdf_path.to_string_lossy().to_string();
    const PDF_TIMEOUT: Duration = Duration::from_secs(45);

    for chrome in chrome_binary_candidates() {
        let mut command = std::process::Command::new(&chrome);
        command.args([
            "--headless=new",
            "--disable-gpu",
            "--no-sandbox",
            "--disable-dev-shm-usage",
            "--disable-background-networking",
            "--disable-sync",
            "--no-pdf-header-footer",
            "--run-all-compositor-stages-before-draw",
            "--virtual-time-budget=5000",
            &format!("--print-to-pdf={pdf_arg}"),
            &html_url,
        ]);

        match run_command_with_timeout(command, PDF_TIMEOUT) {
            Ok(output) if output.status.success() && pdf_path.is_file() => return Ok(()),
            Ok(_) => continue,
            Err(err) => {
                eprintln!("FlowCapture: PDF render with {chrome} failed: {err}");
            }
        }
    }

    let mut wkhtml = std::process::Command::new("wkhtmltopdf");
    wkhtml
        .args([html_path, pdf_path.to_string_lossy().as_ref()])
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null());

    if matches!(
        run_command_with_timeout(wkhtml, PDF_TIMEOUT),
        Ok(output) if output.status.success() && pdf_path.is_file()
    ) {
        return Ok(());
    }

    anyhow::bail!(
        "Could not render PDF. Install Google Chrome, Chromium, Microsoft Edge, or wkhtmltopdf."
    )
}

fn run_command_with_timeout(
    mut command: std::process::Command,
    timeout: Duration,
) -> Result<std::process::Output> {
    use std::io::Read;
    use std::process::{Stdio, Output};
    use std::thread;
    use std::time::Instant;

    command.stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut child = command.spawn()?;
    let start = Instant::now();

    loop {
        if let Some(status) = child.try_wait()? {
            let mut stdout = Vec::new();
            let mut stderr = Vec::new();
            if let Some(mut pipe) = child.stdout.take() {
                let _ = pipe.read_to_end(&mut stdout);
            }
            if let Some(mut pipe) = child.stderr.take() {
                let _ = pipe.read_to_end(&mut stderr);
            }
            return Ok(Output {
                status,
                stdout,
                stderr,
            });
        }

        if start.elapsed() >= timeout {
            let _ = child.kill();
            let _ = child.wait();
            anyhow::bail!("command timed out after {} seconds", timeout.as_secs());
        }

        thread::sleep(Duration::from_millis(50));
    }
}

fn chrome_binary_candidates() -> Vec<String> {
    [
        // macOS
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
        "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
        "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
        // Windows
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe",
        // Linux / PATH
        "google-chrome",
        "chromium",
        "msedge",
        "chrome",
    ]
    .into_iter()
    .filter(|candidate| {
        if candidate.contains('/') || candidate.contains('\\') {
            Path::new(candidate).is_file()
        } else {
            true
        }
    })
    .map(str::to_string)
    .collect()
}

fn path_to_file_url(path: &str) -> Result<String> {
    let absolute = std::fs::canonicalize(path)
        .unwrap_or_else(|_| PathBuf::from(path))
        .to_string_lossy()
        .replace('\\', "/");
    Ok(format!("file://{}", absolute.replace(' ', "%20")))
}

#[allow(dead_code)]
fn render_html_from_markdown(
    session: &Session,
    markdown: &str,
    screenshots: &[Screenshot],
) -> String {
    let markdown_for_html = rewrite_markdown_for_html(markdown, screenshots);
    let mut body = String::new();
    let parser = Parser::new_ext(&markdown_for_html, Options::all());
    html::push_html(&mut body, parser);

    format!(
        r#"<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>{title}</title>
</head>
<body>{body}</body>
</html>"#,
        title = session.title,
        body = body,
    )
}

fn rewrite_markdown_for_html(markdown: &str, screenshots: &[Screenshot]) -> String {
    crate::ai::documentation::normalize_screenshot_references(markdown, screenshots)
        .lines()
        .map(|line| {
            let mut output = line.to_string();
            for shot in screenshots {
                let inline = markdown_image_path(shot);
                if let Ok(file_url) = path_to_file_url(&shot.path) {
                    output = output.replace(&inline, &file_url);
                }
            }
            output
        })
        .collect::<Vec<_>>()
        .join("\n")
}

pub fn prepare_screenshots_for_export(screenshots: &[Screenshot]) {
    for shot in screenshots {
        let path = PathBuf::from(&shot.path);
        if !path.is_file() {
            continue;
        }

        if let (Some(cx), Some(cy)) = (shot.click_x, shot.click_y) {
            let parent = path.parent().unwrap_or_else(|| Path::new(""));
            let stem = path.file_stem().unwrap_or_default().to_string_lossy();
            let ext = path.extension().unwrap_or_default().to_string_lossy();
            let clean_path = parent.join(format!("{stem}_clean.{ext}"));
            let clean_exists = clean_path.exists();
            if !clean_exists {
                let _ = std::fs::copy(&path, &clean_path);
            }

            let has_custom_annotations = shot.annotations_json.as_deref()
                .map(|s| s.contains("badge") || s.contains("rect") || s.contains("circle") || s.contains("highlight") || s.contains("text"))
                .unwrap_or(false);

            if !has_custom_annotations && !clean_exists {
                let _ = crate::screenshots::highlight_click_on_image(&path, cx, cy, None);
            }
        }
    }
}
