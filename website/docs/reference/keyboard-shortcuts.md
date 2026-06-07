---
sidebar_position: 3
title: Keyboard Shortcuts
---

# Keyboard Shortcuts

Global shortcuts work while a recording is active (platform-dependent registration).

## Recording overlay

| Action | macOS | Windows / Linux |
| --- | --- | --- |
| Mark Step | `Cmd+Shift+M` | `Ctrl+Shift+M` |
| Stop Recording | Via overlay UI | Via overlay UI |

## In-app navigation

Standard webview shortcuts apply in text fields:

| Action | macOS | Windows / Linux |
| --- | --- | --- |
| Save / confirm | `Enter` | `Enter` |
| Undo in editor | `Cmd+Z` | `Ctrl+Z` |

## Tips

- Mark steps at logical boundaries — the AI uses them as strong signals.
- Avoid conflicting global shortcuts with other productivity tools.

Shortcut registration is implemented in the Rust recorder layer; see `src-tauri/src/recorder/` for platform handlers.
