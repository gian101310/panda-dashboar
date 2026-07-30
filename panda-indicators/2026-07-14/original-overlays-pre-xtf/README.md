# Original Overlays — Pre BASE/QUOTE XTF Backup

Byte-identical copies of the overlay cores and cTrader binaries as they were
BEFORE commit `f80d895` (port-base-quote-xtf-rows-to-mt4-mt5-ctrader-overlays).

These are the exact versions currently live on the website and installed on
customer terminals. Keep them untouched as the known-good fallback while the
new BASE XTF / QUOTE XTF panel rows are verified.

Contents:

- `mt4/PandaDashboardOverlayMT4.Core.mqh` — old MT4 shared core
- `mt5/PandaDashboardOverlayMT5.Core.mqh` — old MT5 shared core
- `ctrader/PandaDashboardOverlay.Core.cs` — old cTrader shared core
- `ctrader/dist/*.algo` + `SHA256SUMS` — old cTrader binaries (checksums verify)

The MT4/MT5 `.ex4`/`.ex5` binaries in the main `dist/` folder and everything in
`public/downloads/` were never modified — they are still these original builds.

To roll the sources back, copy a core file from here over its counterpart in
the main overlay folders (or `git revert f80d895`).
