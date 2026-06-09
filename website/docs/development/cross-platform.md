---
sidebar_position: 4
title: Cross-Platform Notes
---

# Cross-Platform Notes

FlowCapture targets **macOS**, **Windows**, and **Linux** with platform-specific recording implementations.

## macOS

- Screen video recorded in-app at ~15 fps
- Requires **Screen Recording** + **Accessibility** permissions
- PDF export via headless Chrome when available
- Dock icon: production `.app` uses bundled `icon.icns`; dev mode loads padded PNG

## Windows

- Frame capture encoded to MP4 via bundled/downloaded **ffmpeg**
- Window tracking via standard Win32 APIs
- PDF via headless Chrome or wkhtmltopdf

## Linux

- **Ubuntu 22.04+** with WebKitGTK 4.1
- Screen capture uses **xcap 0.4.x** (X11 + dbus) — no PipeWire 1.0+ required at build time
- **X11 session** recommended; Wayland capture is limited
- ffmpeg for video encoding
- Test on target distro before release — portal permissions vary

## Bundled binaries

`src-tauri/build.rs` downloads **ffmpeg** per target triple when not already present under `src-tauri/binaries/`.

## Export dependencies

| Output | Dependency |
| --- | --- |
| PDF | Google Chrome/Chromium headless (preferred) or wkhtmltopdf |
| Video | ffmpeg |
| HTML/MD | No external deps |

## Known limitations

- Linux screen capture quality depends on desktop environment
- Dev dock icon appearance may differ from production `.app` on macOS
- Very long sessions may need timeline compression tuning before AI generation
