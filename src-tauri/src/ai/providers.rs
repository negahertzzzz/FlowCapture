use anyhow::{Context, Result};
use async_trait::async_trait;
use serde_json::json;

use crate::storage::models::ProviderConfig;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AiOperation {
    DocumentGeneration,
    Translation,
}

#[derive(Debug, Clone)]
pub struct GenerateOptions {
    pub allow_thinking: bool,
    pub custom_params: Option<serde_json::Value>,
}

impl Default for GenerateOptions {
    fn default() -> Self {
        Self {
            allow_thinking: true,
            custom_params: None,
        }
    }
}

pub fn get_ai_generate_options(
    db: &crate::storage::Database,
    operation: AiOperation,
) -> GenerateOptions {
    let thinking_mode = db
        .get_setting("ai_thinking_mode")
        .unwrap_or(None)
        .unwrap_or_else(|| "auto".to_string());

    let custom_params = db
        .get_setting("ai_custom_parameters")
        .unwrap_or(None)
        .and_then(|raw| {
            let trimmed = raw.trim();
            if trimmed.is_empty() {
                None
            } else {
                serde_json::from_str::<serde_json::Value>(trimmed).ok()
            }
        });

    let allow_thinking = match operation {
        // Regola esplicita: "la traduzione non deve pensare, e la traduzione è l' unica con no think"
        AiOperation::Translation => false,
        AiOperation::DocumentGeneration => match thinking_mode.as_str() {
            "no_think" => false,
            _ => true, // "auto" o "think"
        },
    };

    GenerateOptions {
        allow_thinking,
        custom_params,
    }
}

pub fn clean_ai_output(raw: &str) -> String {
    let Ok(re_think) = regex::Regex::new(r"(?is)<think>.*?</think>") else {
        return raw.trim().to_string();
    };
    let Ok(re_thought) = regex::Regex::new(r"(?is)<thought>.*?</thought>") else {
        return raw.trim().to_string();
    };
    let Ok(re_stray) = regex::Regex::new(r"(?is)</?(think|thought)>") else {
        return raw.trim().to_string();
    };

    let step1 = re_think.replace_all(raw, "");
    let step2 = re_thought.replace_all(&step1, "");
    re_stray.replace_all(&step2, "").trim().to_string()
}

#[async_trait]
pub trait LlmProvider: Send + Sync {
    async fn generate(&self, system: &str, prompt: &str, options: &GenerateOptions) -> Result<String>;

    #[allow(dead_code)]
    async fn generate_default(&self, system: &str, prompt: &str) -> Result<String> {
        self.generate(system, prompt, &GenerateOptions::default()).await
    }
}

pub fn build_provider(config: &ProviderConfig) -> Result<Box<dyn LlmProvider>> {
    match config.provider_type.as_str() {
        "openai" => Ok(Box::new(OpenAiProvider::new(config.clone())?)),
        "claude" => Ok(Box::new(ClaudeProvider::new(config.clone())?)),
        "ollama" => Ok(Box::new(OllamaProvider::new(config.clone())?)),
        "gemini" => Ok(Box::new(GeminiProvider::new(config.clone())?)),
        other => anyhow::bail!("unsupported provider type: {other}"),
    }
}

fn create_http_client() -> reqwest::Client {
    reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(15))
        .timeout(std::time::Duration::from_secs(300)) // 5 minuti di timeout per LLM locali
        .build()
        .unwrap_or_else(|_| reqwest::Client::new())
}

pub struct OpenAiProvider {
    client: reqwest::Client,
    config: ProviderConfig,
}

impl OpenAiProvider {
    pub fn new(config: ProviderConfig) -> Result<Self> {
        Ok(Self {
            client: create_http_client(),
            config,
        })
    }
}

#[async_trait]
impl LlmProvider for OpenAiProvider {
    async fn generate(&self, system: &str, prompt: &str, options: &GenerateOptions) -> Result<String> {
        let api_key = self
            .config
            .api_key
            .clone()
            .filter(|k| !k.trim().is_empty())
            .unwrap_or_else(|| "not-needed".to_string());

        let raw_base = self
            .config
            .base_url
            .clone()
            .unwrap_or_else(|| "https://api.openai.com/v1".to_string());
        let clean_base = raw_base.trim().trim_end_matches('/');
        let url = if clean_base.ends_with("/v1") || clean_base.contains("/v1/") || clean_base.starts_with("https://api.openai.com") {
            format!("{clean_base}/chat/completions")
        } else {
            format!("{clean_base}/v1/chat/completions")
        };

        let model = self
            .config
            .model
            .clone()
            .unwrap_or_else(|| "gpt-4o-mini".to_string());

        let effective_system = if !options.allow_thinking {
            format!("{system}\n\nIMPORTANT: Do NOT output thinking steps, reasoning chains, or <think>...</think> tags. Respond immediately and strictly with the final result.")
        } else {
            system.to_string()
        };

        let mut request_payload = json!({
            "model": model,
            "messages": [
                {"role": "system", "content": effective_system},
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.2
        });

        // Unisci i parametri personalizzati se specificati dall'utente
        if let Some(serde_json::Value::Object(custom_map)) = &options.custom_params {
            if let Some(obj) = request_payload.as_object_mut() {
                for (k, v) in custom_map {
                    if k != "messages" {
                        obj.insert(k.clone(), v.clone());
                    }
                }
            }
        }

        // Se think è disabilitato (es. Traduzione), rimuovi eventuali override di thinking nei custom params
        if !options.allow_thinking {
            if let Some(obj) = request_payload.as_object_mut() {
                obj.remove("thinking");
                obj.remove("chat_template_kwargs");
                obj.remove("reasoning_effort");
            }
        }

        let payload_str = serde_json::to_string_pretty(&request_payload).unwrap_or_default();

        crate::logger::log_api_request(
            &format!("OpenAI/Local ({model}) [think={}]", options.allow_thinking),
            "POST",
            &url,
            Some(&[("Authorization", &format!("Bearer {api_key}")), ("Content-Type", "application/json")]),
            &payload_str,
        );

        let start_time = std::time::Instant::now();
        let send_res = self
            .client
            .post(&url)
            .bearer_auth(api_key)
            .json(&request_payload)
            .send()
            .await;
        let duration_ms = start_time.elapsed().as_millis();

        let response = match send_res {
            Ok(resp) => resp,
            Err(e) => {
                let err_msg = if e.is_timeout() {
                    format!(
                        "Timeout di connessione superato (oltre 5 minuti) verso il server AI ({url}). \
                        Il modello locale potrebbe essere troppo lento o sovraccarico."
                    )
                } else if e.is_connect() {
                    format!(
                        "Impossibile stabilire la connessione con il server AI ({url}). \
                        Verifica che LM Studio o il server locale sia avviato e in ascolto sull'indirizzo specificato."
                    )
                } else {
                    format!("Errore di comunicazione verso il server AI ({url}): {e}")
                };
                crate::logger::log_api_error(&format!("OpenAI/Local ({model})"), &url, duration_ms, &err_msg);
                anyhow::bail!("{err_msg}");
            }
        };

        let status = response.status();
        let body_text = response.text().await.unwrap_or_default();

        if !status.is_success() {
            crate::logger::log_api_error(
                &format!("OpenAI/Local ({model})"),
                &url,
                duration_ms,
                &format!("HTTP {status}: {body_text}"),
            );
            anyhow::bail!("Il server AI su {url} ha restituito un errore HTTP {status}: {body_text}");
        }

        crate::logger::log_api_response(
            &format!("OpenAI/Local ({model})"),
            &url,
            status.as_u16(),
            duration_ms,
            &body_text,
        );

        let json_val: serde_json::Value = serde_json::from_str(&body_text)
            .context("Risposta non valida dal server AI (formato JSON non riconosciuto)")?;

        let raw_content = json_val["choices"][0]["message"]["content"]
            .as_str()
            .context("Contenuto mancante nella risposta del modello AI")?;

        Ok(clean_ai_output(raw_content))
    }
}

pub struct ClaudeProvider {
    client: reqwest::Client,
    config: ProviderConfig,
}

impl ClaudeProvider {
    pub fn new(config: ProviderConfig) -> Result<Self> {
        Ok(Self {
            client: create_http_client(),
            config,
        })
    }
}

#[async_trait]
impl LlmProvider for ClaudeProvider {
    async fn generate(&self, system: &str, prompt: &str, options: &GenerateOptions) -> Result<String> {
        let api_key = self
            .config
            .api_key
            .clone()
            .context("Claude API key not configured")?;
        let base_url = self
            .config
            .base_url
            .clone()
            .unwrap_or_else(|| "https://api.anthropic.com/v1".to_string());
        let model = self
            .config
            .model
            .clone()
            .unwrap_or_else(|| "claude-3-5-haiku-latest".to_string());

        let url = format!("{base_url}/messages");

        let effective_system = if !options.allow_thinking {
            format!("{system}\n\nIMPORTANT: Do NOT output thinking steps, reasoning chains, or <think>...</think> tags. Respond immediately and strictly with the final result.")
        } else {
            system.to_string()
        };

        let mut request_payload = json!({
            "model": model,
            "max_tokens": 4096,
            "system": effective_system,
            "messages": [
                {"role": "user", "content": prompt}
            ]
        });

        if let Some(serde_json::Value::Object(custom_map)) = &options.custom_params {
            if let Some(obj) = request_payload.as_object_mut() {
                for (k, v) in custom_map {
                    if k != "messages" && k != "system" {
                        obj.insert(k.clone(), v.clone());
                    }
                }
            }
        }

        if !options.allow_thinking {
            if let Some(obj) = request_payload.as_object_mut() {
                obj.remove("thinking");
            }
        }

        let payload_str = serde_json::to_string_pretty(&request_payload).unwrap_or_default();

        crate::logger::log_api_request(
            &format!("Anthropic Claude ({model}) [think={}]", options.allow_thinking),
            "POST",
            &url,
            Some(&[("x-api-key", &api_key), ("anthropic-version", "2023-06-01"), ("Content-Type", "application/json")]),
            &payload_str,
        );

        let start_time = std::time::Instant::now();
        let send_res = self
            .client
            .post(&url)
            .header("x-api-key", api_key)
            .header("anthropic-version", "2023-06-01")
            .json(&request_payload)
            .send()
            .await;
        let duration_ms = start_time.elapsed().as_millis();

        let response = match send_res {
            Ok(resp) => resp,
            Err(e) => {
                let err_msg = format!("Errore di rete verso Claude ({url}): {e}");
                crate::logger::log_api_error(&format!("Anthropic Claude ({model})"), &url, duration_ms, &err_msg);
                anyhow::bail!("{err_msg}");
            }
        };

        let status = response.status();
        let body_text = response.text().await.unwrap_or_default();

        if !status.is_success() {
            crate::logger::log_api_error(
                &format!("Anthropic Claude ({model})"),
                &url,
                duration_ms,
                &format!("HTTP {status}: {body_text}"),
            );
            anyhow::bail!("Claude API su {url} ha restituito un errore HTTP {status}: {body_text}");
        }

        crate::logger::log_api_response(
            &format!("Anthropic Claude ({model})"),
            &url,
            status.as_u16(),
            duration_ms,
            &body_text,
        );

        let json_val: serde_json::Value = serde_json::from_str(&body_text)
            .context("Risposta non valida da Claude API")?;

        let raw_content = json_val["content"][0]["text"]
            .as_str()
            .context("missing Claude response content")?;

        Ok(clean_ai_output(raw_content))
    }
}

pub struct OllamaProvider {
    client: reqwest::Client,
    config: ProviderConfig,
}

impl OllamaProvider {
    pub fn new(config: ProviderConfig) -> Result<Self> {
        Ok(Self {
            client: create_http_client(),
            config,
        })
    }
}

#[async_trait]
impl LlmProvider for OllamaProvider {
    async fn generate(&self, system: &str, prompt: &str, options: &GenerateOptions) -> Result<String> {
        let base_url = self
            .config
            .base_url
            .clone()
            .unwrap_or_else(|| "http://localhost:11434".to_string());
        let model = self
            .config
            .model
            .clone()
            .unwrap_or_else(|| "llama3.2".to_string());

        let effective_system = if !options.allow_thinking {
            format!("{system}\n\nIMPORTANT: Do NOT output thinking steps, reasoning chains, or <think>...</think> tags. Respond immediately and strictly with the final result.")
        } else {
            system.to_string()
        };

        // 1. Prova l'endpoint nativo di Ollama: /api/chat
        let chat_url = format!("{base_url}/api/chat");
        let mut chat_payload = json!({
            "model": model,
            "messages": [
                {"role": "system", "content": effective_system},
                {"role": "user", "content": prompt}
            ],
            "think": false,
            "stream": false
        });

        if let Some(serde_json::Value::Object(custom_map)) = &options.custom_params {
            if let Some(obj) = chat_payload.as_object_mut() {
                for (k, v) in custom_map {
                    if k != "messages" {
                        obj.insert(k.clone(), v.clone());
                    }
                }
            }
        }

        // if !options.allow_thinking {
        //     if let Some(obj) = chat_payload.as_object_mut() {
        //         obj.remove("think");
        //         if let Some(opts) = obj.get_mut("options").and_then(|o| o.as_object_mut()) {
        //             opts.remove("think");
        //         }
        //     }
        // }

        let chat_payload_str = serde_json::to_string_pretty(&chat_payload).unwrap_or_default();

        crate::logger::log_api_request(
            &format!("Ollama Native ({model}) [think={}]", options.allow_thinking),
            "POST",
            &chat_url,
            None,
            &chat_payload_str,
        );

        let start_time = std::time::Instant::now();
        let res = self
            .client
            .post(&chat_url)
            .json(&chat_payload)
            .send()
            .await;
        let duration_ms = start_time.elapsed().as_millis();

        if let Ok(resp) = res {
            let status = resp.status();
            if let Ok(body_text) = resp.text().await {
                if status.is_success() {
                    crate::logger::log_api_response(
                        &format!("Ollama Native ({model})"),
                        &chat_url,
                        status.as_u16(),
                        duration_ms,
                        &body_text,
                    );
                    if let Ok(json_res) = serde_json::from_str::<serde_json::Value>(&body_text) {
                        if let Some(content) = json_res["message"]["content"].as_str() {
                            return Ok(clean_ai_output(content));
                        }
                    }
                } else {
                    crate::logger::log_api_error(
                        &format!("Ollama Native ({model})"),
                        &chat_url,
                        duration_ms,
                        &format!("HTTP {status}: {body_text}"),
                    );
                }
            }
        }

        let clean_base = base_url.trim().trim_end_matches('/');
        let v1_url = if clean_base.ends_with("/v1") {
            format!("{clean_base}/chat/completions")
        } else {
            format!("{clean_base}/v1/chat/completions")
        };

        // 2. Fallback all'endpoint OpenAI-compatibile: /v1/chat/completions (LM Studio, LocalAI, vLLM, Ollama)
        let mut v1_payload = json!({
            "model": model,
            "messages": [
                {"role": "system", "content": effective_system},
                {"role": "user", "content": prompt}
            ],
            "think": false,
            "stream": false
        });

        if let Some(serde_json::Value::Object(custom_map)) = &options.custom_params {
            if let Some(obj) = v1_payload.as_object_mut() {
                for (k, v) in custom_map {
                    if k != "messages" {
                        obj.insert(k.clone(), v.clone());
                    }
                }
            }
        }

        if !options.allow_thinking {
            if let Some(obj) = v1_payload.as_object_mut() {
                obj.remove("thinking");
                obj.remove("chat_template_kwargs");
                obj.remove("reasoning_effort");
                // obj.remove("think");
            }
        }

        let v1_payload_str = serde_json::to_string_pretty(&v1_payload).unwrap_or_default();

        let auth_header = self.config.api_key.as_deref().filter(|k| !k.trim().is_empty());
        let headers_log = auth_header.map(|k| vec![("Authorization", k)]);

        crate::logger::log_api_request(
            &format!("Ollama/Local V1 ({model}) [think={}]", options.allow_thinking),
            "POST",
            &v1_url,
            headers_log.as_deref(),
            &v1_payload_str,
        );

        let mut req = self
            .client
            .post(&v1_url)
            .json(&v1_payload);

        if let Some(key) = auth_header {
            req = req.bearer_auth(key);
        }

        let start_v1 = std::time::Instant::now();
        let send_res = req.send().await;
        let duration_v1_ms = start_v1.elapsed().as_millis();

        let response = match send_res {
            Ok(resp) => resp,
            Err(e) => {
                let err_msg = if e.is_timeout() {
                    format!("Timeout scaduto (oltre 5 minuti) verso il server AI ({v1_url}).")
                } else if e.is_connect() {
                    format!("Impossibile connettersi al server locale su {clean_base}. Verifica che sia attivo.")
                } else {
                    format!("Errore di rete verso il server AI ({v1_url}): {e}")
                };
                crate::logger::log_api_error(&format!("Ollama/Local V1 ({model})"), &v1_url, duration_v1_ms, &err_msg);
                anyhow::bail!("{err_msg}");
            }
        };

        let status = response.status();
        let body = response.text().await.unwrap_or_default();

        if !status.is_success() {
            crate::logger::log_api_error(
                &format!("Ollama/Local V1 ({model})"),
                &v1_url,
                duration_v1_ms,
                &format!("HTTP {status}: {body}"),
            );
            anyhow::bail!("Il server AI su {v1_url} ha risposto con errore HTTP {status}: {body}");
        }

        crate::logger::log_api_response(
            &format!("Ollama/Local V1 ({model})"),
            &v1_url,
            status.as_u16(),
            duration_v1_ms,
            &body,
        );

        let json_val: serde_json::Value = serde_json::from_str(&body).context("risposta JSON non valida da Ollama/Local LLM")?;
        let raw_content = json_val["choices"][0]["message"]["content"]
            .as_str()
            .context("contenuto mancante nella risposta di Ollama/Local LLM")?;

        Ok(clean_ai_output(raw_content))
    }
}

pub struct GeminiProvider {
    client: reqwest::Client,
    config: ProviderConfig,
}

impl GeminiProvider {
    pub fn new(config: ProviderConfig) -> Result<Self> {
        Ok(Self {
            client: create_http_client(),
            config,
        })
    }
}

#[async_trait]
impl LlmProvider for GeminiProvider {
    async fn generate(&self, system: &str, prompt: &str, options: &GenerateOptions) -> Result<String> {
        let api_key = self
            .config
            .api_key
            .clone()
            .context("Gemini API key not configured")?;
        let base_url = self
            .config
            .base_url
            .clone()
            .unwrap_or_else(|| "https://generativelanguage.googleapis.com/v1beta".to_string());
        let model = self
            .config
            .model
            .clone()
            .unwrap_or_else(|| "gemini-2.5-flash".to_string());

        let url = format!("{base_url}/models/{model}:generateContent");

        let effective_system = if !options.allow_thinking {
            format!("{system}\n\nIMPORTANT: Do NOT output thinking steps, reasoning chains, or <think>...</think> tags. Respond immediately and strictly with the final result.")
        } else {
            system.to_string()
        };

        let mut payload = json!({
            "systemInstruction": {
                "parts": [{ "text": effective_system }]
            },
            "contents": [{
                "role": "user",
                "parts": [{ "text": prompt }]
            }],
            "generationConfig": {
                "temperature": 0.2
            }
        });

        if let Some(serde_json::Value::Object(custom_map)) = &options.custom_params {
            if let Some(gen_cfg) = payload.get_mut("generationConfig").and_then(|g| g.as_object_mut()) {
                for (k, v) in custom_map {
                    gen_cfg.insert(k.clone(), v.clone());
                }
            }
        }

        if !options.allow_thinking {
            if let Some(gen_cfg) = payload.get_mut("generationConfig").and_then(|g| g.as_object_mut()) {
                gen_cfg.insert("thinkingConfig".to_string(), json!({ "thinkingBudget": 0 }));
            }
        }

        let payload_str = serde_json::to_string_pretty(&payload).unwrap_or_default();

        crate::logger::log_api_request(
            &format!("Google Gemini ({model}) [think={}]", options.allow_thinking),
            "POST",
            &url,
            Some(&[("x-goog-api-key", &api_key), ("Content-Type", "application/json")]),
            &payload_str,
        );

        let start_time = std::time::Instant::now();
        let send_res = self
            .client
            .post(&url)
            .header("x-goog-api-key", api_key)
            .json(&payload)
            .send()
            .await;
        let duration_ms = start_time.elapsed().as_millis();

        let response = match send_res {
            Ok(r) => r,
            Err(e) => {
                let err_msg = format!("Errore di rete verso Gemini ({url}): {e}");
                crate::logger::log_api_error(&format!("Google Gemini ({model})"), &url, duration_ms, &err_msg);
                anyhow::bail!("{err_msg}");
            }
        };

        let status = response.status();
        let body = response.text().await.unwrap_or_default();

        if !status.is_success() {
            crate::logger::log_api_error(
                &format!("Google Gemini ({model})"),
                &url,
                duration_ms,
                &format!("HTTP {status}: {body}"),
            );
            anyhow::bail!("Gemini API su {url} ha risposto con errore HTTP {status}: {body}");
        }

        crate::logger::log_api_response(
            &format!("Google Gemini ({model})"),
            &url,
            status.as_u16(),
            duration_ms,
            &body,
        );

        let json_val: serde_json::Value = serde_json::from_str(&body).context("JSON non valido da Gemini")?;
        let raw_content = json_val["candidates"][0]["content"]["parts"][0]["text"]
            .as_str()
            .context("missing Gemini response content")?;

        Ok(clean_ai_output(raw_content))
    }
}
