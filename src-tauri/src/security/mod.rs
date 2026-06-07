use regex::Regex;
use std::sync::LazyLock;

use crate::storage::models::{RedactionSummary, SessionEvent};

static PATTERNS: LazyLock<Vec<(Regex, &'static str)>> = LazyLock::new(|| {
    vec![
        (
            Regex::new(r"(?i)(api[_-]?key|secret|token|password)\s*[:=]\s*\S+").unwrap(),
            "credential_assignment",
        ),
        (
            Regex::new(r"(?i)Bearer\s+[A-Za-z0-9\-._~+/]+=*").unwrap(),
            "bearer_token",
        ),
        (
            Regex::new(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b").unwrap(),
            "email",
        ),
        (
            Regex::new(r"\bsk-[A-Za-z0-9]{16,}\b").unwrap(),
            "openai_key",
        ),
    ]
});

pub fn redact_text(input: &str) -> (String, RedactionSummary) {
    let mut output = input.to_string();
    let mut patterns = Vec::new();
    let mut count = 0usize;

    for (pattern, label) in PATTERNS.iter() {
        if pattern.is_match(&output) {
            patterns.push(label.to_string());
            output = pattern
                .replace_all(&output, "[REDACTED]")
                .to_string();
            count += 1;
        }
    }

    (
        output,
        RedactionSummary {
            count,
            patterns,
        },
    )
}

pub fn redact_events(events: &[SessionEvent]) -> (Vec<SessionEvent>, RedactionSummary) {
    let mut total = RedactionSummary {
        count: 0,
        patterns: Vec::new(),
    };
    let mut redacted = Vec::with_capacity(events.len());

    for event in events {
        let payload_str = event.payload.to_string();
        let (redacted_payload, summary) = redact_text(&payload_str);
        total.count += summary.count;
        for pattern in summary.patterns {
            if !total.patterns.contains(&pattern) {
                total.patterns.push(pattern);
            }
        }
        redacted.push(SessionEvent {
            event_type: event.event_type.clone(),
            app_name: event.app_name.clone(),
            payload: serde_json::from_str(&redacted_payload).unwrap_or(event.payload.clone()),
            timestamp_ms: event.timestamp_ms,
        });
    }

    (redacted, total)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn redacts_api_keys() {
        let (text, summary) = redact_text("api_key=super-secret-value");
        assert!(text.contains("[REDACTED]"));
        assert!(summary.count > 0);
    }
}
