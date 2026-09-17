use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use anyhow::Result;
use chrono::Utc;
use parking_lot::Mutex;
use uuid::Uuid;

use crate::events::{should_trigger_screenshot, EventCollector};
use crate::platform::{preflight_recording_start, PlatformServices, SharedScreenshotCapturer};
use crate::recorder::RecorderEngine;
use crate::screenshots::{run_capture, PendingCapture, ScreenshotEngine};
use crate::storage::Database;
use crate::storage::models::{Session, SessionStatus, StoredEvent};
use crate::thread_util::join_thread_with_timeout;

const COLLECTOR_JOIN_TIMEOUT: Duration = Duration::from_secs(5);
const PLATFORM_STOP_TIMEOUT: Duration = Duration::from_secs(3);

use std::collections::HashMap;

pub struct AppState {
    pub db: Arc<Database>,
    pub platform: Arc<Mutex<PlatformServices>>,
    pub recorder: Mutex<RecorderEngine>,
    pub event_collector: Mutex<EventCollector>,
    pub screenshot_engine: Arc<Mutex<ScreenshotEngine>>,
    pub active_session: Mutex<Option<ActiveRecording>>,
    pub active_ai_cancellations: Mutex<HashMap<String, Arc<AtomicBool>>>,
    pub browser_bridge: crate::platform::browser_bridge::BrowserBridgeState,
}

pub struct ActiveRecording {
    pub session: Session,
    pub started_at: Instant,
    pub monitor_id: Option<String>,
    pub is_paused: Arc<AtomicBool>,
    collector_stop: Arc<AtomicBool>,
    collector_handle: JoinHandle<()>,
}

impl AppState {
    pub fn new(db: Arc<Database>, platform: PlatformServices) -> Result<Self> {
        let browser_bridge = crate::platform::browser_bridge::BrowserBridgeState::new();
        crate::platform::browser_bridge::start_browser_bridge_server(
            browser_bridge.clone(),
            crate::platform::browser_bridge::DEFAULT_BRIDGE_PORT,
        );

        Ok(Self {
            db: db.clone(),
            platform: Arc::new(Mutex::new(platform)),
            recorder: Mutex::new(RecorderEngine::new()),
            event_collector: Mutex::new(EventCollector::new()),
            screenshot_engine: Arc::new(Mutex::new(ScreenshotEngine::new(db.clone()))),
            active_session: Mutex::new(None),
            active_ai_cancellations: Mutex::new(HashMap::new()),
            browser_bridge,
        })
    }

    pub fn register_ai_cancellation(&self, session_id: &str) -> Arc<AtomicBool> {
        let flag = Arc::new(AtomicBool::new(false));
        self.active_ai_cancellations
            .lock()
            .insert(session_id.to_string(), flag.clone());
        flag
    }

    pub fn cancel_ai_job(&self, session_id: &str) -> bool {
        let map = self.active_ai_cancellations.lock();
        if let Some(flag) = map.get(session_id) {
            flag.store(true, Ordering::Relaxed);
            true
        } else {
            false
        }
    }

    pub fn remove_ai_cancellation(&self, session_id: &str) {
        self.active_ai_cancellations.lock().remove(session_id);
    }

    pub fn cleanup_stale_recordings(&self) -> Result<()> {
        for session in self.db.list_sessions()? {
            if session.status == SessionStatus::Recording.as_str() {
                self.db.update_session_status(&session.id, SessionStatus::Ready)?;
            }
        }
        Ok(())
    }

    pub fn start_recording(&self, title: Option<String>, monitor_id: Option<String>) -> Result<Session> {
        let mut active = self.active_session.lock();
        if active.is_some() {
            anyhow::bail!("a recording is already in progress");
        }

        preflight_recording_start()?;

        let effective_monitor_id = monitor_id
            .filter(|s| !s.trim().is_empty())
            .or_else(|| self.db.get_setting("selected_monitor_id").ok().flatten());

        if let Some(ref mid) = effective_monitor_id {
            let _ = self.db.set_setting("selected_monitor_id", mid);
        }

        let session = self.db.create_session(title)?;
        let session_id = session.id.clone();
        let session_dir = self.db.session_dir(&session_id);

        let mon_id = effective_monitor_id.clone();
        let collector_paused = Arc::new(AtomicBool::new(false));
        let collector_paused_clone = collector_paused.clone();
        self.browser_bridge.set_recording(true);
        let browser_bridge_clone = self.browser_bridge.clone();
        let start_result = (|| -> Result<(JoinHandle<()>, Arc<AtomicBool>)> {
            let mut platform = self.platform.lock();
            platform.input.start()?;
            platform.windows.start()?;
            self.recorder
                .lock()
                .start_with_platform(session_dir.clone(), &mut platform, mon_id.clone())?;
            self.event_collector.lock().start(&session_id)?;
            self.screenshot_engine
                .lock()
                .start(&session_id, session_dir.clone(), mon_id)?;

            let collector_stop = Arc::new(AtomicBool::new(false));
            let handle = spawn_recording_collector(
                collector_stop.clone(),
                collector_paused_clone,
                self.db.clone(),
                self.platform.clone(),
                self.screenshot_engine.clone(),
                browser_bridge_clone,
                session_id.clone(),
                session_dir,
            );

            Ok((handle, collector_stop))
        })();

        match start_result {
            Ok((collector_handle, collector_stop)) => {
                *active = Some(ActiveRecording {
                    session: session.clone(),
                    started_at: Instant::now(),
                    monitor_id: effective_monitor_id,
                    is_paused: collector_paused,
                    collector_stop,
                    collector_handle,
                });
                Ok(session)
            }
            Err(err) => {
                self.browser_bridge.set_recording(false);
                let _ = self.rollback_failed_start(&session_id);
                Err(err)
            }
        }
    }

    pub fn stop_recording(&self) -> Result<Session> {
        let active = {
            let mut guard = self.active_session.lock();
            guard
                .take()
                .ok_or_else(|| anyhow::anyhow!("no active recording"))?
        };

        let duration = active.started_at.elapsed().as_secs() as i64;
        let session_id = active.session.id.clone();

        active.collector_stop.store(true, Ordering::SeqCst);
        self.screenshot_engine.lock().stop(&session_id)?;
        signal_platform_stop(self);
        self.browser_bridge.set_recording(false);

        if !join_thread_with_timeout(active.collector_handle, COLLECTOR_JOIN_TIMEOUT) {
            eprintln!("FlowCapture: recording collector did not stop within timeout");
        }
        let _ = stop_platform_services(self);

        let mut pending_events = Vec::new();
        if let Some(mut platform) = self.platform.try_lock() {
            for input in platform.input.drain_events() {
                if should_persist_event(&input.event_type) {
                    pending_events.push(stored_from_input(&session_id, input, &self.browser_bridge));
                }
            }
            for window in platform.windows.drain_events() {
                pending_events.push(stored_from_window(&session_id, window));
            }
        }

        self.event_collector.lock().stop(&session_id)?;
        if !pending_events.is_empty() {
            self.db.insert_events(&pending_events)?;
        }

        self.db
            .finish_session(&session_id, None, duration)?;

        self.db
            .get_session(&session_id)?
            .ok_or_else(|| anyhow::anyhow!("session not found after stop"))
    }

    pub fn capture_manual_screenshot(&self) -> Result<()> {
        let (session_id, monitor_id) = {
            let active = self.active_session.lock();
            let recording = active.as_ref().ok_or_else(|| anyhow::anyhow!("no active recording"))?;
            (recording.session.id.clone(), recording.monitor_id.clone())
        };

        let session_dir = self.db.session_dir(&session_id);
        let mut pending = self
            .screenshot_engine
            .lock()
            .prepare_manual(&session_id, session_dir)?;
        if pending.monitor_id.is_none() {
            pending.monitor_id = monitor_id;
        }
        let capturer = SharedScreenshotCapturer;
        run_capture(&capturer, &pending)?;
        self.screenshot_engine.lock().finish_capture(pending)?;
        Ok(())
    }

    pub fn pause_recording(&self) -> Result<()> {
        let guard = self.active_session.lock();
        let active = guard.as_ref().ok_or_else(|| anyhow::anyhow!("no active recording"))?;
        active.is_paused.store(true, Ordering::SeqCst);
        if let Some(platform) = self.platform.try_lock() {
            self.recorder.lock().pause_with_platform(&platform);
        }
        Ok(())
    }

    pub fn resume_recording(&self) -> Result<()> {
        let guard = self.active_session.lock();
        let active = guard.as_ref().ok_or_else(|| anyhow::anyhow!("no active recording"))?;
        active.is_paused.store(false, Ordering::SeqCst);
        if let Some(platform) = self.platform.try_lock() {
            self.recorder.lock().resume_with_platform(&platform);
        }
        Ok(())
    }

    pub fn switch_recording_monitor(&self, monitor_id: String) -> Result<()> {
        let mut guard = self.active_session.lock();
        let active = guard.as_mut().ok_or_else(|| anyhow::anyhow!("no active recording"))?;
        active.monitor_id = Some(monitor_id.clone());
        self.screenshot_engine.lock().set_monitor_id(Some(monitor_id.clone()));
        if let Some(platform) = self.platform.try_lock() {
            let _ = self.recorder.lock().switch_monitor_with_platform(&platform, Some(monitor_id.clone()));
        }
        let _ = self.db.set_setting("selected_monitor_id", &monitor_id);
        Ok(())
    }

    fn rollback_failed_start(&self, session_id: &str) -> Result<()> {
        let _ = self.screenshot_engine.lock().stop(session_id);
        let _ = self.event_collector.lock().stop(session_id);
        if let Some(mut platform) = self.platform.try_lock() {
            let _ = platform.input.stop();
            let _ = platform.windows.stop();
            let _ = self.recorder.lock().stop_with_platform(&mut platform);
        }
        let _ = self.db.delete_session(session_id);
        Ok(())
    }
}

fn signal_platform_stop(state: &AppState) {
    for _ in 0..100 {
        if let Some(mut platform) = state.platform.try_lock() {
            platform.recorder.request_stop();
            platform.input.request_stop();
            platform.windows.request_stop();
            return;
        }
        thread::sleep(Duration::from_millis(2));
    }
}

fn stop_platform_services(state: &AppState) -> Result<Option<String>> {
    let deadline = Instant::now() + PLATFORM_STOP_TIMEOUT;
    while Instant::now() < deadline {
        if let Some(mut platform) = state.platform.try_lock() {
            platform.input.stop()?;
            platform.windows.stop()?;
            let video_path = state.recorder.lock().stop_with_platform(&mut platform)?;
            return Ok(video_path);
        }
        thread::sleep(Duration::from_millis(5));
    }

    anyhow::bail!("timed out while stopping recording services")
}

fn spawn_recording_collector(
    stop_flag: Arc<AtomicBool>,
    is_paused: Arc<AtomicBool>,
    db: Arc<Database>,
    platform: Arc<Mutex<PlatformServices>>,
    screenshot_engine: Arc<Mutex<ScreenshotEngine>>,
    browser_bridge: crate::platform::browser_bridge::BrowserBridgeState,
    session_id: String,
    session_dir: PathBuf,
) -> JoinHandle<()> {
    let capturer = SharedScreenshotCapturer;
    thread::spawn(move || {
        while !stop_flag.load(Ordering::SeqCst) {
            if is_paused.load(Ordering::SeqCst) {
                // Drain and discard any events while paused to avoid backlog
                if let Some(mut plat) = platform.try_lock() {
                    let _ = plat.input.drain_events();
                    let _ = plat.windows.drain_events();
                }
                thread::sleep(Duration::from_millis(150));
                continue;
            }

            let (input_events, window_events) = {
                let mut platform = platform.lock();
                if stop_flag.load(Ordering::SeqCst) {
                    break;
                }
                (
                    platform.input.drain_events(),
                    platform.windows.drain_events(),
                )
            };

            if stop_flag.load(Ordering::SeqCst) || is_paused.load(Ordering::SeqCst) {
                break;
            }

            let capture_all = db
                .get_setting("capture_all_events")
                .ok()
                .flatten()
                .map(|val| val == "true")
                .unwrap_or(false);

            let mut pending_captures = Vec::new();
            {
                let mut engine = screenshot_engine.lock();
                if engine.is_active() {
                    if let Ok(Some(pending)) =
                        engine.prepare_pending_post(&session_id, session_dir.clone())
                    {
                        pending_captures.push(pending);
                    }

                    for input in &input_events {
                        if stop_flag.load(Ordering::SeqCst) || is_paused.load(Ordering::SeqCst) {
                            break;
                        }
                        if capture_all || should_trigger_screenshot(input) {
                            if let Ok(Some(pending)) = engine.prepare_input_event(
                                &session_id,
                                session_dir.clone(),
                                input,
                            ) {
                                pending_captures.push(pending);
                            }
                        }
                    }

                    for window in &window_events {
                        if stop_flag.load(Ordering::SeqCst) {
                            break;
                        }
                        if let Ok(Some(pending)) = engine.prepare_window_change(
                            &session_id,
                            session_dir.clone(),
                            &window.app_name,
                            &window.title,
                            window.timestamp_ms,
                        ) {
                            pending_captures.push(pending);
                        }
                    }
                }
            }

            for pending in pending_captures {
                if stop_flag.load(Ordering::SeqCst) {
                    break;
                }
                execute_pending_capture(&screenshot_engine, &capturer, pending);
            }

            let mut batch = Vec::new();
            for input in input_events {
                if should_persist_event(&input.event_type) {
                    batch.push(stored_from_input(&session_id, input, &browser_bridge));
                }
            }
            for window in window_events {
                batch.push(stored_from_window(&session_id, window));
            }

            if !batch.is_empty() {
                let _ = db.insert_events(&batch);
            }

            if stop_flag.load(Ordering::SeqCst) {
                break;
            }

            thread::sleep(Duration::from_millis(150));
        }
    })
}

fn execute_pending_capture(
    screenshot_engine: &Arc<Mutex<ScreenshotEngine>>,
    capturer: &SharedScreenshotCapturer,
    pending: PendingCapture,
) {
    if run_capture(capturer, &pending).is_err() {
        return;
    }
    if let Some(engine) = screenshot_engine.try_lock_for(Duration::from_millis(500)) {
        let _ = engine.finish_capture(pending);
    }
}

fn should_persist_event(event_type: &str) -> bool {
    !matches!(event_type, "mouse_move")
}

fn stored_from_input(
    session_id: &str,
    mut event: crate::platform::CapturedInputEvent,
    browser_bridge: &crate::platform::browser_bridge::BrowserBridgeState,
) -> StoredEvent {
    if event.event_type == "mouse_click" || event.event_type == "mouse_double_click" {
        let x = event.payload.get("x").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
        let y = event.payload.get("y").and_then(|v| v.as_i64()).unwrap_or(0) as i32;

        // 1. Try matching with browser DOM event from the extension
        if let Some(dom) = browser_bridge.match_and_take_event(event.timestamp_ms, x, y) {
            if let Some(obj) = event.payload.as_object_mut() {
                if !dom.text.is_empty() {
                    obj.insert("element_name".to_string(), serde_json::Value::String(dom.text));
                }
                obj.insert("element_type".to_string(), serde_json::Value::String(dom.tag.to_lowercase()));
                obj.insert("url".to_string(), serde_json::Value::String(dom.url));
                obj.insert("page_title".to_string(), serde_json::Value::String(dom.page_title));
                if let Some(sel) = dom.selector {
                    obj.insert("selector".to_string(), serde_json::Value::String(sel));
                }
                if let Some(role) = dom.role {
                    obj.insert("element_role".to_string(), serde_json::Value::String(role));
                }
            }
        } else {
            // 2. Fallback to Windows UI Automation
            #[cfg(target_os = "windows")]
            {
                if let Some(uia) = crate::platform::windows_uia::get_element_at_point(x, y) {
                    if let Some(obj) = event.payload.as_object_mut() {
                        if !uia.name.is_empty() {
                            obj.insert("element_name".to_string(), serde_json::Value::String(uia.name));
                        }
                        let type_desc = if !uia.localized_type.is_empty() {
                            uia.localized_type
                        } else {
                            uia.control_type
                        };
                        if !type_desc.is_empty() {
                            obj.insert("element_type".to_string(), serde_json::Value::String(type_desc));
                        }
                        if let Some(cls) = uia.class_name {
                            obj.insert("class_name".to_string(), serde_json::Value::String(cls));
                        }
                    }
                }
            }
        }
    }

    StoredEvent {
        id: Uuid::new_v4().to_string(),
        session_id: session_id.to_string(),
        event_type: event.event_type,
        app_name: event.app_name,
        payload: event.payload.to_string(),
        created_at: Utc::now().to_rfc3339(),
        timestamp_ms: event.timestamp_ms,
    }
}

fn stored_from_window(session_id: &str, event: crate::platform::WindowInfo) -> StoredEvent {
    StoredEvent {
        id: Uuid::new_v4().to_string(),
        session_id: session_id.to_string(),
        event_type: "window_focus".to_string(),
        app_name: Some(event.app_name.clone()),
        payload: serde_json::json!({
            "title": event.title,
            "app_name": event.app_name,
        })
        .to_string(),
        created_at: Utc::now().to_rfc3339(),
        timestamp_ms: event.timestamp_ms,
    }
}
