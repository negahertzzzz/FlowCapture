use std::collections::{HashMap, HashSet};
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
    /// Full-resolution screen recording (`video/recording_hd.mp4`). Added in bundle version 2.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub full_video_file_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub audio_segments: Option<Vec<crate::ai::transcription::AudioSegment>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub aligned_events: Option<Vec<serde_json::Value>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BundleScreenshotMeta {
    pub id: String,
    pub timestamp_ms: i64,
    pub trigger: Option<String>,
    pub selected: i64,
    pub click_x: Option<i64>,
    pub click_y: Option<i64>,
    pub annotations_json: Option<String>,
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
    let mut written: HashSet<String> = HashSet::new();

    // 1. Screenshots, with their derived variants (clean copy, annotated / click-highlighted copy)
    let mut manifest_screenshots = Vec::new();
    for s in &screenshots {
        let original_path = Path::new(&s.path);
        let file_name = original_path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| format!("{}.png", s.id));

        let source = if original_path.is_file() {
            Some(original_path.to_path_buf())
        } else {
            Some(session_dir.join("screenshots").join(&file_name)).filter(|p| p.is_file())
        };

        if let Some(source) = source {
            for candidate in std::iter::once(source.clone()).chain(screenshot_variants(&source)) {
                if let Some(name) = candidate.file_name().and_then(|n| n.to_str()) {
                    add_file(&mut zip, &mut written, &format!("screenshots/{name}"), &candidate)?;
                }
            }
        }

        manifest_screenshots.push(BundleScreenshotMeta {
            id: s.id.clone(),
            timestamp_ms: s.timestamp_ms,
            trigger: s.trigger.clone(),
            selected: s.selected,
            click_x: s.click_x,
            click_y: s.click_y,
            annotations_json: s.annotations_json.clone(),
            file_name,
        });
    }

    // 2. Media: microphone audio, slideshow video and full HD video
    let pack_media = |zip: &mut ZipWriter<File>, written: &mut HashSet<String>, stored: Option<&String>| -> Result<Option<String>> {
        let Some(stored) = stored else {
            return Ok(None);
        };
        let path = Path::new(stored);
        let Some(name) = path.file_name().map(|n| n.to_string_lossy().to_string()) else {
            return Ok(None);
        };
        let source = [path.to_path_buf(), session_dir.join(&name), session_dir.join("video").join(&name), session_dir.join("audio").join(&name)]
            .into_iter()
            .find(|p| p.is_file());
        match source {
            Some(source) => {
                add_file(zip, written, &format!("media/{name}"), &source)?;
                Ok(Some(name))
            }
            None => Ok(None),
        }
    };
    let audio_file_name = pack_media(&mut zip, &mut written, session.audio_path.as_ref())?;
    let video_file_name = pack_media(&mut zip, &mut written, session.video_path.as_ref())?;
    let full_video_file_name = pack_media(&mut zip, &mut written, session.full_video_path.as_ref())?;

    // 3. Exported documents, including the images folder the HTML / Markdown exports reference
    let exports_dir = session_dir.join("exports");
    if exports_dir.is_dir() {
        for path in walk_files(&exports_dir)? {
            if let Ok(relative) = path.strip_prefix(&exports_dir) {
                let entry = relative.to_string_lossy().replace('\\', "/");
                add_file(&mut zip, &mut written, &format!("exports/{entry}"), &path)?;
            }
        }
    }
    for export in &exports {
        let exp_path = Path::new(&export.path);
        if let Some(fname) = exp_path.file_name().and_then(|f| f.to_str()) {
            if exp_path.is_file() {
                add_file(&mut zip, &mut written, &format!("exports/{fname}"), exp_path)?;
            }
        }
    }

    // 5. Compute aligned events with nearby_audio if audio_segments are present
    let (audio_segments, aligned_events) = if let Some(segs_json) = &session.audio_segments_json {
        if let Ok(segs) = serde_json::from_str::<Vec<crate::ai::transcription::AudioSegment>>(segs_json) {
            if !segs.is_empty() {
                const PRE_MS: i64 = 3000;
                const POST_MS: i64 = 2000;

                let first_event_ts = events.first().map(|e| e.timestamp_ms).unwrap_or(0);
                let is_epoch = first_event_ts > 1_000_000_000_000;
                let parsed_start = chrono::DateTime::parse_from_rfc3339(&session.started_at)
                    .map(|dt| dt.timestamp_millis())
                    .ok();
                let t0 = if is_epoch {
                    if let Some(start_ms) = parsed_start.filter(|&s| s > 0 && (s - first_event_ts).abs() < 120_000) {
                        start_ms.min(first_event_ts)
                    } else {
                        first_event_ts
                    }
                } else {
                    0
                };

                let aligned = events
                    .iter()
                    .map(|ev| {
                        let event_offset_ms = if is_epoch {
                            ev.timestamp_ms.saturating_sub(t0)
                        } else {
                            ev.timestamp_ms
                        };
                        let w_start = event_offset_ms.saturating_sub(PRE_MS);
                        let w_end = event_offset_ms + POST_MS;
                        let nearby: Vec<&str> = segs
                            .iter()
                            .filter(|s| s.start_ms <= w_end && s.end_ms >= w_start)
                            .map(|s| s.text.as_str())
                            .collect();
                        let payload_val: serde_json::Value =
                            serde_json::from_str(&ev.payload).unwrap_or(serde_json::json!({}));
                        serde_json::json!({
                            "id": ev.id,
                            "event_type": ev.event_type,
                            "app_name": ev.app_name,
                            "payload": payload_val,
                            "timestamp_ms": ev.timestamp_ms,
                            "nearby_audio": nearby,
                        })
                    })
                    .collect::<Vec<_>>();
                (Some(segs), Some(aligned))
            } else {
                (None, None)
            }
        } else {
            (None, None)
        }
    } else {
        (None, None)
    };

    let manifest = SessionBundleManifest {
        version: 2,
        exported_at: Utc::now().to_rfc3339(),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        session,
        events,
        screenshots: manifest_screenshots,
        ai_jobs,
        exports,
        audio_file_name,
        video_file_name,
        full_video_file_name,
        audio_segments,
        aligned_events,
    };

    let manifest_json = serde_json::to_vec_pretty(&manifest)?;
    zip.start_file(
        "manifest.json",
        SimpleFileOptions::default().compression_method(CompressionMethod::Deflated),
    )?;
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

    // 2. Check collision with existing sessions. The id becomes a directory name, so anything
    //    that is not a plain UUID (e.g. "../../x") is replaced with a fresh one.
    let id_is_safe = Uuid::parse_str(&manifest.session.id).is_ok();
    let (target_session_id, is_remapped) = if !id_is_safe {
        (Uuid::new_v4().to_string(), true)
    } else {
        match db.get_session(&manifest.session.id)? {
            Some(_) => (Uuid::new_v4().to_string(), true),
            None => (manifest.session.id.clone(), false),
        }
    };

    let target_session_dir = db.session_dir(&target_session_id);
    let target_screenshots_dir = target_session_dir.join("screenshots");
    let target_exports_dir = target_session_dir.join("exports");
    std::fs::create_dir_all(&target_screenshots_dir)?;
    std::fs::create_dir_all(&target_exports_dir)?;

    // 3. Extract all files from zip into target session directory.
    //    Entry names come from an untrusted archive: only plain file names directly under the
    //    known folders are accepted, so "screenshots/../../evil.exe" cannot escape the session dir.
    for i in 0..zip.len() {
        let mut entry = zip.by_index(i)?;
        let entry_name = entry.name().to_string();

        if entry.is_dir() {
            continue;
        }

        let target_dir = if let Some(rest) = entry_name.strip_prefix("screenshots/") {
            safe_file_name(rest).map(|name| target_screenshots_dir.join(name))
        } else if let Some(rest) = entry_name.strip_prefix("media/") {
            safe_file_name(rest).map(|name| target_session_dir.join(name))
        } else if let Some(rest) = entry_name.strip_prefix("exports/") {
            safe_relative_path(rest).map(|relative| target_exports_dir.join(relative))
        } else {
            None
        };

        let Some(out_path) = target_dir else {
            if !entry_name.eq_ignore_ascii_case("manifest.json") {
                crate::logger::info("bundle", &format!("Skipping unsafe or unknown archive entry: {entry_name}"));
            }
            continue;
        };

        if let Some(parent) = out_path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let mut out_file = File::create(&out_path)?;
        std::io::copy(&mut entry, &mut out_file)?;
    }

    // 4. Map screenshot IDs and local paths
    let mut screenshot_id_map: HashMap<String, String> = HashMap::new();
    let mut restored_screenshots = Vec::new();

    for meta in &manifest.screenshots {
        let Some(file_name) = safe_file_name(&meta.file_name) else {
            continue;
        };
        let new_id = if is_remapped {
            let gen = Uuid::new_v4().to_string();
            screenshot_id_map.insert(meta.id.clone(), gen.clone());
            gen
        } else {
            meta.id.clone()
        };

        let local_path = target_screenshots_dir
            .join(file_name)
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
            annotations_json: meta.annotations_json.clone(),
        });
    }

    // 5. Prepare restored session record
    let mut session = manifest.session;
    let old_session_id = session.id.clone();
    session.id = target_session_id.clone();

    // Fix audio & video path to point to local extracted files
    session.audio_path = manifest
        .audio_file_name
        .as_deref()
        .and_then(safe_file_name)
        .map(|name| target_session_dir.join(name))
        .filter(|path| path.is_file())
        .map(|path| path.to_string_lossy().to_string());

    session.video_path = manifest
        .video_file_name
        .as_deref()
        .and_then(safe_file_name)
        .map(|name| target_session_dir.join(name))
        .filter(|path| path.is_file())
        .map(|path| path.to_string_lossy().to_string());

    // Never keep a path that points outside this session.
    let full_video_name = manifest.full_video_file_name.clone().or_else(|| {
        session
            .full_video_path
            .as_deref()
            .and_then(|p| Path::new(p).file_name())
            .and_then(|name| name.to_str())
            .map(str::to_string)
    });
    session.full_video_path = full_video_name
        .as_deref()
        .and_then(safe_file_name)
        .map(|name| target_session_dir.join(name))
        .filter(|path| path.is_file())
        .map(|path| path.to_string_lossy().to_string());

    if session.audio_segments_json.is_none() {
        if let Some(segs) = &manifest.audio_segments {
            if let Ok(json_str) = serde_json::to_string(segs) {
                session.audio_segments_json = Some(json_str);
            }
        }
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

/// Streams a file into the archive. Already-compressed media (images, video, audio) is stored
/// as-is: deflating it again costs time and saves almost nothing. Each entry is written once.
fn add_file(
    zip: &mut ZipWriter<File>,
    written: &mut HashSet<String>,
    entry_name: &str,
    source: &Path,
) -> Result<()> {
    if !written.insert(entry_name.to_string()) {
        return Ok(());
    }
    let ext = source
        .extension()
        .and_then(|e| e.to_str())
        .map(str::to_ascii_lowercase)
        .unwrap_or_default();
    let method = if matches!(
        ext.as_str(),
        "png" | "jpg" | "jpeg" | "webp" | "mp4" | "webm" | "m4a" | "mp3" | "ogg" | "zip" | "pdf"
    ) {
        CompressionMethod::Stored
    } else {
        CompressionMethod::Deflated
    };
    let options = SimpleFileOptions::default()
        .compression_method(method)
        .large_file(source.metadata().map(|m| m.len() >= u32::MAX as u64).unwrap_or(false));
    let mut input = File::open(source)
        .with_context(|| format!("Cannot read {} for the bundle", source.display()))?;
    zip.start_file(entry_name, options)?;
    std::io::copy(&mut input, zip)?;
    Ok(())
}

/// `shot.png` -> existing `shot_clean.png` / `shot_annotated.png` next to it.
fn screenshot_variants(path: &Path) -> Vec<PathBuf> {
    let (Some(stem), Some(ext), Some(parent)) = (
        path.file_stem().and_then(|s| s.to_str()),
        path.extension().and_then(|e| e.to_str()),
        path.parent(),
    ) else {
        return Vec::new();
    };
    ["clean", "annotated"]
        .iter()
        .map(|suffix| parent.join(format!("{stem}_{suffix}.{ext}")))
        .filter(|p| p.is_file())
        .collect()
}

fn walk_files(root: &Path) -> Result<Vec<PathBuf>> {
    let mut files = Vec::new();
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        for entry in std::fs::read_dir(&dir)? {
            let path = entry?.path();
            if path.is_dir() {
                stack.push(path);
            } else {
                files.push(path);
            }
        }
    }
    files.sort();
    Ok(files)
}

/// Like `safe_file_name`, but allows sub-folders ("screenshots/shot.png"): every component
/// must be a plain name.
fn safe_relative_path(path: &str) -> Option<PathBuf> {
    let mut result = PathBuf::new();
    for component in path.split('/') {
        result.push(safe_file_name(component)?);
    }
    Some(result).filter(|p| p.components().count() > 0)
}

/// Returns `name` only if it is a single, plain file name (no directories, no `..`,
/// no drive prefixes or absolute paths). Used to sanitize names read from imported bundles.
fn safe_file_name(name: &str) -> Option<&str> {
    let name = name.trim();
    if name.is_empty()
        || name == "."
        || name == ".."
        || name.contains(['/', '\\', ':', '\0'])
    {
        return None;
    }
    let path = Path::new(name);
    if path.file_name().and_then(|f| f.to_str()) != Some(name) {
        return None;
    }
    Some(name)
}

#[cfg(test)]
mod tests {
    use super::{export_session_bundle, import_session_bundle, safe_file_name, safe_relative_path};
    use crate::storage::models::Screenshot;
    use crate::storage::Database;

    #[test]
    fn bundle_round_trip_keeps_all_session_files() {
        let root = std::env::temp_dir().join(format!("flowcapture-bundle-{}", uuid::Uuid::new_v4()));
        let db = Database::new(root.join("data")).unwrap();
        let session = db.create_session(Some("Test".into())).unwrap();
        let dir = db.session_dir(&session.id);

        let write = |rel: &str| {
            let path = dir.join(rel);
            std::fs::create_dir_all(path.parent().unwrap()).unwrap();
            std::fs::write(&path, rel.as_bytes()).unwrap();
            path
        };
        let shot = write("screenshots/s1.png");
        write("screenshots/s1_annotated.png");
        write("screenshots/s1_clean.png");
        let audio = write("audio/mic.webm");
        let video = write("video/recording.mp4");
        let hd = write("video/recording_hd.mp4");
        write("exports/guide.html");
        write("exports/screenshots/step_1.png");

        db.insert_screenshot(&Screenshot {
            id: "shot-1".into(),
            session_id: session.id.clone(),
            path: shot.to_string_lossy().into(),
            timestamp_ms: 1,
            trigger: None,
            selected: 1,
            click_x: None,
            click_y: None,
            annotations_json: None,
        })
        .unwrap();
        db.update_session_audio(&session.id, &audio.to_string_lossy()).unwrap();
        db.update_session_video_path(&session.id, &video.to_string_lossy()).unwrap();
        db.update_session_full_video_path(&session.id, &hd.to_string_lossy()).unwrap();

        let archive = root.join("bundle.zip");
        export_session_bundle(&db, &session.id, &archive).unwrap();

        // Same database: the id collides, so the import gets a new session.
        let imported = import_session_bundle(&db, &archive).unwrap();
        assert_ne!(imported.id, session.id);
        let new_dir = db.session_dir(&imported.id);
        for rel in [
            "screenshots/s1.png",
            "screenshots/s1_annotated.png",
            "screenshots/s1_clean.png",
            "exports/guide.html",
            "exports/screenshots/step_1.png",
        ] {
            assert!(new_dir.join(rel).is_file(), "missing {rel}");
        }
        assert!(imported.audio_path.as_deref().is_some_and(|p| std::path::Path::new(p).is_file()));
        assert!(imported.video_path.as_deref().is_some_and(|p| std::path::Path::new(p).is_file()));
        assert!(imported.full_video_path.as_deref().is_some_and(|p| std::path::Path::new(p).is_file()));

        drop(db);
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn accepts_nested_export_paths_only_when_safe() {
        assert!(safe_relative_path("screenshots/a.png").is_some());
        assert!(safe_relative_path("guide.html").is_some());
        assert!(safe_relative_path("../a.png").is_none());
        assert!(safe_relative_path("screenshots/../../a.png").is_none());
        assert!(safe_relative_path("screenshots//a.png").is_none());
    }

    #[test]
    fn accepts_plain_file_names() {
        assert_eq!(safe_file_name("shot_001.png"), Some("shot_001.png"));
        assert_eq!(safe_file_name("audio.webm"), Some("audio.webm"));
    }

    #[test]
    fn rejects_traversal_and_absolute_paths() {
        for bad in [
            "",
            ".",
            "..",
            "../evil.exe",
            r"..\evil.exe",
            "sub/dir.png",
            r"C:\Windows\evil.dll",
            "C:evil.dll",
            "/etc/passwd",
            "file.txt:stream",
        ] {
            assert_eq!(safe_file_name(bad), None, "should reject {bad:?}");
        }
    }
}
