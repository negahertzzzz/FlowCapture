---
sidebar_position: 4
title: Exports
---

# Exports

The **Exports** tab on a session provides a styled export studio for publishing documentation.

## Formats

| Format | Description |
| --- | --- |
| **Markdown** | Plain `.md` with optional screenshot paths |
| **HTML** | Styled standalone page (dark/light themes) |
| **PDF** | Print-ready via headless Chrome (or `wkhtmltopdf` fallback) |
| **Video** | Session screen recording export when available |

## Export studio options

| Option | Effect |
| --- | --- |
| Theme | Dark or light document styling |
| Accent | Mint, blue, violet, or amber highlights |
| Page size | Letter or A4 (PDF) |
| Cover page | Title, overview, session metadata |
| Screenshots | Include or omit screenshot sections |
| Step numbers | Numbered steps in output |
| Timestamps | Show recording timestamps |
| Annotations | Click rings and captions on shots |
| Branding | FlowCapture logo and footer (disable for white-label) |

When **Screenshots** is off, Markdown export strips screenshot path references.

## Workflow

1. Open **Exports** on a session with generated documentation.
2. Adjust preview options — the live preview reflects theme and accent.
3. Click **Export** and choose a save location.
4. Use **Show in Folder** to reveal output files.

## PDF requirements

PDF export uses **headless Chrome** when installed. Install [Google Chrome](https://www.google.com/chrome/) or Chromium for best results. Without Chrome, the app may fall back to `wkhtmltopdf` if present.

See [Export Formats](../reference/export-formats) for technical details.
