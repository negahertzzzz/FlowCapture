use crate::storage::models::SessionEvent;

/// Keys that mark a step on their own (confirming a form, moving focus, closing a dialog…).
const MEANINGFUL_KEYS: &[&str] = &[
    "Enter", "NumpadEnter", "Tab", "Escape", "Delete", "F1", "F2", "F3", "F4", "F5", "F6", "F7",
    "F8", "F9", "F10", "F11", "F12",
];

/// A double click arrives as a `mouse_click` followed by a `mouse_double_click`; within this
/// window the pair is folded into a single double-click action.
const DOUBLE_CLICK_MERGE_MS: i64 = 600;

pub fn compress_events(events: &[SessionEvent]) -> Vec<SessionEvent> {
    let mut meaningful: Vec<SessionEvent> = Vec::new();
    let mut typing = TypingBuffer::default();

    for event in events {
        match event.event_type.as_str() {
            "key_press" | "shortcut_press" => {
                let key = event.payload.get("key").and_then(|v| v.as_str()).unwrap_or("");
                let flag = |name: &str| event.payload.get(name).and_then(|v| v.as_bool()).unwrap_or(false);
                let (ctrl, alt, meta, shift) = (flag("ctrl"), flag("alt"), flag("meta"), flag("shift"));

                if ctrl && alt && !meta {
                    // AltGr reports as Ctrl+Alt: on European layouts it types a character
                    // (`@`, `#`, `€`…) that can't be told apart from its key position.
                    continue;
                }
                if ctrl || alt || meta {
                    typing.flush(&mut meaningful);
                    if event.event_type == "shortcut_press" {
                        meaningful.push(event.clone());
                    }
                    continue;
                }

                if key == "CapsLock" {
                    typing.caps_lock = !typing.caps_lock;
                    continue;
                }
                if key == "Backspace" {
                    typing.backspace();
                    continue;
                }
                if let Some(ch) = typed_char(key, shift != typing.caps_lock, shift) {
                    typing.push(ch, event, &mut meaningful);
                    continue;
                }
                if MEANINGFUL_KEYS.contains(&key) {
                    typing.flush(&mut meaningful);
                    meaningful.push(event.clone());
                }
                // Arrows, Home/End, modifiers alone… carry no instruction of their own.
            }
            "mouse_double_click" => {
                typing.flush(&mut meaningful);
                let merged = merge_with_previous_click(&mut meaningful, event);
                meaningful.push(merged);
            }
            "mouse_click" | "mouse_scroll" | "window_focus" | "manual_marker" => {
                typing.flush(&mut meaningful);
                meaningful.push(event.clone());
            }
            _ => {}
        }
    }

    typing.flush(&mut meaningful);
    merge_window_focus(&mut meaningful);
    meaningful
}

#[derive(Default)]
struct TypingBuffer {
    text: String,
    app: Option<String>,
    timestamp_ms: i64,
    caps_lock: bool,
}

impl TypingBuffer {
    fn push(&mut self, ch: char, event: &SessionEvent, out: &mut Vec<SessionEvent>) {
        if !self.text.is_empty() && self.app != event.app_name {
            self.flush(out);
        }
        if self.text.is_empty() {
            self.app = event.app_name.clone();
            self.timestamp_ms = event.timestamp_ms;
        }
        self.text.push(ch);
    }

    fn backspace(&mut self) {
        self.text.pop();
    }

    fn flush(&mut self, out: &mut Vec<SessionEvent>) {
        let text = std::mem::take(&mut self.text);
        let app = self.app.take();
        if text.trim().is_empty() {
            return;
        }
        out.push(SessionEvent {
            event_type: "typed_text".to_string(),
            app_name: app,
            payload: serde_json::json!({ "text": text }),
            timestamp_ms: self.timestamp_ms,
        });
    }
}

/// Character produced by a key, from `device_query` key names (US key positions).
///
/// Shifted digits and punctuation depend on the keyboard layout (Shift+2 is `@` on a US layout
/// and `"` on an Italian one), so they are left out rather than guessed wrong.
fn typed_char(key: &str, uppercase: bool, shift: bool) -> Option<char> {
    let mut chars = key.chars();
    if let (Some(letter), None) = (chars.next(), chars.next()) {
        if letter.is_ascii_alphabetic() {
            return Some(if uppercase {
                letter.to_ascii_uppercase()
            } else {
                letter.to_ascii_lowercase()
            });
        }
    }
    if key == "Space" {
        return Some(' ');
    }
    if let Some(digit) = key
        .strip_prefix("Numpad")
        .and_then(|rest| rest.parse::<u8>().ok())
    {
        return char::from_digit(digit as u32, 10);
    }
    let numpad = match key {
        "NumpadDecimal" => Some('.'),
        "NumpadAdd" => Some('+'),
        "NumpadSubtract" => Some('-'),
        "NumpadMultiply" => Some('*'),
        "NumpadDivide" => Some('/'),
        "NumpadEquals" => Some('='),
        _ => None,
    };
    if numpad.is_some() {
        return numpad;
    }
    if shift {
        return None;
    }
    if let Some(digit) = key.strip_prefix("Key").and_then(|rest| rest.parse::<u8>().ok()) {
        return char::from_digit(digit as u32, 10);
    }
    match key {
        "Minus" => Some('-'),
        "Equal" => Some('='),
        "Comma" => Some(','),
        "Dot" => Some('.'),
        "Slash" => Some('/'),
        "Semicolon" => Some(';'),
        "Apostrophe" => Some('\''),
        "Grave" => Some('`'),
        "LeftBracket" => Some('['),
        "RightBracket" => Some(']'),
        "BackSlash" => Some('\\'),
        _ => None,
    }
}

/// Human-readable key name for step descriptions (`Key1` → `1`, `Dot` → `.`).
pub fn display_key_name(key: &str) -> String {
    match key {
        "NumpadEnter" => "Enter".to_string(),
        "Escape" => "Esc".to_string(),
        "LControl" | "RControl" => "Ctrl".to_string(),
        other => typed_char(other, true, false)
            .filter(|ch| *ch != ' ')
            .map(|ch| ch.to_string())
            .unwrap_or_else(|| other.to_string()),
    }
}

/// Folds the plain click that opened a double click into the double-click event, keeping the
/// element details (browser/UI Automation) that were attached to the first click.
fn merge_with_previous_click(meaningful: &mut Vec<SessionEvent>, double: &SessionEvent) -> SessionEvent {
    let button = |event: &SessionEvent| {
        event
            .payload
            .get("button")
            .and_then(|v| v.as_str())
            .map(str::to_string)
    };
    let is_pair = meaningful.last().is_some_and(|prev| {
        prev.event_type == "mouse_click"
            && button(prev) == button(double)
            && (double.timestamp_ms - prev.timestamp_ms).abs() <= DOUBLE_CLICK_MERGE_MS
    });
    if !is_pair {
        return double.clone();
    }

    let prev = meaningful.pop().expect("checked above");
    let mut payload = prev.payload.clone();
    if let (Some(merged), Some(extra)) = (payload.as_object_mut(), double.payload.as_object()) {
        for (key, value) in extra {
            merged.insert(key.clone(), value.clone());
        }
    }
    SessionEvent {
        event_type: double.event_type.clone(),
        app_name: double.app_name.clone().or(prev.app_name),
        payload,
        timestamp_ms: prev.timestamp_ms,
    }
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
        at(event_type, payload, 0)
    }

    fn at(event_type: &str, payload: serde_json::Value, timestamp_ms: i64) -> SessionEvent {
        SessionEvent {
            event_type: event_type.to_string(),
            app_name: Some("Terminal".to_string()),
            payload,
            timestamp_ms,
        }
    }

    fn key(name: &str) -> SessionEvent {
        event("key_press", serde_json::json!({"key": name}))
    }

    fn typed(events: &[SessionEvent]) -> Vec<String> {
        compress_events(events)
            .iter()
            .filter(|e| e.event_type == "typed_text")
            .map(|e| e.payload["text"].as_str().unwrap().to_string())
            .collect()
    }

    #[test]
    fn collapses_mouse_moves_and_typing() {
        let events = vec![
            event("mouse_move", serde_json::json!({"x": 1.0, "y": 1.0})),
            event("mouse_move", serde_json::json!({"x": 2.0, "y": 2.0})),
            key("N"),
            key("P"),
            key("M"),
            event("mouse_click", serde_json::json!({"button": "Left"})),
        ];

        let compressed = compress_events(&events);
        assert_eq!(compressed.len(), 2);
        assert_eq!(compressed[0].event_type, "typed_text");
        assert_eq!(compressed[1].event_type, "mouse_click");
    }

    #[test]
    fn rebuilds_text_with_case_digits_spaces_and_backspace() {
        let shift_h = event("shortcut_press", serde_json::json!({"key": "H", "combo": "Shift+H", "shift": true}));
        let events = vec![
            shift_h,
            key("I"),
            key("Space"),
            key("Key2"),
            key("Numpad4"),
            key("X"),
            key("Backspace"),
        ];
        assert_eq!(typed(&events), vec!["Hi 24"]);
    }

    #[test]
    fn keeps_shortcuts_and_meaningful_keys() {
        let events = vec![
            key("A"),
            key("Enter"),
            event("shortcut_press", serde_json::json!({"key": "S", "combo": "Ctrl+S", "ctrl": true})),
            key("Left"),
        ];
        let kinds: Vec<_> = compress_events(&events).into_iter().map(|e| e.event_type).collect();
        assert_eq!(kinds, vec!["typed_text", "key_press", "shortcut_press"]);
    }

    #[test]
    fn folds_click_and_double_click_into_one_action() {
        let events = vec![
            at("mouse_click", serde_json::json!({"button": "left", "element_name": "report.pdf"}), 1000),
            at("mouse_double_click", serde_json::json!({"button": "left", "double_click": true}), 1250),
        ];
        let compressed = compress_events(&events);
        assert_eq!(compressed.len(), 1);
        assert_eq!(compressed[0].event_type, "mouse_double_click");
        assert_eq!(compressed[0].payload["element_name"], "report.pdf");
        assert_eq!(compressed[0].timestamp_ms, 1000);
    }

    #[test]
    fn display_names_are_readable() {
        assert_eq!(display_key_name("Key1"), "1");
        assert_eq!(display_key_name("Dot"), ".");
        assert_eq!(display_key_name("NumpadEnter"), "Enter");
        assert_eq!(display_key_name("F5"), "F5");
    }
}
