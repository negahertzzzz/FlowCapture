//! In-memory screen frames and pixel-exact frame comparison.
//!
//! Used to (1) drop near-identical screenshots at capture time and (2) wait for the screen to
//! settle after a click. Comparisons run on the full-resolution RGBA buffers: every pixel is
//! checked, only the cursor/hover neighbourhood can be excluded.

use std::path::Path;
use std::sync::Arc;

use anyhow::Result;
use image::RgbaImage;

/// Per-channel difference below which two pixels count as equal (absorbs dithering and
/// sub-pixel font rendering jitter, never real UI changes).
const CHANNEL_TOLERANCE: u8 = 12;

#[derive(Clone)]
pub struct Frame {
    pub image: Arc<RgbaImage>,
    /// Top-left of the captured monitor in global (input) coordinates.
    pub origin: (i64, i64),
    /// Image pixels per input-coordinate unit (1.0 on Windows, 2.0 on Retina macOS…).
    pub scale: (f64, f64),
}

impl Frame {
    #[cfg(any(test, target_os = "linux"))]
    pub fn from_image(image: RgbaImage) -> Self {
        Self {
            image: Arc::new(image),
            origin: (0, 0),
            scale: (1.0, 1.0),
        }
    }

    /// Converts a global mouse position into this frame's pixel coordinates.
    pub fn to_image_coords(&self, x: i64, y: i64) -> (i64, i64) {
        (
            ((x - self.origin.0) as f64 * self.scale.0).round() as i64,
            ((y - self.origin.1) as f64 * self.scale.1).round() as i64,
        )
    }

    /// Global mouse position -> pixel inside this frame, or `None` when it falls outside
    /// (the click happened on another monitor).
    pub fn click_in_image(&self, x: i64, y: i64) -> Option<(i64, i64)> {
        let (ix, iy) = self.to_image_coords(x, y);
        let (width, height) = self.image.dimensions();
        (ix >= 0 && iy >= 0 && ix < width as i64 && iy < height as i64).then_some((ix, iy))
    }

    /// Square of side `2 * radius` (in input units) centred on a global mouse position.
    pub fn region_around(&self, x: i64, y: i64, radius: i64) -> Rect {
        let (cx, cy) = self.to_image_coords(x, y);
        let rx = (radius as f64 * self.scale.0).round() as i64;
        let ry = (radius as f64 * self.scale.1).round() as i64;
        Rect { x0: cx - rx, y0: cy - ry, x1: cx + rx, y1: cy + ry }
    }

    pub fn save_png(&self, path: &Path) -> Result<()> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        // Write next to the target and rename, so a crash never leaves a truncated PNG
        // behind that the UI or the exporter would try to read.
        let tmp = path.with_extension("png.part");
        self.image.save_with_format(&tmp, image::ImageFormat::Png)?;
        std::fs::rename(&tmp, path)?;
        Ok(())
    }
}

/// Half-open pixel rectangle `[x0, x1) × [y0, y1)`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Rect {
    pub x0: i64,
    pub y0: i64,
    pub x1: i64,
    pub y1: i64,
}

impl Rect {
    pub fn width(&self) -> i64 {
        (self.x1 - self.x0).max(0)
    }

    pub fn height(&self) -> i64 {
        (self.y1 - self.y0).max(0)
    }

    fn contains(&self, x: i64, y: i64) -> bool {
        x >= self.x0 && x < self.x1 && y >= self.y0 && y < self.y1
    }

    fn include(&mut self, x: i64, y: i64) {
        self.x0 = self.x0.min(x);
        self.y0 = self.y0.min(y);
        self.x1 = self.x1.max(x + 1);
        self.y1 = self.y1.max(y + 1);
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct FrameDiff {
    /// Pixels (outside the excluded regions) whose colour changed beyond the tolerance.
    pub changed: u64,
    /// Bounding box of the changed pixels.
    pub bbox: Option<Rect>,
}

impl FrameDiff {
    #[cfg(test)]
    pub fn is_identical(&self) -> bool {
        self.changed == 0
    }
}

/// Compares two frames pixel by pixel. Returns `None` when the sizes differ (monitor switch,
/// resolution change), which callers must treat as "different".
pub fn diff_frames(a: &RgbaImage, b: &RgbaImage, exclude: &[Rect]) -> Option<FrameDiff> {
    if a.dimensions() != b.dimensions() {
        return None;
    }
    let (width, height) = a.dimensions();
    let row_len = width as usize * 4;
    let raw_a = a.as_raw();
    let raw_b = b.as_raw();

    let mut changed = 0u64;
    let mut bbox: Option<Rect> = None;

    for y in 0..height as usize {
        let row_a = &raw_a[y * row_len..(y + 1) * row_len];
        let row_b = &raw_b[y * row_len..(y + 1) * row_len];
        // Fast path: identical rows are by far the common case.
        if row_a == row_b {
            continue;
        }
        let yi = y as i64;
        let row_excludes: Vec<&Rect> = exclude.iter().filter(|r| yi >= r.y0 && yi < r.y1).collect();
        for (x, (pa, pb)) in row_a.chunks_exact(4).zip(row_b.chunks_exact(4)).enumerate() {
            if pa == pb {
                continue;
            }
            let differs = pa
                .iter()
                .zip(pb)
                .take(3)
                .any(|(ca, cb)| ca.abs_diff(*cb) > CHANNEL_TOLERANCE);
            if !differs {
                continue;
            }
            let xi = x as i64;
            if row_excludes.iter().any(|r| r.contains(xi, yi)) {
                continue;
            }
            changed += 1;
            match bbox.as_mut() {
                Some(rect) => rect.include(xi, yi),
                None => bbox = Some(Rect { x0: xi, y0: yi, x1: xi + 1, y1: yi + 1 }),
            }
        }
    }

    Some(FrameDiff { changed, bbox })
}

/// A change too small to deserve its own screenshot: nothing at all, a handful of noisy
/// pixels, or a blinking text caret (a thin vertical/horizontal line). Anything with a real
/// area — a ticked checkbox, a new character, a hover highlight outside the cursor zone —
/// counts as a change, so no meaningful step is ever dropped.
pub fn is_insignificant(diff: &FrameDiff, scale: f64) -> bool {
    if diff.changed <= 16 {
        return true;
    }
    let Some(bbox) = diff.bbox else {
        return true;
    };
    let thin = (4.0 * scale.max(1.0)).ceil() as i64;
    let caret_like = bbox.width() <= thin || bbox.height() <= thin;
    caret_like && diff.changed <= (60.0 * scale.max(1.0)).ceil() as u64 * thin as u64
}

/// Captures the given monitor into memory (no disk I/O, no PNG encoding).
#[cfg(not(target_os = "linux"))]
pub fn capture_frame(monitor_id: Option<&str>) -> Result<Frame> {
    let monitor = crate::platform::find_monitor(monitor_id)?;
    let image = monitor.capture_image()?;
    let (img_w, img_h) = image.dimensions();
    let mon_w = monitor.width().unwrap_or(img_w).max(1);
    let mon_h = monitor.height().unwrap_or(img_h).max(1);
    Ok(Frame {
        origin: (monitor.x().unwrap_or(0) as i64, monitor.y().unwrap_or(0) as i64),
        scale: (img_w as f64 / mon_w as f64, img_h as f64 / mon_h as f64),
        image: Arc::new(image),
    })
}

/// Linux captures go through external tools on Wayland, so they land on disk first.
#[cfg(target_os = "linux")]
pub fn capture_frame(_monitor_id: Option<&str>) -> Result<Frame> {
    let tmp = std::env::temp_dir().join(format!("flowcapture-frame-{}.png", uuid::Uuid::new_v4()));
    let result = crate::platform::linux_capture::capture_primary_monitor(tmp.clone())
        .and_then(|path| Ok(image::open(&path)?.to_rgba8()));
    let _ = std::fs::remove_file(&tmp);
    Ok(Frame::from_image(result?))
}

/// Whether frames are cheap enough to poll several times per second.
pub fn supports_fast_sampling() -> bool {
    cfg!(not(target_os = "linux"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::Rgba;

    fn solid(w: u32, h: u32) -> RgbaImage {
        RgbaImage::from_pixel(w, h, Rgba([30, 30, 30, 255]))
    }

    #[test]
    fn identical_frames_have_no_changes() {
        let a = solid(200, 100);
        let diff = diff_frames(&a, &a.clone(), &[]).unwrap();
        assert!(diff.is_identical());
        assert!(is_insignificant(&diff, 1.0));
    }

    #[test]
    fn tolerance_absorbs_tiny_colour_jitter() {
        let a = solid(50, 50);
        let mut b = a.clone();
        b.put_pixel(10, 10, Rgba([36, 30, 30, 255]));
        assert!(diff_frames(&a, &b, &[]).unwrap().is_identical());
    }

    #[test]
    fn caret_blink_is_insignificant_but_checkbox_is_not() {
        let a = solid(400, 300);
        let mut caret = a.clone();
        for y in 100..120 {
            caret.put_pixel(50, y, Rgba([255, 255, 255, 255]));
            caret.put_pixel(51, y, Rgba([255, 255, 255, 255]));
        }
        let diff = diff_frames(&a, &caret, &[]).unwrap();
        assert_eq!(diff.changed, 40);
        assert!(is_insignificant(&diff, 1.0));

        let mut checkbox = a.clone();
        for y in 200..212 {
            for x in 200..212 {
                checkbox.put_pixel(x, y, Rgba([0, 200, 120, 255]));
            }
        }
        let diff = diff_frames(&a, &checkbox, &[]).unwrap();
        assert_eq!(diff.changed, 144);
        assert!(!is_insignificant(&diff, 1.0));
    }

    #[test]
    fn excluded_regions_are_ignored() {
        let a = solid(300, 300);
        let mut b = a.clone();
        for y in 140..160 {
            for x in 140..160 {
                b.put_pixel(x, y, Rgba([200, 0, 0, 255]));
            }
        }
        let frame = Frame::from_image(a.clone());
        let zone = frame.region_around(150, 150, 20);
        assert!(diff_frames(&a, &b, &[zone]).unwrap().is_identical());
        assert_eq!(diff_frames(&a, &b, &[]).unwrap().changed, 400);
    }

    #[test]
    fn size_mismatch_is_reported() {
        assert!(diff_frames(&solid(10, 10), &solid(10, 11), &[]).is_none());
    }

    #[test]
    fn clicks_outside_the_captured_monitor_are_dropped() {
        let frame = Frame {
            image: Arc::new(solid(1920, 1080)),
            origin: (1920, 0),
            scale: (1.0, 1.0),
        };
        assert_eq!(frame.click_in_image(2500, 300), Some((580, 300)));
        assert_eq!(frame.click_in_image(500, 300), None);
    }

    #[test]
    fn maps_global_coords_through_origin_and_scale() {
        let frame = Frame {
            image: Arc::new(solid(10, 10)),
            origin: (-1920, 0),
            scale: (2.0, 2.0),
        };
        assert_eq!(frame.to_image_coords(-1900, 5), (40, 10));
    }
}
