pub(crate) mod styled_html;

use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use anyhow::{Context, Result};
use chrono::Utc;
use uuid::Uuid;

pub use styled_html::{ExportOptions, render_styled_export_html};
use crate::ai::documentation::{
    infer_workflow_summary, markdown_image_path, render_documentation_markdown,
    strip_screenshot_references,
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
        let export_path = self.export_path(session_id, &session, "md");
        let rewritten = if options.screenshots {
            // Images are copied next to the file (exports/screenshots/) so the .md and its
            // "screenshots" folder can be moved together.
            let normalized = crate::ai::documentation::normalize_screenshot_references(&markdown, &screenshots);
            let images_dir = export_path.parent().map(|p| p.join("screenshots")).context("invalid export path")?;
            copy_referenced_screenshots(&normalized, &screenshots, &images_dir)?;
            normalized
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
        let path = self.export_path(session_id, &session, "html");
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
        let pdf_path = self.export_path(session_id, &session, "pdf");
        // Intermediate page for the headless browser: not an export, removed afterwards.
        let html_path = pdf_path.with_extension("print.html");
        std::fs::write(&html_path, html)?;
        let printed = try_print_pdf(html_path.to_string_lossy().as_ref(), &pdf_path);
        let _ = std::fs::remove_file(&html_path);
        printed.context("PDF export failed. Install Google Chrome, Chromium, or Microsoft Edge.")?;
        self.persist_export(session_id, "pdf", pdf_path)
    }

    pub fn export_video(&self, session_id: &str) -> Result<ExportRecord> {
        let session = self.require_session(session_id)?;
        let session_dir = self.db.session_dir(session_id);
        // Prefer the full-resolution recording; the slideshow is a low-fps fallback.
        let full_video = session
            .full_video_path
            .as_deref()
            .map(std::path::PathBuf::from)
            .filter(|p| p.is_file() && p.extension().is_some_and(|e| e == "mp4"));
        let mp4 = match full_video {
            Some(path) => path,
            None => match ensure_session_mp4(
            &session_dir,
            session.video_path.as_deref(),
            session.duration,
        )? {
            Some(path) => path,
            None if resolve_ffmpeg().is_none() => {
                anyhow::bail!("Video encoding is unavailable. Rebuild the app to bundle ffmpeg.")
            }
            None => anyhow::bail!("No recorded video found for this session"),
            },
        };
        let path = self.export_path(session_id, &session, "mp4");
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
        let (title, overview) = infer_workflow_summary(&session.title, &[], &steps, None);
        Ok(render_documentation_markdown(
            crate::ai::prompts::DocLanguage::from_db(&self.db),
            &title,
            &overview,
            &steps,
            screenshots,
        ))
    }

    /// Readable, unique file name: "<session title>_<date-time>.<ext>".
    fn export_path(&self, session_id: &str, session: &Session, extension: &str) -> PathBuf {
        let dir = self.db.session_dir(session_id).join("exports");
        let _ = std::fs::create_dir_all(&dir);
        let base = format!(
            "{}_{}",
            file_name_slug(&session.title),
            chrono::Local::now().format("%Y-%m-%d_%H-%M-%S")
        );
        let mut candidate = dir.join(format!("{base}.{extension}"));
        let mut counter = 2;
        while candidate.exists() {
            candidate = dir.join(format!("{base}_{counter}.{extension}"));
            counter += 1;
        }
        candidate
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

/// Session title -> safe file name (keeps letters incl. accents, digits, '-' and '_').
fn file_name_slug(title: &str) -> String {
    let slug: String = title
        .trim()
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .collect();
    let slug = slug
        .split('_')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("_");
    let slug: String = slug.chars().take(60).collect();
    if slug.is_empty() {
        "FlowCapture".to_string()
    } else {
        slug
    }
}

/// Copies the screenshots referenced by the guide into `images_dir`, preferring the
/// annotated / click-highlighted variant, under the name the Markdown already uses.
fn copy_referenced_screenshots(markdown: &str, screenshots: &[Screenshot], images_dir: &Path) -> Result<()> {
    std::fs::create_dir_all(images_dir)?;
    for shot in screenshots {
        let reference = markdown_image_path(shot);
        if !markdown.contains(&reference) {
            continue;
        }
        let Some(name) = Path::new(&reference).file_name() else {
            continue;
        };
        let original = Path::new(&shot.path);
        let annotated = original.with_file_name(format!(
            "{}_annotated.{}",
            original.file_stem().unwrap_or_default().to_string_lossy(),
            original.extension().unwrap_or_default().to_string_lossy()
        ));
        let source = if annotated.is_file() { annotated } else { original.to_path_buf() };
        if source.is_file() {
            std::fs::copy(&source, images_dir.join(name))
                .with_context(|| format!("copying {}", source.display()))?;
        }
    }
    Ok(())
}

const PDF_TIMEOUT: Duration = Duration::from_secs(120);

fn try_print_pdf(html_path: &str, pdf_path: &Path) -> Result<()> {
    let html_url = path_to_file_url(html_path)?;
    let pdf_arg = pdf_path.to_string_lossy().to_string();
    let mut failures: Vec<String> = Vec::new();

    let candidates = chrome_binary_candidates();
    for chrome in &candidates {
        // `--headless=new` needs Chromium/Edge >= 112; older builds only know `--headless`.
        for headless_flag in ["--headless=new", "--headless"] {
            let _ = std::fs::remove_file(pdf_path);
            // A throw-away profile keeps headless Edge/Chrome from handing the job off to an
            // already running browser (Edge "startup boost" does this on Windows and the
            // process then exits without ever writing the PDF).
            let profile_dir = std::env::temp_dir().join(format!("flowcapture-pdf-{}", Uuid::new_v4()));
            let mut command = crate::process_util::background_command(chrome);
            command.args([
                headless_flag,
                "--disable-gpu",
                "--no-sandbox",
                "--disable-dev-shm-usage",
                "--disable-background-networking",
                "--disable-extensions",
                "--disable-sync",
                "--disable-features=msEdgeStartupBoost,Translate",
                "--no-first-run",
                "--no-default-browser-check",
                "--allow-file-access-from-files",
                "--no-pdf-header-footer",
                "--print-to-pdf-no-header",
                "--run-all-compositor-stages-before-draw",
                "--virtual-time-budget=10000",
                &format!("--user-data-dir={}", profile_dir.display()),
                &format!("--print-to-pdf={pdf_arg}"),
                &html_url,
            ]);

            let result = run_command_with_timeout(command, PDF_TIMEOUT);
            let _ = std::fs::remove_dir_all(&profile_dir);
            match result {
                Ok(_) if is_valid_pdf(pdf_path) => return Ok(()),
                Ok(status) => failures.push(format!("{chrome} {headless_flag}: exited with {status}")),
                Err(err) => failures.push(format!("{chrome} {headless_flag}: {err}")),
            }
        }
    }

    let mut wkhtml = crate::process_util::background_command("wkhtmltopdf");
    wkhtml.args([
        "--enable-local-file-access",
        "--print-media-type",
        html_path,
        pdf_path.to_string_lossy().as_ref(),
    ]);
    match run_command_with_timeout(wkhtml, PDF_TIMEOUT) {
        Ok(_) if is_valid_pdf(pdf_path) => return Ok(()),
        Ok(status) => failures.push(format!("wkhtmltopdf: exited with {status}")),
        Err(err) => failures.push(format!("wkhtmltopdf: {err}")),
    }

    for failure in &failures {
        eprintln!("FlowCapture: PDF render attempt failed: {failure}");
    }
    if candidates.is_empty() {
        anyhow::bail!(
            "Could not render PDF: no Chromium-based browser found. Install Microsoft Edge, Google Chrome, Chromium, or wkhtmltopdf."
        )
    }
    anyhow::bail!("Could not render PDF. Attempts: {}", failures.join("; "))
}

fn is_valid_pdf(path: &Path) -> bool {
    use std::io::Read;
    let Ok(mut file) = std::fs::File::open(path) else {
        return false;
    };
    let mut header = [0u8; 5];
    file.read_exact(&mut header).is_ok() && &header == b"%PDF-"
}

/// Runs a command with stdout/stderr discarded (Chromium logs heavily; piping without
/// draining can fill the pipe buffer and hang the child until the timeout). Callers build it
/// with `background_command`, so no console window flashes on Windows.
fn run_command_with_timeout(
    mut command: std::process::Command,
    timeout: Duration,
) -> Result<std::process::ExitStatus> {
    use std::process::Stdio;
    use std::thread;
    use std::time::Instant;

    command
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    let mut child = command.spawn()?;
    let start = Instant::now();

    loop {
        if let Some(status) = child.try_wait()? {
            return Ok(status);
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
    let mut candidates: Vec<String> = Vec::new();

    #[cfg(target_os = "windows")]
    {
        // Edge ships with every Windows 10/11 install, so try it first. Per-user installs
        // of Chrome/Edge live under %LOCALAPPDATA%, system-wide ones under Program Files.
        let roots: Vec<String> = ["ProgramFiles(x86)", "ProgramFiles", "ProgramW6432", "LOCALAPPDATA"]
            .iter()
            .filter_map(|var| std::env::var(var).ok())
            .collect();
        for rel in [
            r"Microsoft\Edge\Application\msedge.exe",
            r"Google\Chrome\Application\chrome.exe",
            r"Chromium\Application\chrome.exe",
            r"BraveSoftware\Brave-Browser\Application\brave.exe",
        ] {
            for root in &roots {
                candidates.push(format!(r"{root}\{rel}"));
            }
        }
        candidates.extend(
            [
                r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
                r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
                r"C:\Program Files\Google\Chrome\Application\chrome.exe",
                r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
            ]
            .map(str::to_string),
        );
    }

    #[cfg(target_os = "macos")]
    candidates.extend(
        [
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Chromium.app/Contents/MacOS/Chromium",
            "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
            "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
        ]
        .map(str::to_string),
    );

    #[cfg(target_os = "linux")]
    candidates.extend(
        [
            "google-chrome",
            "google-chrome-stable",
            "chromium",
            "chromium-browser",
            "microsoft-edge",
            "microsoft-edge-stable",
            "brave-browser",
        ]
        .map(str::to_string),
    );

    let mut seen = std::collections::HashSet::new();
    candidates
        .into_iter()
        .filter(|candidate| seen.insert(candidate.to_lowercase()))
        .filter(|candidate| {
            if candidate.contains('/') || candidate.contains('\\') {
                Path::new(candidate).is_file()
            } else {
                binary_on_path(candidate)
            }
        })
        .collect()
}

fn binary_on_path(name: &str) -> bool {
    std::env::var_os("PATH")
        .map(|paths| std::env::split_paths(&paths).any(|dir| dir.join(name).is_file()))
        .unwrap_or(false)
}

/// Builds a `file:///` URL that Chromium accepts on every platform. On Windows
/// `canonicalize` returns verbatim paths (`\\?\C:\...`) which must be stripped, and
/// drive paths need a third slash (`file:///C:/...`). Anything outside the unreserved
/// set (spaces, `#`, `%`, non-ASCII user names...) is percent-encoded.
fn path_to_file_url(path: &str) -> Result<String> {
    let absolute = std::fs::canonicalize(path).unwrap_or_else(|_| PathBuf::from(path));
    Ok(file_url_from_path_string(&absolute.to_string_lossy()))
}

fn file_url_from_path_string(raw: &str) -> String {
    let mut normalized = raw.replace('\\', "/");
    if let Some(rest) = normalized.strip_prefix("//?/UNC/") {
        normalized = format!("//{rest}");
    } else if let Some(rest) = normalized.strip_prefix("//?/") {
        normalized = rest.to_string();
    }

    let mut encoded = String::with_capacity(normalized.len());
    for byte in normalized.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' | b'/' | b':' => {
                encoded.push(byte as char)
            }
            _ => encoded.push_str(&format!("%{byte:02X}")),
        }
    }

    if encoded.starts_with("//") {
        // UNC share: file://server/share/...
        format!("file:{encoded}")
    } else if encoded.starts_with('/') {
        format!("file://{encoded}")
    } else {
        format!("file:///{encoded}")
    }
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

#[cfg(test)]
mod tests {
    use super::{file_url_from_path_string, render_styled_export_html, try_print_pdf, ExportOptions};
    use crate::storage::models::{Screenshot, Session, WorkflowStep};

    /// End-to-end check of the PDF path with a real Chromium. Run with
    /// `cargo test -- --ignored pdf_renders` once a Chromium/Edge binary is on PATH.
    #[test]
    #[ignore]
    fn pdf_renders_with_local_chromium() {
        let dir = std::env::temp_dir().join(format!("flowcapture pdf tëst {}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(dir.join("screenshots")).unwrap();
        let shot_path = dir.join("screenshots").join("shot.png");
        image::RgbaImage::from_pixel(1600, 900, image::Rgba([40, 120, 200, 255]))
            .save(&shot_path)
            .unwrap();
        let screenshot = Screenshot {
            id: "s1".into(),
            session_id: "sess".into(),
            path: shot_path.to_string_lossy().to_string(),
            timestamp_ms: 1_700_000_005_000,
            trigger: Some("mouse_click".into()),
            selected: 1,
            click_x: Some(10),
            click_y: Some(10),
            annotations_json: None,
        };
        let mut md = String::from("# Guida di prova\n\nPanoramica.\n\n## Steps\n\n");
        for n in 1..=12 {
            md.push_str(&format!(
                "### Step {n}: Passo numero {n}\nDescrizione lunga del passo {n} con **grassetto** e testo àèìòù.\n\n![shot](screenshots/shot.png)\n\n"
            ));
        }
        let session = Session {
            id: "sess".into(),
            title: "Prova".into(),
            status: "ready".into(),
            started_at: "2023-11-14T22:13:20Z".into(),
            ended_at: None,
            video_path: None,
            duration: 95,
            documentation_md: Some(md),
            steps_json: None,
            compressed_events_json: None,
            audio_path: None,
            audio_transcript: None,
            full_video_path: None,
            preview_screenshot_path: None,
            audio_segments_json: None,
        };
        let steps: Vec<WorkflowStep> = Vec::new();
        let options = ExportOptions { page_size: "a4".into(), screenshots: true, cover: true, ..Default::default() };
        let html = render_styled_export_html(&session, &steps, &[screenshot], &options, "pdf");
        assert!(html.contains("@page { size: A4"));
        assert!(!html.contains("fonts.googleapis.com"));
        let html_path = dir.join("export.html");
        std::fs::write(&html_path, html).unwrap();
        let pdf_path = dir.join("export.pdf");
        try_print_pdf(html_path.to_str().unwrap(), &pdf_path).expect("pdf render");
        let bytes = std::fs::read(&pdf_path).unwrap();
        assert!(bytes.starts_with(b"%PDF-"));
        println!("PDF written to {} ({} bytes)", pdf_path.display(), bytes.len());
    }

    #[test]
    fn windows_verbatim_drive_path_becomes_triple_slash_url() {
        assert_eq!(
            file_url_from_path_string(r"\\?\C:\Users\Nicolò Rossi\AppData\export #1.html"),
            "file:///C:/Users/Nicol%C3%B2%20Rossi/AppData/export%20%231.html"
        );
    }

    #[test]
    fn plain_windows_drive_path() {
        assert_eq!(
            file_url_from_path_string(r"C:\data\a.html"),
            "file:///C:/data/a.html"
        );
    }

    #[test]
    fn windows_unc_paths() {
        assert_eq!(
            file_url_from_path_string(r"\\?\UNC\server\share\a b.html"),
            "file://server/share/a%20b.html"
        );
    }

    #[test]
    fn unix_path() {
        assert_eq!(
            file_url_from_path_string("/home/me/My Docs/a.html"),
            "file:///home/me/My%20Docs/a.html"
        );
    }

    use super::file_name_slug;

    #[test]
    fn slugs_are_safe_file_names() {
        assert_eq!(file_name_slug("Come creare un ordine: guida/2"), "Come_creare_un_ordine_guida_2");
        assert_eq!(file_name_slug("Perché? Più file"), "Perché_Più_file");
        assert_eq!(file_name_slug("  "), "FlowCapture");
        assert_eq!(file_name_slug(r"..\evil"), "evil");
    }
}
