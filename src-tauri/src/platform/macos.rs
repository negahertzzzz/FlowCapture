use anyhow::Result;

use super::common::{SharedInputSource, SharedScreenshotCapturer, SharedWindowTracker};
use super::macos_recorder::MacScreenRecorder;
use super::PlatformServices;

pub struct MacPlatform;

impl MacPlatform {
    pub fn new() -> Result<PlatformServices> {
        Ok(PlatformServices {
            recorder: Box::new(MacScreenRecorder::default()),
            input: Box::new(SharedInputSource::default()),
            windows: Box::new(SharedWindowTracker::default()),
            screenshots: Box::new(SharedScreenshotCapturer),
            platform_name: "macOS".to_string(),
        })
    }
}
