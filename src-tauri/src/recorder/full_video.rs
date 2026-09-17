use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use anyhow::{Context, Result};

use crate::media::resolve_ffmpeg;
use crate::platform::find_monitor;

#[derive(Debug, Clone)]
pub struct FullVideoConfig {
    pub fps: u32,
    pub monitor_id: Option<String>,
    pub quality_crf: u32,
}

impl Default for FullVideoConfig {
    fn default() -> Self {
        Self {
            fps: 30,
            monitor_id: None,
            quality_crf: 23,
        }
    }
}

pub struct FullVideoRecorderHandle {
    stop_flag: Arc<AtomicBool>,
    is_paused: Arc<AtomicBool>,
    worker_handle: Option<JoinHandle<()>>,
    child: Option<Child>,
    temp_output_path: PathBuf,
}

impl FullVideoRecorderHandle {
    pub fn start(session_dir: PathBuf, config: FullVideoConfig) -> Result<Self> {
        let ffmpeg_path = resolve_ffmpeg().context("FFmpeg not available for full video recording")?;
        let video_dir = session_dir.join("video");
        std::fs::create_dir_all(&video_dir)?;

        let temp_output_path = video_dir.join("recording_hd_temp.mp4");

        // Clean up any stale files
        let _ = std::fs::remove_file(&temp_output_path);

        let fps = config.fps.clamp(5, 60);
        let monitor = find_monitor(config.monitor_id.as_deref())
            .or_else(|_| find_monitor(None))
            .context("no monitor found for video recording")?;

        let width = monitor.width().map_err(|e| anyhow::anyhow!(e))? & !1;
        let height = monitor.height().map_err(|e| anyhow::anyhow!(e))? & !1;

        if width == 0 || height == 0 {
            anyhow::bail!("invalid monitor resolution: {}x{}", width, height);
        }

        let crf = config.quality_crf.clamp(15, 35).to_string();
        let fps_str = fps.to_string();

        let mut child = Command::new(&ffmpeg_path)
            .args([
                "-hide_banner",
                "-loglevel",
                "warning",
                "-y",
                "-f",
                "rawvideo",
                "-pix_fmt",
                "rgba",
                "-s",
                &format!("{width}x{height}"),
                "-r",
                &fps_str,
                "-i",
                "-",
                "-c:v",
                "libx264",
                "-preset",
                "ultrafast",
                "-tune",
                "zerolatency",
                "-crf",
                &crf,
                "-pix_fmt",
                "yuv420p",
                &temp_output_path.to_string_lossy(),
            ])
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .spawn()
            .context("failed to spawn ffmpeg for full video recording")?;

        let mut stdin = child.stdin.take().context("failed to open ffmpeg stdin")?;
        let stop_flag = Arc::new(AtomicBool::new(false));
        let is_paused = Arc::new(AtomicBool::new(false));

        let stop_clone = stop_flag.clone();
        let pause_clone = is_paused.clone();
        let target_monitor_id = config.monitor_id.clone();
        let frame_interval = Duration::from_nanos(1_000_000_000 / fps as u64);

        let worker_handle = thread::Builder::new()
            .name("full-video-capture-thread".to_string())
            .spawn(move || {
                let mut next_frame_time = Instant::now();
                while !stop_clone.load(Ordering::SeqCst) {
                    if pause_clone.load(Ordering::SeqCst) {
                        thread::sleep(Duration::from_millis(100));
                        next_frame_time = Instant::now();
                        continue;
                    }

                    let monitor_res = find_monitor(target_monitor_id.as_deref())
                        .or_else(|_| find_monitor(None));

                    if let Ok(mon) = monitor_res {
                        if let Ok(image) = mon.capture_image() {
                            let raw_bytes = image.as_raw();
                            if stdin.write_all(raw_bytes).is_err() {
                                // FFmpeg process exited or broken pipe
                                break;
                            }
                        }
                    }

                    next_frame_time += frame_interval;
                    let now = Instant::now();
                    if next_frame_time > now {
                        thread::sleep(next_frame_time - now);
                    } else if now - next_frame_time > Duration::from_millis(500) {
                        // Reset if falling significantly behind
                        next_frame_time = now;
                    }
                }

                // Flush and close stdin cleanly
                let _ = stdin.flush();
                drop(stdin);
            })
            .context("failed to spawn video capture worker thread")?;

        Ok(Self {
            stop_flag,
            is_paused,
            worker_handle: Some(worker_handle),
            child: Some(child),
            temp_output_path,
        })
    }

    pub fn pause(&self) {
        self.is_paused.store(true, Ordering::SeqCst);
    }

    pub fn resume(&self) {
        self.is_paused.store(false, Ordering::SeqCst);
    }

    pub fn stop(mut self) -> Result<PathBuf> {
        self.stop_flag.store(true, Ordering::SeqCst);

        if let Some(handle) = self.worker_handle.take() {
            let _ = handle.join();
        }

        if let Some(mut child) = self.child.take() {
            let _ = child.wait();
        }

        Ok(self.temp_output_path)
    }
}

static FINALIZE_LOCK: parking_lot::Mutex<()> = parking_lot::Mutex::new(());

pub fn finalize_hd_video(session_dir: &Path, audio_path: Option<&Path>) -> Result<Option<PathBuf>> {
    let _guard = FINALIZE_LOCK.lock();
    let video_dir = session_dir.join("video");
    let temp_video = video_dir.join("recording_hd_temp.mp4");
    let final_video = video_dir.join("recording_hd.mp4");

    if !temp_video.is_file() {
        if final_video.is_file() {
            return Ok(Some(final_video));
        }
        return Ok(None);
    }

    let Some(ffmpeg) = resolve_ffmpeg() else {
        // Without ffmpeg, just rename temp to final if possible
        if std::fs::rename(&temp_video, &final_video).is_ok() {
            return Ok(Some(final_video));
        }
        return Ok(Some(temp_video));
    };

    if let Some(audio) = audio_path.filter(|p| p.is_file()) {
        let mut cmd = Command::new(&ffmpeg);
        cmd.args([
            "-hide_banner",
            "-loglevel",
            "warning",
            "-y",
            "-i",
            &temp_video.to_string_lossy(),
            "-i",
            &audio.to_string_lossy(),
            "-c:v",
            "copy",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-shortest",
            "-movflags",
            "+faststart",
            &final_video.to_string_lossy(),
        ]);

        if let Ok(status) = cmd.status() {
            if status.success() && final_video.is_file() {
                let _ = std::fs::remove_file(&temp_video);
                return Ok(Some(final_video));
            }
        }
    }

    // If no audio or muxing failed, rename temp to final
    if std::fs::rename(&temp_video, &final_video).is_ok() {
        Ok(Some(final_video))
    } else {
        Ok(Some(temp_video))
    }
}
