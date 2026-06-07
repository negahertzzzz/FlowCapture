---
sidebar_position: 3
title: AI Documentation
---

# AI Documentation

FlowCapture uses a **multi-stage AI pipeline** instead of one giant prompt. Each stage has a focused job and structured output.

## Pipeline stages

| Stage | Role |
| --- | --- |
| **Timeline Builder** | Understands the session and proposes step structure |
| **Screenshot Selector** | Picks the most useful images per step |
| **Technical Writer** | Produces Markdown documentation |
| **Quality Reviewer** | Suggests improvements to clarity and ordering |

Progress is shown on the session page while jobs run. Jobs are persisted — you can inspect history via **AI Jobs** if exposed in the UI.

## Providers (BYOK)

Configure providers in **Settings**. Supported types include:

- OpenAI (GPT models)
- Anthropic (Claude)
- Google (Gemini)
- Ollama (local models)

Only **one enabled provider** is used at a time. Keys and base URLs are stored locally.

See [AI Providers](../reference/ai-providers) for configuration details.

## Before you generate

1. Review the **timeline** — remove stray screenshots.
2. Set a clear **session title**.
3. Confirm the right provider/model is enabled.

## After generation

- Edit Markdown directly in the app.
- Regenerate if the structure is wrong (cheaper to fix timeline first).
- Export when satisfied — [Exports](./exports).

## What makes FlowCapture different

Most tools generate docs from screenshots alone. FlowCapture sends **events + screenshots + context** to the pipeline, producing more accurate step order and command capture.

See [Technical Architecture](../project/technical-architecture) for the full system design.
