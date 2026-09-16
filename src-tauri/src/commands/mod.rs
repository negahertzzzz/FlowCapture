use std::sync::mpsc;
use std::sync::Arc;

use anyhow::anyhow;
use tauri::{AppHandle, State};

use crate::media::spawn_session_video_encode;
use crate::platform::{
    check_recording_permissions,
    open_accessibility_settings as open_accessibility_settings_impl,
    open_screen_recording_settings as open_screen_recording_settings_impl,
    prepare_recording_permissions as prepare_recording_permissions_impl,
    request_accessibility_permission as request_accessibility_permission_impl,
    reveal_executable_in_finder as reveal_executable_in_finder_impl,
    RecordingPermissions,
};
use crate::ai::AiPipeline;
use crate::export::ExportEngine;
use crate::state::AppState;
use crate::storage::models::{
    AiJob, ExportRecord, ProviderConfig, RedactionSummary, Session, Screenshot, StoredEvent,
};

fn run_on_main_thread<T, F>(app: &AppHandle, task: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> T + Send + 'static,
{
    let (tx, rx) = mpsc::sync_channel(1);
    app.run_on_main_thread(move || {
        let _ = tx.send(task());
    })
    .map_err(|err| err.to_string())?;
    rx.recv().map_err(|err| err.to_string())
}

#[tauri::command]
pub fn get_recording_permissions(app: AppHandle) -> Result<RecordingPermissions, String> {
    run_on_main_thread(&app, check_recording_permissions)
}

#[tauri::command]
pub async fn prepare_recording_permissions(app: AppHandle) -> Result<RecordingPermissions, String> {
    tauri::async_runtime::spawn_blocking(move || run_on_main_thread(&app, prepare_recording_permissions_impl))
        .await
        .map_err(|err| err.to_string())?
}

#[tauri::command]
pub fn request_accessibility_permission(app: AppHandle) -> Result<bool, String> {
    run_on_main_thread(&app, request_accessibility_permission_impl)
}

#[tauri::command]
pub fn open_screen_recording_settings() -> Result<(), String> {
    open_screen_recording_settings_impl().map_err(|err| err.to_string())
}

#[tauri::command]
pub fn open_accessibility_settings() -> Result<(), String> {
    open_accessibility_settings_impl().map_err(|err| err.to_string())
}

#[tauri::command]
pub fn reveal_executable_in_finder() -> Result<(), String> {
    reveal_executable_in_finder_impl().map_err(|err| err.to_string())
}

#[tauri::command]
pub fn get_platform_name(state: State<'_, Arc<AppState>>) -> Result<String, String> {
    Ok(state.platform.lock().platform_name.clone())
}

#[tauri::command]
pub fn list_sessions(state: State<'_, Arc<AppState>>) -> Result<Vec<Session>, String> {
    let mut sessions = state.db.list_sessions().map_err(|err| err.to_string())?;
    for session in &mut sessions {
        session.preview_screenshot_path = state
            .db
            .session_preview_screenshot_path(&session.id)
            .ok()
            .flatten();
    }
    Ok(sessions)
}

#[tauri::command]
pub fn get_session(state: State<'_, Arc<AppState>>, session_id: String) -> Result<Option<Session>, String> {
    let mut session = state
        .db
        .get_session(&session_id)
        .map_err(|err| err.to_string())?;

    if let Some(session_ref) = session.as_mut() {
        if session_ref.documentation_md.is_some() {
            let screenshots = state
                .db
                .list_screenshots(&session_id)
                .map_err(|err| err.to_string())?;
            if let Some(markdown) = session_ref.documentation_md.as_mut() {
                *markdown = crate::ai::documentation::normalize_screenshot_references(
                    markdown,
                    &screenshots,
                );
            }
        }
    }

    Ok(session)
}

#[tauri::command]
pub fn update_session_title(
    state: State<'_, Arc<AppState>>,
    session_id: String,
    title: String,
) -> Result<(), String> {
    state
        .db
        .update_session_title(&session_id, &title)
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn list_monitors() -> Result<Vec<crate::storage::models::MonitorInfo>, String> {
    crate::platform::list_monitors().map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn start_recording(
    state: State<'_, Arc<AppState>>,
    title: Option<String>,
    monitor_id: Option<String>,
) -> Result<Session, String> {
    let state = Arc::clone(state.inner());
    tauri::async_runtime::spawn_blocking(move || state.start_recording(title, monitor_id))
        .await
        .map_err(|err| err.to_string())?
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn stop_recording(
    state: State<'_, Arc<AppState>>,
    app: AppHandle,
) -> Result<Session, String> {
    let db = Arc::clone(&state.db);
    let state = Arc::clone(state.inner());
    let session = tauri::async_runtime::spawn_blocking(move || state.stop_recording())
        .await
        .map_err(|err| err.to_string())?
        .map_err(|err| err.to_string())?;
    spawn_session_video_encode(
        db,
        app,
        session.id.clone(),
        session.duration.max(1),
    );
    Ok(session)
}

#[tauri::command]
pub fn pause_recording(state: State<'_, Arc<AppState>>) -> Result<(), String> {
    state.pause_recording().map_err(|err| err.to_string())
}

#[tauri::command]
pub fn resume_recording(state: State<'_, Arc<AppState>>) -> Result<(), String> {
    state.resume_recording().map_err(|err| err.to_string())
}

#[tauri::command]
pub fn switch_recording_monitor(
    state: State<'_, Arc<AppState>>,
    monitor_id: String,
) -> Result<(), String> {
    state
        .switch_recording_monitor(monitor_id)
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn capture_manual_screenshot(state: State<'_, Arc<AppState>>) -> Result<(), String> {
    let state = Arc::clone(state.inner());
    tauri::async_runtime::spawn_blocking(move || state.capture_manual_screenshot())
        .await
        .map_err(|err| err.to_string())?
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn list_events(
    state: State<'_, Arc<AppState>>,
    session_id: String,
) -> Result<Vec<StoredEvent>, String> {
    state
        .db
        .list_events(&session_id)
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn list_screenshots(
    state: State<'_, Arc<AppState>>,
    session_id: String,
) -> Result<Vec<Screenshot>, String> {
    state
        .db
        .list_screenshots(&session_id)
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn delete_screenshot(
    state: State<'_, Arc<AppState>>,
    screenshot_id: String,
) -> Result<(), String> {
    state
        .db
        .delete_screenshot(&screenshot_id)
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn list_providers(state: State<'_, Arc<AppState>>) -> Result<Vec<ProviderConfig>, String> {
    state.db.list_providers().map_err(|err| err.to_string())
}

#[tauri::command]
pub fn update_provider(
    state: State<'_, Arc<AppState>>,
    provider: ProviderConfig,
) -> Result<(), String> {
    if provider.enabled == 1 {
        for mut existing in state.db.list_providers().map_err(|err| err.to_string())? {
            existing.enabled = 0;
            state
                .db
                .update_provider(&existing)
                .map_err(|err| err.to_string())?;
        }
    }
    state
        .db
        .update_provider(&provider)
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn update_session_documentation(
    state: State<'_, Arc<AppState>>,
    session_id: String,
    markdown: String,
) -> Result<(), String> {
    state
        .db
        .update_session_documentation(&session_id, &markdown)
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn cancel_documentation_generation(
    state: State<'_, Arc<AppState>>,
    session_id: String,
) -> Result<bool, String> {
    let cancelled = state.cancel_ai_job(&session_id);
    let _ = state.db.update_session_status(&session_id, crate::storage::models::SessionStatus::Ready);
    Ok(cancelled)
}

#[tauri::command]
pub async fn generate_documentation(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    session_id: String,
) -> Result<GenerateDocumentationResult, String> {
    let cancel_flag = state.register_ai_cancellation(&session_id);
    let pipeline = AiPipeline::new(Arc::clone(&state.db));
    let result = pipeline
        .run(&session_id, &app, cancel_flag)
        .await;

    state.remove_ai_cancellation(&session_id);

    match result {
        Ok((markdown, redaction_summary)) => Ok(GenerateDocumentationResult {
            markdown,
            redaction_summary,
        }),
        Err(err) => {
            let _ = state.db.update_session_status(&session_id, crate::storage::models::SessionStatus::Ready);
            Err(err.to_string())
        }
    }
}

#[derive(serde::Serialize)]
pub struct GenerateDocumentationResult {
    pub markdown: String,
    pub redaction_summary: RedactionSummary,
}

#[tauri::command]
pub fn list_ai_jobs(state: State<'_, Arc<AppState>>, session_id: String) -> Result<Vec<AiJob>, String> {
    state
        .db
        .list_ai_jobs(&session_id)
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn export_session(
    state: State<'_, Arc<AppState>>,
    session_id: String,
    format: String,
    options: Option<crate::export::ExportOptions>,
) -> Result<ExportRecord, String> {
    let db = Arc::clone(&state.db);
    let session_id = session_id.clone();
    let format = format.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let engine = ExportEngine::new(db);
        match format.as_str() {
            "markdown" => engine.export_markdown(&session_id, options),
            "html" => engine.export_html(&session_id, options),
            "pdf" => engine.export_pdf(&session_id, options),
            "video" => engine.export_video(&session_id),
            other => Err(anyhow!("unsupported export format: {other}")),
        }
    })
    .await
    .map_err(|err| err.to_string())?
    .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn list_exports(
    state: State<'_, Arc<AppState>>,
    session_id: String,
) -> Result<Vec<ExportRecord>, String> {
    state
        .db
        .list_exports(&session_id)
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn get_setting(state: State<'_, Arc<AppState>>, key: String) -> Result<Option<String>, String> {
    state.db.get_setting(&key).map_err(|err| err.to_string())
}

#[tauri::command]
pub fn set_setting(state: State<'_, Arc<AppState>>, key: String, value: String) -> Result<(), String> {
    state
        .db
        .set_setting(&key, &value)
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn get_compressed_timeline(
    state: State<'_, Arc<AppState>>,
    session_id: String,
) -> Result<Vec<crate::storage::models::SessionEvent>, String> {
    let events = state
        .db
        .list_events(&session_id)
        .map_err(|err| err.to_string())?
        .into_iter()
        .map(|event| crate::storage::models::SessionEvent {
            event_type: event.event_type,
            app_name: event.app_name,
            payload: serde_json::from_str(&event.payload).unwrap_or(serde_json::json!({})),
            timestamp_ms: event.timestamp_ms,
        })
        .collect::<Vec<_>>();
    Ok(crate::compression::compress_events(&events))
}

#[tauri::command]
pub fn get_replay_steps(
    state: State<'_, Arc<AppState>>,
    session_id: String,
) -> Result<Vec<crate::storage::models::WorkflowStep>, String> {
    let session = state
        .db
        .get_session(&session_id)
        .map_err(|err| err.to_string())?
        .ok_or_else(|| "session not found".to_string())?;
    if let Some(steps_json) = session.steps_json {
        serde_json::from_str(&steps_json).map_err(|err| err.to_string())
    } else {
        Ok(Vec::new())
    }
}

#[tauri::command]
pub async fn save_session_audio(
    state: State<'_, Arc<AppState>>,
    session_id: String,
    audio_base64: String,
    mime_type: String,
) -> Result<String, String> {
    use base64::Engine;
    let session_dir = state.db.session_dir(&session_id);
    let audio_dir = session_dir.join("audio");
    std::fs::create_dir_all(&audio_dir).map_err(|err| err.to_string())?;

    let ext = if mime_type.contains("wav") {
        "wav"
    } else if mime_type.contains("mp3") {
        "mp3"
    } else if mime_type.contains("ogg") {
        "ogg"
    } else {
        "webm"
    };

    let audio_path = audio_dir.join(format!("recording.{ext}"));
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(audio_base64.trim())
        .map_err(|err| format!("invalid audio base64: {err}"))?;

    std::fs::write(&audio_path, bytes).map_err(|err| err.to_string())?;

    let path_str = audio_path.to_string_lossy().to_string();
    state
        .db
        .update_session_audio(&session_id, &path_str)
        .map_err(|err| err.to_string())?;

    Ok(path_str)
}

#[tauri::command]
pub async fn transcribe_session_audio(
    state: State<'_, Arc<AppState>>,
    session_id: String,
) -> Result<String, String> {
    let session = state
        .db
        .get_session(&session_id)
        .map_err(|err| err.to_string())?
        .ok_or_else(|| "session not found".to_string())?;

    let audio_path_str = session
        .audio_path
        .ok_or_else(|| "No audio recorded for this session".to_string())?;
    let audio_path = std::path::PathBuf::from(&audio_path_str);
    if !audio_path.is_file() {
        return Err("Audio file not found on disk".to_string());
    }

    // Check if user set a dedicated provider, model or base URL for transcription
    let transcription_prov_id = state.db.get_setting("transcription_provider_id").unwrap_or(None);
    let transcription_model_override = state.db.get_setting("transcription_model").unwrap_or(None);
    let transcription_url_override = state.db.get_setting("transcription_base_url").unwrap_or(None);

    let mut provider = if let Some(prov_id) = transcription_prov_id.filter(|s| !s.trim().is_empty()) {
        state
            .db
            .list_providers()
            .map_err(|err| err.to_string())?
            .into_iter()
            .find(|p| p.id == prov_id)
            .unwrap_or(
                state
                    .db
                    .get_enabled_provider()
                    .map_err(|err| err.to_string())?
                    .ok_or_else(|| "No AI provider configured for transcription".to_string())?
            )
    } else {
        state
            .db
            .get_enabled_provider()
            .map_err(|err| err.to_string())?
            .ok_or_else(|| "No enabled AI provider configured for transcription".to_string())?
    };

    if let Some(model_override) = transcription_model_override.filter(|s| !s.trim().is_empty()) {
        provider.model = Some(model_override);
    }
    if let Some(url_override) = transcription_url_override.filter(|s| !s.trim().is_empty()) {
        provider.base_url = Some(url_override);
    }

    let transcript = crate::ai::transcription::transcribe_audio(&provider, &audio_path)
        .await
        .map_err(|err| err.to_string())?;

    state
        .db
        .update_session_audio_transcript(&session_id, &transcript)
        .map_err(|err| err.to_string())?;

    Ok(transcript)
}

#[tauri::command]
pub fn delete_session(
    state: State<'_, Arc<AppState>>,
    session_id: String,
) -> Result<(), String> {
    state.cancel_ai_job(&session_id);
    state.remove_ai_cancellation(&session_id);
    state.db.delete_session(&session_id).map_err(|err| err.to_string())
}

#[tauri::command]
pub fn export_session_bundle(
    state: State<'_, Arc<AppState>>,
    session_id: String,
    target_path: String,
) -> Result<String, String> {
    let path = std::path::Path::new(&target_path);
    let result_path = crate::storage::bundle::export_session_bundle(&state.db, &session_id, path)
        .map_err(|err| err.to_string())?;
    Ok(result_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn import_session_bundle(
    state: State<'_, Arc<AppState>>,
    archive_path: String,
) -> Result<Session, String> {
    let path = std::path::Path::new(&archive_path);
    crate::storage::bundle::import_session_bundle(&state.db, path)
        .map_err(|err| err.to_string())
}

