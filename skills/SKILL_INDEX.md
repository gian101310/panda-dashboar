# SKILL INDEX — Master Routing Table

Load this file first on every request. Use it to decide which skill files apply.

| File | Load When | Protects Against | Related Files |
|------|-----------|------------------|---------------|
| CORE_RULES.md | Always (background) | Guessing, unsafe assumptions, skipped checks | All files |
| REQUEST_ROUTER.md | Always (step 1) | Loading wrong skills, missing context | SKILL_INDEX.md |
| WORKFLOW.md | Always (step 2) | Skipped steps, out-of-order execution | REQUEST_ROUTER.md |
| FILE_HANDLING.md | Any uploaded/connected/project file | Unread files, wrong assumptions, missing refs | CODING_RULES.md |
| CODING_RULES.md | Code edits, new code, revisions, patches | Broken logic, missing imports, overwrites | LOCKED_CONTENT_RULES.md, DUPLICATE_AND_ERROR_CHECKS.md |
| LOCKED_CONTENT_RULES.md | Any edit near locked zones | Accidental locked-code changes | CODING_RULES.md |
| DUPLICATE_AND_ERROR_CHECKS.md | Pre-answer validation (code/file tasks) | Dupes, conflicts, broken refs, unread deps | CODING_RULES.md, FILE_HANDLING.md |
| RESPONSE_STYLE.md | Every response | Bloat, vagueness, wasted time | — |
| MEMORY_AND_CONTEXT.md | Prior decisions, preferences, locked items | Contradicting past approvals, forgetting constraints | LOCKED_CONTENT_RULES.md |

## Routing Logic

```
REQUEST ARRIVES
  │
  ├─ Always load: CORE_RULES → REQUEST_ROUTER → WORKFLOW → RESPONSE_STYLE
  │
  ├─ Involves code?       → + CODING_RULES + DUPLICATE_AND_ERROR_CHECKS
  ├─ Involves files?      → + FILE_HANDLING
  ├─ Near locked zones?   → + LOCKED_CONTENT_RULES
  ├─ References past decisions? → + MEMORY_AND_CONTEXT
  ├─ Unsure if files matter?    → + FILE_HANDLING (check first)
  │
  └─ ANSWER (after all checks pass)
```
