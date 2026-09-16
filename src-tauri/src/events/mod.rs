use anyhow::Result;

use crate::platform::CapturedInputEvent;
use crate::storage::models::StoredEvent;

pub struct EventCollector {
    buffered: Vec<StoredEvent>,
}

impl EventCollector {
    pub fn new() -> Self {
        Self {
            buffered: Vec::new(),
        }
    }

    pub fn start(&mut self, _session_id: &str) -> Result<()> {
        self.buffered.clear();
        Ok(())
    }

    pub fn stop(&mut self, _session_id: &str) -> Result<Vec<StoredEvent>> {
        Ok(std::mem::take(&mut self.buffered))
    }
}

pub fn should_trigger_screenshot(event: &CapturedInputEvent) -> bool {
    match event.event_type.as_str() {
        "mouse_click" | "mouse_double_click" | "shortcut_press" | "manual_marker" | "window_focus" => true,
        "key_press" => is_meaningful_key(event),
        _ => false,
    }
}

pub fn screenshot_trigger_label(event: &CapturedInputEvent) -> String {
    match event.event_type.as_str() {
        "mouse_click" | "mouse_double_click" => {
            let prefix = if event.event_type == "mouse_double_click" {
                "mouse_double_click"
            } else {
                "mouse_click"
            };
            let button = event
                .payload
                .get("button")
                .and_then(|value| value.as_str())
                .unwrap_or("click");
            let x = event.payload.get("x").and_then(|value| value.as_i64());
            let y = event.payload.get("y").and_then(|value| value.as_i64());
            match (x, y) {
                (Some(x), Some(y)) => format!("{prefix}:{button}@{x},{y}"),
                _ => format!("{prefix}:{button}"),
            }
        }
        "shortcut_press" => {
            let combo = event
                .payload
                .get("combo")
                .and_then(|value| value.as_str())
                .unwrap_or("shortcut");
            format!("shortcut:{combo}")
        }
        "key_press" => {
            let key = event
                .payload
                .get("key")
                .and_then(|value| value.as_str())
                .unwrap_or("key");
            format!("key_press:{key}")
        }
        other => other.to_string(),
    }
}

fn is_meaningful_key(event: &CapturedInputEvent) -> bool {
    let key = event
        .payload
        .get("key")
        .and_then(|value| value.as_str())
        .unwrap_or("");

    matches!(
        key,
        "Enter" | "Return" | "Tab" | "Escape" | "Space" | "Backspace" | "Delete"
    ) || (key.starts_with('F') && key.len() <= 3)
}
