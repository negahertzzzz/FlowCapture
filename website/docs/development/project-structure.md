---
sidebar_position: 2
title: Project Structure
---

# Project Structure

```text
flowcapture/
├── src/                    # React app (Tauri webview)
│   ├── components/         # UI components
│   ├── pages/              # Routes (Home, Session, Settings)
│   ├── lib/                # API client, export options
│   └── styles/             # App + export CSS
├── src-tauri/              # Rust backend
│   ├── src/
│   │   ├── ai/             # LLM pipeline, providers, redaction
│   │   ├── commands/       # Tauri invoke handlers
│   │   ├── export/         # MD/HTML/PDF/video export
│   │   ├── platform/       # OS-specific recording
│   │   ├── recorder/       # Session capture
│   │   └── storage/        # SQLite models + migrations
│   ├── migrations/         # SQL schema
│   └── icons/              # App icons
├── website/                # Marketing site + docs (Vite, React Router)
│   └── docs/               # Documentation markdown
└── docs/                   # Legacy markdown sources (PRD, dogfooding)
```

## Frontend ↔ backend

The frontend calls Rust via Tauri **`invoke`**:

```typescript
import { invoke } from "@tauri-apps/api/core";
await invoke("start_recording");
```

Handlers are registered in `src-tauri/src/lib.rs` under `invoke_handler!`.

## Database

SQLite schema is defined in `src-tauri/migrations/`. Main tables:

- `sessions` — recordings
- `events` — timeline events
- `screenshots` — image paths + metadata
- `exports` — generated file records
- `settings` — key/value app config

## AI pipeline

Located in `src-tauri/src/ai/`. Stages run sequentially with job status persisted for UI progress.

## Export engine

`src-tauri/src/export/` renders Markdown, styled HTML, PDF (headless Chrome), and video outputs.

See [Technical Architecture](../project/technical-architecture) for diagrams and deeper detail.
