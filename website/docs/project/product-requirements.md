---
sidebar_position: 1
title: Product Requirements
---

# FlowCapture PRD (Product Requirements Document)

## Product Vision

FlowCapture is an AI-powered documentation engine that automatically converts user workflows into professional documentation.

Instead of manually creating SOPs, installation guides, onboarding documents, and knowledge-base articles, users simply record their screen and FlowCapture generates:

- Step-by-step documentation
- Screenshots with annotations
- SOPs
- PDFs
- Markdown documentation
- Training material
- Complete video recordings

---

# Problem Statement

Technical teams, support teams, consultants, educators, and developers spend significant time documenting workflows.

Current process:

1. Record screen
2. Take screenshots manually
3. Write instructions manually
4. Format documentation
5. Publish documentation

A 10-minute task often becomes 1–2 hours of documentation work.

---

# Solution

FlowCapture automatically records:

- Screen activity
- Mouse movements
- Mouse clicks
- Keyboard activity
- Window changes
- Browser navigation
- Terminal commands

AI then converts the session into:

- SOPs
- Installation guides
- Knowledge base articles
- Onboarding documentation
- Troubleshooting guides
- Training documents

---

# Target Audience

## Primary Users

### Developers

Use Cases:

- Installation guides
- Deployment documentation
- Environment setup instructions
- Internal technical documentation

### QA Teams

Use Cases:

- Reproduction steps
- Test execution reports
- Bug documentation

### Customer Support

Use Cases:

- Troubleshooting guides
- Customer walkthroughs
- Internal support SOPs

### Product Teams

Use Cases:

- Feature documentation
- Release notes
- Product walkthroughs

### Agencies & Consultants

Use Cases:

- Client handover documentation
- Training guides
- Knowledge transfer documents

---

# Core User Flow

## Step 1: Start Recording

User clicks:

"Start Recording"

---

## Step 2: Capture Activity

FlowCapture records:

### Screen

- Full screen
- Specific monitor
- Selected window

### Mouse

- Clicks
- Double clicks
- Scrolls

### Keyboard

- Typing
- Shortcuts

### Windows

- Opened
- Closed
- Switched

### Browser

- URL changes
- Tab switches

### Terminal

- Commands executed

---

## Step 3: Stop Recording

User clicks:

"Stop Recording"

---

## Step 4: AI Processing

### Timeline Generation

Example:

```text
00:00 Open Terminal
00:10 Install Node.js
00:30 Verify Installation
01:00 Clone Repository
01:30 Configure Environment
```

### Screenshot Extraction

Automatically select important screenshots.

### Step Detection

Identify:

- Important actions
- Configuration changes
- Navigation actions
- Installation steps

### Screenshot Annotation

Automatically generate:

- Click indicators
- Arrows
- Highlights
- Focus areas

### Documentation Generation

Generate:

- Titles
- Instructions
- Explanations
- Contextual information

---

# Output Formats

## Markdown

```md
# Setup Guide

## Step 1
Install Node.js

## Step 2
Install Package
```

## PDF

Professional formatted document.

## HTML

Shareable documentation page.

## Notion Export

One-click export.

## Confluence Export

Enterprise documentation export.

## Video Recording

Complete session replay.

---

# Killer Feature: AI Replay

Instead of static documentation:

Generate interactive walkthroughs.

Users can:

- Replay step-by-step
- View screenshots
- Follow instructions interactively

Similar to:

- Product tours
- Guided onboarding
- Interactive SOPs

---

# Architecture

## Desktop Application

Recommended:

### Tauri

Benefits:

- Lightweight
- Fast
- Low memory usage
- Native Rust backend

Alternative:

### Electron

---

## Frontend Stack

- React
- TypeScript
- Tailwind CSS
- ShadCN UI

---

## Local Database

SQLite

Benefits:

- No cloud costs
- Fast
- Reliable
- Offline-first

### Tables

```sql
sessions
events
screenshots
exports
settings
```

---

# Recording Layer

## Screen Recording

Desktop Capture APIs

## Event Tracking

Native OS APIs

Capture:

- Mouse activity
- Keyboard activity
- Window management

---

# Screenshot Engine

Capture:

- On click
- On screen change
- On window change

Store locally.

AI later selects useful screenshots.

---

# AI Processing Pipeline

## Stage 1: Session Understanding

Input:

```json
{
  "events": [],
  "screenshots": [],
  "transcript": []
}
```

Output:

Workflow graph.

---

## Stage 2: Step Extraction

Output:

```json
[
  {
    "title": "Open Terminal"
  },
  {
    "title": "Install Package"
  }
]
```

---

## Stage 3: Documentation Generation

Templates:

- Technical Documentation
- Beginner Guides
- SOPs
- Internal Documentation
- Knowledge Base Articles

---

# LLM Strategy

## Bring Your Own Key (BYOK)

Do not provide proprietary LLM access initially.

Users can configure:

### OpenAI

GPT models

### Anthropic

Claude models

### Google

Gemini models

### OpenRouter

Access multiple providers through one API.

### Ollama

Local models

### LM Studio

Local models

---

## Provider Interface

```ts
interface AIProvider {
  generate()
}
```

Each provider implements the interface.

---

# Open Source Strategy

## Community Edition

Free and Open Source

Features:

- Screen recording
- Event tracking
- Screenshot capture
- Local AI support
- Markdown export
- PDF export

---

## Future Pro Version

Potential paid features:

- Team collaboration
- Cloud sync
- Shared workspaces
- Notion integration
- Confluence integration
- Templates marketplace

---

# Key Differentiator

Most competitors generate documentation from screenshots.

FlowCapture generates documentation using:

1. Screen recording
2. Mouse events
3. Keyboard events
4. Browser events
5. Window events
6. Terminal activity

This provides significantly richer context and more accurate documentation.

---

# MVP Scope (4–6 Weeks)

## Included

- Screen Recording
- Event Tracking
- Screenshot Capture
- SQLite Storage
- OpenAI Support
- Claude Support
- Ollama Support
- Markdown Export
- PDF Export
- Video Export
- Step Detection
- AI Documentation Generation

---

## Deferred

- Authentication
- Billing
- Team Collaboration
- Cloud Storage
- SaaS Platform
- Notion Integration
- Confluence Integration

---

# Success Metrics

## User Metrics

- Time saved per documentation session
- Documentation generation accuracy
- Export usage
- Active users

## Product Metrics

- Documentation quality score
- Screenshot relevance score
- AI processing success rate

---

# Long-Term Vision

FlowCapture becomes the easiest way to transform real-world workflows into professional documentation.

Users perform tasks naturally.

FlowCapture automatically creates:

- SOPs
- Training material
- Knowledge base content
- Installation guides
- Product walkthroughs
- Interactive tutorials

without requiring any manual documentation effort.
