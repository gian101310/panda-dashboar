# MT4 Global Exporter — BOS

**Use `Panda_Exporter_v2_BOS.mq4`.** It is the running v2 exporter (keeps the price-context
fields `PDO/PDC/PRH/PRL/DAYO/DAYH/DAYL/ADR/H1R6`) **plus** Break of Structure
(`TBG_BOS` / `TBG_BOS_T`, `CalcBos`, inputs `SwingLength`, `BOS_ScanBars`).

`Panda_Exporter_BOS.mq4` is **SUPERSEDED** — it was built on the older v1 base and is
**missing the v2 price-context fields**. Do not deploy it; it would drop the dashboard's
price-context data. Kept only for reference/history.

Install: copy `Panda_Exporter_v2_BOS.mq4` into `MQL4/Experts`, compile (F7), and attach it
to ONE chart in place of the current `Panda_Exporter_v2` EA.
