//! Session folder mirror: keeps an up-to-date, readable copy of every session in a folder the
//! user picks (Settings → "Cartella sessioni"), one sub-folder per session named after it.
//!
//! Each folder holds the same content as a `.flowcapture` export, unzipped:
//! `manifest.json` (session, steps, events, screenshots, exports…), `documentation.md`,
//! `screenshots/`, `media/` (HD video, timelapse, audio) and `exports/`. Renaming a session
//! renames its folder. Updates run on a background worker, a moment after the last change.

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, RecvTimeoutError, Sender};
use std::sync::Arc;
use std::time::{Duration, Instant};

use anyhow::{Context, Result};

use super::bundle::{write_session_bundle, BundleSink};
use super::Database;

/// Setting holding the mirror root folder; empty or missing = mirroring off.
pub const MIRROR_DIR_SETTING: &str = "session_mirror_dir";
/// Per-session setting with the name of the folder the session was last written to.
const FOLDER_SETTING_PREFIX: &str = "mirror_folder:";
/// Marker file identifying which session a folder belongs to.
const OWNER_MARKER: &str = ".flowcapture-session";
/// Sub-folders whose content is fully managed (stale files are removed from them).
const MANAGED_DIRS: [&str; 3] = ["screenshots", "media", "exports"];

const QUIET_PERIOD: Duration = Duration::from_millis(1500);
const MAX_DELAY: Duration = Duration::from_secs(10);

/// Background worker: collects "session changed" notifications and syncs each session once
/// the changes have settled.
#[derive(Clone)]
pub struct MirrorWorker {
    tx: Sender<String>,
}

impl MirrorWorker {
    pub fn spawn(db: Arc<Database>) -> Self {
        let (tx, rx) = mpsc::channel::<String>();
        let _ = std::thread::Builder::new()
            .name("session-mirror".to_string())
            .spawn(move || {
                while let Ok(first) = rx.recv() {
                    let mut pending: HashSet<String> = HashSet::from([first]);
                    let started = Instant::now();
                    loop {
                        let remaining = MAX_DELAY.saturating_sub(started.elapsed());
                        match rx.recv_timeout(QUIET_PERIOD.min(remaining)) {
                            Ok(id) => {
                                pending.insert(id);
                            }
                            Err(RecvTimeoutError::Timeout) => break,
                            Err(RecvTimeoutError::Disconnected) => return,
                        }
                        if started.elapsed() >= MAX_DELAY {
                            break;
                        }
                    }
                    for session_id in pending {
                        if let Err(err) = sync_session(&db, &session_id) {
                            crate::logger::write_entry(
                                "WARN",
                                "mirror",
                                &format!("could not update the folder of session {session_id}: {err:#}"),
                            );
                        }
                    }
                }
            });
        Self { tx }
    }

    pub fn request(&self, session_id: &str) {
        let _ = self.tx.send(session_id.to_string());
    }
}

pub fn mirror_root(db: &Database) -> Option<PathBuf> {
    db.get_setting(MIRROR_DIR_SETTING)
        .ok()
        .flatten()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
}

/// Writes (or refreshes) the mirror folder of one session. Returns the folder, or `None` when
/// mirroring is off, the session no longer exists or is still being recorded.
pub fn sync_session(db: &Database, session_id: &str) -> Result<Option<PathBuf>> {
    let Some(root) = mirror_root(db) else {
        return Ok(None);
    };
    let Some(session) = db.get_session(session_id)? else {
        return Ok(None);
    };
    if session.status == crate::storage::models::SessionStatus::Recording.as_str() {
        return Ok(None);
    }
    std::fs::create_dir_all(&root)
        .with_context(|| format!("cannot create the sessions folder {}", root.display()))?;

    let folder = resolve_folder(db, &root, session_id, &session.title)?;
    std::fs::create_dir_all(&folder)?;
    std::fs::write(folder.join(OWNER_MARKER), session_id)?;

    let mut sink = DirSink { root: folder.clone(), written: HashSet::new() };
    let manifest = write_session_bundle(db, session_id, &mut sink)?;
    sink.add_bytes("manifest.json", &serde_json::to_vec_pretty(&manifest)?)?;
    if let Some(markdown) = session.documentation_md.as_deref().filter(|md| !md.trim().is_empty()) {
        let screenshots = db.list_screenshots(session_id)?;
        // References become `screenshots/<file>`, which is where the images are in the folder.
        let normalized = crate::ai::documentation::normalize_screenshot_references(markdown, &screenshots);
        sink.add_bytes("documentation.md", normalized.as_bytes())?;
    }
    sink.prune_stale_files()?;
    Ok(Some(folder))
}

/// Requests a sync of every session (after the folder was chosen or changed).
pub fn sync_all(db: &Database, worker: &MirrorWorker) -> Result<usize> {
    let sessions = db.list_sessions()?;
    for session in &sessions {
        worker.request(&session.id);
    }
    Ok(sessions.len())
}

/// Folder of the session under `root`, named after its title. Moves the existing folder when
/// the title changed; never takes over a folder that belongs to another session (or to the user).
fn resolve_folder(db: &Database, root: &Path, session_id: &str, title: &str) -> Result<PathBuf> {
    let desired = folder_name_for_title(title);
    let setting_key = format!("{FOLDER_SETTING_PREFIX}{session_id}");
    let previous = db
        .get_setting(&setting_key)?
        .map(|name| root.join(name))
        .filter(|path| owned_by(path, session_id));

    let folder = match previous {
        Some(current) if current.file_name().and_then(|n| n.to_str()) == Some(desired.as_str()) => current,
        Some(current) => {
            let target = free_folder(root, &desired, session_id);
            match std::fs::rename(&current, &target) {
                Ok(()) => target,
                // A file in it is open (e.g. a PDF in a viewer): keep the old name for now,
                // the next change retries.
                Err(err) => {
                    crate::logger::write_entry(
                        "WARN",
                        "mirror",
                        &format!("cannot rename {} to {}: {err}", current.display(), target.display()),
                    );
                    current
                }
            }
        }
        None => free_folder(root, &desired, session_id),
    };

    if let Some(name) = folder.file_name().and_then(|n| n.to_str()) {
        db.set_setting(&setting_key, name)?;
    }
    Ok(folder)
}

/// `desired`, or `desired (2)`, `desired (3)`… skipping folders owned by someone else.
fn free_folder(root: &Path, desired: &str, session_id: &str) -> PathBuf {
    let mut counter = 1;
    loop {
        let name = if counter == 1 { desired.to_string() } else { format!("{desired} ({counter})") };
        let candidate = root.join(&name);
        if !candidate.exists() || owned_by(&candidate, session_id) {
            return candidate;
        }
        counter += 1;
    }
}

fn owned_by(folder: &Path, session_id: &str) -> bool {
    std::fs::read_to_string(folder.join(OWNER_MARKER))
        .map(|owner| owner.trim() == session_id)
        .unwrap_or(false)
}

/// Session title -> folder name valid on Windows, macOS and Linux (keeps spaces and accents).
pub fn folder_name_for_title(title: &str) -> String {
    let cleaned: String = title
        .chars()
        .map(|c| match c {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => ' ',
            c if c.is_control() => ' ',
            c => c,
        })
        .collect();
    let collapsed = cleaned.split_whitespace().collect::<Vec<_>>().join(" ");
    let mut name: String = collapsed.chars().take(80).collect();
    // Windows drops trailing dots/spaces and refuses reserved device names.
    name = name.trim_end_matches(['.', ' ']).trim().to_string();
    let upper = name.to_ascii_uppercase();
    let base = upper.split('.').next().unwrap_or("");
    let reserved = matches!(base, "CON" | "PRN" | "AUX" | "NUL")
        || ((base.starts_with("COM") || base.starts_with("LPT"))
            && base.len() == 4
            && base.as_bytes()[3].is_ascii_digit());
    if name.is_empty() || reserved {
        name = if name.is_empty() { "Sessione".to_string() } else { format!("{name}_") };
    }
    name
}

/// Bundle destination writing plain files into a folder. Unchanged files are not copied again
/// (videos can be large), and files no longer part of the session are removed afterwards.
struct DirSink {
    root: PathBuf,
    written: HashSet<PathBuf>,
}

impl DirSink {
    fn target(&mut self, entry: &str) -> Option<PathBuf> {
        let mut path = self.root.clone();
        for part in entry.split('/') {
            if part.is_empty() || part == "." || part == ".." || part.contains(['\\', ':']) {
                return None;
            }
            path.push(part);
        }
        self.written.insert(path.clone()).then_some(path)
    }

    fn prune_stale_files(&self) -> Result<()> {
        for dir in MANAGED_DIRS {
            let dir = self.root.join(dir);
            if !dir.is_dir() {
                continue;
            }
            let mut stack = vec![dir];
            while let Some(current) = stack.pop() {
                for entry in std::fs::read_dir(&current)? {
                    let path = entry?.path();
                    if path.is_dir() {
                        stack.push(path);
                    } else if !self.written.contains(&path) {
                        let _ = std::fs::remove_file(&path);
                    }
                }
            }
        }
        Ok(())
    }
}

impl BundleSink for DirSink {
    fn add_file(&mut self, entry: &str, source: &Path) -> Result<()> {
        let Some(target) = self.target(entry) else {
            return Ok(());
        };
        if is_up_to_date(source, &target) {
            return Ok(());
        }
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent)?;
        }
        // Copy next to the target and rename, so a reader never sees a half-written file.
        let partial = partial_path(&target);
        std::fs::copy(source, &partial)
            .with_context(|| format!("copying {} to the sessions folder", source.display()))?;
        replace_file(&partial, &target)
    }

    fn add_bytes(&mut self, entry: &str, bytes: &[u8]) -> Result<()> {
        let Some(target) = self.target(entry) else {
            return Ok(());
        };
        if std::fs::read(&target).is_ok_and(|current| current == bytes) {
            return Ok(());
        }
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let partial = partial_path(&target);
        std::fs::write(&partial, bytes)?;
        replace_file(&partial, &target)
    }
}

fn partial_path(target: &Path) -> PathBuf {
    let mut name = target.file_name().unwrap_or_default().to_os_string();
    name.push(".partial");
    target.with_file_name(name)
}

fn replace_file(partial: &Path, target: &Path) -> Result<()> {
    if std::fs::rename(partial, target).is_err() {
        // Windows cannot rename over an existing file in every case (e.g. read-only flag).
        let _ = std::fs::remove_file(target);
        if let Err(err) = std::fs::rename(partial, target) {
            let _ = std::fs::remove_file(partial);
            return Err(err).with_context(|| format!("writing {}", target.display()));
        }
    }
    Ok(())
}

fn is_up_to_date(source: &Path, target: &Path) -> bool {
    let (Ok(src), Ok(dst)) = (source.metadata(), target.metadata()) else {
        return false;
    };
    if src.len() != dst.len() {
        return false;
    }
    match (src.modified(), dst.modified()) {
        (Ok(src_time), Ok(dst_time)) => dst_time >= src_time,
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(label: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("flowcapture-mirror-{label}-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn folder_names_are_valid_everywhere() {
        assert_eq!(folder_name_for_title("Ordine: cliente/fornitore?"), "Ordine cliente fornitore");
        assert_eq!(folder_name_for_title("  Perché più file...  "), "Perché più file");
        assert_eq!(folder_name_for_title("CON"), "CON_");
        assert_eq!(folder_name_for_title("com1.txt"), "com1.txt_");
        assert_eq!(folder_name_for_title("***"), "Sessione");
    }

    #[test]
    fn mirrors_a_session_and_follows_renames() {
        let data = temp_dir("data");
        let root = temp_dir("root");
        let db = Database::new(data.clone()).unwrap();
        db.set_setting(MIRROR_DIR_SETTING, &root.to_string_lossy()).unwrap();

        let session = db.create_session(Some("Primo titolo".into())).unwrap();
        db.finish_session(&session.id, None, 12).unwrap();
        let shots_dir = db.session_dir(&session.id).join("screenshots");
        std::fs::create_dir_all(&shots_dir).unwrap();
        let shot_path = shots_dir.join("a.png");
        image::RgbaImage::from_pixel(4, 4, image::Rgba([1, 2, 3, 255])).save(&shot_path).unwrap();
        db.insert_screenshot(&crate::storage::models::Screenshot {
            id: "shot-a".into(),
            session_id: session.id.clone(),
            path: shot_path.to_string_lossy().to_string(),
            timestamp_ms: 1,
            trigger: None,
            selected: 1,
            click_x: None,
            click_y: None,
            annotations_json: None,
        })
        .unwrap();
        db.save_documentation(&session.id, "# Guida\n\n### Step 1: Apri\n![a](screenshots/a.png)\n", "[]", "[]")
            .unwrap();

        let folder = sync_session(&db, &session.id).unwrap().unwrap();
        assert_eq!(folder, root.join("Primo titolo"));
        assert!(folder.join("manifest.json").is_file());
        assert!(folder.join("screenshots/a.png").is_file());
        assert!(std::fs::read_to_string(folder.join("documentation.md")).unwrap().contains("screenshots/a.png"));

        db.update_session_title(&session.id, "Secondo titolo").unwrap();
        let renamed = sync_session(&db, &session.id).unwrap().unwrap();
        assert_eq!(renamed, root.join("Secondo titolo"));
        assert!(!root.join("Primo titolo").exists());
        assert!(renamed.join("screenshots/a.png").is_file());

        // A user folder with the same name is never taken over.
        let other = db.create_session(Some("Secondo titolo".into())).unwrap();
        db.finish_session(&other.id, None, 1).unwrap();
        let second = sync_session(&db, &other.id).unwrap().unwrap();
        assert_eq!(second, root.join("Secondo titolo (2)"));

        // Deleted screenshots disappear from the copy.
        db.delete_screenshot("shot-a").unwrap();
        sync_session(&db, &session.id).unwrap();
        assert!(!renamed.join("screenshots/a.png").exists());

        drop(db);
        let _ = std::fs::remove_dir_all(data);
        let _ = std::fs::remove_dir_all(root);
    }
}
