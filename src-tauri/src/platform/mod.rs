mod common;
#[cfg(target_os = "linux")]
mod linux;
mod macos;
#[cfg(target_os = "macos")]
mod macos_recorder;
mod permissions;
mod traits;
#[cfg(target_os = "windows")]
mod windows;

pub use permissions::{
    check_recording_permissions, open_accessibility_settings, open_screen_recording_settings,
    preflight_recording_start, prepare_recording_permissions, request_accessibility_permission,
    reveal_executable_in_finder, RecordingPermissions,
};
#[cfg(all(debug_assertions, target_os = "macos"))]
pub use macos::refresh_dev_dock_icon;
pub use traits::*;

use anyhow::Result;

pub fn create_platform_services() -> Result<PlatformServices> {
    #[cfg(target_os = "macos")]
    {
        return macos::MacPlatform::new();
    }
    #[cfg(target_os = "windows")]
    {
        return Ok(windows::WindowsPlatform::new()?.into_services());
    }
    #[cfg(target_os = "linux")]
    {
        return Ok(linux::LinuxPlatform::new()?.into_services());
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        anyhow::bail!("unsupported platform")
    }
}

pub struct PlatformServices {
    pub recorder: Box<dyn ScreenRecorder>,
    pub input: Box<dyn InputEventSource>,
    pub windows: Box<dyn WindowTracker>,
    pub screenshots: Box<dyn ScreenshotCapturer>,
    pub platform_name: String,
}
