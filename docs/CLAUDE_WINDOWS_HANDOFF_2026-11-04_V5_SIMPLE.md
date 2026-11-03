# Windows handoff — 2026-11-04 V5 simple panel

- User reported that the two-column V5 panel was too wide and noisy. V5 now defaults to a 400-pixel simple view with directional color, H1 strength/ADX, H1 and M15 events, Lines, level, alignment, decision, and next step. Details opens the full prior panel.
- Matching M15 CHOCH is shown as a developing pullback; the existing decision logic still requires a fresh matching M15 BOS after H1 rejection for a pullback READY state. No scoring or trading rules changed.
- Built V5 successfully with zero warnings/errors. The release `.algo` was installed locally by the build and copied to `ctrader/dist` with an updated checksum. The 37 deterministic confluence tests, `check_dupes.py`, and `npx next build` passed.
- cTrader was running, but the attached chart was not changed or visually verified. Reattach the rebuilt V5 indicator to load the new panel on an existing chart.
- The engine was successfully restarted through Windows elevation after the earlier handoff, with a new port-8000 PID and ACTIVE status.
