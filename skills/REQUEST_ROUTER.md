# REQUEST ROUTER — Skill Loading Logic

Read the request. Classify it. Load the minimum set of skill files needed.

## Routing Rules

**If request involves code (edit, create, debug, review):**
→ Load CODING_RULES.md + DUPLICATE_AND_ERROR_CHECKS.md
→ If edit is near locked zones → also load LOCKED_CONTENT_RULES.md

**If request involves files (uploaded, connected, project files, previous outputs):**
→ Load FILE_HANDLING.md
→ Read relevant files before answering

**If request involves rewriting or improving text/responses:**
→ Load RESPONSE_STYLE.md

**If request references previous decisions, locked sections, or remembered constraints:**
→ Load MEMORY_AND_CONTEXT.md

**If unsure whether files are relevant:**
→ Load FILE_HANDLING.md first — check before answering

**If request involves app.py scoring logic (lines ~421–536):**
→ Load LOCKED_CONTENT_RULES.md — mandatory, no exceptions

**If request involves dashboard.js:**
→ Load FILE_HANDLING.md (read with offset/length, never full rewrite)
→ Load CODING_RULES.md + DUPLICATE_AND_ERROR_CHECKS.md

## Default Stack (loaded on every request)
- CORE_RULES.md (background awareness)
- RESPONSE_STYLE.md (output formatting)
- WORKFLOW.md (step execution order)
