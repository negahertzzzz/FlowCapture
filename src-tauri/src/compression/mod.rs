use crate::storage::models::SessionEvent;

pub fn compress_events(events: &[SessionEvent]) -> Vec<SessionEvent> {
    let mut meaningful = Vec::new();
    let mut typing_buffer = String::new();
    let mut typing_app: Option<String> = None;
    let mut typing_timestamp = 0i64;
    let mut last_mouse_move: Option<(f64, f64)> = None;

    for event in events {
        match event.event_type.as_str() {
            "mouse_move" => {
                let x = event.payload.get("x").and_then(|v| v.as_f64()).unwrap_or(0.0);
                let y = event.payload.get("y").and_then(|v| v.as_f64()).unwrap_or(0.0);
                if last_mouse_move.is_some_and(|(lx, ly)| (lx - x).abs() < 5.0 && (ly - y).abs() < 5.0)
                {
                    continue;
                }
                last_mouse_move = Some((x, y));
            }
            "key_press" => {
                let key = event
                    .payload
                    .get("key")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                if key.len() == 1 && key.chars().all(|c| !c.is_control()) {
                    if typing_buffer.is_empty() {
                        typing_app = event.app_name.clone();
                        typing_timestamp = event.timestamp_ms;
                    }
                    typing_buffer.push_str(key);
                    continue;
                }
                flush_typing(
                    &mut meaningful,
                    &mut typing_buffer,
                    &mut typing_app,
                    typing_timestamp,
                );
            }
            "mouse_click" | "mouse_scroll" | "window_focus" | "manual_marker" => {
                flush_typing(
                    &mut meaningful,
                    &mut typing_buffer,
                    &mut typing_app,
                    typing_timestamp,
                );
                meaningful.push(event.clone());
            }
            _ => {}
        }
    }

    flush_typing(
        &mut meaningful,
        &mut typing_buffer,
        &mut typing_app,
        typing_timestamp,
    );

    merge_window_focus(&mut meaningful);
    meaningful
}

fn flush_typing(
    meaningful: &mut Vec<SessionEvent>,
    typing_buffer: &mut String,
    typing_app: &mut Option<String>,
    typing_timestamp: i64,
) {
    if typing_buffer.is_empty() {
        return;
    }

    meaningful.push(SessionEvent {
        event_type: "typed_text".to_string(),
        app_name: typing_app.clone(),
        payload: serde_json::json!({ "text": typing_buffer.clone() }),
        timestamp_ms: typing_timestamp,
    });
    typing_buffer.clear();
    *typing_app = None;
}

fn merge_window_focus(events: &mut Vec<SessionEvent>) {
    let mut merged: Vec<SessionEvent> = Vec::with_capacity(events.len());
    for event in events.drain(..) {
        if event.event_type == "window_focus" {
            let title = event
                .payload
                .get("title")
                .and_then(|v| v.as_str())
                .unwrap_or_default();
            if let Some(last) = merged.last_mut() {
                if last.event_type == "window_focus" {
                    let last_title = last
                        .payload
                        .get("title")
                        .and_then(|v| v.as_str())
                        .unwrap_or_default();
                    if last.app_name == event.app_name
                        && last_title == title
                        && event.timestamp_ms - last.timestamp_ms < 2000
                    {
                        continue;
                    }
                }
            }
        }
        merged.push(event);
    }
    *events = merged;
}

#[cfg(test)]
mod tests {
    use super::*;

    fn event(event_type: &str, payload: serde_json::Value) -> SessionEvent {
        SessionEvent {
            event_type: event_type.to_string(),
            app_name: Some("Terminal".to_string()),
            payload,
            timestamp_ms: 0,
        }
    }

    #[test]
    fn collapses_mouse_moves_and_typing() {
        let events = vec![
            event("mouse_move", serde_json::json!({"x": 1.0, "y": 1.0})),
            event("mouse_move", serde_json::json!({"x": 2.0, "y": 2.0})),
            event("key_press", serde_json::json!({"key": "n"})),
            event("key_press", serde_json::json!({"key": "p"})),
            event("key_press", serde_json::json!({"key": "m"})),
            event(
                "mouse_click",
                serde_json::json!({"button": "Left"}),
            ),
        ];

        let compressed = compress_events(&events);
        assert_eq!(compressed.len(), 2);
        assert_eq!(compressed[0].event_type, "typed_text");
        assert_eq!(compressed[1].event_type, "mouse_click");
    }
}
