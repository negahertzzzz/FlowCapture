use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

pub const DEFAULT_BRIDGE_PORT: u16 = 41789;

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct BrowserDomEvent {
    pub tag: String,
    pub text: String,
    #[serde(default)]
    pub input_type: Option<String>,
    #[serde(default)]
    pub role: Option<String>,
    pub url: String,
    pub page_title: String,
    #[serde(default)]
    pub selector: Option<String>,
    #[serde(default)]
    pub element_id: Option<String>,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub x: i32,
    #[serde(default)]
    pub y: i32,
    #[serde(default)]
    pub width: Option<i32>,
    #[serde(default)]
    pub height: Option<i32>,
    #[serde(default)]
    pub timestamp_ms: i64,
}

#[derive(Clone, Default)]
pub struct BrowserBridgeState {
    events: Arc<Mutex<VecDeque<BrowserDomEvent>>>,
    is_recording: Arc<AtomicBool>,
}

impl BrowserBridgeState {
    pub fn new() -> Self {
        Self {
            events: Arc::new(Mutex::new(VecDeque::new())),
            is_recording: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn set_recording(&self, recording: bool) {
        self.is_recording.store(recording, Ordering::SeqCst);
    }

    pub fn is_recording(&self) -> bool {
        self.is_recording.load(Ordering::SeqCst)
    }

    pub fn push_event(&self, mut event: BrowserDomEvent) {
        if event.timestamp_ms <= 0 {
            event.timestamp_ms = now_ms();
        }
        if let Ok(mut queue) = self.events.lock() {
            // Keep at most 100 recent events
            if queue.len() >= 100 {
                queue.pop_front();
            }
            // Prune events older than 15 seconds
            let cutoff = now_ms() - 15_000;
            while let Some(front) = queue.front() {
                if front.timestamp_ms < cutoff {
                    queue.pop_front();
                } else {
                    break;
                }
            }
            queue.push_back(event);
        }
    }

    pub fn match_and_take_event(&self, timestamp_ms: i64, x: i32, y: i32) -> Option<BrowserDomEvent> {
        let mut queue = self.events.lock().ok()?;
        if queue.is_empty() {
            return None;
        }

        // Match within +/- 1500ms
        let best_idx = queue
            .iter()
            .enumerate()
            .filter(|(_, ev)| (ev.timestamp_ms - timestamp_ms).abs() <= 1500)
            .min_by_key(|(_, ev)| {
                let dt = (ev.timestamp_ms - timestamp_ms).abs();
                let dx = (ev.x - x).abs() as i64;
                let dy = (ev.y - y).abs() as i64;
                dt + (dx + dy) * 2
            })
            .map(|(idx, _)| idx);

        best_idx.and_then(|idx| queue.remove(idx))
    }
}

pub fn start_browser_bridge_server(state: BrowserBridgeState, port: u16) {
    std::thread::Builder::new()
        .name("browser-bridge-server".to_string())
        .spawn(move || {
            let rt = match tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
            {
                Ok(rt) => rt,
                Err(e) => {
                    eprintln!("FlowCapture: Failed to build tokio runtime for browser bridge: {e}");
                    return;
                }
            };

            rt.block_on(async move {
                let addr = format!("127.0.0.1:{port}");
                let listener = match TcpListener::bind(&addr).await {
                    Ok(l) => {
                        println!("FlowCapture: Browser extension bridge listening on http://{addr}");
                        l
                    }
                    Err(err) => {
                        eprintln!("FlowCapture: Failed to bind browser bridge on {addr}: {err}");
                        return;
                    }
                };

                loop {
                    let (mut socket, _) = match listener.accept().await {
                        Ok(conn) => conn,
                        Err(_) => continue,
                    };

                    let state_clone = state.clone();
                    tokio::spawn(async move {
                let mut buf = vec![0u8; 8192];
                let n = match socket.read(&mut buf).await {
                    Ok(n) if n > 0 => n,
                    _ => return,
                };

                let request = String::from_utf8_lossy(&buf[..n]);
                let (first_line, body) = match request.split_once("\r\n\r\n") {
                    Some((headers, b)) => (headers.lines().next().unwrap_or(""), b),
                    None => (request.lines().next().unwrap_or(""), ""),
                };

                let parts: Vec<&str> = first_line.split_whitespace().collect();
                if parts.len() < 2 {
                    return;
                }
                let method = parts[0];
                let path = parts[1];

                if method == "OPTIONS" {
                    let resp = "HTTP/1.1 204 No Content\r\n\
                                Access-Control-Allow-Origin: *\r\n\
                                Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n\
                                Access-Control-Allow-Headers: Content-Type, Authorization\r\n\
                                Content-Length: 0\r\n\r\n";
                    let _ = socket.write_all(resp.as_bytes()).await;
                    return;
                }

                if method == "GET" && (path == "/health" || path == "/") {
                    let json = serde_json::json!({
                        "status": "ok",
                        "app": "FlowCapture",
                        "recording": state_clone.is_recording(),
                        "bridge_version": "1.0.0"
                    })
                    .to_string();

                    let resp = format!(
                        "HTTP/1.1 200 OK\r\n\
                         Content-Type: application/json\r\n\
                         Access-Control-Allow-Origin: *\r\n\
                         Content-Length: {}\r\n\r\n{}",
                        json.len(),
                        json
                    );
                    let _ = socket.write_all(resp.as_bytes()).await;
                    return;
                }

                if method == "POST" && path == "/browser-event" {
                    if let Ok(dom_event) = serde_json::from_str::<BrowserDomEvent>(body.trim()) {
                        state_clone.push_event(dom_event);
                        let json = "{\"status\":\"received\"}";
                        let resp = format!(
                            "HTTP/1.1 200 OK\r\n\
                             Content-Type: application/json\r\n\
                             Access-Control-Allow-Origin: *\r\n\
                             Content-Length: {}\r\n\r\n{}",
                            json.len(),
                            json
                        );
                        let _ = socket.write_all(resp.as_bytes()).await;
                    } else {
                        let json = "{\"error\":\"invalid json\"}";
                        let resp = format!(
                            "HTTP/1.1 400 Bad Request\r\n\
                             Content-Type: application/json\r\n\
                             Access-Control-Allow-Origin: *\r\n\
                             Content-Length: {}\r\n\r\n{}",
                            json.len(),
                            json
                        );
                        let _ = socket.write_all(resp.as_bytes()).await;
                    }
                    return;
                }

                let resp = "HTTP/1.1 404 Not Found\r\nAccess-Control-Allow-Origin: *\r\nContent-Length: 0\r\n\r\n";
                let _ = socket.write_all(resp.as_bytes()).await;
            });
        }
    });
    })
    .expect("failed to spawn browser bridge thread");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_browser_dom_event_within_time_and_coords() {
        let state = BrowserBridgeState::new();
        state.push_event(BrowserDomEvent {
            tag: "BUTTON".to_string(),
            text: "Accedi".to_string(),
            input_type: None,
            role: Some("button".to_string()),
            url: "https://example.com/login".to_string(),
            page_title: "Login Page".to_string(),
            selector: Some("#login-btn".to_string()),
            element_id: Some("login-btn".to_string()),
            name: None,
            x: 500,
            y: 300,
            width: Some(80),
            height: Some(30),
            timestamp_ms: 10000,
        });

        // Query matching event
        let matched = state.match_and_take_event(10150, 505, 302);
        assert!(matched.is_some());
        let ev = matched.unwrap();
        assert_eq!(ev.text, "Accedi");
        assert_eq!(ev.tag, "BUTTON");

        // Second query should be None as event was consumed
        assert!(state.match_and_take_event(10150, 505, 302).is_none());
    }

    #[test]
    fn rejects_stale_browser_dom_event() {
        let state = BrowserBridgeState::new();
        state.push_event(BrowserDomEvent {
            tag: "A".to_string(),
            text: "Home".to_string(),
            input_type: None,
            role: None,
            url: "https://example.com".to_string(),
            page_title: "Home".to_string(),
            selector: None,
            element_id: None,
            name: None,
            x: 100,
            y: 100,
            width: None,
            height: None,
            timestamp_ms: 1000,
        });

        // Query with large delta (3500ms > 1500ms limit)
        assert!(state.match_and_take_event(4500, 100, 100).is_none());
    }
}
