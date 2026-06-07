---
sidebar_position: 2
title: Sessions & Timeline
---

# Sessions & Timeline

Every recording becomes a **session** stored locally in SQLite.

## Session list

The **Sessions** page lists all recordings with title, date, duration, and status. Click a session to open its detail view.

## Timeline

The timeline is a **compressed** view of raw events — noise collapsed, important actions preserved.

You'll see entries such as:

- Window focus changes
- Mouse clicks with context
- Keyboard activity (redacted when configured)
- Terminal commands (when captured)
- Manual step marks

Use the timeline to verify the AI will see the right story before spending tokens on generation.

## Screenshots

Screenshots are captured automatically on meaningful events and can be triggered manually during recording.

On the session page you can:

- Browse thumbnails in context
- Delete irrelevant screenshots before generating docs

## Replay

The replay viewer lets you step through the session visually — useful for QA and for understanding what the AI pipeline received.

## Editing metadata

- **Title** — update before export for better cover pages and filenames
- **Documentation** — editable after AI generation in the Markdown editor

Next: [AI Documentation](./ai-documentation)
