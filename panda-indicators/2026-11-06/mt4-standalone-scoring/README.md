# Panda Box and Lines MT4

This indicator calculates its own scores directly from MT4 broker prices and history. It does not read or write export files, call the Panda engine, use an EA, or access the web.

## Sources and behavior

- Current and ADV 21-pair net currency scoring and score windows are retained from the installed `Scoring with Adv v1 MT4.mq4` source (SHA-256 `145f2384e2740fe2a8277c48c4a05add7eec1a7dbcfb135e8c824d59fc4f2f7c`). The current gap and bias remain on its calculation.
- The displayed ADV **forecast** follows the current Panda Pair Card and snapshot horizon rules in `pages/dashboard.js` and `app.py`: next Dubai weekday session uses current D1/H4 plus ADV H1; Friday/weekend uses current D1 plus ADV H4/H1; a next session crossing a month boundary uses ADV D1/H4/H1. Each currency's strongest selected score is compared. Opposing selected extremes (at least +4 and at most -4) make the forecast `INVALID`; otherwise projected gap >= +5 is BUY, <= -5 is SELL, and a smaller gap is WAIT. The forecast is display-only and must be checked against the next live score.
- The three monthly, weekly, and daily WagBoxes use the same main box windows and drawing rules as Scoring with Adv v1. The chart shows only the current pair's boxes, while the score still covers all 21 pairs.
- Panda Levels are the previous day, week, month, and year highs/lows: PDH/PDL, PWH/PWL, PMH/PML, PYH/PYL. Their H1 previous-period aggregation and previous-year monthly aggregation follow the installed `Panda Levels MT5.mq5` display source. The levels are chart references and do not change scoring or bias.

The panel, boxes, and levels can be toggled with indicator inputs. Boxes and levels default on. The panel strip can be dragged. All chart objects belong to this indicator instance and are removed when it is detached.

Source: `Panda Box and Lines.mq4`. Compiled EX4 and installation ZIP: `dist/`. MetaEditor 4 compiled with 0 errors and 0 warnings; `check_dupes.py` and the Next.js build passed. A live side-by-side MT4 chart comparison remains pending.
