//! Off-thread screenshot persistence and the adaptive post-click wait.
//!
//! The recording loop only grabs frames into memory; PNG encoding (100–300 ms for a 4K frame),
//! the near-duplicate check and the database insert happen on a dedicated writer thread so the
//! loop keeps draining input events on time.

use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::Arc;
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use parking_lot::Mutex;

use super::frame::{diff_frames, is_insignificant, Frame, Rect};
use super::{PendingCapture, ScreenshotEngine};
use crate::storage::Database;
use crate::thread_util::join_thread_with_timeout;

/// Half-size (in input units) of the zone ignored around the mouse: the pointer itself, the
/// pressed/hover state of the element under it, small tooltips.
const CURSOR_ZONE_RADIUS: i64 = 60;

pub struct CaptureJob {
    pub pending: PendingCapture,
    pub frame: Frame,
    /// Mouse position (global coordinates) when the frame was taken.
    pub cursor: Option<(i64, i64)>,
}

struct SavedCapture {
    id: String,
    path: std::path::PathBuf,
    trigger: String,
    click: Option<(i64, i64)>,
    cursor: Option<(i64, i64)>,
    frame: Frame,
}

#[derive(Debug, PartialEq, Eq)]
enum Decision {
    Keep,
    /// Same picture as the previous capture, which only showed a result: keep the new one
    /// (it carries this action's click marker) and delete the previous.
    ReplacePrevious,
    Drop,
}

pub struct ScreenshotWriter {
    tx: Option<Sender<CaptureJob>>,
    handle: Option<JoinHandle<()>>,
}

impl ScreenshotWriter {
    pub fn spawn(engine: Arc<Mutex<ScreenshotEngine>>, db: Arc<Database>, dedupe: bool) -> Self {
        let (tx, rx) = mpsc::channel::<CaptureJob>();
        let handle = thread::Builder::new()
            .name("screenshot-writer".to_string())
            .spawn(move || run_writer(rx, engine, db, dedupe))
            .ok();
        Self { tx: Some(tx), handle }
    }

    pub fn submit(&self, job: CaptureJob) {
        if let Some(tx) = &self.tx {
            let _ = tx.send(job);
        }
    }

    /// Closes the queue and waits for every queued screenshot to be written.
    pub fn finish(mut self, timeout: Duration) -> bool {
        self.tx.take();
        match self.handle.take() {
            Some(handle) => join_thread_with_timeout(handle, timeout),
            None => true,
        }
    }
}

fn run_writer(rx: Receiver<CaptureJob>, engine: Arc<Mutex<ScreenshotEngine>>, db: Arc<Database>, dedupe: bool) {
    let mut last: Option<SavedCapture> = None;
    for job in rx {
        let decision = if dedupe { decide(last.as_ref(), &job) } else { Decision::Keep };
        match decision {
            Decision::Drop => {
                eprintln!("FlowCapture: skipped near-duplicate screenshot ({})", job.pending.trigger);
                continue;
            }
            Decision::ReplacePrevious => {
                if let Some(previous) = last.take() {
                    let _ = db.delete_screenshot(&previous.id);
                    let _ = std::fs::remove_file(&previous.path);
                }
            }
            Decision::Keep => {}
        }

        if let Err(err) = job.frame.save_png(&job.pending.path) {
            eprintln!("FlowCapture: failed to save screenshot: {err:#}");
            continue;
        }

        let saved = SavedCapture {
            id: job.pending.id.clone(),
            path: job.pending.path.clone(),
            trigger: job.pending.trigger.clone(),
            click: job.pending.click_x.zip(job.pending.click_y),
            cursor: job.cursor,
            frame: job.frame,
        };
        let inserted = engine.lock().finish_capture(job.pending);
        match inserted {
            Ok(_) => last = Some(saved),
            Err(err) => {
                eprintln!("FlowCapture: failed to record screenshot: {err:#}");
                let _ = std::fs::remove_file(&saved.path);
            }
        }
    }
}

fn decide(last: Option<&SavedCapture>, job: &CaptureJob) -> Decision {
    let Some(last) = last else {
        return Decision::Keep;
    };
    let new_click = job.pending.click_x.zip(job.pending.click_y);

    // Hover/pressed states under the pointer are not a reason to keep a second screenshot.
    let mut zones: Vec<Rect> = Vec::new();
    for (x, y) in [new_click, last.click, job.cursor, last.cursor].into_iter().flatten() {
        zones.push(job.frame.region_around(x, y, CURSOR_ZONE_RADIUS));
    }

    let Some(diff) = diff_frames(&last.frame.image, &job.frame.image, &zones) else {
        return Decision::Keep;
    };
    if !is_insignificant(&diff, job.frame.scale.0) {
        return Decision::Keep;
    }

    let new_is_post = job.pending.trigger.starts_with("post_");
    let last_is_post = last.trigger.starts_with("post_");
    match (new_click, last.click) {
        // The click changed nothing visible: the "before" shot already tells the story.
        _ if new_is_post => Decision::Drop,
        // Two different clicks on the same screen are two different steps.
        (Some(a), Some(b)) if !last_is_post && far_apart(a, b) => Decision::Keep,
        (Some(_), _) if last_is_post || last.click.is_none() => Decision::ReplacePrevious,
        _ => Decision::Drop,
    }
}

fn far_apart(a: (i64, i64), b: (i64, i64)) -> bool {
    (a.0 - b.0).abs() > 8 || (a.1 - b.1).abs() > 8
}

/// Waits for the screen to stop changing after a click (instead of a fixed delay), so slow
/// pages are not captured half-loaded.
///
/// Rules, evaluated on every sample (every ~120 ms, at most 2 s):
/// * the zone around the mouse path since the previous sample is ignored, and a sample where
///   the mouse travelled far does not count as "still" (hover effects are moving with it);
/// * once the screen differs from the pre-click frame and two consecutive samples match, the
///   UI has settled → capture;
/// * if nothing has changed at all after 700 ms, the click had no visible effect → capture;
/// * after 2 s capture anyway (spinners, videos, animations never settle).
pub struct PostClickSampler {
    pub trigger: String,
    pub click: Option<(i64, i64)>,
    reference: Frame,
    previous: Option<Frame>,
    started: Instant,
    next_sample: Instant,
    changed_since_click: bool,
    mouse_path: Option<Rect>,
    fast: bool,
}

pub const POST_CLICK_MIN_DELAY: Duration = Duration::from_millis(200);
pub const POST_CLICK_SAMPLE_INTERVAL: Duration = Duration::from_millis(120);
pub const POST_CLICK_QUIET_NO_CHANGE: Duration = Duration::from_millis(700);
pub const POST_CLICK_MAX_WAIT: Duration = Duration::from_millis(2000);
/// Fixed delay used where frames are too expensive to poll (Wayland portals).
pub const POST_CLICK_FIXED_DELAY: Duration = Duration::from_millis(300);
/// Mouse travel (input units) between two samples beyond which the user is still moving.
const MOUSE_STILL_SPAN: i64 = 240;

impl PostClickSampler {
    pub fn new(trigger: String, click: Option<(i64, i64)>, reference: Frame, fast: bool) -> Self {
        let now = Instant::now();
        let first = if fast { POST_CLICK_MIN_DELAY } else { POST_CLICK_FIXED_DELAY };
        Self {
            trigger,
            click,
            reference,
            previous: None,
            started: now,
            next_sample: now + first,
            changed_since_click: false,
            mouse_path: None,
            fast,
        }
    }

    pub fn is_due(&self, now: Instant) -> bool {
        now >= self.next_sample
    }

    /// Records a mouse position observed since the last sample (global coordinates).
    pub fn track_mouse(&mut self, x: i64, y: i64) {
        match self.mouse_path.as_mut() {
            Some(rect) => {
                rect.x0 = rect.x0.min(x);
                rect.y0 = rect.y0.min(y);
                rect.x1 = rect.x1.max(x + 1);
                rect.y1 = rect.y1.max(y + 1);
            }
            None => self.mouse_path = Some(Rect { x0: x, y0: y, x1: x + 1, y1: y + 1 }),
        }
    }

    /// Feeds a new frame; returns it back when it is the one to save.
    pub fn offer(&mut self, frame: Frame, cursor: Option<(i64, i64)>, now: Instant) -> Option<Frame> {
        let elapsed = now.duration_since(self.started);
        if !self.fast || elapsed >= POST_CLICK_MAX_WAIT {
            return Some(frame);
        }

        if let Some((x, y)) = cursor {
            self.track_mouse(x, y);
        }
        let path = self.mouse_path.take();
        // Keep the current position as the start of the next segment.
        if let Some((x, y)) = cursor {
            self.track_mouse(x, y);
        }
        let mouse_still = path
            .map(|rect| rect.width() <= MOUSE_STILL_SPAN && rect.height() <= MOUSE_STILL_SPAN)
            .unwrap_or(true);

        let mut zones: Vec<Rect> = Vec::new();
        if let Some(rect) = path {
            let (x0, y0) = frame.to_image_coords(rect.x0 - CURSOR_ZONE_RADIUS, rect.y0 - CURSOR_ZONE_RADIUS);
            let (x1, y1) = frame.to_image_coords(rect.x1 + CURSOR_ZONE_RADIUS, rect.y1 + CURSOR_ZONE_RADIUS);
            zones.push(Rect { x0, y0, x1, y1 });
        }
        let mut ref_zones = zones.clone();
        if let Some((x, y)) = self.click {
            ref_zones.push(frame.region_around(x, y, CURSOR_ZONE_RADIUS));
        }

        let scale = frame.scale.0;
        let vs_reference = diff_frames(&self.reference.image, &frame.image, &ref_zones);
        if vs_reference.map_or(true, |diff| !is_insignificant(&diff, scale)) {
            self.changed_since_click = true;
        }

        let settled = match &self.previous {
            Some(previous) => {
                mouse_still
                    && diff_frames(&previous.image, &frame.image, &zones)
                        .is_some_and(|diff| is_insignificant(&diff, scale))
            }
            None => false,
        };

        let ready = settled && (self.changed_since_click || elapsed >= POST_CLICK_QUIET_NO_CHANGE);
        if ready {
            return Some(frame);
        }
        self.previous = Some(frame);
        self.next_sample = now + POST_CLICK_SAMPLE_INTERVAL;
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{Rgba, RgbaImage};

    fn frame_with_box(color: [u8; 4], box_at: Option<(u32, u32)>) -> Frame {
        let mut img = RgbaImage::from_pixel(400, 300, Rgba([20, 20, 20, 255]));
        if let Some((bx, by)) = box_at {
            for y in by..by + 30 {
                for x in bx..bx + 30 {
                    img.put_pixel(x, y, Rgba(color));
                }
            }
        }
        Frame::from_image(img)
    }

    fn sampler(reference: Frame) -> PostClickSampler {
        PostClickSampler::new("mouse_click".into(), Some((10, 10)), reference, true)
    }

    #[test]
    fn waits_until_the_page_stops_changing() {
        let reference = frame_with_box([0, 0, 0, 255], None);
        let mut s = sampler(reference);
        let t0 = s.started;
        let at = |ms| t0 + Duration::from_millis(ms);
        // Page still loading: content keeps moving.
        assert!(s.offer(frame_with_box([200, 0, 0, 255], Some((100, 100))), Some((10, 10)), at(200)).is_none());
        assert!(s.offer(frame_with_box([200, 0, 0, 255], Some((150, 100))), Some((10, 10)), at(320)).is_none());
        // Two identical samples after a change → settled.
        assert!(s.offer(frame_with_box([200, 0, 0, 255], Some((150, 100))), Some((10, 10)), at(440)).is_some());
    }

    #[test]
    fn does_not_capture_before_a_slow_page_starts_changing() {
        let reference = frame_with_box([0, 0, 0, 255], None);
        let mut s = sampler(reference.clone());
        let t0 = s.started;
        let at = |ms| t0 + Duration::from_millis(ms);
        assert!(s.offer(reference.clone(), Some((10, 10)), at(200)).is_none());
        assert!(s.offer(reference.clone(), Some((10, 10)), at(320)).is_none(), "stable but nothing changed yet");
        assert!(s.offer(reference.clone(), Some((10, 10)), at(700)).is_some(), "no visible effect after 700ms");
    }

    #[test]
    fn mouse_hover_changes_are_ignored_but_big_moves_are_not_still() {
        let reference = frame_with_box([0, 0, 0, 255], None);
        let mut s = sampler(reference);
        let t0 = s.started;
        let at = |ms| t0 + Duration::from_millis(ms);
        let loaded = frame_with_box([0, 200, 0, 255], Some((300, 200)));
        assert!(s.offer(loaded.clone(), Some((20, 20)), at(200)).is_none());
        // The mouse sweeps across the screen: not still yet.
        s.track_mouse(250, 150);
        assert!(s.offer(loaded.clone(), Some((390, 290)), at(320)).is_none());
        // Mouse rests; only its hover highlight differs, inside the ignored zone.
        let mut hovered = (*loaded.image).clone();
        for y in 280..295 {
            for x in 370..395 {
                hovered.put_pixel(x, y, Rgba([90, 90, 250, 255]));
            }
        }
        assert!(s.offer(Frame::from_image(hovered), Some((390, 290)), at(440)).is_some());
    }

    #[test]
    fn gives_up_after_max_wait() {
        let reference = frame_with_box([0, 0, 0, 255], None);
        let mut s = sampler(reference);
        let t0 = s.started;
        let spinner = frame_with_box([200, 200, 0, 255], Some((200, 150)));
        assert!(s.offer(spinner, None, t0 + POST_CLICK_MAX_WAIT).is_some());
    }

    fn pending(trigger: &str, click: Option<(i64, i64)>) -> PendingCapture {
        PendingCapture {
            id: "n".into(),
            path: std::env::temp_dir().join("n.png"),
            session_id: "s".into(),
            timestamp_ms: 0,
            trigger: trigger.into(),
            click_x: click.map(|c| c.0),
            click_y: click.map(|c| c.1),
            monitor_id: None,
        }
    }

    fn saved(trigger: &str, click: Option<(i64, i64)>, frame: Frame) -> SavedCapture {
        SavedCapture {
            id: "p".into(),
            path: std::env::temp_dir().join("p.png"),
            trigger: trigger.into(),
            click,
            cursor: click,
            frame,
        }
    }

    #[test]
    fn dedupe_decisions() {
        let screen = frame_with_box([0, 120, 0, 255], Some((50, 50)));
        let changed = frame_with_box([0, 120, 0, 255], Some((250, 200)));
        let job = |trigger: &str, click, frame: &Frame| CaptureJob {
            pending: pending(trigger, click),
            frame: frame.clone(),
            cursor: click,
        };

        // Different picture → always kept.
        let last = saved("post_mouse_click", Some((5, 5)), screen.clone());
        assert_eq!(decide(Some(&last), &job("mouse_click", Some((5, 5)), &changed)), Decision::Keep);
        // Previous "after click" identical to the next "before click" → keep the one with the marker.
        assert_eq!(decide(Some(&last), &job("mouse_click", Some((300, 20)), &screen)), Decision::ReplacePrevious);
        // Click with no visible effect → drop the "after" shot.
        let last = saved("mouse_click", Some((300, 20)), screen.clone());
        assert_eq!(decide(Some(&last), &job("post_mouse_click", Some((300, 20)), &screen)), Decision::Drop);
        // Two clicks at different spots on the same screen are two steps.
        assert_eq!(decide(Some(&last), &job("mouse_click", Some((20, 250)), &screen)), Decision::Keep);
        // Same window re-focused without visual change.
        assert_eq!(decide(Some(&last), &job("window_change", None, &screen)), Decision::Drop);
    }
}
