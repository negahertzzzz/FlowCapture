---
sidebar_position: 5
title: Settings & Privacy
---

# Settings & Privacy

Settings control AI providers, privacy, and app behavior.

## AI providers

Each provider card lets you:

- Enable or disable the provider
- Set **API key** (stored locally)
- Override **model** name
- Set custom **base URL** (for proxies or Ollama)

Only one provider should be enabled at a time for predictable generation behavior.

## Redaction

The **Redaction** toggle in Settings controls whether sensitive patterns are masked before content is sent to AI or included in exports.

Typical redaction targets:

- API keys and tokens
- Password fields
- Email addresses (configurable patterns)

:::info
Review the [Technical Architecture](../project/technical-architecture) security section for how redaction is applied in the pipeline.
:::

## Data storage

All sessions, events, screenshots, and settings live in your **local app data directory** (SQLite). Nothing is uploaded to FlowCapture servers — only to the AI provider you configure when generating documentation.

## Permissions

Use Settings shortcuts to open macOS **Screen Recording** and **Accessibility** panes. See [Permissions](../getting-started/permissions).
