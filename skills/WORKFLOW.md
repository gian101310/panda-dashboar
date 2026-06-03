# WORKFLOW — Standard Execution Order

Every request follows these steps. Do not skip steps for code/file tasks.

## Steps

1. **Understand** — Parse the request. Identify what's being asked.
2. **Classify** — Is this code, files, text, memory, or conversation?
3. **Route** — Use REQUEST_ROUTER.md to load needed skill files.
4. **Inspect** — Read relevant source files before forming an answer. Use `offset`/`length` for large files.
5. **Apply rules** — Follow CODING_RULES, LOCKED_CONTENT_RULES, etc. as loaded.
6. **Validate** — Run DUPLICATE_AND_ERROR_CHECKS.md before delivering code. Confirm LOCKED_CONTENT_RULES.md not violated.
7. **Answer** — Deliver per RESPONSE_STYLE.md. Precise. No fluff.

## Panda Engine Dev Order (when writing/deploying code)

1. Read source files with `offset`/`length` before edits
2. Write large files in chunked appends (25-30 lines)
3. Run `py -3.11 C:\Users\Admin\Desktop\ctrader_trend_scanner\check_dupes.py`
4. Run `npx next build` from `C:\Users\Admin\panda-dashboard`
5. Write `.bat` commit file → execute via Desktop Commander `start_process` (shell: cmd)
6. Update CHANGELOG.md
7. Re-upload SKILL.md / AI_BUILD_PLAN.md / CHANGELOG.md after major sessions
