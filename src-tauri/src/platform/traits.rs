use std::path::PathBuf;

use anyhow::Result;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CapturedInputEvent {
    pub event_type: String,
    pub app_name: Option<String>,
    pub payload: serde_json::Value,
    pub timestamp_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowInfo {
    pub app_name: String,
    pub title: String,
    pub timestamp_ms: i64,
}

pub trait ScreenRecorder: Send + Sync {
    fn start(&mut self, output_dir: PathBuf) -> Result<PathBuf>;
    fn stop(&mut self) -> Result<Option<PathBuf>>;
    fn request_stop(&mut self) {}
}

pub trait InputEventSource: Send + Sync {
    fn start(&mut self) -> Result<()>;
    fn stop(&mut self) -> Result<()>;
    fn drain_events(&mut self) -> Vec<CapturedInputEvent>;
    fn request_stop(&mut self) {}
}

pub trait WindowTracker: Send + Sync {
    fn start(&mut self) -> Result<()>;
    fn stop(&mut self) -> Result<()>;
    fn drain_events(&mut self) -> Vec<WindowInfo>;
    fn request_stop(&mut self) {}
}

pub trait ScreenshotCapturer: Send + Sync {
    fn capture_primary_monitor(&self, output_path: PathBuf) -> Result<PathBuf>;
}
