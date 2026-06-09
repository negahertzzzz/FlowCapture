use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use anyhow::{Context, Result};
use device_query::{DeviceQuery, DeviceState, Keycode};
#[cfg(not(target_os = "linux"))]
use xcap::Monitor;

use crate::thread_util::join_thread_with_timeout;
use super::traits::{
    CapturedInputEvent, InputEventSource, ScreenshotCapturer, WindowInfo, WindowTracker,
};
#[cfg(not(target_os = "macos"))]
use super::traits::ScreenRecorder;
#[cfg(not(target_os = "macos"))]
use crate::platform::PlatformServices;

#[cfg(not(target_os = "macos"))]
pub struct SharedPlatform {
    recorder: SharedRecorder,
    input: SharedInputSource,
    windows: SharedWindowTracker,
    platform_name: String,
}

#[cfg(not(target_os = "macos"))]
impl SharedPlatform {
    pub fn new(platform_name: &str) -> Result<Self> {
        Ok(Self {
            recorder: SharedRecorder::default(),
            input: SharedInputSource::default(),
            windows: SharedWindowTracker::default(),
            platform_name: platform_name.to_string(),
        })
    }

    pub fn into_services(self) -> PlatformServices {
        PlatformServices {
            recorder: Box::new(self.recorder),
            input: Box::new(self.input),
            windows: Box::new(self.windows),
            platform_name: self.platform_name,
        }
    }
}

const SERVICE_JOIN_TIMEOUT: Duration = Duration::from_secs(3);

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

#[cfg(not(target_os = "macos"))]
#[derive(Default)]
pub struct SharedRecorder {
    recording: AtomicBool,
    output_dir: Mutex<Option<PathBuf>>,
    #[allow(dead_code)]
    video_path: Mutex<Option<PathBuf>>,
    handle: Mutex<Option<JoinHandle<()>>>,
    stop_flag: Arc<AtomicBool>,
}

#[cfg(not(target_os = "macos"))]
impl ScreenRecorder for SharedRecorder {
    fn start(&mut self, output_dir: PathBuf) -> Result<PathBuf> {
        if self.recording.load(Ordering::SeqCst) {
            anyhow::bail!("recording already in progress");
        }

        std::fs::create_dir_all(&output_dir)?;
        let frames_dir = output_dir.join("frames");
        std::fs::create_dir_all(&frames_dir)?;

        let stop_flag = Arc::new(AtomicBool::new(false));
        self.stop_flag = stop_flag.clone();
        self.recording.store(true, Ordering::SeqCst);
        *self.output_dir.lock().unwrap() = Some(output_dir.clone());

        let frames_dir_clone = frames_dir.clone();
        let handle = thread::spawn(move || {
            let mut frame_index = 0u64;
            while !stop_flag.load(Ordering::SeqCst) {
                let path = frames_dir_clone.join(format!("frame_{frame_index:06}.png"));
                let captured = {
                    #[cfg(target_os = "linux")]
                    {
                        super::linux_capture::capture_primary_monitor(path.clone()).is_ok()
                    }
                    #[cfg(not(target_os = "linux"))]
                    {
                        Monitor::all()
                            .ok()
                            .and_then(|monitors| monitors.into_iter().next())
                            .and_then(|monitor| monitor.capture_image().ok())
                            .and_then(|image| image.save(&path).ok())
                            .is_some()
                    }
                };
                if captured {
                    frame_index += 1;
                }
                thread::sleep(Duration::from_millis(500));
            }
        });

        *self.handle.lock().unwrap() = Some(handle);
        Ok(output_dir)
    }

    fn stop(&mut self) -> Result<Option<PathBuf>> {
        if !self.recording.load(Ordering::SeqCst) {
            return Ok(None);
        }

        self.request_stop();
        if let Some(handle) = self.handle.lock().unwrap().take() {
            if !join_thread_with_timeout(handle, SERVICE_JOIN_TIMEOUT) {
                eprintln!("FlowCapture: shared recorder thread did not stop within timeout");
            }
        }

        self.recording.store(false, Ordering::SeqCst);
        self.output_dir.lock().unwrap().take();
        Ok(None)
    }

    fn request_stop(&mut self) {
        self.stop_flag.store(true, Ordering::SeqCst);
    }
}

#[derive(Default)]
pub struct SharedInputSource {
    running: AtomicBool,
    events: Arc<Mutex<Vec<CapturedInputEvent>>>,
    handle: Mutex<Option<JoinHandle<()>>>,
    stop_flag: Arc<AtomicBool>,
    last_mouse: Arc<Mutex<Option<(i32, i32)>>>,
    left_button_down: Arc<Mutex<[bool; 3]>>,
}

impl InputEventSource for SharedInputSource {
    fn start(&mut self) -> Result<()> {
        if self.running.load(Ordering::SeqCst) {
            return Ok(());
        }

        #[cfg(target_os = "macos")]
        if DeviceState::checked_new().is_none() {
            anyhow::bail!(
                "Accessibility permission is required to track keyboard and mouse input."
            );
        }

        let events = self.events.clone();
        let stop_flag = Arc::new(AtomicBool::new(false));
        self.stop_flag = stop_flag.clone();
        self.running.store(true, Ordering::SeqCst);

        let last_mouse = self.last_mouse.clone();
        let left_button_down = self.left_button_down.clone();

        let handle = thread::spawn(move || {
            let Some(device_state) = DeviceState::checked_new() else {
                return;
            };
            let mut previous_keys: Vec<Keycode> = Vec::new();
            while !stop_flag.load(Ordering::SeqCst) {
                let mouse = device_state.get_mouse();
                let keys = device_state.get_keys();
                let timestamp_ms = now_ms();

                {
                    let mut last = last_mouse.lock().unwrap();
                    if *last != Some(mouse.coords) {
                        *last = Some(mouse.coords);
                        events.lock().unwrap().push(CapturedInputEvent {
                            event_type: "mouse_move".to_string(),
                            app_name: active_window_name(),
                            payload: serde_json::json!({
                                "x": mouse.coords.0,
                                "y": mouse.coords.1
                            }),
                            timestamp_ms,
                        });
                    }
                }

                {
                    let mut was_down = left_button_down.lock().unwrap();
                    for (index, button) in [(0_usize, "left"), (1, "right"), (2, "middle")] {
                        let is_down = mouse.button_pressed[index];
                        if is_down && !was_down[index] {
                            events.lock().unwrap().push(CapturedInputEvent {
                                event_type: "mouse_click".to_string(),
                                app_name: active_window_name(),
                                payload: serde_json::json!({
                                    "button": button,
                                    "x": mouse.coords.0,
                                    "y": mouse.coords.1
                                }),
                                timestamp_ms,
                            });
                        }
                        was_down[index] = is_down;
                    }
                }

                for key in keys.iter().copied().filter(|key| !previous_keys.contains(key)) {
                    let key_name = format!("{key:?}");
                    events.lock().unwrap().push(CapturedInputEvent {
                        event_type: "key_press".to_string(),
                        app_name: active_window_name(),
                        payload: serde_json::json!({ "key": key_name }),
                        timestamp_ms,
                    });
                }

                previous_keys = keys;
                thread::sleep(Duration::from_millis(30));
            }
        });

        *self.handle.lock().unwrap() = Some(handle);
        Ok(())
    }

    fn stop(&mut self) -> Result<()> {
        if !self.running.load(Ordering::SeqCst) {
            return Ok(());
        }
        self.request_stop();
        if let Some(handle) = self.handle.lock().unwrap().take() {
            if !join_thread_with_timeout(handle, SERVICE_JOIN_TIMEOUT) {
                eprintln!("FlowCapture: shared recorder thread did not stop within timeout");
            }
        }
        self.running.store(false, Ordering::SeqCst);
        Ok(())
    }

    fn drain_events(&mut self) -> Vec<CapturedInputEvent> {
        let mut events = self.events.lock().unwrap();
        std::mem::take(&mut *events)
    }

    fn request_stop(&mut self) {
        self.stop_flag.store(true, Ordering::SeqCst);
    }
}
fn active_window_name() -> Option<String> {
    active_win_pos_rs::get_active_window().ok().map(|window| window.app_name)
}

#[derive(Default)]
pub struct SharedWindowTracker {
    running: AtomicBool,
    events: Arc<Mutex<Vec<WindowInfo>>>,
    last_window_key: Arc<Mutex<Option<String>>>,
    handle: Mutex<Option<JoinHandle<()>>>,
    stop_flag: Arc<AtomicBool>,
}

impl WindowTracker for SharedWindowTracker {
    fn start(&mut self) -> Result<()> {
        if self.running.load(Ordering::SeqCst) {
            return Ok(());
        }

        let events = self.events.clone();
        let last_window_key = self.last_window_key.clone();
        let stop_flag = Arc::new(AtomicBool::new(false));
        self.stop_flag = stop_flag.clone();
        self.running.store(true, Ordering::SeqCst);

        let handle = thread::spawn(move || {
            while !stop_flag.load(Ordering::SeqCst) {
                if let Ok(window) = active_win_pos_rs::get_active_window() {
                    let window_key = format!("{}::{}", window.app_name, window.title);
                    let mut last = last_window_key.lock().unwrap();
                    if last.as_deref() != Some(window_key.as_str()) {
                        *last = Some(window_key);
                        events.lock().unwrap().push(WindowInfo {
                            app_name: window.app_name,
                            title: window.title,
                            timestamp_ms: now_ms(),
                        });
                    }
                }
                thread::sleep(Duration::from_millis(200));
            }
        });

        *self.handle.lock().unwrap() = Some(handle);
        Ok(())
    }

    fn stop(&mut self) -> Result<()> {
        if !self.running.load(Ordering::SeqCst) {
            return Ok(());
        }
        self.request_stop();
        if let Some(handle) = self.handle.lock().unwrap().take() {
            if !join_thread_with_timeout(handle, SERVICE_JOIN_TIMEOUT) {
                eprintln!("FlowCapture: shared recorder thread did not stop within timeout");
            }
        }
        self.running.store(false, Ordering::SeqCst);
        Ok(())
    }

    fn drain_events(&mut self) -> Vec<WindowInfo> {
        let mut events = self.events.lock().unwrap();
        std::mem::take(&mut *events)
    }

    fn request_stop(&mut self) {
        self.stop_flag.store(true, Ordering::SeqCst);
    }
}

pub struct SharedScreenshotCapturer;

impl ScreenshotCapturer for SharedScreenshotCapturer {
    fn capture_primary_monitor(&self, output_path: PathBuf) -> Result<PathBuf> {
        #[cfg(target_os = "linux")]
        {
            return super::linux_capture::capture_primary_monitor(output_path);
        }

        #[cfg(not(target_os = "linux"))]
        {
            if let Some(parent) = output_path.parent() {
                std::fs::create_dir_all(parent)?;
            }
            let monitor = Monitor::all()?
                .into_iter()
                .next()
                .context("no monitor found")?;
            let image = monitor.capture_image()?;
            image
                .save(&output_path)
                .map_err(|err| anyhow::anyhow!("failed to save screenshot: {err}"))?;
            Ok(output_path)
        }
    }
}
