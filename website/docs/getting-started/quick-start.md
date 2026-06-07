---
sidebar_position: 2
title: Quick Start
---

# Quick Start

Get from zero to exported documentation in a few minutes.

## 1. Configure an AI provider

1. Launch FlowCapture and open **Settings**.
2. Enable one provider: **OpenAI**, **Claude**, **Gemini**, or **Ollama**.
3. Paste your API key and pick a model (defaults work for most flows).

Keys are stored locally in your app data directory — never sent to FlowCapture servers.

## 2. Start a recording

1. On **Home**, click **Start Recording**.
2. Grant permissions if prompted ([Permissions](./permissions)).
3. Perform a real workflow (install something, configure a tool, run commands).
4. Use the overlay to **Mark Step** (`Cmd+Shift+M` on macOS, `Ctrl+Shift+M` elsewhere) at important moments.
5. Click **Stop** when finished.

## 3. Review the session

Open the session from **Sessions**. You'll see:

- **Timeline** — compressed events (clicks, window changes, keys)
- **Screenshots** — event-driven captures
- **Replay** — step through the session visually

Edit the title if needed before generating docs.

## 4. Generate documentation

1. Click **Generate Documentation** on the session page.
2. Wait for the multi-stage AI pipeline (timeline → screenshot selection → writer → reviewer).
3. Edit the Markdown in the built-in editor.

## 5. Export

1. Open the **Exports** tab.
2. Choose format: **Markdown**, **HTML**, **PDF**, or **Video**.
3. Tune theme, accent, cover page, and toggles in the export studio.
4. Click **Export** and use **Show in Folder** to locate files.

## Dogfooding tip

Try documenting a workflow you know well (Node setup, MCP install, DevOps commands). The doc should need only **minor edits** before publishing. See [Dogfooding](../quality/dogfooding) for acceptance scenarios.
