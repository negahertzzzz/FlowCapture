# FlowCapture

FlowCapture is a cross-platform Tauri desktop app that records workflows and converts them into documentation.

## Features

- Screen frame capture with event-driven screenshots
- Mouse, keyboard, and window tracking
- Local SQLite storage
- BYOK AI providers: OpenAI, Claude, Ollama, Gemini
- Multi-stage AI pipeline: timeline, screenshot selection, writer, reviewer
- Exports: Markdown, HTML, PDF, Video
- Session replay viewer

## Development

```bash
npm install
npm run tauri dev
```

## Dogfooding quick start

1. Launch the app and open **Settings**.
2. Enable one provider (OpenAI, Claude, Ollama, or Gemini) and add your API key.
3. Click **Start Recording** on Home and perform a workflow.
4. Use the bottom-right overlay to **Mark Step** (`Cmd/Ctrl+Shift+M`) or **Stop**.
5. On the session page, review the compressed timeline and screenshots.
6. Click **Generate Documentation**, edit the Markdown, then export MD/HTML/PDF/Video.
7. Use **Show in Folder** on the Exports tab to locate generated files.

See [docs/dogfooding.md](docs/dogfooding.md) for acceptance scenarios (also at `/docs/quality/dogfooding` on the website).

## Website & documentation

```bash
npm run website:dev
```

Marketing site and docs live in `website/` (docs at `/docs/*`). Build with `npm run website:build`.

## Release build

```bash
npm run tauri:build
```

The packaged app is written to `src-tauri/target/release/bundle/`.

## Testing

```bash
npm run build
npm run test:rust
```

## Cross-platform notes

- macOS records in-app screen video at 15 fps (uses FlowCapture's Screen Recording permission).
- Windows/Linux use periodic frame capture encoded to MP4 when ffmpeg is available.
- PDF export uses Chrome headless or `wkhtmltopdf` when installed.
- Linux screen capture requires a compositor-compatible setup (PipeWire/X11).

## Dogfooding scenarios

Use FlowCapture to document:

1. MCP installation workflows
2. Node/React project setup
3. Terminal-heavy DevOps flows

Ship when generated docs need only minor edits before publishing.
