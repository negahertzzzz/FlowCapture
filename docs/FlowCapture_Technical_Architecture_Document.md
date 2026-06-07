# Founder PRD v1

## Vision

Enable anyone to transform real-world workflows into structured knowledge automatically.

Users perform work normally.

FlowCapture observes:

* What happened
* When it happened
* Why it happened
* Which tools were used

Then converts that into:

* Documentation
* SOPs
* Tutorials
* Training material
* AI-ready workflow datasets

---

# Long-Term Vision (3 Years)

Today:

```text
User records workflow
↓
AI creates documentation
```

Future:

```text
User records workflow
↓
AI understands workflow
↓
AI can replay workflow
↓
AI can automate workflow
```

Think:

* Loom + Scribe + Replay.io + OpenObserve + AI Agents

---

# Product Principles

### Local First

User owns data.

Everything stored locally.

No cloud dependency.

---

### AI Provider Agnostic

Never lock users into:

* OpenAI
* Claude
* Gemini

Users choose.

---

### Open Core

Community Edition:

* Open source

Pro Edition:

* Team features
* Collaboration
* Cloud sync

---

### Developer First

Initial target:

* Engineers
* DevOps
* QA
* Technical Writers

---

# Competitive Landscape

## Scribe

Pros

* Good screenshots
* Nice docs

Cons

* Browser focused
* Weak technical workflows

---

## Tango

Pros

* Easy onboarding

Cons

* Limited technical depth

---

## Loom AI

Pros

* Great recordings

Cons

* Video-first

---

## Guidde

Pros

* Beautiful outputs

Cons

* Less developer focused

---

# Opportunity

Nobody deeply understands:

* Terminal commands
* IDE workflows
* Desktop workflows
* Developer setups

This becomes your wedge.

---

# System Architecture

```text
+-----------------------+
| Tauri Desktop App     |
+-----------+-----------+
            |
            v

+-----------------------+
| Event Collector       |
+-----------------------+

            |
            v

+-----------------------+
| Local SQLite          |
+-----------------------+

            |
            v

+-----------------------+
| AI Processing Engine  |
+-----------------------+

            |
            v

+-----------------------+
| Export Engine         |
+-----------------------+
```

---

# Core Modules

## 1. Recorder Engine

Responsibilities:

* Screen recording
* Session creation
* Session lifecycle

Output:

```json
{
  "sessionId": "",
  "videoPath": ""
}
```

---

## 2. Event Collector

Captures:

### Mouse

```text
Click
Double Click
Scroll
Drag
```

### Keyboard

```text
Typing
Shortcuts
```

### Windows

```text
Open
Close
Switch
Focus
```

### Applications

```text
VSCode
Terminal
Chrome
Cursor
```

---

## 3. Screenshot Engine

Triggers:

### Mouse Click

Take screenshot

### Window Change

Take screenshot

### URL Change

Take screenshot

### Manual Marker

Take screenshot

---

# Storage Architecture

SQLite Database

```sql
sessions
events
screenshots
exports
settings
ai_jobs
providers
```

---

# Sessions Table

```sql
CREATE TABLE sessions (
 id TEXT PRIMARY KEY,
 title TEXT,
 started_at DATETIME,
 ended_at DATETIME,
 video_path TEXT,
 duration INTEGER
);
```

---

# Events Table

```sql
CREATE TABLE events (
 id TEXT PRIMARY KEY,
 session_id TEXT,
 event_type TEXT,
 app_name TEXT,
 payload JSON,
 created_at DATETIME
);
```

---

# Screenshots Table

```sql
CREATE TABLE screenshots (
 id TEXT PRIMARY KEY,
 session_id TEXT,
 path TEXT,
 timestamp INTEGER
);
```

---

# AI Pipeline

This is where the moat is.

---

## Stage 1

Event Compression

Input

```text
50,000 raw events
```

Output

```text
500 meaningful events
```

Example

Instead of:

```text
Mouse moved
Mouse moved
Mouse moved
Mouse moved
```

AI sees:

```text
User clicked Install button
```

---

## Stage 2

Workflow Detection

Output

```json
[
 {
   "step": 1,
   "title": "Install NodeJS"
 }
]
```

---

## Stage 3

Screenshot Selection

AI ranks screenshots.

Score:

```text
Relevance
Visual clarity
Uniqueness
```

Top screenshots selected.

---

## Stage 4

Documentation Generation

Models:

### Fast

Small model

For:

* Timeline generation

---

### Large

Claude / GPT

For:

* Final docs

---

# LLM Abstraction Layer

```ts
interface LLMProvider {
 generate()
 stream()
 embeddings()
}
```

Providers:

```text
OpenAI
Claude
Gemini
OpenRouter
Ollama
LM Studio
```

---

# Recommended AI Workflow

Instead of one huge prompt:

```text
50k events
→ documentation
```

Use multiple agents.

---

## Agent 1

Timeline Builder

Output

```json
steps
```

---

## Agent 2

Screenshot Selector

Output

```json
selectedImages
```

---

## Agent 3

Technical Writer

Output

```md
documentation
```

---

## Agent 4

Quality Reviewer

Output

```json
improvements
```

---

# Export Engine

Generate:

### Markdown

Primary format

---

### HTML

Interactive

---

### PDF

Professional

---

Internal format:

```json
{
 "steps": [],
 "screenshots": []
}
```

Then render into exports.

---

# Future Browser Extension

V2

Capture:

```text
URL
DOM
Button Labels
Forms
Navigation
```

This will massively improve docs.

---

# Security

Sensitive Data Detection

Before AI processing:

Mask:

```text
Passwords
API Keys
Tokens
Secrets
Emails
```

Critical feature.

---

# Open Source Strategy

## Community

Free

Features:

* Recording
* SQLite
* Exports
* BYOK

---

## Pro

Paid

Features:

* Team workspaces
* Cloud sync
* Shared libraries
* Confluence
* Notion
* Enterprise SSO

---

# Revenue Roadmap

## Phase 1

Open source

Goal:

Acquire developers.

---

## Phase 2

Hosted Sync

$10-$20/month

---

## Phase 3

Team Plans

$49-$299/month

---

# Biggest Technical Risk

Not recording.

Not screenshots.

Not exports.

The hardest problem is:

> Converting noisy user behavior into clean, human-readable workflow steps.

This is where 90% of your engineering effort should go.

---

# What I would build first (Week 1–4)

### Milestone 1

* Tauri app
* Session recording
* Event capture
* SQLite

### Milestone 2

* Screenshot engine
* Timeline view

### Milestone 3

* Claude/OpenAI integration
* Markdown generation

### Milestone 4

* PDF export
* Session replay

After that, start dogfooding it by documenting your own:

* Amazon Ads projects
* MCP installations
* OpenObserve setups
* React project setups

If it consistently creates documentation you'd be willing to publish without major edits, you're onto a real product.


1. Product Type: ✅ Desktop First 2. Framework: ✅ Tauri + React 3. Recording Method: ✅ Video + Events 4. Screenshot Strategy: ✅ Event-driven screenshots 5. AI Processing: ✅ Option C 6. Storage: ✅ SQLite only initially 7. Export Formats (MVP): My recommendation:✅ Markdown✅ PDF✅ HTML 8. Browser Capture: ✅ Future V2 9. Privacy Model: ✅ Local-first 10. Open Source Model: ✅ Open Core 11. Future Target: ✅ Start with A (Developers) 12. AI Quality vs Speed: ✅ Quality first