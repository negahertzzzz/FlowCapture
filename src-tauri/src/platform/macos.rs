use anyhow::Result;

use super::common::{SharedInputSource, SharedWindowTracker};
use super::macos_recorder::MacScreenRecorder;
use super::PlatformServices;

pub struct MacPlatform;

impl MacPlatform {
    pub fn new() -> Result<PlatformServices> {
        Ok(PlatformServices {
            recorder: Box::new(MacScreenRecorder::default()),
            input: Box::new(SharedInputSource::default()),
            windows: Box::new(SharedWindowTracker::default()),
            platform_name: "macOS".to_string(),
        })
    }
}

/// `tauri dev` embeds `.icns` bytes for the dock icon, which can drop alpha and look
/// oversized/square. Re-apply our PNG (squircle + padding) after startup.
#[cfg(all(debug_assertions, target_os = "macos"))]
pub fn refresh_dev_dock_icon() {
    use objc2::{AllocAnyThread, MainThreadMarker};
    use objc2_app_kit::{NSApplication, NSImage};
    use objc2_foundation::NSData;

    let Some(mtm) = MainThreadMarker::new() else {
        return;
    };

    let bytes = include_bytes!(concat!(env!("CARGO_MANIFEST_DIR"), "/app-icon.png"));
    let data = NSData::with_bytes(bytes);
    let Some(app_icon) = NSImage::initWithData(NSImage::alloc(), &data) else {
        return;
    };
    app_icon.setSize(objc2_foundation::NSSize::new(1024.0, 1024.0));

    let app = NSApplication::sharedApplication(mtm);
    unsafe { app.setApplicationIconImage(Some(&app_icon)) };
}
