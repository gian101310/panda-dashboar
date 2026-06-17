# Claude Start Here

Read this before continuing Panda Engine work.

## Required Order

1. Read `AGENTS.md` first. It is the locked source of truth.
2. Read `CODEX_HANDOFF.md` for latest Codex changes, deployed commits, and unfinished notes.
3. Check Git before editing:
   - `git fetch origin`
   - `git status --short --branch`
   - `git log --oneline --decorate --graph --left-right HEAD...origin/main`
4. Preserve unrelated local changes. Do not stage `snapshot.png`, `.gitignore`, `SKILL_v2.md`, or logs unless Boss-G asks.

## Coordination Rules

- Boss-G is final.
- Claude is primary builder.
- Codex handles targeted fixes, reviews, small routes, debugging, and handoffs.
- Never force push.
- Never use `assistant-server`.
- Push only `gian101310/panda-dashboar` branch `main`.

## Current High-Risk Areas

- Login/security alerts: approved-user alerts use `PF_APPROVE_BOT_TOKEN` and `PF_ADMIN_CHAT`.
- Signup alerts: new signup bot uses `PF_BOT_TOKEN` and `PF_ADMIN_CHAT`.
- Pending access must always work: unapproved users go to `/pending`; approved active users reach dashboard/admin.
- Locked scoring and strategy logic must not be edited without Boss-G approval.

## Before Any Deploy

Run:

```powershell
py -3.11 check_dupes.py
npx next build
```

After push, verify Vercel production is `READY` and build time is more than 20 seconds.

