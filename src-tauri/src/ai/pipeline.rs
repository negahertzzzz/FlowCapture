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
use crate::ai::transcription::{AudioSegment, transcribe_audio_with_segments};
use crate::compression::compress_events;
use crate::security::redact_events;
use crate::storage::Database;
use crate::storage::models::{
    AiJobStage, AiJobStatus, Documentation, DocumentationMetadata, ProviderConfig, RedactionSummary,
    SessionEvent, Screenshot, WorkflowStep,
};

/// Increment this when prompts are changed, so every ai_jobs row records which version was used.
const PROMPT_VERSION: &str = "v2";

/// An event paired with nearby spoken audio segments (within a ±5s window).
#[derive(serde::Serialize)]
struct AlignedEvent<'a> {
    event: &'a SessionEvent,
    /// Text of audio segments that temporally overlap this event (3s before → 2s after).
    nearby_audio: Vec<&'a str>,
}

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

        let audio_transcript_result = {
            let stored_segments = session
                .audio_segments_json
                .as_deref()
                .and_then(|j| serde_json::from_str::<Vec<AudioSegment>>(j).ok())
                .unwrap_or_default();

            let has_valid_stored_segments = !stored_segments.is_empty();
            let has_existing_text = session
                .audio_transcript
                .as_ref()
                .map(|t| !t.trim().is_empty())
                .unwrap_or(false);

            if has_valid_stored_segments && has_existing_text {
                let existing_text = session.audio_transcript.as_ref().unwrap();
                emit_log(
                    app,
                    session_id,
                    &format!(
                        "Utilizzo trascrizione vocale e {} segmenti temporizzati esistenti a database",
                        stored_segments.len()
                    ),
                );
                Some(crate::ai::transcription::TranscriptionResult {
                    text: existing_text.clone(),
                    segments: stored_segments,
                })
            } else if let Some(audio_path_str) = &session.audio_path {
                let audio_path = std::path::Path::new(audio_path_str);
                if audio_path.is_file() {
                    if has_existing_text {
                        emit_log(
                            app,
                            session_id,
                            "Trascrizione presente ma priva di segmentazione temporizzata a DB. Avvio analisi audio con Whisper per recuperare i segmenti...",
                        );
                    } else {
                        emit_log(
                            app,
                            session_id,
                            "Avvio trascrizione audio del microfono con AI...",
                        );
                    }

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

                    let transcription_lang = self.db.get_setting("transcription_language").unwrap_or(None);

                    match transcribe_audio_with_segments(&trans_provider, audio_path, transcription_lang.as_deref()).await {
                        Ok(result) => {
                            let _ = self.db.update_session_audio_transcript(session_id, &result.text);
                            emit_log(app, session_id, &format!(
                                "Trascrizione vocale completata con {}: {} caratteri, {} segmenti temporizzati",
                                trans_provider.name, result.text.len(), result.segments.len()
                            ));
                            // Persist timed segments to DB for replay/re-alignment
                            if !result.segments.is_empty() {
                                if let Ok(segs_json) = serde_json::to_string(&result.segments) {
                                    let _ = self.db.update_session_audio_segments(session_id, &segs_json);
                                }
                            }
                            Some(result)
                        }
                        Err(err) => {
                            emit_log(app, session_id, &format!("Trascrizione non riuscita: {err}"));
                            if let Some(existing_text) = &session.audio_transcript {
                                emit_log(app, session_id, "Utilizzo comunque il testo della trascrizione precedentemente salvato");
                                Some(crate::ai::transcription::TranscriptionResult {
                                    text: existing_text.clone(),
                                    segments: vec![],
                                })
                            } else {
                                None
                            }
                        }
                    }
                } else if let Some(existing_text) = &session.audio_transcript {
                    emit_log(app, session_id, "Utilizzo trascrizione vocale esistente (file audio non presente per ri-segmentare)");
                    Some(crate::ai::transcription::TranscriptionResult {
                        text: existing_text.clone(),
                        segments: vec![],
                    })
                } else {
                    None
                }
            } else if let Some(existing_text) = &session.audio_transcript {
                emit_log(app, session_id, "Utilizzo trascrizione vocale esistente");
                Some(crate::ai::transcription::TranscriptionResult {
                    text: existing_text.clone(),
                    segments: vec![],
                })
            } else {
                None
            }
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

        let session_start_ms = chrono::DateTime::parse_from_rfc3339(&session.started_at)
            .map(|dt| dt.timestamp_millis())
            .ok();

        // Build pre-aligned event+audio pairs in Rust (deterministic, no AI guesswork needed)
        let aligned_events = if let Some(ref result) = audio_transcript_result {
            if !result.segments.is_empty() {
                let aligned = align_audio_to_events(&redacted_events, &result.segments, session_start_ms);
                emit_log(app, session_id, &format!(
                    "Allineamento deterministico audio-eventi: {}/{} eventi con audio associato",
                    aligned.iter().filter(|a| !a.nearby_audio.is_empty()).count(),
                    aligned.len()
                ));
                Some(aligned)
            } else {
                None
            }
        } else {
            None
        };

        let audio_text = audio_transcript_result.as_ref().map(|r| r.text.as_str()).filter(|t| !t.trim().is_empty());

        let timeout_secs = self
            .db
            .get_setting("ai_generation_timeout_seconds")
            .ok()
            .flatten()
            .and_then(|s| s.parse::<u64>().ok())
            .unwrap_or(600);

        let refine_timeout = Duration::from_secs((timeout_secs / 2).max(60));
        let enhance_timeout = Duration::from_secs(timeout_secs.max(120));

        emit_log(app, session_id, "Ottimizzazione passaggi con modello LLM...");
        let refine_fut = self.refine_timeline(
            &provider,
            &session.title,
            &redacted_events,
            &steps,
            audio_text,
            aligned_events.as_deref(),
        );

        match tokio::time::timeout(refine_timeout, refine_fut).await {
            Ok(Ok(ai_steps)) => {
                if !ai_steps.is_empty() && ai_steps.len() <= 120 {
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
            Some(json!({ "steps": steps, "prompt_version": PROMPT_VERSION }).to_string()),
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

        let highlight_enabled = self
            .db
            .get_setting("highlight_clicks")
            .ok()
            .flatten()
            .map(|val| val != "false")
            .unwrap_or(true);

        if highlight_enabled {
            emit_log(app, session_id, "Evidenziazione punti di click sugli screenshot del documento...");
            crate::export::prepare_screenshots_for_export(&screenshots);
        }

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
            infer_workflow_summary(&session.title, &redacted_events, &steps, audio_text);
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
            audio_text,
            aligned_events.as_deref(),
        );

        let markdown = match tokio::time::timeout(enhance_timeout, enhance_fut).await {
            Ok(Ok(enhanced)) => {
                emit_progress(app, session_id, AiJobStage::TechnicalWriter, "completed");
                emit_log(app, session_id, "Guida generata con successo dal modello AI");
                self.db.finish_ai_job(
                    &writer_job.id,
                    AiJobStatus::Completed,
                    Some(json!({ "length": enhanced.len(), "prompt_version": PROMPT_VERSION }).to_string()),
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
        aligned_events: Option<&[AlignedEvent<'_>]>,
    ) -> Result<Vec<WorkflowStep>> {
        if steps.len() <= 3 {
            return Ok(steps.to_vec());
        }

        // Build the audio context section for the prompt
        let audio_section = build_audio_context_section(audio_transcript, aligned_events);

        let options = crate::ai::providers::get_ai_generate_options(
            &self.db,
            crate::ai::providers::AiOperation::DocumentGeneration,
        );
        let llm = build_provider(provider)?;
        let prompt = format!(
            "Session title: {session_title}\n{audio_section}Current steps:\n{}\nRaw events:\n{}",
            serde_json::to_string_pretty(steps)?,
            events_for_prompt(events)
        );

        let system = "You consolidate noisy desktop recordings into concise, instructive workflow steps. \
Return a JSON array ONLY. Each element must have exactly these fields: \
  step (integer), title (string), description (string), reason (string or null), timestamp_ms (integer). \
Rules: \
- Merge duplicate navigation and repeated clicks. Keep the steps concise, but cover the ENTIRE recorded workflow from the very beginning to the end without omitting actions. \
- When an action or window switch involves a web browser (Google Chrome, Microsoft Edge, Mozilla Firefox, Brave, etc.), explicitly tell the user to go to or open the browser (e.g., 'Vai sul browser (Google Chrome)' / 'Apri il browser'). \
- When an event provides 'element_name', 'element_type', or 'url', describe clicking that specific element \
  (e.g., 'Click \"Submit\" button'). \
- 'description': explain WHAT to do, WHERE (app/window/UI element), and HOW. \
- 'reason': explain WHY this step is needed in the overall workflow. \
  If the user's audio transcript contains a spoken explanation for this step, use it verbatim or paraphrase it. \
  If no reason can be inferred, set reason to null. \
- When pre-aligned audio is provided, each event already has 'nearby_audio' — use those phrases directly to fill 'reason'. \
- Do not invent actions not supported by the events. Do not use placeholders.";

        let response = llm.generate(system, &prompt, &options).await?;
        parse_steps_json_with_retry(&*llm, system, &response, &options).await
    }

    async fn enhance_documentation(
        &self,
        provider: &ProviderConfig,
        title: &str,
        overview: &str,
        steps: &[WorkflowStep],
        base_markdown: &str,
        audio_transcript: Option<&str>,
        aligned_events: Option<&[AlignedEvent<'_>]>,
    ) -> Result<String> {
        let audio_section = build_audio_context_section(audio_transcript, aligned_events);

        let options = crate::ai::providers::get_ai_generate_options(
            &self.db,
            crate::ai::providers::AiOperation::DocumentGeneration,
        );
        let llm = build_provider(provider)?;
        let prompt = format!(
            "Improve this workflow documentation Markdown.\n\
Title: {title}\n\
Overview: {overview}\n\
{audio_section}\
Steps JSON (each step may include a 'reason' field with the user's spoken explanation):\n{}\n\
Current Markdown:\n{base_markdown}\n\n\
Rules:\n\
- Write a COMPLETE USER GUIDE in Markdown with these sections:\n\
  1. Title: A specific, descriptive title for the workflow\n\
  2. Overview: What this guide is about, what the user will accomplish, and why it is useful\n\
  3. Prerequisites: Any software, accounts, or setup needed before starting (infer from the apps and URLs used)\n\
  4. Steps: Detailed numbered steps with clear instructions covering the ENTIRE recorded workflow from start to finish\n\
  5. Expected Result: What the user should see or have at the end of the workflow\n\
- When actions occur in web browsers like Google Chrome, Microsoft Edge, or Mozilla Firefox, explicitly tell the user to open or go to the browser (e.g., 'Vai sul browser / Apri il browser (Google Chrome/Edge/Firefox)').\n\
- Keep the same number of steps and preserve every screenshot image line (![...](...)) EXACTLY as-is, unchanged.\n\
- For each step, explain:\n\
  (a) WHAT to do (the specific action)\n\
  (b) WHERE to do it (which app, window, panel, or menu)\n\
  (c) HOW to do it (click which button, type what text, navigate which menu path)\n\
  (d) WHY — if a 'reason' is present in the step JSON, use it as the basis for this explanation;\n\
      if pre-aligned audio is provided, use the 'nearby_audio' phrases for context.\n\
- Use the event data fields: 'element_name' for exact UI element names, 'element_type' \
for element kinds (button, link, input), and 'url' for web addresses.\n\
- Infer the user's goal from the recorded actions and audio explanation, and write a clear overview.\n\
- Replace generic session titles with a specific workflow title when possible.\n\
- Write concrete instructions using real app names, window titles, and menu paths from the steps.\n\
- Never use bracket placeholders like [MISSING SCREENSHOT] or [SPECIFY ...].\n\
- Never add TODO/TBD notes.\n\
- Return Markdown only.",
            serde_json::to_string_pretty(steps)?
        );
        llm.generate(
            "You are an expert technical writer creating detailed, step-by-step user guides \
from desktop workflow recordings. Your output must be a complete, self-contained guide \
that a user with no prior knowledge can follow to reproduce the exact workflow.",
            &prompt,
            &options,
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

/// Attempts to parse steps JSON from the AI response. If parsing fails, sends a correction
/// prompt asking the model to fix its own output before giving up.
async fn parse_steps_json_with_retry(
    llm: &dyn crate::ai::providers::LlmProvider,
    system: &str,
    response: &str,
    options: &crate::ai::providers::GenerateOptions,
) -> Result<Vec<WorkflowStep>> {
    // First attempt
    match parse_steps_json(response) {
        Ok(steps) if !steps.is_empty() => return Ok(steps),
        _ => {}
    }

    // Second attempt: ask the model to correct its own output
    let correction_prompt = format!(
        "Your previous output could not be parsed as a valid JSON array. \
The required schema is: [{{\"step\": integer, \"title\": string, \"description\": string, \
\"reason\": string_or_null, \"timestamp_ms\": integer}}, ...]. \
Return ONLY the corrected JSON array, nothing else. \
Previous output:\n{response}"
    );

    let corrected = llm.generate(system, &correction_prompt, options).await?;
    parse_steps_json(&corrected)
}

fn extract_json_array(response: &str) -> String {
    if let Some(start) = response.find('[') {
        if let Some(end) = response.rfind(']') {
            return response[start..=end].to_string();
        }
    }
    "[]".to_string()
}

/// Deterministically aligns audio segments to events by timestamp proximity.
/// Converts absolute epoch event timestamps to relative audio file offsets using T0.
/// For each event, finds all segments whose `[start_ms - PRE_MS, end_ms + POST_MS]` window
/// overlaps the event's timestamp. The model then receives already-paired data.
fn align_audio_to_events<'a>(
    events: &'a [SessionEvent],
    segments: &'a [AudioSegment],
    session_start_ms: Option<i64>,
) -> Vec<AlignedEvent<'a>> {
    // Window: 3s before event (user often explains before clicking) to 2s after
    const PRE_MS: i64 = 3000;
    const POST_MS: i64 = 2000;

    let first_event_ts = events.first().map(|e| e.timestamp_ms).unwrap_or(0);
    let is_epoch = first_event_ts > 1_000_000_000_000;

    let t0 = if is_epoch {
        if let Some(start_ms) = session_start_ms.filter(|&s| s > 0 && (s - first_event_ts).abs() < 120_000) {
            start_ms.min(first_event_ts)
        } else {
            first_event_ts
        }
    } else {
        0
    };

    events
        .iter()
        .map(|event| {
            let event_offset_ms = if is_epoch {
                event.timestamp_ms.saturating_sub(t0)
            } else {
                event.timestamp_ms
            };

            let window_start = event_offset_ms.saturating_sub(PRE_MS);
            let window_end = event_offset_ms + POST_MS;

            let nearby_audio = segments
                .iter()
                .filter(|seg| {
                    // Segment overlaps [window_start, window_end]
                    seg.start_ms <= window_end && seg.end_ms >= window_start
                })
                .map(|seg| seg.text.as_str())
                .collect::<Vec<_>>();
            AlignedEvent { event, nearby_audio }
        })
        .collect()
}

/// Builds the audio context block for an AI prompt.
/// If pre-aligned events are available, formats them as structured JSON pairs (deterministic).
/// Otherwise falls back to a plain transcript blob.
fn build_audio_context_section(
    audio_transcript: Option<&str>,
    aligned_events: Option<&[AlignedEvent<'_>]>,
) -> String {
    if let Some(aligned) = aligned_events {
        // Only include events that have nearby audio
        let with_audio: Vec<_> = aligned
            .iter()
            .filter(|a| !a.nearby_audio.is_empty())
            .collect();

        if !with_audio.is_empty() {
            let pairs_json = with_audio
                .iter()
                .map(|a| {
                    serde_json::json!({
                        "event_type": a.event.event_type,
                        "app": a.event.app_name,
                        "timestamp_ms": a.event.timestamp_ms,
                        "nearby_audio": a.nearby_audio,
                    })
                })
                .collect::<Vec<_>>();
            return format!(
                "\nPre-aligned Audio-Event pairs (audio already matched to the nearest event by timestamp):\n{}\n\n",
                serde_json::to_string_pretty(&pairs_json).unwrap_or_default()
            );
        }
    }

    // Fallback: plain blob
    if let Some(transcript) = audio_transcript.filter(|t| !t.trim().is_empty()) {
        format!(
            "\nUser's Spoken Microphone Explanation (Audio Transcript):\n\"\"\"\n{}\n\"\"\"\n",
            transcript.trim()
        )
    } else {
        String::new()
    }
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

pub fn emit_log(app: &AppHandle, session_id: &str, message: &str) {
    crate::logger::info(&format!("AI:{session_id}"), message);
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
