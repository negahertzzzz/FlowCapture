use anyhow::{Context, Result};
use async_trait::async_trait;
use serde_json::json;

use crate::storage::models::ProviderConfig;

#[async_trait]
pub trait LlmProvider: Send + Sync {
    async fn generate(&self, system: &str, prompt: &str) -> Result<String>;
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
        .connect_timeout(std::time::Duration::from_secs(10))
        .timeout(std::time::Duration::from_secs(90))
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
    async fn generate(&self, system: &str, prompt: &str) -> Result<String> {
        let api_key = self
            .config
            .api_key
            .clone()
            .context("OpenAI API key not configured")?;
        let base_url = self
            .config
            .base_url
            .clone()
            .unwrap_or_else(|| "https://api.openai.com/v1".to_string());
        let model = self
            .config
            .model
            .clone()
            .unwrap_or_else(|| "gpt-4o-mini".to_string());

        let response = self
            .client
            .post(format!("{base_url}/chat/completions"))
            .bearer_auth(api_key)
            .json(&json!({
                "model": model,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": prompt}
                ],
                "temperature": 0.2
            }))
            .send()
            .await?
            .error_for_status()?
            .json::<serde_json::Value>()
            .await?;

        response["choices"][0]["message"]["content"]
            .as_str()
            .map(str::to_string)
            .context("missing OpenAI response content")
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
    async fn generate(&self, system: &str, prompt: &str) -> Result<String> {
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

        let response = self
            .client
            .post(format!("{base_url}/messages"))
            .header("x-api-key", api_key)
            .header("anthropic-version", "2023-06-01")
            .json(&json!({
                "model": model,
                "max_tokens": 4096,
                "system": system,
                "messages": [
                    {"role": "user", "content": prompt}
                ]
            }))
            .send()
            .await?
            .error_for_status()?
            .json::<serde_json::Value>()
            .await?;

        response["content"][0]["text"]
            .as_str()
            .map(str::to_string)
            .context("missing Claude response content")
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
    async fn generate(&self, system: &str, prompt: &str) -> Result<String> {
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

        // 1. Try Ollama native chat endpoint: /api/chat
        let res = self
            .client
            .post(format!("{base_url}/api/chat"))
            .json(&json!({
                "model": model,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": prompt}
                ],
                "stream": false
            }))
            .send()
            .await;

        if let Ok(resp) = res {
            if resp.status().is_success() {
                if let Ok(json_res) = resp.json::<serde_json::Value>().await {
                    if let Some(content) = json_res["message"]["content"].as_str() {
                        return Ok(content.to_string());
                    }
                }
            }
        }

        // 2. Fallback to OpenAI-compatible endpoint: /v1/chat/completions (LM Studio, LocalAI, vLLM, Ollama)
        let mut req = self
            .client
            .post(format!("{base_url}/v1/chat/completions"))
            .json(&json!({
                "model": model,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": prompt}
                ],
                "temperature": 0.2
            }));

        if let Some(key) = &self.config.api_key {
            if !key.trim().is_empty() {
                req = req.bearer_auth(key);
            }
        }

        let response = req
            .send()
            .await?
            .error_for_status()?
            .json::<serde_json::Value>()
            .await?;

        response["choices"][0]["message"]["content"]
            .as_str()
            .map(str::to_string)
            .context("missing Ollama/Local LLM response content (tried /api/chat and /v1/chat/completions)")
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
    async fn generate(&self, system: &str, prompt: &str) -> Result<String> {
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

        let response = self
            .client
            .post(format!("{base_url}/models/{model}:generateContent"))
            .header("x-goog-api-key", api_key)
            .json(&json!({
                "systemInstruction": {
                    "parts": [{ "text": system }]
                },
                "contents": [{
                    "role": "user",
                    "parts": [{ "text": prompt }]
                }],
                "generationConfig": {
                    "temperature": 0.2
                }
            }))
            .send()
            .await?
            .error_for_status()?
            .json::<serde_json::Value>()
            .await?;

        response["candidates"][0]["content"]["parts"][0]["text"]
            .as_str()
            .map(str::to_string)
            .context("missing Gemini response content")
    }
}
