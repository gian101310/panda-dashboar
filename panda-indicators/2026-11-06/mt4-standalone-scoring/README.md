# Panda Standalone Scoring for MT4

One self-contained indicator with local 21-pair scoring, current/ADV raw components, gap/bias/execution/confidence, H1/D1 ATR, spread and current-chart boxes. No EA, external indicator, engine feed, license token, HTTP calls, file imports or exports. See INSTALL-MT4.txt for installation and broker time settings.

Private sources are the four `.mq4`/`.mqh` files. Distribute only the compiled `.ex4` or ZIP in `dist`.

Calculation verification:

```sh
python3 panda-indicators/2026-11-06/mt4-standalone-scoring/tests/engine_parity.py
clang++ -std=c++17 panda-indicators/2026-11-06/mt4-standalone-scoring/tests/score_math.cpp -o /tmp/panda-score-math-test
/tmp/panda-score-math-test
clang++ -std=c++17 panda-indicators/2026-11-06/mt4-standalone-scoring/tests/score_windows.cpp -o /tmp/panda-score-window-test
/tmp/panda-score-window-test
```

The parity test extracts only the locked scoring function ASTs from app.py; it never imports or starts the engine. Both native test programs compile the actual MQL-compatible math/window headers. MetaEditor 4 compile evidence is in dist/compile.log. Live broker/chart comparison remains pending.
