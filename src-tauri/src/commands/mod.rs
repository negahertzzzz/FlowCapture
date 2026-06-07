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
pub fn prepare_recording_permissions(app: AppHandle) -> Result<RecordingPermissions, String> {
    run_on_main_thread(&app, prepare_recording_permissions_impl)
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
pub fn get_platform_name(state: State<'_, AppState>) -> Result<String, String> {
    Ok(state.platform.lock().platform_name.clone())
}

#[tauri::command]
pub fn list_sessions(state: State<'_, AppState>) -> Result<Vec<Session>, String> {
    state.db.list_sessions().map_err(|err| err.to_string())
}

#[tauri::command]
pub fn get_session(state: State<'_, AppState>, session_id: String) -> Result<Option<Session>, String> {
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
    state: State<'_, AppState>,
    session_id: String,
    title: String,
) -> Result<(), String> {
    state
        .db
        .update_session_title(&session_id, &title)
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn start_recording(
    state: State<'_, AppState>,
    title: Option<String>,
) -> Result<Session, String> {
    state.start_recording(title).map_err(|err| err.to_string())
}

#[tauri::command]
pub fn stop_recording(state: State<'_, AppState>, app: AppHandle) -> Result<Session, String> {
    let session = state.stop_recording().map_err(|err| err.to_string())?;
    spawn_session_video_encode(
        Arc::clone(&state.db),
        app,
        session.id.clone(),
        session.duration.max(1),
    );
    Ok(session)
}

#[tauri::command]
pub fn capture_manual_screenshot(state: State<'_, AppState>) -> Result<(), String> {
    state
        .capture_manual_screenshot()
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn list_events(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<Vec<StoredEvent>, String> {
    state
        .db
        .list_events(&session_id)
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn list_screenshots(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<Vec<Screenshot>, String> {
    state
        .db
        .list_screenshots(&session_id)
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn delete_screenshot(
    state: State<'_, AppState>,
    screenshot_id: String,
) -> Result<(), String> {
    state
        .db
        .delete_screenshot(&screenshot_id)
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn list_providers(state: State<'_, AppState>) -> Result<Vec<ProviderConfig>, String> {
    state.db.list_providers().map_err(|err| err.to_string())
}

#[tauri::command]
pub fn update_provider(
    state: State<'_, AppState>,
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
    state: State<'_, AppState>,
    session_id: String,
    markdown: String,
) -> Result<(), String> {
    state
        .db
        .update_session_documentation(&session_id, &markdown)
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn generate_documentation(
    app: AppHandle,
    state: State<'_, AppState>,
    session_id: String,
) -> Result<GenerateDocumentationResult, String> {
    let pipeline = AiPipeline::new(Arc::clone(&state.db));
    let (markdown, redaction_summary) = pipeline
        .run(&session_id, &app)
        .await
        .map_err(|err| err.to_string())?;
    Ok(GenerateDocumentationResult {
        markdown,
        redaction_summary,
    })
}

#[derive(serde::Serialize)]
pub struct GenerateDocumentationResult {
    pub markdown: String,
    pub redaction_summary: RedactionSummary,
}

#[tauri::command]
pub fn list_ai_jobs(state: State<'_, AppState>, session_id: String) -> Result<Vec<AiJob>, String> {
    state
        .db
        .list_ai_jobs(&session_id)
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn export_session(
    state: State<'_, AppState>,
    session_id: String,
    format: String,
    options: Option<crate::export::ExportOptions>,
) -> Result<ExportRecord, String> {
    let engine = ExportEngine::new(Arc::clone(&state.db));
    match format.as_str() {
        "markdown" => engine.export_markdown(&session_id, options),
        "html" => engine.export_html(&session_id, options),
        "pdf" => engine.export_pdf(&session_id, options),
        "video" => engine.export_video(&session_id),
        other => Err(anyhow!("unsupported export format: {other}")),
    }
    .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn list_exports(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<Vec<ExportRecord>, String> {
    state
        .db
        .list_exports(&session_id)
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn get_setting(state: State<'_, AppState>, key: String) -> Result<Option<String>, String> {
    state.db.get_setting(&key).map_err(|err| err.to_string())
}

#[tauri::command]
pub fn set_setting(state: State<'_, AppState>, key: String, value: String) -> Result<(), String> {
    state
        .db
        .set_setting(&key, &value)
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn get_compressed_timeline(
    state: State<'_, AppState>,
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
    state: State<'_, AppState>,
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
