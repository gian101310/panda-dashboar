# LOCKED CONTENT RULES — Do Not Touch

## Core Rule
Anything marked LOCKED must never be changed, refactored, renamed, or reorganized.

## Locked Zones

| Zone | Location | Scope |
|------|----------|-------|
| Core scoring | `app.py` lines ~421–536 | `extract_panda_score` + `compute_scores_all_pairs` — LOCKED FOREVER |
| Security layer | `validates_session()`, `isAdmin` logic, webhook secret validation | Locked since Apr 25 |

## Prohibited Actions on Locked Content
- Do not edit locked functions or their internals.
- Do not rename locked functions, variables, IDs, files, or comments.
- Do not refactor or "improve" locked sections.
- Do not move locked code to different locations.
- Do not change locked thresholds or scoring weights.

## If a Change Requires Touching Locked Code
1. **STOP.**
2. Explain why the change would need to touch locked content.
3. Ask Boss-G for explicit permission.
4. Only proceed after written approval.

## Adjacent Code
- Code that calls locked functions may be edited, but the locked function signatures and behavior must remain identical.
- Do not change how data flows into or out of locked functions without permission.
