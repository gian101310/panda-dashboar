# Panda Gold MT4 to Engine bridge

`Panda Gold V1.mq4` writes its confirmed Gold state to MT4 Common Files once
per minute and immediately when a new live signal opens. The engine reads the
H1 export by default (`PANDA_GOLD_MT4_PERIOD=60`). The indicator must be
attached to an XAUUSD H1 chart with `GoldEngineExport=true` and MT4 must stay
open. The current demo terminal is on XAUUSD H1.

The export contains a UTC write time, account, broker symbol, timeframe, signal
bar, UTC event time, direction, active/flat state, entry, stop, TP1-TP3, USD
strength, and filter availability. It contains no Telegram token. The engine
uses the MT4 plan for the Gold snapshot and queues a Signal-bot message for a
fresh, confirmed event. Outbox idempotency prevents repeated messages across
engine restarts. A stale export shows OFFLINE; it does not silently switch to
Twelve Data after an MT4 export has existed. Before the first export, the
existing Twelve Data Gold path remains active.

To activate, compile the updated `.mq4` in the active MT4 MetaEditor and
re-attach the indicator to XAUUSD H1. The source does not place orders.
