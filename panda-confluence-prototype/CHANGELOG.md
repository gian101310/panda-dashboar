# Panda Confluence Prototype Changelog

## 2026-11-01 — V4 H1 swing trade planner

- Added separate read-only cTrader V2, V3, and V4 artifacts without changing Panda scoring or locked strategy definitions.
- V3 uses H1 Panda Lines and previous-period Panda Levels with fresh M15 continuation confirmation to block early and late pullback entries.
- V4 draws a native draggable risk/reward plan from the confirmed M15 trigger close, latest confirmed H1 swing plus buffer, configurable maximum stop width, and fixed-R target.
- Added deterministic gap, line, level, pullback, continuation, swing-stop, and BUY/SELL symmetry tests plus installable `.algo` files and SHA-256 checksums.
