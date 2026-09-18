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
        db.clone(),
        app.clone(),
        session.id.clone(),
        session.duration.max(1),
    );
    crate::media::spawn_session_full_video_finalize(
        db,
        app,
        session.id.clone(),
        None,
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
    app: AppHandle,
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

    crate::media::spawn_session_full_video_finalize(
        state.db.clone(),
        app,
        session_id,
        Some(audio_path),
    );

    Ok(path_str)
}

#[tauri::command]
pub async fn transcribe_session_audio(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    session_id: String,
) -> Result<String, String> {
    crate::ai::emit_log(&app, &session_id, "Inizializzazione trascrizione vocale del microfono...");

    let session = state
        .db
        .get_session(&session_id)
        .map_err(|err| err.to_string())?
        .ok_or_else(|| "session not found".to_string())?;

    let audio_path_str = session
        .audio_path
        .ok_or_else(|| "Nessun file audio registrato per questa sessione".to_string())?;
    let audio_path = std::path::PathBuf::from(&audio_path_str);
    if !audio_path.is_file() {
        let msg = "File audio non trovato su disco".to_string();
        crate::ai::emit_log(&app, &session_id, &format!("ERRORE: {msg}"));
        return Err(msg);
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
                    .ok_or_else(|| "Nessun provider AI configurato per la trascrizione".to_string())?
            )
    } else {
        state
            .db
            .get_enabled_provider()
            .map_err(|err| err.to_string())?
            .ok_or_else(|| "Nessun provider AI abilitato per la trascrizione".to_string())?
    };

    if let Some(model_override) = transcription_model_override.filter(|s| !s.trim().is_empty()) {
        provider.model = Some(model_override);
    }
    if let Some(url_override) = transcription_url_override.filter(|s| !s.trim().is_empty()) {
        provider.base_url = Some(url_override);
    }

    let transcription_lang = state.db.get_setting("transcription_language").unwrap_or(None);

    let filename = audio_path.file_name().and_then(|n| n.to_str()).unwrap_or("audio");
    let file_size = std::fs::metadata(&audio_path).map(|m| m.len()).unwrap_or(0);
    crate::ai::emit_log(
        &app,
        &session_id,
        &format!(
            "Connessione al servizio di trascrizione '{}' (endpoint: {:?}, modello: {:?})...",
            provider.name, provider.base_url, provider.model
        ),
    );
    crate::ai::emit_log(
        &app,
        &session_id,
        &format!("Invio file '{filename}' ({file_size} bytes, lingua: {:?}). In attesa...", transcription_lang),
    );

    let transcript = match crate::ai::transcription::transcribe_audio(&provider, &audio_path, transcription_lang.as_deref()).await {
        Ok(t) => {
            crate::ai::emit_log(
                &app,
                &session_id,
                &format!("Trascrizione vocale completata con successo ({} caratteri)!", t.len()),
            );
            t
        }
        Err(err) => {
            let msg = format!("Errore durante la trascrizione audio: {err}");
            crate::ai::emit_log(&app, &session_id, &format!("ERRORE: {msg}"));
            return Err(msg);
        }
    };

    state
        .db
        .update_session_audio_transcript(&session_id, &transcript)
        .map_err(|err| err.to_string())?;

    crate::ai::emit_log(&app, &session_id, "Testo trascritto salvato con successo nel database!");
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

#[tauri::command]
pub async fn translate_documentation(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    session_id: String,
    target_language: Option<String>,
) -> Result<String, String> {
    crate::ai::emit_log(&app, &session_id, "Inizializzazione traduzione della documentazione...");

    let session = state
        .db
        .get_session(&session_id)
        .map_err(|err| err.to_string())?
        .ok_or_else(|| "Sessione non trovata".to_string())?;

    let current_md = session
        .documentation_md
        .ok_or_else(|| "Nessuna documentazione generata per questa sessione".to_string())?;

    if current_md.trim().is_empty() {
        return Err("La documentazione è vuota".to_string());
    }

    // Estrai tutti i tag immagine del Markdown: ![alt](url)
    // Sostituiscili temporaneamente con un token compatto tipo <!-- FC_SCREENSHOT_0 -->
    // in modo che l'LLM riceva e traduca SOLO IL TESTO puro, senza alterare o confondere i percorsi immagine.
    let image_regex = regex::Regex::new(r"!\[([^\]]*)\]\(([^)]+)\)")
        .map_err(|e| format!("Regex error: {e}"))?;

    let mut images: Vec<String> = Vec::new();
    let text_to_translate = image_regex
        .replace_all(&current_md, |caps: &regex::Captures| {
            let idx = images.len();
            images.push(caps[0].to_string());
            format!("<!-- FC_SCREENSHOT_{idx} -->")
        })
        .to_string();

    crate::ai::emit_log(
        &app,
        &session_id,
        &format!(
            "Isolate {} immagini: all'AI verrà inviato unicamente il testo puro.",
            images.len()
        ),
    );

    let provider_config = state
        .db
        .get_enabled_provider()
        .map_err(|err| err.to_string())?
        .ok_or_else(|| "Nessun provider AI abilitato per la traduzione. Configura un provider in Impostazioni.".to_string())?;

    let llm = crate::ai::providers::build_provider(&provider_config)
        .map_err(|err| err.to_string())?;

    let lang = target_language.unwrap_or_else(|| "Italian".to_string());
    let provider_name = provider_config.name.clone();
    let model_name = provider_config.model.clone().unwrap_or_else(|| "default".to_string());
    let endpoint = provider_config.base_url.clone().unwrap_or_else(|| "default".to_string());

    crate::ai::emit_log(
        &app,
        &session_id,
        &format!(
            "Connessione a '{provider_name}' ({endpoint}) con modello '{model_name}'..."
        ),
    );

    let char_count = text_to_translate.len();
    let word_count = text_to_translate.split_whitespace().count();
    crate::ai::emit_log(
        &app,
        &session_id,
        &format!(
            "Invio testo al server AI ({char_count} caratteri, ~{word_count} parole). In attesa della traduzione in {lang}..."
        ),
    );

    let system = "You are an expert technical documentation translator specializing in software user guides and SOPs. Translate accurately into natural, fluent Italian.";
    let prompt = format!(
        "Traduci in lingua {lang} la seguente documentazione di workflow Markdown.\n\n\
        REGOLE FONDAMENTALI:\n\
        1. NON alterare, non tradurre e non rimuovere i segnaposto <!-- FC_SCREENSHOT_X -->. Mantienili esattamente nella stessa posizione.\n\
        2. Traduci tutti i titoli (#, ##, ###), le descrizioni delle azioni, le spiegazioni e gli elenchi in un italiano chiaro, naturale e professionale.\n\
        3. Preserva fedelmente la formattazione Markdown (grassetti, corsivi, elenchi numerati e puntati, tabelle, blocchi di codice).\n\
        4. Rispondi ESCLUSIVAMENTE con il Markdown tradotto, senza alcuna premessa, saluto o commento conversazionale.\n\n\
        Testo Markdown da tradurre:\n\
        {text_to_translate}"
    );

    let options = crate::ai::providers::get_ai_generate_options(
        &state.db,
        crate::ai::providers::AiOperation::Translation,
    );

    crate::ai::emit_log(
        &app,
        &session_id,
        "Applicata modalità No-Think (ragionamento interno disabilitato per traduzione diretta)...",
    );

    let translated_res = llm.generate(system, &prompt, &options).await;
    let translated_raw = match translated_res {
        Ok(t) => {
            crate::ai::emit_log(
                &app,
                &session_id,
                &format!("Risposta ricevuta con successo dal server AI ({} caratteri)!", t.len()),
            );
            t
        }
        Err(err) => {
            let err_msg = format!("Errore durante la traduzione con {provider_name}: {err}");
            crate::ai::emit_log(&app, &session_id, &format!("ERRORE: {err_msg}"));
            return Err(err_msg);
        }
    };

    crate::ai::emit_log(&app, &session_id, "Ripristino dei riferimenti originali agli screenshot...");
    let mut final_md = translated_raw.trim().to_string();

    // Rimuovi eventuali ```markdown e ``` che alcuni modelli avvolgono attorno alla risposta
    if final_md.starts_with("```markdown") {
        final_md = final_md.trim_start_matches("```markdown").to_string();
    } else if final_md.starts_with("```") {
        final_md = final_md.trim_start_matches("```").to_string();
    }
    if final_md.ends_with("```") {
        final_md = final_md.trim_end_matches("```").to_string();
    }
    final_md = final_md.trim().to_string();

    for (idx, original_tag) in images.iter().enumerate() {
        let placeholder = format!("<!-- FC_SCREENSHOT_{idx} -->");
        if final_md.contains(&placeholder) {
            final_md = final_md.replace(&placeholder, original_tag);
        } else {
            // Se il modello ha per errore rimosso il placeholder, riaccoda l'immagine per non perderla
            final_md.push_str(&format!("\n\n{original_tag}\n"));
        }
    }

    state
        .db
        .update_session_documentation(&session_id, &final_md)
        .map_err(|err| err.to_string())?;

    crate::ai::emit_log(&app, &session_id, "Documentazione tradotta salvata nel database!");
    crate::ai::emit_log(&app, &session_id, "Traduzione in italiano completata con successo!");

    Ok(final_md)
}

#[derive(serde::Deserialize)]
pub struct NewStepPayload {
    pub title: String,
    pub description: String,
}

#[tauri::command]
pub fn save_annotated_screenshot(
    state: State<'_, Arc<AppState>>,
    session_id: String,
    screenshot_id: String,
    image_base64: String,
    click_x: Option<i64>,
    click_y: Option<i64>,
    new_step: Option<NewStepPayload>,
    annotations_json: Option<String>,
) -> Result<crate::storage::models::Screenshot, String> {
    let screenshots = state.db.list_screenshots(&session_id).map_err(|err| err.to_string())?;
    let screenshot = screenshots
        .into_iter()
        .find(|s| s.id == screenshot_id)
        .ok_or_else(|| "Screenshot not found".to_string())?;

    let original_path = std::path::PathBuf::from(&screenshot.path);
    if original_path.is_file() {
        let parent = original_path.parent().unwrap_or(std::path::Path::new(""));
        let stem = original_path.file_stem().unwrap_or_default().to_string_lossy();
        let ext = original_path.extension().unwrap_or_default().to_string_lossy();
        let clean_path = parent.join(format!("{stem}_clean.{ext}"));
        if !clean_path.exists() {
            let _ = std::fs::copy(&original_path, &clean_path);
        }
    }

    let raw_base64 = if let Some(idx) = image_base64.find("base64,") {
        &image_base64[idx + 7..]
    } else {
        &image_base64
    };

    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(raw_base64.trim())
        .map_err(|e| format!("Invalid base64 image data: {e}"))?;

    std::fs::write(&screenshot.path, &bytes)
        .map_err(|e| format!("Failed to save screenshot file: {e}"))?;

    state.db.update_screenshot_annotations(&screenshot_id, annotations_json.as_deref(), click_x, click_y)
        .map_err(|err| err.to_string())?;

    if let Some(step_data) = new_step {
        if let Ok(Some(session)) = state.db.get_session(&session_id) {
            let mut steps: Vec<crate::storage::models::WorkflowStep> = session
                .steps_json
                .as_deref()
                .and_then(|json_str| serde_json::from_str(json_str).ok())
                .unwrap_or_default();

            let next_step_num = steps.len() + 1;
            let new_step_obj = crate::storage::models::WorkflowStep {
                step: next_step_num,
                title: step_data.title.clone(),
                description: step_data.description.clone(),
                reason: None,
                timestamp_ms: screenshot.timestamp_ms,
                screenshot_ids: vec![screenshot.id.clone()],
            };
            steps.push(new_step_obj);

            let new_steps_json = serde_json::to_string(&steps).unwrap_or_default();

            let mut md = session.documentation_md.unwrap_or_default();
            let img_line = format!("![Step {}]({})\n\n", next_step_num, screenshot.path);
            md.push_str(&format!(
                "\n\n### Step {}: {}\n\n{}\n\n{}",
                next_step_num,
                step_data.title,
                step_data.description,
                img_line
            ));

            let _ = state.db.save_documentation(
                &session_id,
                &md,
                &new_steps_json,
                session.compressed_events_json.as_deref().unwrap_or("[]"),
            );
        }
    }

    let updated_screenshots = state.db.list_screenshots(&session_id).map_err(|err| err.to_string())?;
    updated_screenshots
        .into_iter()
        .find(|s| s.id == screenshot_id)
        .ok_or_else(|| "Screenshot not found after save".to_string())
}

#[tauri::command]
pub fn open_logs_folder() -> Result<String, String> {
    let log_dir = crate::logger::get_log_dir();
    let path_str = log_dir.to_string_lossy().to_string();
    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("explorer").arg(&log_dir).spawn();
    }
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open").arg(&log_dir).spawn();
    }
    #[cfg(target_os = "linux")]
    {
        let _ = std::process::Command::new("xdg-open").arg(&log_dir).spawn();
    }
    Ok(path_str)
}

#[tauri::command]
pub fn open_browser_extension_folder() -> Result<String, String> {
    let mut candidate = std::env::current_dir()
        .map(|p| p.join("browser-extension"))
        .unwrap_or_else(|_| std::path::PathBuf::from("browser-extension"));

    if !candidate.is_dir() {
        if let Ok(exe) = std::env::current_exe() {
            if let Some(parent) = exe.parent() {
                let p2 = parent.join("browser-extension");
                if p2.is_dir() {
                    candidate = p2;
                } else if let Some(grandparent) = parent.parent() {
                    let p3 = grandparent.join("browser-extension");
                    if p3.is_dir() {
                        candidate = p3;
                    }
                }
            }
        }
    }

    let path_str = candidate.to_string_lossy().to_string();
    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("explorer").arg(&candidate).spawn();
    }
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open").arg(&candidate).spawn();
    }
    #[cfg(target_os = "linux")]
    {
        let _ = std::process::Command::new("xdg-open").arg(&candidate).spawn();
    }
    Ok(path_str)
}

#[tauri::command]
pub fn get_browser_bridge_status(state: State<'_, Arc<AppState>>) -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({
        "port": crate::platform::browser_bridge::DEFAULT_BRIDGE_PORT,
        "recording": state.browser_bridge.is_recording(),
    }))
}



