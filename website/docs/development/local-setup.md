---
sidebar_position: 1
title: Local Setup
---

# Local Development Setup

## Clone and install

```bash
git clone https://github.com/flowcapture/flowcapture.git
cd flowcapture
npm run setup
```

On **Linux**, install system libraries (WebKitGTK 4.1, build tools, etc.) with:

```bash
npm run setup:install
```

Requires **Ubuntu 22.04+** or a distro that ships `libwebkit2gtk-4.1-dev` and `libpipewire-0.3-dev` (screen capture via [xcap](https://github.com/nashaofu/xcap)). `npm run setup:install` installs both Tauri and xcap build dependencies. See [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for other distributions.

## Run the app

```bash
npm run tauri:dev
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
| `npm run setup` | Check prerequisites and install npm deps |
| `npm run setup:install` | Also install system packages (Linux) / Rust |
| `npm run tauri:dev` | Run desktop app with hot reload |
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
