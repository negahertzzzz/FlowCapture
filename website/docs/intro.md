---
sidebar_position: 1
title: Introduction
---

# FlowCapture Documentation

FlowCapture is an **open-source, local-first** desktop app that records your screen, mouse, keyboard, and window activity — then uses **your own AI API key** to turn raw sessions into step-by-step documentation, SOPs, and exports.

## What you can do

- **Record** workflows with event-driven screenshots and optional screen video
- **Review** a compressed timeline and replay steps before generating docs
- **Generate** Markdown documentation with a multi-stage AI pipeline
- **Export** styled HTML, PDF, Markdown, and video
- **Stay local** — sessions live in SQLite on your machine; BYOK for AI

## Who this is for

| Audience | Typical use |
| --- | --- |
| Developers | Setup guides, deployment runbooks, internal docs |
| QA | Reproduction steps, test execution notes |
| Support | Troubleshooting guides, customer walkthroughs |
| Consultants | Client handover and training material |

## Documentation map

| Section | Contents |
| --- | --- |
| [Getting Started](./getting-started/installation) | Install, first recording, permissions |
| [User Guide](./guide/recording) | Recording, sessions, AI, exports, settings |
| [Development](./development/local-setup) | Clone, build, test, platform notes |
| [Reference](./reference/ai-providers) | Providers, export options, shortcuts |
| [Project](./project/product-requirements) | PRD and technical architecture |

## Core principles

1. **Local-first** — SQLite storage, no required cloud account
2. **BYOK AI** — OpenAI, Claude, Gemini, Ollama; you control keys and models
3. **Rich context** — not just screenshots: events, windows, terminal activity
4. **Export-ready** — polish in the app, publish as MD / HTML / PDF / video

Ready to go? Start with [Installation](./getting-started/installation) or the [5-minute quick start](./getting-started/quick-start).
