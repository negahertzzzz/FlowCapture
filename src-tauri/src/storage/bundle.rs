use std::collections::HashMap;
use std::fs::File;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

use crate::storage::models::{AiJob, ExportRecord, Screenshot, Session, StoredEvent};
use crate::storage::Database;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionBundleManifest {
    pub version: u32,
    pub exported_at: String,
    pub app_version: String,
    pub session: Session,
    pub events: Vec<StoredEvent>,
    pub screenshots: Vec<BundleScreenshotMeta>,
    pub ai_jobs: Vec<AiJob>,
    pub exports: Vec<ExportRecord>,
    pub audio_file_name: Option<String>,
    pub video_file_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BundleScreenshotMeta {
    pub id: String,
    pub timestamp_ms: i64,
    pub trigger: Option<String>,
    pub selected: i64,
    pub click_x: Option<i64>,
    pub click_y: Option<i64>,
    pub file_name: String,
}

pub fn export_session_bundle(
    db: &Database,
    session_id: &str,
    target_path: &Path,
) -> Result<PathBuf> {
    let session = db
        .get_session(session_id)?
        .context("Session not found for export")?;
    let events = db.list_events(session_id)?;
    let screenshots = db.list_screenshots(session_id)?;
    let ai_jobs = db.list_ai_jobs(session_id)?;
    let exports = db.list_exports(session_id)?;
    let session_dir = db.session_dir(session_id);

    if let Some(parent) = target_path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    let file = File::create(target_path)
        .with_context(|| format!("Failed to create export bundle at {}", target_path.display()))?;
    let mut zip = ZipWriter::new(file);
    let file_opts = SimpleFileOptions::default()
        .compression_method(CompressionMethod::Deflated);

    // 1. Pack screenshots
    let mut manifest_screenshots = Vec::new();
    for s in &screenshots {
        let original_path = Path::new(&s.path);
        let file_name = original_path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| format!("{}.jpg", s.id));

        let zip_entry_name = format!("screenshots/{file_name}");

        let maybe_bytes = if original_path.is_file() {
            std::fs::read(original_path).ok()
        } else {
            let candidate = session_dir.join("screenshots").join(&file_name);
            if candidate.is_file() {
                std::fs::read(candidate).ok()
            } else {
                None
            }
        };

        if let Some(bytes) = maybe_bytes {
            zip.start_file(&zip_entry_name, file_opts)?;
            zip.write_all(&bytes)?;
        }

        manifest_screenshots.push(BundleScreenshotMeta {
            id: s.id.clone(),
            timestamp_ms: s.timestamp_ms,
            trigger: s.trigger.clone(),
            selected: s.selected,
            click_x: s.click_x,
            click_y: s.click_y,
            file_name,
        });
    }

    // 2. Pack audio file if present
    let mut audio_file_name = None;
    if let Some(audio_path_str) = &session.audio_path {
        let audio_path = Path::new(audio_path_str);
        let name = audio_path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "audio.webm".to_string());

        let maybe_bytes = if audio_path.is_file() {
            std::fs::read(audio_path).ok()
        } else {
            let candidate = session_dir.join(&name);
            if candidate.is_file() {
                std::fs::read(candidate).ok()
            } else {
                None
            }
        };

        if let Some(bytes) = maybe_bytes {
            zip.start_file(format!("media/{name}"), file_opts)?;
            zip.write_all(&bytes)?;
            audio_file_name = Some(name);
        }
    }

    // 3. Pack video file if present
    let mut video_file_name = None;
    if let Some(video_path_str) = &session.video_path {
        let video_path = Path::new(video_path_str);
        let name = video_path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "recording.mp4".to_string());

        let maybe_bytes = if video_path.is_file() {
            std::fs::read(video_path).ok()
        } else {
            let candidate = session_dir.join(&name);
            if candidate.is_file() {
                std::fs::read(candidate).ok()
            } else {
                None
            }
        };

        if let Some(bytes) = maybe_bytes {
            zip.start_file(format!("media/{name}"), file_opts)?;
            zip.write_all(&bytes)?;
            video_file_name = Some(name);
        }
    }

    // 4. Pack exports directory files if present
    for export in &exports {
        let exp_path = Path::new(&export.path);
        if exp_path.is_file() {
            if let Some(fname) = exp_path.file_name().and_then(|f| f.to_str()) {
                if let Ok(bytes) = std::fs::read(exp_path) {
                    let zip_entry = format!("exports/{fname}");
                    let _ = zip.start_file(&zip_entry, file_opts);
                    let _ = zip.write_all(&bytes);
                }
            }
        }
    }

    // 5. Write manifest.json
    let manifest = SessionBundleManifest {
        version: 1,
        exported_at: Utc::now().to_rfc3339(),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        session,
        events,
        screenshots: manifest_screenshots,
        ai_jobs,
        exports,
        audio_file_name,
        video_file_name,
    };

    let manifest_json = serde_json::to_vec_pretty(&manifest)?;
    zip.start_file("manifest.json", file_opts)?;
    zip.write_all(&manifest_json)?;

    zip.finish()?;
    Ok(target_path.to_path_buf())
}

pub fn import_session_bundle(
    db: &Database,
    archive_path: &Path,
) -> Result<Session> {
    let file = File::open(archive_path)
        .with_context(|| format!("Failed to open import bundle at {}", archive_path.display()))?;
    let mut zip = ZipArchive::new(file)
        .with_context(|| "Failed to read zip archive")?;

    // 1. Read manifest.json
    let mut manifest_file = zip
        .by_name("manifest.json")
        .context("Missing manifest.json in archive: invalid or unsupported FlowCapture bundle")?;
    let mut manifest_str = String::new();
    manifest_file.read_to_string(&mut manifest_str)?;
    drop(manifest_file);

    let manifest: SessionBundleManifest = serde_json::from_str(&manifest_str)
        .context("Failed to parse bundle manifest.json")?;

    // 2. Check collision with existing sessions
    let (target_session_id, is_remapped) = match db.get_session(&manifest.session.id)? {
        Some(_) => (Uuid::new_v4().to_string(), true),
        None => (manifest.session.id.clone(), false),
    };

    let target_session_dir = db.session_dir(&target_session_id);
    let target_screenshots_dir = target_session_dir.join("screenshots");
    let target_exports_dir = target_session_dir.join("exports");
    std::fs::create_dir_all(&target_screenshots_dir)?;
    std::fs::create_dir_all(&target_exports_dir)?;

    // 3. Extract all files from zip into target session directory
    for i in 0..zip.len() {
        let mut entry = zip.by_index(i)?;
        let entry_name = entry.name().to_string();

        if entry.is_dir() {
            continue;
        }

        if entry_name.starts_with("screenshots/") {
            let file_name = entry_name.trim_start_matches("screenshots/");
            if !file_name.is_empty() {
                let out_path = target_screenshots_dir.join(file_name);
                let mut out_file = File::create(&out_path)?;
                std::io::copy(&mut entry, &mut out_file)?;
            }
        } else if entry_name.starts_with("media/") {
            let file_name = entry_name.trim_start_matches("media/");
            if !file_name.is_empty() {
                let out_path = target_session_dir.join(file_name);
                let mut out_file = File::create(&out_path)?;
                std::io::copy(&mut entry, &mut out_file)?;
            }
        } else if entry_name.starts_with("exports/") {
            let file_name = entry_name.trim_start_matches("exports/");
            if !file_name.is_empty() {
                let out_path = target_exports_dir.join(file_name);
                let mut out_file = File::create(&out_path)?;
                std::io::copy(&mut entry, &mut out_file)?;
            }
        }
    }

    // 4. Map screenshot IDs and local paths
    let mut screenshot_id_map: HashMap<String, String> = HashMap::new();
    let mut restored_screenshots = Vec::new();

    for meta in &manifest.screenshots {
        let new_id = if is_remapped {
            let gen = Uuid::new_v4().to_string();
            screenshot_id_map.insert(meta.id.clone(), gen.clone());
            gen
        } else {
            meta.id.clone()
        };

        let local_path = target_screenshots_dir
            .join(&meta.file_name)
            .to_string_lossy()
            .to_string();

        restored_screenshots.push(Screenshot {
            id: new_id,
            session_id: target_session_id.clone(),
            path: local_path,
            timestamp_ms: meta.timestamp_ms,
            trigger: meta.trigger.clone(),
            selected: meta.selected,
            click_x: meta.click_x,
            click_y: meta.click_y,
        });
    }

    // 5. Prepare restored session record
    let mut session = manifest.session;
    let old_session_id = session.id.clone();
    session.id = target_session_id.clone();

    // Fix audio & video path to point to local extracted files
    if let Some(audio_name) = &manifest.audio_file_name {
        let local_audio = target_session_dir.join(audio_name);
        if local_audio.is_file() {
            session.audio_path = Some(local_audio.to_string_lossy().to_string());
        }
    } else {
        session.audio_path = None;
    }

    if let Some(video_name) = &manifest.video_file_name {
        let local_video = target_session_dir.join(video_name);
        if local_video.is_file() {
            session.video_path = Some(local_video.to_string_lossy().to_string());
        }
    } else {
        session.video_path = None;
    }

    // If remapped, update IDs in documentation_md, steps_json, compressed_events_json
    if is_remapped {
        if let Some(ref mut steps_str) = session.steps_json {
            for (old_id, new_id) in &screenshot_id_map {
                *steps_str = steps_str.replace(old_id, new_id);
            }
        }
    }

    // Normalize markdown image references for local platform
    if let Some(ref mut md) = session.documentation_md {
        if is_remapped {
            for (old_id, new_id) in &screenshot_id_map {
                *md = md.replace(old_id, new_id);
            }
            *md = md.replace(&old_session_id, &target_session_id);
        }
        *md = crate::ai::documentation::normalize_screenshot_references(md, &restored_screenshots);
    }

    // 6. Remap events
    let mut restored_events = manifest.events;
    for event in &mut restored_events {
        if is_remapped {
            event.id = Uuid::new_v4().to_string();
        }
        event.session_id = target_session_id.clone();
    }

    // 7. Remap AI jobs
    let mut restored_ai_jobs = manifest.ai_jobs;
    for job in &mut restored_ai_jobs {
        if is_remapped {
            job.id = Uuid::new_v4().to_string();
        }
        job.session_id = target_session_id.clone();
    }

    // 8. Remap exports
    let mut restored_exports = manifest.exports;
    for export in &mut restored_exports {
        if is_remapped {
            export.id = Uuid::new_v4().to_string();
        }
        export.session_id = target_session_id.clone();
        let exp_filename = Path::new(&export.path)
            .file_name()
            .map(|f| f.to_string_lossy().to_string())
            .unwrap_or_default();
        export.path = target_exports_dir
            .join(exp_filename)
            .to_string_lossy()
            .to_string();
    }

    // 9. Insert into database
    db.insert_imported_session(
        &session,
        &restored_events,
        &restored_screenshots,
        &restored_ai_jobs,
        &restored_exports,
    )?;

    // 10. Return imported session
    db.get_session(&target_session_id)?
        .context("Failed to reload newly imported session")
}
