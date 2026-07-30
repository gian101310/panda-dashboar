# Auto-Pull Setup — keep Mac + Windows repos synced automatically

Both scripts pull `origin/main` every 5 minutes, but ONLY when safe:
- Skips if you have uncommitted local edits (never loses work)
- Fast-forward only (never overwrites local commits; does nothing on force-push divergence)

## Mac — DONE (installed 2026-07-08)
Cron job runs `~/panda-dashboar/autopull.sh` every 5 min while the Mac is awake.
Check it: `crontab -l` · Log: `~/panda-autopull.log`

## Windows — run this ONCE (as Admin user, from home PC)
1. Pull latest so autopull.bat exists: `git pull origin main`
2. Register the scheduled task (cmd, run once):
```
schtasks /Create /SC MINUTE /MO 5 /TN "PandaAutoPull" /TR "C:\Users\Admin\panda-dashboard\autopull.bat" /F
```
3. Verify: `schtasks /Query /TN "PandaAutoPull"`

To remove: `schtasks /Delete /TN "PandaAutoPull" /F`

## Notes
- Only pulls while the machine is on and online.
- The engine folder (ctrader_trend_scanner) is NOT touched — dashboard repo only.
- Pushing stays manual on purpose: check_dupes + next build before every push.
- If a pull silently stops working, the likely cause is remote force-push divergence — resolve manually (backup branch, then reset to origin/main).
