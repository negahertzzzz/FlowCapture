use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

#[cfg(target_os = "linux")]
use anyhow::Result;
#[cfg(not(target_os = "linux"))]
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
    is_paused: Arc<AtomicBool>,
    current_monitor_id: Arc<Mutex<Option<String>>>,
}

#[cfg(not(target_os = "macos"))]
impl ScreenRecorder for SharedRecorder {
    fn start_with_monitor(&mut self, output_dir: PathBuf, monitor_id: Option<String>) -> Result<PathBuf> {
        if self.recording.load(Ordering::SeqCst) {
            anyhow::bail!("recording already in progress");
        }

        std::fs::create_dir_all(&output_dir)?;
        let frames_dir = output_dir.join("frames");
        std::fs::create_dir_all(&frames_dir)?;

        let stop_flag = Arc::new(AtomicBool::new(false));
        self.stop_flag = stop_flag.clone();
        self.is_paused.store(false, Ordering::SeqCst);
        if let Ok(mut mon_guard) = self.current_monitor_id.lock() {
            *mon_guard = monitor_id;
        }
        self.recording.store(true, Ordering::SeqCst);
        *self.output_dir.lock().unwrap() = Some(output_dir.clone());

        let frames_dir_clone = frames_dir.clone();
        let is_paused_clone = self.is_paused.clone();
        let current_monitor_id_clone = self.current_monitor_id.clone();
        let handle = thread::spawn(move || {
            let mut frame_index = 0u64;
            while !stop_flag.load(Ordering::SeqCst) {
                if is_paused_clone.load(Ordering::SeqCst) {
                    thread::sleep(Duration::from_millis(200));
                    continue;
                }
                let target_mon_id = current_monitor_id_clone.lock().ok().and_then(|g| g.clone());
                let path = frames_dir_clone.join(format!("frame_{frame_index:06}.png"));
                let captured = {
                    #[cfg(target_os = "linux")]
                    {
                        let _ = &target_mon_id;
                        super::linux_capture::capture_primary_monitor(path.clone()).is_ok()
                    }
                    #[cfg(not(target_os = "linux"))]
                    {
                        find_monitor(target_mon_id.as_deref())
                            .and_then(|monitor| monitor.capture_image().map_err(|e| anyhow::anyhow!(e)))
                            .and_then(|image| image.save(&path).map_err(|e| anyhow::anyhow!(e)))
                            .is_ok()
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

    fn pause(&self) {
        self.is_paused.store(true, Ordering::SeqCst);
    }

    fn resume(&self) {
        self.is_paused.store(false, Ordering::SeqCst);
    }

    fn switch_monitor(&self, monitor_id: Option<String>) -> Result<()> {
        if let Ok(mut guard) = self.current_monitor_id.lock() {
            *guard = monitor_id;
        }
        Ok(())
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
    last_click_time: Arc<Mutex<[i64; 3]>>,
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
        let last_click_time = self.last_click_time.clone();

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
                    let mut last_clicks = last_click_time.lock().unwrap();
                    for (index, button) in [(0_usize, "left"), (1, "right"), (2, "middle")] {
                        let is_down = mouse.button_pressed[index];
                        if is_down && !was_down[index] {
                            // Check for double-click within 400ms
                            let is_double_click = (timestamp_ms - last_clicks[index]) < 400;
                            last_clicks[index] = timestamp_ms;

                            let event_type = if is_double_click {
                                "mouse_double_click".to_string()
                            } else {
                                "mouse_click".to_string()
                            };

                            events.lock().unwrap().push(CapturedInputEvent {
                                event_type,
                                app_name: active_window_name(),
                                payload: serde_json::json!({
                                    "button": button,
                                    "x": mouse.coords.0,
                                    "y": mouse.coords.1,
                                    "double_click": is_double_click
                                }),
                                timestamp_ms,
                            });
                        } else if !is_down && was_down[index] {
                            // Mouse release event (useful for drag-and-drop actions)
                            events.lock().unwrap().push(CapturedInputEvent {
                                event_type: "mouse_release".to_string(),
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

                // Check modifiers (Ctrl, Alt, Shift, Meta)
                let has_ctrl = keys.iter().any(|k| matches!(k, Keycode::LControl | Keycode::RControl));
                let has_alt = keys.iter().any(|k| matches!(k, Keycode::LAlt | Keycode::RAlt));
                let has_shift = keys.iter().any(|k| matches!(k, Keycode::LShift | Keycode::RShift));
                let has_meta = keys.iter().any(|k| matches!(k, Keycode::LMeta | Keycode::RMeta));

                for key in keys.iter().copied().filter(|key| !previous_keys.contains(key)) {
                    // Skip standalone modifier presses when creating combo events
                    let is_mod = matches!(
                        key,
                        Keycode::LControl
                            | Keycode::RControl
                            | Keycode::LAlt
                            | Keycode::RAlt
                            | Keycode::LShift
                            | Keycode::RShift
                            | Keycode::LMeta
                            | Keycode::RMeta
                    );

                    let key_name = format!("{key:?}");
                    let combo = if !is_mod && (has_ctrl || has_alt || has_shift || has_meta) {
                        let mut parts = Vec::new();
                        if has_ctrl {
                            parts.push("Ctrl");
                        }
                        if has_alt {
                            parts.push("Alt");
                        }
                        if has_shift {
                            parts.push("Shift");
                        }
                        if has_meta {
                            parts.push("Meta");
                        }
                        parts.push(&key_name);
                        Some(parts.join("+"))
                    } else {
                        None
                    };

                    events.lock().unwrap().push(CapturedInputEvent {
                        event_type: if combo.is_some() {
                            "shortcut_press".to_string()
                        } else {
                            "key_press".to_string()
                        },
                        app_name: active_window_name(),
                        payload: serde_json::json!({
                            "key": key_name,
                            "combo": combo,
                            "ctrl": has_ctrl,
                            "alt": has_alt,
                            "shift": has_shift,
                            "meta": has_meta,
                        }),
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

#[cfg(not(target_os = "linux"))]
pub fn list_monitors() -> Result<Vec<crate::storage::models::MonitorInfo>> {
    let monitors = Monitor::all()?;
    let mut list = Vec::new();
    for (idx, m) in monitors.into_iter().enumerate() {
        let id = m.id().map(|v| v.to_string()).unwrap_or_else(|_| idx.to_string());
        let name = m.name().unwrap_or_else(|_| format!("Display {}", idx + 1));
        let is_primary = m.is_primary().unwrap_or(idx == 0);
        let width = m.width().unwrap_or(0);
        let height = m.height().unwrap_or(0);
        let scale_factor = m.scale_factor().map(|s| s as f64).unwrap_or(1.0);
        list.push(crate::storage::models::MonitorInfo {
            id,
            name,
            is_primary,
            width,
            height,
            scale_factor,
        });
    }
    if list.is_empty() {
        list.push(crate::storage::models::MonitorInfo {
            id: "primary".to_string(),
            name: "Primary Display".to_string(),
            is_primary: true,
            width: 1920,
            height: 1080,
            scale_factor: 1.0,
        });
    }
    Ok(list)
}

#[cfg(target_os = "linux")]
pub fn list_monitors() -> Result<Vec<crate::storage::models::MonitorInfo>> {
    let mut list = Vec::new();
    if let Ok(monitors) = xcap::Monitor::all() {
        for (idx, m) in monitors.into_iter().enumerate() {
            list.push(crate::storage::models::MonitorInfo {
                id: idx.to_string(),
                name: format!("Display {}", idx + 1),
                is_primary: idx == 0,
                width: m.width(),
                height: m.height(),
                scale_factor: 1.0,
            });
        }
    }
    if list.is_empty() {
        list.push(crate::storage::models::MonitorInfo {
            id: "primary".to_string(),
            name: "Primary Display".to_string(),
            is_primary: true,
            width: 1920,
            height: 1080,
            scale_factor: 1.0,
        });
    }
    Ok(list)
}

#[cfg(not(target_os = "linux"))]
pub fn find_monitor(target_id: Option<&str>) -> Result<Monitor> {
    let monitors = Monitor::all()?;
    if let Some(target) = target_id.filter(|s| !s.is_empty() && *s != "primary") {
        if let Some(m) = monitors.iter().find(|m| {
            m.id().map(|id| id.to_string()).ok().as_deref() == Some(target)
                || m.name().ok().as_deref() == Some(target)
        }) {
            return Ok(m.clone());
        }
        if let Ok(idx) = target.parse::<usize>() {
            if let Some(m) = monitors.get(idx) {
                return Ok(m.clone());
            }
        }
    }
    if let Some(m) = monitors.iter().find(|m| m.is_primary().unwrap_or(false)) {
        return Ok(m.clone());
    }
    monitors.into_iter().next().context("no monitor found")
}

pub struct SharedScreenshotCapturer;

impl ScreenshotCapturer for SharedScreenshotCapturer {
    fn capture_monitor(&self, output_path: PathBuf, monitor_id: Option<&str>) -> Result<PathBuf> {
        #[cfg(target_os = "linux")]
        {
            let _ = monitor_id;
            return super::linux_capture::capture_primary_monitor(output_path);
        }

        #[cfg(not(target_os = "linux"))]
        {
            if let Some(parent) = output_path.parent() {
                std::fs::create_dir_all(parent)?;
            }
            let monitor = find_monitor(monitor_id)?;
            let image = monitor.capture_image()?;
            image
                .save(&output_path)
                .map_err(|err| anyhow::anyhow!("failed to save screenshot: {err}"))?;
            Ok(output_path)
        }
    }
}
