use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use anyhow::Result;
use uuid::Uuid;

use crate::events::{screenshot_trigger_label, should_trigger_screenshot};
use crate::platform::{CapturedInputEvent, ScreenshotCapturer};
use crate::storage::Database;
use crate::storage::models::Screenshot;

const POST_CLICK_DELAY: Duration = Duration::from_millis(300);

struct PendingPostCapture {
    due_at: Instant,
    trigger: String,
    timestamp_ms: i64,
}

pub struct PendingCapture {
    pub id: String,
    pub path: PathBuf,
    pub session_id: String,
    pub timestamp_ms: i64,
    pub trigger: String,
}

pub struct ScreenshotEngine {
    db: Arc<Database>,
    session_id: Option<String>,
    last_window_key: Option<String>,
    pending_post_capture: Option<PendingPostCapture>,
}

impl ScreenshotEngine {
    pub fn new(db: Arc<Database>) -> Self {
        Self {
            db,
            session_id: None,
            last_window_key: None,
            pending_post_capture: None,
        }
    }

    pub fn start(&mut self, session_id: &str, _session_dir: PathBuf) -> Result<()> {
        self.session_id = Some(session_id.to_string());
        self.last_window_key = None;
        self.pending_post_capture = None;
        Ok(())
    }

    pub fn stop(&mut self, session_id: &str) -> Result<()> {
        let _ = session_id;
        self.session_id = None;
        self.last_window_key = None;
        self.pending_post_capture = None;
        Ok(())
    }

    pub fn is_active(&self) -> bool {
        self.session_id.is_some()
    }

    pub fn prepare_manual(
        &self,
        session_id: &str,
        session_dir: PathBuf,
    ) -> Result<PendingCapture> {
        self.plan_capture(session_id, session_dir, "manual_marker", now_ms())
    }

    pub fn prepare_pending_post(
        &mut self,
        session_id: &str,
        session_dir: PathBuf,
    ) -> Result<Option<PendingCapture>> {
        if !self.is_active() {
            return Ok(None);
        }
        let due = self
            .pending_post_capture
            .as_ref()
            .map(|pending| pending.due_at)
            .filter(|due_at| Instant::now() >= *due_at);

        if due.is_none() {
            return Ok(None);
        }

        let pending = self
            .pending_post_capture
            .take()
            .expect("pending capture checked above");

        Ok(Some(self.plan_capture(
            session_id,
            session_dir,
            &pending.trigger,
            pending.timestamp_ms,
        )?))
    }

    pub fn prepare_input_event(
        &mut self,
        session_id: &str,
        session_dir: PathBuf,
        event: &CapturedInputEvent,
    ) -> Result<Option<PendingCapture>> {
        if !self.is_active() || !should_trigger_screenshot(event) {
            return Ok(None);
        }

        let trigger = screenshot_trigger_label(event);
        let capture = self.plan_capture(
            session_id,
            session_dir,
            &trigger,
            event.timestamp_ms,
        )?;

        if event.event_type == "mouse_click" {
            self.pending_post_capture = Some(PendingPostCapture {
                due_at: Instant::now() + POST_CLICK_DELAY,
                trigger: format!("post_{trigger}"),
                timestamp_ms: event.timestamp_ms + POST_CLICK_DELAY.as_millis() as i64,
            });
        }

        Ok(Some(capture))
    }

    pub fn prepare_window_change(
        &mut self,
        session_id: &str,
        session_dir: PathBuf,
        app_name: &str,
        window_title: &str,
        timestamp_ms: i64,
    ) -> Result<Option<PendingCapture>> {
        if !self.is_active() {
            return Ok(None);
        }

        let window_key = format!("{app_name}::{window_title}");
        if self.last_window_key.as_deref() == Some(window_key.as_str()) {
            return Ok(None);
        }
        self.last_window_key = Some(window_key);
        Ok(Some(
            self.plan_capture(session_id, session_dir, "window_change", timestamp_ms)?,
        ))
    }

    pub fn finish_capture(&self, pending: PendingCapture) -> Result<Screenshot> {
        let screenshot = Screenshot {
            id: pending.id,
            session_id: pending.session_id,
            path: pending.path.to_string_lossy().to_string(),
            timestamp_ms: pending.timestamp_ms,
            trigger: Some(pending.trigger),
            selected: 0,
        };
        self.db.insert_screenshot(&screenshot)?;
        Ok(screenshot)
    }

    fn plan_capture(
        &self,
        session_id: &str,
        session_dir: PathBuf,
        trigger: &str,
        timestamp_ms: i64,
    ) -> Result<PendingCapture> {
        if self.session_id.is_none() {
            anyhow::bail!("recording is not active");
        }
        let id = Uuid::new_v4().to_string();
        let screenshots_dir = session_dir.join("screenshots");
        std::fs::create_dir_all(&screenshots_dir)?;
        let path = screenshots_dir.join(format!("{id}.png"));
        Ok(PendingCapture {
            id,
            path,
            session_id: session_id.to_string(),
            timestamp_ms,
            trigger: trigger.to_string(),
        })
    }
}

pub fn run_capture(
    capturer: &dyn ScreenshotCapturer,
    pending: &PendingCapture,
) -> Result<()> {
    capturer.capture_primary_monitor(pending.path.clone())?;
    Ok(())
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}
