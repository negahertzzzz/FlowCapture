use std::path::{Path, PathBuf};
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
    click_x: Option<i64>,
    click_y: Option<i64>,
}

pub struct PendingCapture {
    pub id: String,
    pub path: PathBuf,
    pub session_id: String,
    pub timestamp_ms: i64,
    pub trigger: String,
    pub click_x: Option<i64>,
    pub click_y: Option<i64>,
    pub monitor_id: Option<String>,
}

pub struct ScreenshotEngine {
    db: Arc<Database>,
    session_id: Option<String>,
    monitor_id: Option<String>,
    last_window_key: Option<String>,
    pending_post_capture: Option<PendingPostCapture>,
}

impl ScreenshotEngine {
    pub fn new(db: Arc<Database>) -> Self {
        Self {
            db,
            session_id: None,
            monitor_id: None,
            last_window_key: None,
            pending_post_capture: None,
        }
    }

    pub fn start(&mut self, session_id: &str, _session_dir: PathBuf, monitor_id: Option<String>) -> Result<()> {
        self.session_id = Some(session_id.to_string());
        self.monitor_id = monitor_id;
        self.last_window_key = None;
        self.pending_post_capture = None;
        Ok(())
    }

    pub fn stop(&mut self, session_id: &str) -> Result<()> {
        let _ = session_id;
        self.session_id = None;
        self.monitor_id = None;
        self.last_window_key = None;
        self.pending_post_capture = None;
        Ok(())
    }

    pub fn set_monitor_id(&mut self, monitor_id: Option<String>) {
        self.monitor_id = monitor_id;
    }

    pub fn is_active(&self) -> bool {
        self.session_id.is_some()
    }

    pub fn prepare_manual(
        &self,
        session_id: &str,
        session_dir: PathBuf,
    ) -> Result<PendingCapture> {
        self.plan_capture(session_id, session_dir, "manual_marker", now_ms(), None, None)
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
            pending.click_x,
            pending.click_y,
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

        let (click_x, click_y) = if event.event_type == "mouse_click" || event.event_type == "mouse_double_click" {
            let x = event.payload.get("x").and_then(|value| value.as_i64());
            let y = event.payload.get("y").and_then(|value| value.as_i64());
            (x, y)
        } else {
            (None, None)
        };

        let trigger = screenshot_trigger_label(event);
        let capture = self.plan_capture(
            session_id,
            session_dir,
            &trigger,
            event.timestamp_ms,
            click_x,
            click_y,
        )?;

        if event.event_type == "mouse_click" || event.event_type == "mouse_double_click" {
            self.pending_post_capture = Some(PendingPostCapture {
                due_at: Instant::now() + POST_CLICK_DELAY,
                trigger: format!("post_{trigger}"),
                timestamp_ms: event.timestamp_ms + POST_CLICK_DELAY.as_millis() as i64,
                click_x,
                click_y,
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
            self.plan_capture(session_id, session_dir, "window_change", timestamp_ms, None, None)?,
        ))
    }

    pub fn finish_capture(&self, pending: PendingCapture) -> Result<Screenshot> {
        let highlight_enabled = self
            .db
            .get_setting("highlight_clicks")
            .ok()
            .flatten()
            .map(|val| val != "false")
            .unwrap_or(true);

        if highlight_enabled {
            if let (Some(x), Some(y)) = (pending.click_x, pending.click_y) {
                let _ = highlight_click_on_image(&pending.path, x, y, pending.monitor_id.as_deref());
            }
        }

        let screenshot = Screenshot {
            id: pending.id,
            session_id: pending.session_id,
            path: pending.path.to_string_lossy().to_string(),
            timestamp_ms: pending.timestamp_ms,
            trigger: Some(pending.trigger),
            selected: 0,
            click_x: pending.click_x,
            click_y: pending.click_y,
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
        click_x: Option<i64>,
        click_y: Option<i64>,
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
            click_x,
            click_y,
            monitor_id: self.monitor_id.clone(),
        })
    }
}

pub fn run_capture(
    capturer: &dyn ScreenshotCapturer,
    pending: &PendingCapture,
) -> Result<()> {
    capturer.capture_monitor(pending.path.clone(), pending.monitor_id.as_deref())?;
    Ok(())
}

pub fn highlight_click_on_image(
    path: &Path,
    click_x: i64,
    click_y: i64,
    monitor_id: Option<&str>,
) -> Result<()> {
    if !path.is_file() {
        return Ok(());
    }
    let mut img = image::open(path)?.to_rgba8();
    let (width, height) = img.dimensions();
    if width == 0 || height == 0 {
        return Ok(());
    }

    // Determine coordinate scale factor and monitor origin offset
    let (cx, cy) = {
        #[cfg(not(target_os = "linux"))]
        {
            if let Ok(monitor) = crate::platform::find_monitor(monitor_id) {
                let mon_x = monitor.x().unwrap_or(0);
                let mon_y = monitor.y().unwrap_or(0);
                let mon_w = monitor.width().unwrap_or(width);
                let mon_h = monitor.height().unwrap_or(height);

                let rel_x = click_x - mon_x as i64;
                let rel_y = click_y - mon_y as i64;

                if mon_w > 0 && mon_h > 0 {
                    let scale_x = width as f64 / mon_w as f64;
                    let scale_y = height as f64 / mon_h as f64;
                    (
                        (rel_x as f64 * scale_x).round() as i32,
                        (rel_y as f64 * scale_y).round() as i32,
                    )
                } else {
                    (rel_x as i32, rel_y as i32)
                }
            } else {
                (click_x as i32, click_y as i32)
            }
        }
        #[cfg(target_os = "linux")]
        {
            let _ = monitor_id;
            (click_x as i32, click_y as i32)
        }
    };

    if cx < 0 || cx >= width as i32 || cy < 0 || cy >= height as i32 {
        return Ok(());
    }

    // High-visibility click cursor marker:
    // Center dot + dual contrast ring + outer subtle ripple
    let max_r = 30i32;
    for dy in -max_r..=max_r {
        for dx in -max_r..=max_r {
            let px = cx + dx;
            let py = cy + dy;
            if px < 0 || px >= width as i32 || py < 0 || py >= height as i32 {
                continue;
            }

            let dist_sq = dx * dx + dy * dy;
            let dist = (dist_sq as f64).sqrt();

            let color: Option<[u8; 4]> = if dist <= 4.0 {
                // Central bright dot
                Some([239, 68, 68, 255])
            } else if dist >= 13.0 && dist <= 17.0 {
                // Main neon ring
                Some([239, 68, 68, 230])
            } else if (dist > 17.0 && dist <= 19.5) || (dist >= 10.5 && dist < 13.0) {
                // White outline for contrast against both dark and light backgrounds
                Some([255, 255, 255, 220])
            } else if dist > 19.5 && dist <= 28.0 {
                // Outer translucent ripple
                Some([239, 68, 68, 55])
            } else {
                None
            };

            if let Some(c) = color {
                let existing = img.get_pixel_mut(px as u32, py as u32);
                let alpha = c[3] as f32 / 255.0;
                let inv_alpha = 1.0 - alpha;
                existing[0] = (c[0] as f32 * alpha + existing[0] as f32 * inv_alpha) as u8;
                existing[1] = (c[1] as f32 * alpha + existing[1] as f32 * inv_alpha) as u8;
                existing[2] = (c[2] as f32 * alpha + existing[2] as f32 * inv_alpha) as u8;
            }
        }
    }

    img.save(path)?;
    Ok(())
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}
