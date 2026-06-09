---
sidebar_position: 3
title: Permissions
---

# Permissions

FlowCapture needs OS-level access to capture your workflow accurately.

## macOS

| Permission | Why |
| --- | --- |
| **Screen Recording** | Screen video and screenshots during sessions |
| **Accessibility** | Window titles, focus changes, mouse/keyboard events |

### Granting access

1. Open **Settings** in FlowCapture and use the permission shortcuts, or
2. Go to **System Settings → Privacy & Security**:
   - **Screen Recording** — enable FlowCapture
   - **Accessibility** — enable FlowCapture

Restart the app after granting Screen Recording if capture still fails.

### Dev vs production

When running `npm run tauri:dev`, the Dock may show the dev binary name. Production `.app` bundles use the **FlowCapture** name and icon from `Info.plist`.

## Windows

- No separate Accessibility prompt; window tracking uses standard APIs.
- Screen capture uses periodic frame sampling encoded with ffmpeg when available.

## Linux

- Requires a compositor-compatible setup (**PipeWire** or **X11**).
- Permissions vary by distro; ensure screen capture portals are allowed for the app.

## Privacy

- Recordings stay in **local SQLite** unless you export them.
- **Redaction** settings control whether sensitive patterns are masked before AI processing — see [Settings & Privacy](../guide/settings-and-privacy).
