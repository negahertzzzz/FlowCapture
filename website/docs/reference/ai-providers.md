---
sidebar_position: 1
title: AI Providers
---

# AI Providers

FlowCapture uses a **Bring Your Own Key (BYOK)** model. Configure providers in **Settings**.

## Supported providers

| Provider | Type key | Typical use |
| --- | --- | --- |
| OpenAI | `openai` | GPT-4o, GPT-4.1, etc. |
| Anthropic | `anthropic` | Claude 3.5/4 models |
| Google Gemini | `gemini` | Gemini Pro / Flash |
| Ollama | `ollama` | Local models via Ollama API |

## Configuration fields

| Field | Description |
| --- | --- |
| API Key | Provider secret (local storage) |
| Model | Model identifier string |
| Base URL | Optional — custom endpoint or Ollama host |

### Ollama example

- Base URL: `http://localhost:11434/v1`
- Model: `llama3.2` (or your pulled model name)
- API Key: can be a placeholder if Ollama doesn't require one

## Provider selection

Enable **exactly one** provider at a time. The enabled provider receives all pipeline stages (timeline, selector, writer, reviewer).

## Implementation

Provider trait and stage prompts live in `src-tauri/src/ai/`. Each provider implements the shared LLM interface with provider-specific request formatting.

## Cost tips

1. Compress timeline noise before generation (automatic, but review sessions).
2. Delete bad screenshots to reduce vision tokens.
3. Use smaller models for iteration, larger models for final publish pass.
