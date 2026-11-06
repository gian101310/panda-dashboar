# Panda Raw Score Engine — licensed for Mac and Windows

## Admin flow

1. Open Panda License Admin and select **Panda Raw Score Engine for cTrader**.
2. Register the customer's cTrader trading account number, confirm payment and approve the license. Set expiry as needed.
3. Use **ISSUE / ROTATE TOKEN** on that license. Send the .algo and the issued token to the customer. Only its hash is stored; rotating it revokes the previous token.
4. The customer imports the .algo, attaches **Panda Raw Score Engine** to a supported chart and enters **License Token**. The indicator sends the active trading account automatically; there is no editable account input or operator-token bypass.

Uses the existing `/api/trend-confluence-feed` account-token flow with product `ctrader_raw_score_engine`. A token is valid only for its approved, paid, unexpired account and product. Switching accounts clears the display immediately and ignores responses for the previous account. License checks repeat on each poll (30 seconds by default).

No local MT4 files or score recomputation. Displays engine current and ADV dominant timeframe values, official gap/bias/execution/confidence, and H1/D1 ATR in MT4 points. Original split strings (+3/-1) are not stored; +3 is displayed. Spread is live cTrader spread in local pips/tick points. Polling does not accelerate the engine's normal update cycle.

Stale data clears using the engine timestamp (maximum ten minutes). Missing score fields and authorization failures clear the panel. No orders, alerts or file access.

Build: `dotnet build PandaRawScoreEngine.csproj -c Release -p:AlgoPublish=false`.

Download through License Admin or import `dist/Panda Raw Score Engine.algo`. Live chart/account-switch verification still requires cTrader.
