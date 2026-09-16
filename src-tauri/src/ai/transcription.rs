use std::path::Path;
use anyhow::{Context, Result};
use base64::Engine;
use reqwest::Client;
use serde_json::json;

use crate::storage::models::ProviderConfig;

pub async fn transcribe_audio(
    provider: &ProviderConfig,
    audio_path: &Path,
) -> Result<String> {
    let bytes = std::fs::read(audio_path)
        .with_context(|| format!("failed to read audio file at {}", audio_path.display()))?;

    if bytes.is_empty() {
        anyhow::bail!("audio file is empty");
    }

    match provider.provider_type.as_str() {
        "openai" => transcribe_openai(provider, audio_path, bytes).await,
        "gemini" => transcribe_gemini(provider, audio_path, bytes).await,
        "ollama" => transcribe_ollama(provider, audio_path, bytes).await,
        other => {
            anyhow::bail!("Audio transcription is supported with OpenAI (Whisper), Gemini, and Local/Self-hosted (Whisper/Ollama). Configured provider: {other}")
        }
    }
}

fn create_transcription_client() -> Client {
    Client::builder()
        .connect_timeout(std::time::Duration::from_secs(10))
        .timeout(std::time::Duration::from_secs(45))
        .build()
        .unwrap_or_else(|_| Client::new())
}

async fn transcribe_openai(
    provider: &ProviderConfig,
    audio_path: &Path,
    bytes: Vec<u8>,
) -> Result<String> {
    let api_key = provider
        .api_key
        .clone()
        .context("OpenAI API key not configured")?;
    let base_url = provider
        .base_url
        .clone()
        .unwrap_or_else(|| "https://api.openai.com/v1".to_string());

    let file_name = audio_path
        .file_name()
        .map(|f| f.to_string_lossy().to_string())
        .unwrap_or_else(|| "recording.webm".to_string());

    let client = create_transcription_client();
    let part = reqwest::multipart::Part::bytes(bytes).file_name(file_name);
    let form = reqwest::multipart::Form::new()
        .part("file", part)
        .text("model", "whisper-1");

    let response = client
        .post(format!("{base_url}/audio/transcriptions"))
        .bearer_auth(api_key)
        .multipart(form)
        .send()
        .await?
        .error_for_status()?
        .json::<serde_json::Value>()
        .await?;

    response["text"]
        .as_str()
        .map(str::to_string)
        .context("missing OpenAI Whisper transcription in response")
}

async fn transcribe_gemini(
    provider: &ProviderConfig,
    audio_path: &Path,
    bytes: Vec<u8>,
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
                        "text": "Transcribe the spoken audio verbatim in its original spoken language (such as Italian, English, etc.). Output only the transcript without conversational pleasantries or commentary."
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
    let form = reqwest::multipart::Form::new()
        .part("file", part)
        .text("model", model.clone());

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
    let base64_audio = base64::engine::general_purpose::STANDARD.encode(&bytes);
    let res = client
        .post(format!("{base_url}/api/chat"))
        .json(&json!({
            "model": model,
            "messages": [
                {
                    "role": "user",
                    "content": "Transcribe the spoken audio in its original language. Output only the transcript verbatim.",
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
