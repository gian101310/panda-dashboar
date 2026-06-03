# FILE HANDLING — Rules for Files

## Before Answering
- Never assume file contents without reading them.
- If the answer depends on a file, inspect that file first.
- If a file has not been inspected, say so clearly.
- Identify missing files before making claims.

## Reading Rules
- Use `offset`/`length` for large files (dashboard.js ~3356 lines, app.py ~2234 lines).
- Never read dashboard.js in full — target the relevant section.
- Check connected files in all mounted folders before answering.

## Tracking
- Track which files were checked during the task.
- Track which files are connected to the answer.
- Before final answer, list checked files when useful to Boss-G.

## Project File Locations
- **Engine:** `C:\Users\Admin\Desktop\ctrader_trend_scanner\` (legacy name)
- **Dashboard:** `C:\Users\Admin\panda-dashboard\`
- **Workspace:** `C:\Users\Admin\Documents\Claude\Projects\Panda Engine\`
- **Bash paths:** Use `/sessions/focused-vigilant-cannon/mnt/` prefix

## Key Files
- `app.py` — Engine core (~2234 lines). Lines ~421-536 LOCKED (see LOCKED_CONTENT_RULES.md).
- `dashboard.js` — Frontend (~3356 lines, 13 tabs). Never rewrite wholesale.
- `check_dupes.py` — Duplicate checker. Run before every commit.
- `CHANGELOG.md` — Update after every code session.
