# Panda Signal Lifecycle MT4

Read-only MT4 chart panel mirroring the existing Panda Signal Lifecycle
snapshot. It reads `panda_lifecycle_<PAIR>.txt` from the MT4 Common Files
directory; no HTTP, DLL, trade orders, or scoring changes are involved.

The engine writes all 21 pair files after each scoring cycle. The existing
`Panda Signal Lifecycle Export` scheduled task mirrors the current JSON file
as a fallback when the running engine has not yet loaded the new exporter.
The panel rejects data older than 20 minutes and says why a reading is missing.

The panel displays Panda bias and gap, lifecycle phase, H1/H4/D1 box position,
nearby opposing level, related currency breadth, four-hour evidence, and a
short reason. The four-hour percentage remains withheld until the existing
sample and holdout requirements are met. `ShowPanel=false` hides the panel;
the `-` button minimizes it and `+` expands it.

Install `Panda Signal Lifecycle MT4.ex4` in the active MT4 terminal's
`MQL4/Indicators` folder, refresh Navigator, then attach it to any supported
pair chart. The installed IC Markets Global terminal data folder is
`%APPDATA%/MetaQuotes/Terminal/5D49F47D1EA1ECFC0DDC965B6D100AC5`.
The indicator uses `FILE_COMMON`, so the engine's per-pair text files are
shared across MT4 terminals. The cTrader indicator remains available.

Source: `Panda Signal Lifecycle MT4.mq4`. Compile with MetaEditor and verify
`compile.log` reports zero errors and warnings. Visual chart behavior still
needs checking after attachment in MT4.
