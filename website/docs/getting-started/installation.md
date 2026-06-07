---
sidebar_position: 1
title: Installation
---

# Installation

FlowCapture is a **Tauri 2** desktop app (Rust backend + React frontend). You can run from source or install a release build when available.

## Requirements

| Tool | Version |
| --- | --- |
| Node.js | 20+ |
| Rust | stable (via [rustup](https://rustup.rs)) |
| macOS | Xcode Command Line Tools (for building on Mac) |

Platform-specific recording dependencies (ffmpeg, Chrome for PDF) are bundled or downloaded automatically when possible.

## From source

From the repository root:

```bash
git clone https://github.com/flowcapture/flowcapture.git
cd flowcapture
npm install
npm run tauri dev
```

The first `tauri dev` run compiles the Rust crate and may take several minutes.

## Release build

```bash
npm run tauri:build
```

Packaged artifacts are written to:

```text
src-tauri/target/release/bundle/
```

On macOS you get `FlowCapture.app` and a `.dmg` installer. Pre-built downloads are available on [GitHub Releases](https://github.com/Abhi6722/FlowCapture/releases) (macOS Apple Silicon for now).

## Documentation

Docs are built into the website. From the repo root:

```bash
npm run website:dev
```

Then open http://localhost:4321/docs/intro. Build static output with `npm run website:build` (`website/dist/`).

## Next steps

- [Quick Start](./quick-start) — first recording in 5 minutes
- [Permissions](./permissions) — Screen Recording and Accessibility on macOS
