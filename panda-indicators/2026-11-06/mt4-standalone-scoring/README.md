# Panda Box and Lines MT4

This indicator calculates its own scores directly from MT4 broker prices and history. It does not read or write export files, call the Panda engine, use an EA, or access the web.

## Sources and behavior

- Current and ADV 21-pair net currency scoring, score windows, and gap/bias rules are retained from the installed `Scoring with Adv v1 MT4.mq4` source (SHA-256 `145f2384e2740fe2a8277c48c4a05add7eec1a7dbcfb135e8c824d59fc4f2f7c`). The main and ADV bias use its threshold input (default gap 5); below threshold displays `INVALID`.
- The three monthly, weekly, and daily WagBoxes use the same main box windows and drawing rules as Scoring with Adv v1. The chart shows only the current pair's boxes, while the score still covers all 21 pairs.
- Panda Levels are the previous day, week, month, and year highs/lows: PDH/PDL, PWH/PWL, PMH/PML, PYH/PYL. Their H1 previous-period aggregation and previous-year monthly aggregation follow the installed `Panda Levels MT5.mq5` display source. The levels are chart references and do not change scoring or bias.

The panel, boxes, and levels can be toggled with indicator inputs. Boxes and levels default on. The panel strip can be dragged. All chart objects belong to this indicator instance and are removed when it is detached.

Source: `Panda Box and Lines.mq4`. Compiled EX4 and installation ZIP: `dist/`. MetaEditor 4 compiled with 0 errors and 0 warnings; `check_dupes.py` and the Next.js build passed. A live side-by-side MT4 chart comparison remains pending.
