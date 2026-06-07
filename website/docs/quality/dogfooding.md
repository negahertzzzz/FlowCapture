---
sidebar_position: 1
title: Dogfooding
---

# Dogfooding Acceptance Scenarios

Use these workflows to validate MVP quality before broader release.

## Scenario 1: MCP Installation

1. Start recording.
2. Open terminal, clone a repo, install dependencies, edit config, verify server starts.
3. Stop recording and generate documentation.
4. Pass if the doc captures install commands, config edits, and verification with usable step order.

## Scenario 2: Node/React Project Setup

1. Record creating a project, installing packages, editing env files, and running the dev server.
2. Generate docs and export Markdown + HTML.
3. Pass if a new developer could follow the doc with minor edits.

## Scenario 3: Terminal-Heavy DevOps Flow

1. Record SSH/config/command sequence with multiple window switches.
2. Verify compressed timeline collapses noise and preserves commands.
3. Pass if redaction masks secrets and the final doc avoids leaking tokens.

## Cross-Platform QA Matrix

| OS | Recording | Events | Screenshots | Exports |
| --- | --- | --- | --- | --- |
| macOS | required | required | required | required |
| Windows 11 | required | required | required | required |
| Ubuntu (PipeWire) | required | required | required | required |

## Ship Criteria

Generated docs should be publishable with minor edits in at least 2 of the 3 scenarios above.
