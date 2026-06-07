---
sidebar_position: 1
title: Local Setup
---

# Local Development Setup

## Clone and install

```bash
git clone https://github.com/flowcapture/flowcapture.git
cd flowcapture
npm install
```

## Run the app

```bash
npm run tauri dev
```

This starts the Vite dev server (`localhost:1420`) and the Tauri shell with hot reload for the frontend.

## Run the website (marketing + docs)

```bash
npm run website:dev
```

Open http://localhost:4321 for the landing page and http://localhost:4321/docs/intro for documentation. Source lives in `website/` (markdown in `website/docs/`).

## Environment

No `.env` is required for core app functionality. AI keys are entered in the UI and stored in SQLite.

## Useful commands

| Command | Purpose |
| --- | --- |
| `npm run build` | Build frontend only |
| `npm run tauri:build` | Production desktop bundle |
| `npm run test:rust` | Rust unit/integration tests |
| `npm run website:build` | Static marketing site + docs |

## Rust tooling

```bash
cd src-tauri
cargo test
cargo clippy
```

ffmpeg for bundling is fetched automatically by `build.rs` on supported targets when missing.
