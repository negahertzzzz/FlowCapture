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
    #[allow(dead_code)]
    fn start(&mut self, output_dir: PathBuf) -> Result<PathBuf> {
        self.start_with_monitor(output_dir, None)
    }
    fn start_with_monitor(&mut self, output_dir: PathBuf, monitor_id: Option<String>) -> Result<PathBuf>;
    fn stop(&mut self) -> Result<Option<PathBuf>>;
    fn pause(&self) {}
    fn resume(&self) {}
    fn switch_monitor(&self, _monitor_id: Option<String>) -> Result<()> {
        Ok(())
    }
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
    #[allow(dead_code)]
    fn capture_primary_monitor(&self, output_path: PathBuf) -> Result<PathBuf> {
        self.capture_monitor(output_path, None)
    }
    fn capture_monitor(&self, output_path: PathBuf, monitor_id: Option<&str>) -> Result<PathBuf>;
}

