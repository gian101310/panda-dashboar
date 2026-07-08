#!/bin/sh
# Panda Engine auto-pull (Mac) — runs via cron every 5 min.
# Pulls latest origin/main ONLY if safe: no local edits, fast-forward only.
REPO="$HOME/panda-dashboar"
cd "$REPO" || exit 0
# Skip if any tracked file has local modifications (staged or unstaged)
git diff --quiet 2>/dev/null || exit 0
git diff --cached --quiet 2>/dev/null || exit 0
git fetch origin --quiet 2>/dev/null || exit 0
# Fast-forward only — never overwrites local commits; fails silently on force-push divergence
git merge --ff-only origin/main --quiet 2>/dev/null
