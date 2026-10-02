//! Token and cost estimation for AI generation.

use serde::Serialize;

use crate::ai::providers::TokenUsage;
use crate::storage::models::ProviderConfig;
use crate::storage::Database;

/// Price in USD per million tokens.
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
pub struct ModelPrice {
    pub input_per_mtok: f64,
    pub output_per_mtok: f64,
}

impl ModelPrice {
    pub fn cost_usd(&self, usage: TokenUsage) -> f64 {
        (usage.input_tokens as f64 * self.input_per_mtok
            + usage.output_tokens as f64 * self.output_per_mtok)
            / 1_000_000.0
    }
}

/// Indicative list prices (USD / 1M tokens) of common models. Matching is by prefix on the
/// normalised model name, so dated or dotted variants ("claude-sonnet-4.5") are recognised.
/// Longer prefixes come first so "gpt-5-mini" is not priced as "gpt-5".
const KNOWN_PRICES: &[(&str, f64, f64)] = &[
    // Anthropic
    ("claude-fable-5", 10.0, 50.0),
    ("claude-opus-5-5", 4.0, 20.0),
    ("claude-opus-5", 5.0, 25.0),
    ("claude-opus-4-8", 5.0, 25.0),
    ("claude-opus-4-7", 5.0, 25.0),
    ("claude-opus-4-6", 5.0, 25.0),
    ("claude-opus-4-5", 5.0, 25.0),
    ("claude-opus-4", 15.0, 75.0),
    ("claude-sonnet-5", 2.0, 10.0),
    ("claude-sonnet-4", 3.0, 15.0),
    ("claude-3-7-sonnet", 3.0, 15.0),
    ("claude-haiku-4", 1.0, 5.0),
    ("claude-3-5-haiku", 0.8, 4.0),
    // OpenAI
    ("gpt-5-nano", 0.05, 0.4),
    ("gpt-5-mini", 0.25, 2.0),
    ("gpt-5", 1.25, 10.0),
    ("gpt-4-1-nano", 0.1, 0.4),
    ("gpt-4-1-mini", 0.4, 1.6),
    ("gpt-4-1", 2.0, 8.0),
    ("gpt-4o-mini", 0.15, 0.6),
    ("gpt-4o", 2.5, 10.0),
    // Google
    ("gemini-2-5-flash-lite", 0.1, 0.4),
    ("gemini-2-5-flash", 0.3, 2.5),
    ("gemini-2-5-pro", 1.25, 10.0),
];

fn normalise_model(model: &str) -> String {
    let lower = model.trim().to_ascii_lowercase();
    // "openai/gpt-5" or "anthropic/claude-..." -> last segment
    let last = lower.rsplit('/').next().unwrap_or(&lower);
    last.replace('.', "-")
}

pub fn known_price(model: &str) -> Option<ModelPrice> {
    let name = normalise_model(model);
    KNOWN_PRICES
        .iter()
        .find(|(prefix, _, _)| name.starts_with(prefix))
        .map(|&(_, input_per_mtok, output_per_mtok)| ModelPrice {
            input_per_mtok,
            output_per_mtok,
        })
}

pub fn price_setting_keys(provider_id: &str) -> (String, String) {
    (
        format!("price_input_per_mtok:{provider_id}"),
        format!("price_output_per_mtok:{provider_id}"),
    )
}

/// Price for the provider: the user's override from Settings wins (useful for proxies such as
/// GitHub Copilot, or local models = 0), then the built-in list. Local Ollama is free.
pub fn provider_price(db: &Database, provider: &ProviderConfig) -> Option<ModelPrice> {
    let (in_key, out_key) = price_setting_keys(&provider.id);
    let read = |key: &str| {
        db.get_setting(key)
            .ok()
            .flatten()
            .and_then(|v| v.trim().replace(',', ".").parse::<f64>().ok())
            .filter(|v| *v >= 0.0)
    };
    if let (Some(input_per_mtok), Some(output_per_mtok)) = (read(&in_key), read(&out_key)) {
        return Some(ModelPrice {
            input_per_mtok,
            output_per_mtok,
        });
    }
    if provider.provider_type == "ollama" {
        return Some(ModelPrice {
            input_per_mtok: 0.0,
            output_per_mtok: 0.0,
        });
    }
    provider.model.as_deref().and_then(known_price)
}

/// Rough token count without a tokenizer: ~3.5 characters per token fits the mix of JSON,
/// English instructions and Italian text these prompts contain.
pub fn estimate_tokens(text: &str) -> u64 {
    let chars = text.chars().count() as f64;
    (chars / 3.5).ceil() as u64
}

#[derive(Debug, Clone, Serialize)]
pub struct CostEstimate {
    pub provider_name: String,
    pub model: Option<String>,
    pub llm_calls: u32,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub price: Option<ModelPrice>,
    pub estimated_cost_usd: Option<f64>,
    /// The recording has audio that still has to be transcribed (billed separately).
    pub needs_transcription: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_prices_for_model_variants() {
        assert_eq!(known_price("claude-opus-5").unwrap().input_per_mtok, 5.0);
        assert_eq!(known_price("claude-sonnet-4.5").unwrap().output_per_mtok, 15.0);
        assert_eq!(known_price("gpt-5-mini").unwrap().input_per_mtok, 0.25);
        assert_eq!(known_price("openai/gpt-5").unwrap().input_per_mtok, 1.25);
        assert_eq!(known_price("gpt-4.1-mini").unwrap().input_per_mtok, 0.4);
        assert!(known_price("my-local-model").is_none());
    }

    #[test]
    fn computes_cost() {
        let price = ModelPrice {
            input_per_mtok: 5.0,
            output_per_mtok: 25.0,
        };
        let usage = TokenUsage {
            input_tokens: 200_000,
            output_tokens: 40_000,
        };
        assert!((price.cost_usd(usage) - 2.0).abs() < 1e-9);
    }

    #[test]
    fn estimates_tokens_from_length() {
        assert_eq!(estimate_tokens(""), 0);
        assert_eq!(estimate_tokens(&"a".repeat(35)), 10);
    }
}
