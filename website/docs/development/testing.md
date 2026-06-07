---
sidebar_position: 3
title: Testing
---

# Testing

## Frontend

Build the TypeScript frontend to catch type errors:

```bash
npm run build
```

## Rust

From the repo root:

```bash
npm run test:rust
```

Or directly:

```bash
cd src-tauri && cargo test
```

## Manual QA

Use the [Dogfooding](../quality/dogfooding) scenarios before release:

1. MCP installation workflow
2. Node/React project setup
3. Terminal-heavy DevOps flow

Each scenario should produce documentation that needs only minor edits before publishing.

## Cross-platform matrix

| OS | Recording | Events | Screenshots | Exports |
| --- | --- | --- | --- | --- |
| macOS | required | required | required | required |
| Windows 11 | required | required | required | required |
| Ubuntu (PipeWire) | required | required | required | required |

## Website & docs

Verify the site builds cleanly:

```bash
npm run website:build
```
