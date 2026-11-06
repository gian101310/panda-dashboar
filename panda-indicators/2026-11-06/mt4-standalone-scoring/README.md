# Panda Standalone Raw Score MT4

This indicator is derived from the installed `Scoring with Adv v1 MT4.mq4` source (SHA-256 `145f2384e2740fe2a8277c48c4a05add7eec1a7dbcfb135e8c824d59fc4f2f7c`). Its six 21-pair scoring passes, box windows, bounds, broker-symbol resolution, net currency votes, and score formatting are retained. It does not read or write export files and does not use the Panda engine, an EA, a token, or network access.

The panel shows current and ADV D1/H4/H1 **net** scores for the chart pair's base and quote currencies. It omits the source indicator's boxes, ATR, spread, gaps, bias, and file export. Source file: `PandaStandaloneScoringMT4.mq4`; compiled file and ZIP: `dist/`.

With the original default inputs, monthly and weekly main windows end one period before the current period; ADV ends at the current period boundary. Daily windows use **calendar days**, exactly as ADV v1 does, and H1 bars build all three ranges. Each pair votes +1/-1 outside its box and zero inside. Votes are summed into one signed number per currency and timeframe. Missing symbols, prices, or bounds are skipped, matching ADV v1.

MetaEditor 4 compilation: `dist/compile.log` reports 0 errors, 0 warnings. A live side-by-side comparison against ADV v1 on the same broker remains to be done. The previous package and its engine-parity claim applied to a different calculation and are superseded.
