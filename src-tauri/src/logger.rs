use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;
use chrono::Local;

static LOG_MUTEX: parking_lot::Mutex<()> = parking_lot::Mutex::new(());

pub fn get_log_dir() -> PathBuf {
    let base = if let Ok(current) = std::env::current_dir() {
        let clean = current.to_string_lossy();
        if clean.ends_with("src-tauri") || clean.ends_with("src-tauri\\") || clean.ends_with("src-tauri/") {
            current.parent().map(|p| p.to_path_buf()).unwrap_or(current)
        } else {
            current
        }
    } else if let Ok(exe) = std::env::current_exe() {
        let parent = exe.parent().unwrap_or_else(|| std::path::Path::new("."));
        let clean = parent.to_string_lossy();
        if clean.contains("target") {
            let mut p = parent.to_path_buf();
            while let Some(parent_p) = p.parent() {
                if p.ends_with("src-tauri") {
                    p = parent_p.to_path_buf();
                    break;
                }
                p = parent_p.to_path_buf();
            }
            p
        } else {
            parent.to_path_buf()
        }
    } else {
        PathBuf::from(".")
    };

    let dir = base.join("log");
    let _ = std::fs::create_dir_all(&dir);
    dir
}

pub fn get_current_log_file() -> PathBuf {
    let dir = get_log_dir();
    let today = Local::now().format("%Y-%m-%d").to_string();
    dir.join(format!("flowcapture_{today}.log"))
}

pub fn write_entry(level: &str, tag: &str, message: &str) {
    let _guard = LOG_MUTEX.lock();
    let path = get_current_log_file();
    let timestamp = Local::now().format("%Y-%m-%d %H:%M:%S%.3f").to_string();
    let line = format!("[{timestamp}] [{level}] [{tag}] {message}\n");

    println!("{line}");

    if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(path) {
        let _ = f.write_all(line.as_bytes());
    }
}

pub fn info(tag: &str, message: &str) {
    write_entry("INFO", tag, message);
}

pub fn warn(tag: &str, message: &str) {
    write_entry("WARN", tag, message);
}

pub fn error(tag: &str, message: &str) {
    write_entry("ERROR", tag, message);
}

pub fn log_api_request(
    service: &str,
    method: &str,
    url: &str,
    headers: Option<&[(&str, &str)]>,
    body: &str,
) {
    let mut header_lines = String::new();
    if let Some(hdrs) = headers {
        for (k, v) in hdrs {
            let masked = if k.eq_ignore_ascii_case("authorization") || k.eq_ignore_ascii_case("x-api-key") {
                if v.len() > 10 {
                    format!("{}...{}", &v[..5], &v[v.len() - 3..])
                } else {
                    "***".to_string()
                }
            } else {
                v.to_string()
            };
            header_lines.push_str(&format!("  {k}: {masked}\n"));
        }
    }

    let msg = format!(
        "\n==================== [API REQUEST START] ====================\n\
         Service: {service}\n\
         Request: {method} {url}\n\
         Headers:\n{header_lines}\
         Body:\n{body}\n\
         ==================== [API REQUEST END] ======================"
    );
    write_entry("INFO", "API_HTTP", &msg);
}

pub fn log_api_response(
    service: &str,
    url: &str,
    status_code: u16,
    duration_ms: u128,
    body: &str,
) {
    let msg = format!(
        "\n==================== [API RESPONSE START] ====================\n\
         Service:  {service}\n\
         URL:      {url}\n\
         Status:   HTTP {status_code}\n\
         Duration: {duration_ms} ms\n\
         Response Body:\n{body}\n\
         ==================== [API RESPONSE END] ======================"
    );
    write_entry("INFO", "API_HTTP", &msg);
}

pub fn log_api_error(
    service: &str,
    url: &str,
    duration_ms: u128,
    err: &str,
) {
    let msg = format!(
        "\n==================== [API ERROR START] ====================\n\
         Service:  {service}\n\
         URL:      {url}\n\
         Duration: {duration_ms} ms\n\
         Error:    {err}\n\
         ==================== [API ERROR END] ======================"
    );
    write_entry("ERROR", "API_HTTP", &msg);
}
