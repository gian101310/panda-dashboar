# Panda Scoring Dashboard MT5

Compact, read-only on-chart indicator with three buttons:

- **ALL** shows every currently valid Panda bias, sorted by absolute gap. A row is shown only when its score row is fresh, `hard_invalid` is false, and BUY has gap ≥ +5 or SELL has gap ≤ −5.
- **PAIR** shows the pair on the attached chart, including its gap, bias, PL zone/G1 state, and H4/H1 box labels. It also shows WAIT or INVALID pairs.
- **− / +** collapses or restores the panel. The chosen view is saved per chart.

The panel uses Panda's existing MT5 overlay snapshot. It does not recompute scores, alter Panda Levels or EA behavior, place trades, or change any engine strategy rules. The feed is account licensed separately from Panda Levels using the existing **Panda MT5 Dashboard Overlay** product in Panda Engine Admin (`mt5_dashboard_overlay`). The feed server validates the MT5 account, license status, payment, expiry, and device policy. This indicator reads only the account-specific cache written by that licensed feed.

## Install

1. In MT5, open **File → Open Data Folder**. Copy `Panda Scoring Dashboard MT5.ex5` into `MQL5/Indicators` and `PandaDashboardFeedMT5-Licensed.ex5` into `MQL5/Experts`.
2. In MT5 **Tools → Options → Expert Advisors**, allow WebRequest for `https://pandaengine.app`.
3. In Panda Engine Admin, approve and mark paid a **Panda MT5 Dashboard Overlay** license for the MT5 account number. A Panda Levels license alone does not authorize this dashboard feed.
4. Attach the feed EA to one supported forex chart. Attach the scoring indicator to any chart where the panel is wanted. Refresh Navigator or restart MT5 if the files do not appear.

After replacing the `.ex5` while MT5 is running, remove and reattach the scoring indicator to load the new build. Leave the feed EA on its separate chart.

One feed EA refreshes the shared snapshot every 60 seconds for all indicator instances. **LIVE** means its last successful response is within the server's 10-minute freshness limit; each pair must also have an updated score within that limit. **STALE** means the feed needs refreshing. A license rejection appears as its server status and clears the displayed rows. If the feed has never run, the panel shows **ATTACH FEED EA**.

The source is `Panda Scoring Dashboard MT5.mq5`; compile it in MetaEditor if changing the `PanelX`, `PanelY`, or initial view inputs is insufficient. The released `.ex5` was compiled with MetaEditor64 and `compile.log` records the result.
