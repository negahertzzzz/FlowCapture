use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use anyhow::{Context, Result};
use chrono::Utc;
use serde_json::json;
use tauri::{AppHandle, Emitter};

use crate::ai::documentation::{
    build_workflow_steps, events_for_prompt, infer_workflow_summary, match_screenshots_to_steps,
    normalize_screenshot_references, render_documentation_markdown, sanitize_markdown,
};
use crate::ai::providers::build_provider;
use crate::compression::compress_events;
use crate::security::redact_events;
use crate::storage::Database;
use crate::storage::models::{
    AiJobStage, AiJobStatus, Documentation, DocumentationMetadata, ProviderConfig, RedactionSummary,
    SessionEvent, Screenshot, WorkflowStep,
};

pub struct AiPipeline {
    db: Arc<Database>,
}

#[derive(Clone, serde::Serialize)]
pub struct AiProgressEvent {
    pub session_id: String,
    pub stage: String,
    pub status: String,
}

#[derive(Clone, serde::Serialize)]
pub struct AiLogEvent {
    pub session_id: String,
    pub message: String,
    pub timestamp_ms: i64,
}

impl AiPipeline {
    pub fn new(db: Arc<Database>) -> Self {
        Self { db }
    }

    pub async fn run(
        &self,
        session_id: &str,
        app: &AppHandle,
        cancel_flag: Arc<AtomicBool>,
    ) -> Result<(String, RedactionSummary)> {
        if cancel_flag.load(Ordering::Relaxed) {
            emit_log(app, session_id, "Generazione annullata dall'utente.");
            let _ = self.db.update_session_status(session_id, crate::storage::models::SessionStatus::Ready);
            anyhow::bail!("cancelled by user");
        }

        emit_log(app, session_id, "Inizializzazione generazione documentazione AI...");
        self.db
            .update_session_status(session_id, crate::storage::models::SessionStatus::Processing)?;

        let provider = self
            .db
            .get_enabled_provider()?
            .context("no enabled AI provider configured")?;

        let session = self
            .db
            .get_session(session_id)?
            .context("session not found")?;

        let raw_events = self.load_session_events(session_id)?;
        let compressed = compress_events(&raw_events);
        let (redacted_events, redaction_summary) = redact_events(&compressed);
        let screenshots = self.db.list_screenshots(session_id)?;

        emit_log(
            app,
            session_id,
            &format!(
                "Caricati {} eventi e {} screenshot; compressi in {} azioni chiave ({} elementi oscurati)",
                raw_events.len(),
                screenshots.len(),
                compressed.len(),
                redaction_summary.count
            ),
        );

        if cancel_flag.load(Ordering::Relaxed) {
            emit_log(app, session_id, "Generazione annullata dall'utente.");
            let _ = self.db.update_session_status(session_id, crate::storage::models::SessionStatus::Ready);
            anyhow::bail!("cancelled by user");
        }

        let audio_transcript = if let Some(existing) = &session.audio_transcript {
            if !existing.trim().is_empty() {
                emit_log(app, session_id, "Utilizzo trascrizione vocale esistente");
                Some(existing.clone())
            } else {
                None
            }
        } else if let Some(audio_path_str) = &session.audio_path {
            let audio_path = std::path::Path::new(audio_path_str);
            if audio_path.is_file() {
                emit_log(app, session_id, "Avvio trascrizione audio del microfono con AI...");
                
                let transcription_prov_id = self.db.get_setting("transcription_provider_id").unwrap_or(None);
                let transcription_model_override = self.db.get_setting("transcription_model").unwrap_or(None);
                let transcription_url_override = self.db.get_setting("transcription_base_url").unwrap_or(None);

                let mut trans_provider = if let Some(prov_id) = transcription_prov_id.filter(|s| !s.trim().is_empty()) {
                    self.db
                        .list_providers()
                        .unwrap_or_default()
                        .into_iter()
                        .find(|p| p.id == prov_id)
                        .unwrap_or_else(|| provider.clone())
                } else {
                    provider.clone()
                };

                if let Some(model_override) = transcription_model_override.filter(|s| !s.trim().is_empty()) {
                    trans_provider.model = Some(model_override);
                }
                if let Some(url_override) = transcription_url_override.filter(|s| !s.trim().is_empty()) {
                    trans_provider.base_url = Some(url_override);
                }

                match crate::ai::transcription::transcribe_audio(&trans_provider, audio_path).await {
                    Ok(transcript) => {
                        let _ = self.db.update_session_audio_transcript(session_id, &transcript);
                        emit_log(app, session_id, &format!("Trascrizione vocale completata con {}: {} caratteri", trans_provider.name, transcript.len()));
                        Some(transcript)
                    }
                    Err(err) => {
                        emit_log(app, session_id, &format!("Trascrizione non riuscita: {err}"));
                        None
                    }
                }
            } else {
                None
            }
        } else {
            None
        };

        if cancel_flag.load(Ordering::Relaxed) {
            emit_log(app, session_id, "Generazione annullata dall'utente.");
            let _ = self.db.update_session_status(session_id, crate::storage::models::SessionStatus::Ready);
            anyhow::bail!("cancelled by user");
        }

        let timeline_job = self
            .db
            .create_ai_job(session_id, AiJobStage::TimelineBuilder)?;
        emit_progress(app, session_id, AiJobStage::TimelineBuilder, "running");
        emit_log(app, session_id, "Costruzione sequenza temporale e raggruppamento azioni...");
        let mut steps = build_workflow_steps(&redacted_events);

        emit_log(app, session_id, "Ottimizzazione passaggi con modello LLM...");
        let refine_fut = self.refine_timeline(
            &provider,
            &session.title,
            &redacted_events,
            &steps,
            audio_transcript.as_deref(),
        );

        match tokio::time::timeout(Duration::from_secs(35), refine_fut).await {
            Ok(Ok(ai_steps)) => {
                if !ai_steps.is_empty() && ai_steps.len() <= 15 {
                    steps = ai_steps;
                    emit_log(app, session_id, "Passaggi consolidati con successo dal modello AI");
                } else {
                    emit_log(app, session_id, "Passaggi deterministici mantenuti");
                }
            }
            Ok(Err(err)) => {
                emit_log(app, session_id, &format!("Ottimizzazione passaggi LLM saltata ({err}), utilizzo raggruppamento deterministico"));
            }
            Err(_) => {
                emit_log(app, session_id, "Timeout risposta modello AI per i passaggi, proseguo con i passaggi deterministici");
            }
        }

        if cancel_flag.load(Ordering::Relaxed) {
            emit_log(app, session_id, "Generazione annullata dall'utente.");
            let _ = self.db.update_session_status(session_id, crate::storage::models::SessionStatus::Ready);
            anyhow::bail!("cancelled by user");
        }

        emit_progress(app, session_id, AiJobStage::TimelineBuilder, "completed");
        emit_log(app, session_id, &format!("Timeline definita: {} passaggi identificati", steps.len()));
        self.db.finish_ai_job(
            &timeline_job.id,
            AiJobStatus::Completed,
            Some(serde_json::to_string(&steps)?),
            None,
        )?;

        if cancel_flag.load(Ordering::Relaxed) {
            emit_log(app, session_id, "Generazione annullata dall'utente.");
            let _ = self.db.update_session_status(session_id, crate::storage::models::SessionStatus::Ready);
            anyhow::bail!("cancelled by user");
        }

        let selector_job = self
            .db
            .create_ai_job(session_id, AiJobStage::ScreenshotSelector)?;
        emit_progress(app, session_id, AiJobStage::ScreenshotSelector, "running");
        emit_log(app, session_id, "Abbinamento e selezione screenshot migliori per ogni passaggio...");
        match_screenshots_to_steps(&mut steps, &screenshots);
        let selected_ids: Vec<String> = steps
            .iter()
            .flat_map(|step| step.screenshot_ids.clone())
            .collect();
        let _ = self.db.mark_screenshots_selected(&selected_ids);
        emit_progress(app, session_id, AiJobStage::ScreenshotSelector, "completed");
        emit_log(app, session_id, &format!("Selezionati {} screenshot per la documentazione", selected_ids.len()));
        self.db.finish_ai_job(
            &selector_job.id,
            AiJobStatus::Completed,
            Some(json!({ "count": screenshots.len() }).to_string()),
            None,
        )?;

        if cancel_flag.load(Ordering::Relaxed) {
            emit_log(app, session_id, "Generazione annullata dall'utente.");
            let _ = self.db.update_session_status(session_id, crate::storage::models::SessionStatus::Ready);
            anyhow::bail!("cancelled by user");
        }

        let (doc_title, overview) =
            infer_workflow_summary(&session.title, &redacted_events, &steps);
        let base_markdown = render_documentation_markdown(&doc_title, &overview, &steps, &screenshots);

        let writer_job = self
            .db
            .create_ai_job(session_id, AiJobStage::TechnicalWriter)?;
        emit_progress(app, session_id, AiJobStage::TechnicalWriter, "running");
        emit_log(app, session_id, "Generazione guida e arricchimento tecnico con modello LLM...");
        
        let enhance_fut = self.enhance_documentation(
            &provider,
            &doc_title,
            &overview,
            &steps,
            &base_markdown,
            audio_transcript.as_deref(),
        );

        let markdown = match tokio::time::timeout(Duration::from_secs(60), enhance_fut).await {
            Ok(Ok(enhanced)) => {
                emit_progress(app, session_id, AiJobStage::TechnicalWriter, "completed");
                emit_log(app, session_id, "Guida generata con successo dal modello AI");
                self.db.finish_ai_job(
                    &writer_job.id,
                    AiJobStatus::Completed,
                    Some(json!({ "length": enhanced.len() }).to_string()),
                    None,
                )?;
                enhanced
            }
            Ok(Err(err)) => {
                emit_progress(app, session_id, AiJobStage::TechnicalWriter, "failed");
                emit_log(app, session_id, &format!("Arricchimento AI non riuscito ({err}), uso template base"));
                self.db.finish_ai_job(
                    &writer_job.id,
                    AiJobStatus::Failed,
                    None,
                    Some(err.to_string()),
                )?;
                base_markdown.clone()
            }
            Err(_) => {
                emit_progress(app, session_id, AiJobStage::TechnicalWriter, "failed");
                emit_log(app, session_id, "Timeout risposta modello AI per la guida, uso template base");
                self.db.finish_ai_job(
                    &writer_job.id,
                    AiJobStatus::Failed,
                    None,
                    Some("Timeout response from LLM provider".to_string()),
                )?;
                base_markdown.clone()
            }
        };

        if cancel_flag.load(Ordering::Relaxed) {
            emit_log(app, session_id, "Generazione annullata dall'utente.");
            let _ = self.db.update_session_status(session_id, crate::storage::models::SessionStatus::Ready);
            anyhow::bail!("cancelled by user");
        }

        let reviewer_job = self
            .db
            .create_ai_job(session_id, AiJobStage::QualityReviewer)?;
        emit_progress(app, session_id, AiJobStage::QualityReviewer, "running");
        emit_log(app, session_id, "Revisione qualità, sanitizzazione e controllo link screenshot...");
        let reviewed_markdown = finalize_markdown(&markdown, &base_markdown, &screenshots);
        emit_progress(app, session_id, AiJobStage::QualityReviewer, "completed");
        self.db.finish_ai_job(
            &reviewer_job.id,
            AiJobStatus::Completed,
            Some("Sanitized placeholders and normalized screenshot paths.".to_string()),
            None,
        )?;

        let documentation = Documentation {
            title: doc_title.clone(),
            steps: steps.clone(),
            metadata: DocumentationMetadata {
                session_id: session_id.to_string(),
                created_at: Utc::now().to_rfc3339(),
            },
        };

        self.db.save_documentation(
            session_id,
            &reviewed_markdown,
            &serde_json::to_string(&steps)?,
            &serde_json::to_string(&redacted_events)?,
        )?;
        let _ = documentation;

        self.db
            .update_session_status(session_id, crate::storage::models::SessionStatus::Ready)?;
        emit_log(app, session_id, "Documentazione completata e salvata con successo!");

        Ok((reviewed_markdown, redaction_summary))
    }

    fn load_session_events(&self, session_id: &str) -> Result<Vec<SessionEvent>> {
        Ok(self
            .db
            .list_events(session_id)?
            .into_iter()
            .map(|event| SessionEvent {
                event_type: event.event_type,
                app_name: event.app_name,
                payload: serde_json::from_str(&event.payload).unwrap_or(json!({})),
                timestamp_ms: event.timestamp_ms,
            })
            .collect())
    }

    async fn refine_timeline(
        &self,
        provider: &ProviderConfig,
        session_title: &str,
        events: &[SessionEvent],
        steps: &[WorkflowStep],
        audio_transcript: Option<&str>,
    ) -> Result<Vec<WorkflowStep>> {
        if steps.len() <= 3 {
            return Ok(steps.to_vec());
        }

        let audio_section = if let Some(transcript) = audio_transcript.filter(|t| !t.trim().is_empty()) {
            format!("\nUser's Spoken Microphone Explanation (Audio Transcript):\n\"\"\"\n{}\n\"\"\"\n", transcript.trim())
        } else {
            String::new()
        };

        let llm = build_provider(provider)?;
        let prompt = format!(
            "Session title: {session_title}\n{audio_section}Current steps:\n{}\nRaw events:\n{}",
            serde_json::to_string_pretty(steps)?,
            events_for_prompt(events)
        );
        let response = llm
            .generate(
                "You consolidate noisy desktop recordings into concise workflow steps. \
Return JSON array only with fields step, title, description, timestamp_ms. \
Merge duplicate navigation and repeated clicks. Keep at most 15 steps. \
Do not invent actions that are not supported by the events. \
Do not use placeholders.",
                &prompt,
            )
            .await?;
        parse_steps_json(&response)
    }

    async fn enhance_documentation(
        &self,
        provider: &ProviderConfig,
        title: &str,
        overview: &str,
        steps: &[WorkflowStep],
        base_markdown: &str,
        audio_transcript: Option<&str>,
    ) -> Result<String> {
        let audio_section = if let Some(transcript) = audio_transcript.filter(|t| !t.trim().is_empty()) {
            format!("\nUser's Spoken Microphone Explanation (Audio Transcript):\n\"\"\"\n{}\n\"\"\"\n", transcript.trim())
        } else {
            String::new()
        };

        let llm = build_provider(provider)?;
        let prompt = format!(
            "Improve this workflow documentation Markdown.\n\
Title: {title}\n\
Overview: {overview}\n\
{audio_section}\
Steps JSON:\n{}\n\
Current Markdown:\n{base_markdown}\n\n\
Rules:\n\
- Keep the same number of steps and preserve every screenshot image line exactly.\n\
- Use the user's spoken audio explanation to describe each step and clarify actions.\n\
- Infer the user's goal from the recorded actions and audio explanation, and write a clear overview.\n\
- Replace generic session titles with a specific workflow title when possible.\n\
- Write concrete instructions using app names and pane titles from the steps.\n\
- Never use bracket placeholders like [MISSING SCREENSHOT] or [SPECIFY ...].\n\
- Never add TODO/TBD notes.\n\
- Return Markdown only.",
            serde_json::to_string_pretty(steps)?
        );
        llm.generate(
            "You are a technical writer turning desktop recordings into polished SOPs.",
            &prompt,
        )
        .await
    }
}

fn finalize_markdown(markdown: &str, fallback: &str, screenshots: &[Screenshot]) -> String {
    let cleaned = sanitize_markdown(markdown);
    let normalized = normalize_screenshot_references(&cleaned, screenshots);
    if normalized.trim().len() < 80 || contains_placeholder_artifacts(&normalized) {
        normalize_screenshot_references(fallback, screenshots)
    } else {
        normalized
    }
}

fn contains_placeholder_artifacts(markdown: &str) -> bool {
    markdown.contains('[')
        && (markdown.contains("MISSING")
            || markdown.contains("SPECIFY")
            || markdown.contains("SPECIFIC TARGET")
            || markdown.contains("Describe what"))
}

fn parse_steps_json(response: &str) -> Result<Vec<WorkflowStep>> {
    serde_json::from_str(&extract_json_array(response)).context("invalid steps json")
}

fn extract_json_array(response: &str) -> String {
    if let Some(start) = response.find('[') {
        if let Some(end) = response.rfind(']') {
            return response[start..=end].to_string();
        }
    }
    "[]".to_string()
}

fn emit_progress(app: &AppHandle, session_id: &str, stage: AiJobStage, status: &str) {
    let _ = app.emit(
        "ai-progress",
        AiProgressEvent {
            session_id: session_id.to_string(),
            stage: stage.as_str().to_string(),
            status: status.to_string(),
        },
    );
}

fn emit_log(app: &AppHandle, session_id: &str, message: &str) {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;
    let _ = app.emit(
        "ai-log",
        AiLogEvent {
            session_id: session_id.to_string(),
            message: message.to_string(),
            timestamp_ms: now,
        },
    );
}
