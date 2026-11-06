# Panda Standalone Scoring for MT4

A plain movable panel showing BASE/QUOTE raw timeframe scores, ADV scores and bias. Drag its title row to move the whole panel; score refreshes retain the current position. No EA, external indicator, engine feed, token, files or web calls. No additional chart drawings or trading metrics. See INSTALL-MT4.txt.

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
