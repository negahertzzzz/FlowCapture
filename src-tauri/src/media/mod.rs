use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::Arc;
use std::thread;

use anyhow::{Context, Result};
use tauri::{AppHandle, Emitter};
use serde::Serialize;

use crate::storage::Database;

const FFMPEG_ENV: &str = env!("FLOWCAPTURE_FFMPEG");

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoReadyEvent {
    pub session_id: String,
    pub video_path: String,
}

pub fn resolve_ffmpeg() -> Option<PathBuf> {
    for candidate in sidecar_ffmpeg_paths() {
        if candidate.is_file() {
            return Some(candidate);
        }
    }

    if !FFMPEG_ENV.is_empty() {
        let bundled = PathBuf::from(FFMPEG_ENV);
        if bundled.is_file() {
            return Some(bundled);
        }
    }

    if Command::new("ffmpeg")
        .arg("-version")
        .output()
        .is_ok_and(|output| output.status.success())
    {
        return Some(PathBuf::from("ffmpeg"));
    }

    for candidate in [
        "/opt/homebrew/bin/ffmpeg",
        "/usr/local/bin/ffmpeg",
        "/usr/bin/ffmpeg",
    ] {
        let path = PathBuf::from(candidate);
        if path.is_file() {
            return Some(path);
        }
    }

    None
}

fn sidecar_ffmpeg_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();

    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            for name in [
                "ffmpeg",
                "ffmpeg-aarch64-apple-darwin",
                "ffmpeg-x86_64-apple-darwin",
                "ffmpeg-x86_64-pc-windows-msvc.exe",
                "ffmpeg-aarch64-unknown-linux-gnu",
                "ffmpeg-x86_64-unknown-linux-gnu",
            ] {
                paths.push(dir.join(name));
            }
        }
    }

    if let Ok(manifest_dir) = std::env::var("CARGO_MANIFEST_DIR") {
        if let Ok(target) = std::env::var("TARGET") {
            paths.push(
                PathBuf::from(manifest_dir)
                    .join("binaries")
                    .join(format!("ffmpeg-{target}")),
            );
        }
    }

    paths
}

pub fn spawn_session_video_encode(
    db: Arc<Database>,
    app: AppHandle,
    session_id: String,
    duration_secs: i64,
) {
    thread::spawn(move || {
        let session_dir = db.session_dir(&session_id);
        match encode_session_video(&session_dir, duration_secs) {
            Ok(Some(path)) => {
                let video_path = path.to_string_lossy().to_string();
                if db
                    .update_session_video_path(&session_id, &video_path)
                    .is_ok()
                {
                    let _ = app.emit(
                        "video-ready",
                        VideoReadyEvent {
                            session_id,
                            video_path,
                        },
                    );
                }
            }
            Ok(None) => {}
            Err(err) => {
                eprintln!("session video encode failed for {session_id}: {err:#}");
            }
        }
    });
}

pub fn encode_session_video(session_dir: &Path, duration_secs: i64) -> Result<Option<PathBuf>> {
    let output = session_dir.join("video/recording.mp4");
    if output.is_file() && output.metadata().is_ok_and(|meta| meta.len() > 1024) {
        return Ok(Some(output));
    }

    let frames_dir = session_dir.join("video/frames");
    if !frames_dir.is_dir() {
        return Ok(None);
    }

    let audio_file = find_session_audio(session_dir);
    let duration = duration_secs.max(1) as f64;
    if encode_frames_to_mp4(&frames_dir, audio_file.as_deref(), &output, duration)? {
        Ok(Some(output))
    } else {
        Ok(None)
    }
}

pub fn find_session_audio(session_dir: &Path) -> Option<PathBuf> {
    let audio_dir = session_dir.join("audio");
    for ext in ["webm", "wav", "mp3", "ogg", "m4a"] {
        let path = audio_dir.join(format!("recording.{ext}"));
        if path.is_file() {
            return Some(path);
        }
    }
    None
}

pub fn encode_frames_to_mp4(
    frames_dir: &Path,
    audio_path: Option<&Path>,
    output_path: &Path,
    duration_secs: f64,
) -> Result<bool> {
    let (frame_count, input_pattern) = detect_frame_sequence(frames_dir)?;
    if frame_count == 0 {
        return Ok(false);
    }

    let Some(ffmpeg) = resolve_ffmpeg() else {
        return Ok(false);
    };

    if let Some(parent) = output_path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    let fps = (frame_count as f64 / duration_secs.max(1.0)).clamp(1.0, 30.0);
    let fps_arg = format!("{fps:.3}");

    let mut cmd = Command::new(ffmpeg);
    cmd.args([
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-start_number",
        "0",
        "-framerate",
        &fps_arg,
        "-i",
        &input_pattern,
    ]);

    if let Some(audio) = audio_path {
        cmd.args([
            "-i",
            &audio.to_string_lossy(),
            "-c:a",
            "aac",
            "-b:a",
            "128k",
            "-shortest",
        ]);
    }

    cmd.args([
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        &output_path.to_string_lossy(),
    ]);

    let status = cmd
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .status()
        .context("failed to run ffmpeg")?;

    if !status.success() {
        return Ok(false);
    }

    Ok(output_path.is_file() && output_path.metadata().is_ok_and(|meta| meta.len() > 1024))
}

fn detect_frame_sequence(frames_dir: &Path) -> Result<(usize, String)> {
    for ext in ["jpg", "jpeg", "png"] {
        let first = frames_dir.join(format!("frame_000000.{ext}"));
        if first.is_file() {
            let count = count_numbered_frames(frames_dir, ext);
            if count > 0 {
                return Ok((
                    count,
                    frames_dir
                        .join(format!("frame_%06d.{ext}"))
                        .to_string_lossy()
                        .into_owned(),
                ));
            }
        }
    }

    Ok((0, String::new()))
}

fn count_numbered_frames(frames_dir: &Path, extension: &str) -> usize {
    (0..)
        .map(|index| frames_dir.join(format!("frame_{index:06}.{extension}")))
        .take_while(|path| path.is_file())
        .count()
}

pub fn resolve_session_mp4(session_dir: &Path, video_path: Option<&str>) -> Option<PathBuf> {
    if let Some(path) = video_path {
        let candidate = PathBuf::from(path);
        if candidate.extension().is_some_and(|ext| ext == "mp4") && candidate.is_file() {
            return Some(candidate);
        }
    }

    let default_mp4 = session_dir.join("video/recording.mp4");
    if default_mp4.is_file() {
        return Some(default_mp4);
    }

    None
}

pub fn ensure_session_mp4(
    session_dir: &Path,
    video_path: Option<&str>,
    duration_secs: i64,
) -> Result<Option<PathBuf>> {
    if let Some(path) = resolve_session_mp4(session_dir, video_path) {
        return Ok(Some(path));
    }

    encode_session_video(session_dir, duration_secs)
}
