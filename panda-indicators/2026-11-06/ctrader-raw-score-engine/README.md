# Panda Raw Score Engine — Mac and Windows

Reads the existing authenticated Panda cTrader overlay feed. No local MT4 files or local score recomputation. Enter the existing Operator Token in indicator settings. The server must first deploy the accompanying feed field extension.

Displays engine current and ADV dominant timeframe values, official gap/bias/execution/confidence, and engine H1/D1 ATR in MT4 points. Original split strings (+3/-1) are not stored in the dashboard; +3 is displayed. Spread is live cTrader spread in cTrader pips/tick points. Engine updates follow its normal cycle; polling every 30 seconds does not create new scores.

Stale data is cleared using the engine row timestamp (maximum ten minutes), including when requests fail. Missing required score fields, authorization failures and unsupported symbols clear the display. No trading, file access, scoring changes, or alerts.

Build: `dotnet build PandaRawScoreEngine.csproj -c Release -p:AlgoPublish=false`.
Import `dist/Panda Raw Score Engine.algo` in cTrader, then add **Panda Raw Score Engine** to a supported chart. Live chart/feed verification remains necessary.
