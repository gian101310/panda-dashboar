# CODING RULES — Edit, Create, Revise

## Output Format
- Full revised code by default (not patches) unless Boss-G explicitly asks for patch only.
- Explain exactly what changed — brief, not verbose.
- Clearly separate: changed parts, unchanged parts, final result.

## Edit Discipline
- Only modify what is necessary.
- Preserve existing working logic.
- Do not touch locked code (see LOCKED_CONTENT_RULES.md).
- Do not refactor code that wasn't asked about.

## Pre-Delivery Checks
- **Syntax** — Valid Python/JS/JSX before delivering.
- **Imports** — All imports present and correct.
- **Dependencies** — No missing packages or modules.
- **References** — No broken variable/function references.
- **Duplicates** — No duplicate functions, classes, or variables (run check_dupes.py).
- **Conflicts** — No conflicting logic between new and existing code.

## Panda-Specific
- Use `py -3.11`, never `python`.
- Supabase client from `../../lib/supabase` — never `process.env` directly.
- `None` vs `""`: always `row.get("key") or ""`.
- Confluence loops: use `all_scores.get(sym)`, not stale `scores.get(sym)`.
- BB gap: `PREV_GAP[symbol]` set AFTER `check_bb_entry()`, `gap_deltas` computed BEFORE.
- Auth gates on ALL data-returning API routes (validateSession + role check).
- `signal-tracker` POST: dual auth (session cookie OR `ENGINE_SECRET` header).
- Twelve Data: 8 req/min, 10s delay between batches.

## Git Workflow
- Commits via `.bat` file (inline `&&` breaks on special chars).
- Vercel auto-deploys on push to main.
- Desktop Commander `start_process` with shell: cmd.
