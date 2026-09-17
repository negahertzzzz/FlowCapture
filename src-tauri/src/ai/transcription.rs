use std::path::Path;
use anyhow::{Context, Result};
use base64::Engine;
use reqwest::Client;
use serde_json::json;

use crate::storage::models::ProviderConfig;

pub async fn transcribe_audio(
    provider: &ProviderConfig,
    audio_path: &Path,
    language: Option<&str>,
) -> Result<String> {
    let bytes = std::fs::read(audio_path)
        .with_context(|| format!("failed to read audio file at {}", audio_path.display()))?;

    if bytes.is_empty() {
        anyhow::bail!("audio file is empty");
    }

    match provider.provider_type.as_str() {
        "openai" => transcribe_openai(provider, audio_path, bytes, language).await,
        "gemini" => transcribe_gemini(provider, audio_path, bytes, language).await,
        "ollama" => transcribe_ollama(provider, audio_path, bytes, language).await,
        other => {
            anyhow::bail!("Audio transcription is supported with OpenAI (Whisper), Gemini, and Local/Self-hosted (Whisper/Ollama). Configured provider: {other}")
        }
    }
}

fn create_transcription_client() -> Client {
    Client::builder()
        .connect_timeout(std::time::Duration::from_secs(15))
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .unwrap_or_else(|_| Client::new())
}

async fn transcribe_openai(
    provider: &ProviderConfig,
    audio_path: &Path,
    bytes: Vec<u8>,
    language: Option<&str>,
) -> Result<String> {
    let api_key = provider
        .api_key
        .clone()
        .filter(|k| !k.trim().is_empty())
        .unwrap_or_else(|| "not-needed".to_string());
    let base_url = provider
        .base_url
        .clone()
        .unwrap_or_else(|| "https://api.openai.com/v1".to_string());

    let clean_base = base_url.trim().trim_end_matches('/');
    let url = if clean_base.ends_with("/audio/transcriptions") {
        clean_base.to_string()
    } else if clean_base.ends_with("/v1") || clean_base.starts_with("https://api.openai.com") {
        format!("{clean_base}/audio/transcriptions")
    } else {
        format!("{clean_base}/v1/audio/transcriptions")
    };

    let file_name = audio_path
        .file_name()
        .map(|f| f.to_string_lossy().to_string())
        .unwrap_or_else(|| "recording.webm".to_string());

    let model_name = provider
        .model
        .clone()
        .unwrap_or_else(|| "whisper-1".to_string());

    let bytes_len = bytes.len();
    let client = create_transcription_client();
    let part = reqwest::multipart::Part::bytes(bytes).file_name(file_name.clone());
    let mut form = reqwest::multipart::Form::new()
        .part("file", part)
        .text("model", model_name.clone());

    if let Some(lang) = language.filter(|l| !l.is_empty() && *l != "auto") {
        form = form.text("language", lang.to_string());
    }

    let payload_desc = format!(
        "File: {file_name} ({bytes_len} bytes), Modello: {model_name}, Lingua: {:?}",
        language
    );
    crate::logger::log_api_request("Whisper/OpenAI Audio", "POST", &url, None, &payload_desc);

    let start_time = std::time::Instant::now();
    let send_res = client
        .post(&url)
        .bearer_auth(&api_key)
        .multipart(form)
        .send()
        .await;
    let duration_ms = start_time.elapsed().as_millis();

    let response = match send_res {
        Ok(resp) => resp,
        Err(e) => {
            let err_msg = if e.is_timeout() {
                format!("Timeout scaduto (oltre 5 minuti) in attesa di trascrizione da {url}.")
            } else if e.is_connect() {
                format!("Impossibile connettersi al server di trascrizione su {url}. Verifica che sia attivo.")
            } else {
                format!("Errore di rete verso {url}: {e}")
            };
            crate::logger::log_api_error("Whisper/OpenAI Audio", &url, duration_ms, &err_msg);
            anyhow::bail!("{err_msg}");
        }
    };

    let status = response.status();
    let body = response.text().await.unwrap_or_default();

    if !status.is_success() {
        crate::logger::log_api_error(
            "Whisper/OpenAI Audio",
            &url,
            duration_ms,
            &format!("HTTP {status}: {body}"),
        );
        anyhow::bail!("Whisper API su {url} ha risposto con errore HTTP {status}: {body}");
    }

    crate::logger::log_api_response(
        "Whisper/OpenAI Audio",
        &url,
        status.as_u16(),
        duration_ms,
        &body,
    );

    let json_val: serde_json::Value = serde_json::from_str(&body)
        .context("risposta JSON non valida da Whisper")?;

    json_val["text"]
        .as_str()
        .map(str::to_string)
        .context("missing OpenAI Whisper transcription in response")
}

async fn transcribe_gemini(
    provider: &ProviderConfig,
    audio_path: &Path,
    bytes: Vec<u8>,
    language: Option<&str>,
) -> Result<String> {
    let api_key = provider
        .api_key
        .clone()
        .context("Gemini API key not configured")?;
    let base_url = provider
        .base_url
        .clone()
        .unwrap_or_else(|| "https://generativelanguage.googleapis.com/v1beta".to_string());
    let model = provider
        .model
        .clone()
        .unwrap_or_else(|| "gemini-2.5-flash".to_string());

    let ext = audio_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("webm")
        .to_lowercase();
    let mime_type = match ext.as_str() {
        "wav" => "audio/wav",
        "mp3" => "audio/mp3",
        "ogg" => "audio/ogg",
        "m4a" => "audio/m4a",
        _ => "audio/webm",
    };

    let base64_audio = base64::engine::general_purpose::STANDARD.encode(&bytes);

    let prompt_text = match language {
        Some("it") => "Transcribe the spoken audio verbatim in Italian. Output only the transcript without conversational pleasantries or commentary.".to_string(),
        Some("en") => "Transcribe the spoken audio verbatim in English. Output only the transcript without conversational pleasantries or commentary.".to_string(),
        Some("es") => "Transcribe the spoken audio verbatim in Spanish. Output only the transcript without conversational pleasantries or commentary.".to_string(),
        Some("fr") => "Transcribe the spoken audio verbatim in French. Output only the transcript without conversational pleasantries or commentary.".to_string(),
        Some("de") => "Transcribe the spoken audio verbatim in German. Output only the transcript without conversational pleasantries or commentary.".to_string(),
        Some(other) if !other.is_empty() && other != "auto" => format!("Transcribe the spoken audio verbatim in {other}. Output only the transcript without conversational pleasantries or commentary."),
        _ => "Transcribe the spoken audio verbatim in its original spoken language (Italian by default if detected). Output only the transcript without conversational pleasantries or commentary.".to_string(),
    };

    let client = create_transcription_client();
    let response = client
        .post(format!("{base_url}/models/{model}:generateContent"))
        .header("x-goog-api-key", api_key)
        .json(&json!({
            "contents": [{
                "role": "user",
                "parts": [
                    {
                        "inline_data": {
                            "mime_type": mime_type,
                            "data": base64_audio
                        }
                    },
                    {
                        "text": prompt_text
                    }
                ]
            }]
        }))
        .send()
        .await?
        .error_for_status()?
        .json::<serde_json::Value>()
        .await?;

    response["candidates"][0]["content"]["parts"][0]["text"]
        .as_str()
        .map(str::to_string)
        .context("missing Gemini transcription response content")
}

async fn transcribe_ollama(
    provider: &ProviderConfig,
    audio_path: &Path,
    bytes: Vec<u8>,
    language: Option<&str>,
) -> Result<String> {
    let base_url = provider
        .base_url
        .clone()
        .unwrap_or_else(|| "http://localhost:11434".to_string());
    let model = provider
        .model
        .clone()
        .unwrap_or_else(|| "whisper".to_string());

    let file_name = audio_path
        .file_name()
        .map(|f| f.to_string_lossy().to_string())
        .unwrap_or_else(|| "recording.webm".to_string());

    let client = create_transcription_client();

    // 1. First attempt: OpenAI-compatible audio transcription endpoint (used by whisper.cpp server, faster-whisper server, vLLM, LocalAI)
    let part = reqwest::multipart::Part::bytes(bytes.clone()).file_name(file_name.clone());
    let mut form = reqwest::multipart::Form::new()
        .part("file", part)
        .text("model", model.clone());

    if let Some(lang) = language.filter(|l| !l.is_empty() && *l != "auto") {
        form = form.text("language", lang.to_string());
    }

    let mut req = client.post(format!("{base_url}/v1/audio/transcriptions")).multipart(form);
    if let Some(key) = &provider.api_key {
        if !key.trim().is_empty() {
            req = req.bearer_auth(key);
        }
    }

    if let Ok(res) = req.send().await {
        if res.status().is_success() {
            if let Ok(json_res) = res.json::<serde_json::Value>().await {
                if let Some(text) = json_res["text"].as_str() {
                    return Ok(text.to_string());
                }
            }
        }
    }

    // 2. Second attempt: Ollama chat/generate API with audio base64 if a multimodal model is used
    let chat_instruction = match language {
        Some("it") => "Transcribe the spoken audio in Italian. Output only the transcript verbatim.",
        Some(other) if !other.is_empty() && other != "auto" => &format!("Transcribe the spoken audio in {other}. Output only the transcript verbatim."),
        _ => "Transcribe the spoken audio in its original language. Output only the transcript verbatim.",
    };

    let base64_audio = base64::engine::general_purpose::STANDARD.encode(&bytes);
    let res = client
        .post(format!("{base_url}/api/chat"))
        .json(&json!({
            "model": model,
            "messages": [
                {
                    "role": "user",
                    "content": chat_instruction,
                    "images": [base64_audio]
                }
            ],
            "stream": false
        }))
        .send()
        .await;

    if let Ok(response) = res {
        if response.status().is_success() {
            if let Ok(val) = response.json::<serde_json::Value>().await {
                if let Some(txt) = val["message"]["content"].as_str() {
                    return Ok(txt.to_string());
                }
            }
        }
    }

    anyhow::bail!(
        "Impossibile trascrivere l'audio con Ollama/Self-hosted. Assicurati che un server compatibile con Whisper (es. whisper.cpp, faster-whisper o LocalAI) o un modello audio sia in esecuzione su {base_url} con modello '{model}'."
    )
}
