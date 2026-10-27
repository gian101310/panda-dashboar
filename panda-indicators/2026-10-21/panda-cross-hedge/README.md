# Panda Cross-Hedge Check — personal cTrader indicator

This is a separate, read-only chart indicator. It reads the **current cTrader
account's** open positions. It never places, closes, modifies, or cancels an
order, and it does not call MCP, FIX, or Telegram. Panda Engine writes a local
setup snapshot that the indicator reads from its cTrader data folder.

Attach it to any chart in cTrader Desktop. It shows the account's net currency
exposure, current equity and margin, a user-defined stress-limit comparison,
the selected position, simulated reduce/close alternatives, and up to three
cross-hedge simulations at the configured lot size (default 0.01).
`Next open position` cycles through the
account; the default selection is the position with the lowest current P/L.
Drag the panel by its visible grip to move it away from other indicators. Its
chart position is saved for that indicator instance.
The candidate universe is the existing 21 Panda forex pairs in dashboard.js.
Only a fresh, non-invalid Panda BUY/SELL bias with a gap of at least 5 in its
direction is eligible. Panda Lines, G1, and H1/H4 box trends are shown for
context but are not required to include the pair. Candidates are ranked by
modelled exposure fit; a valid bias does not guarantee a good hedge. If the
Panda snapshot is missing or older than 20 minutes, the panel continues to
show exposure and reduce/close comparisons but pauses pair suggestions.
The engine exports the snapshot on its normal scoring cycle to
`Documents/cAlgo/Data/Indicators/Panda Cross-Hedge/panda_bias_snapshot.txt`.
The indicator resolves unique broker suffixes; ambiguous or unavailable symbols
are skipped. It refuses to rank hedges if any open position is outside the seven
currencies in that universe, because account-wide exposure would be incomplete.

## Calculation

For BUY A/B of V base units at current mid M, the account holds +V units of A
and -V*M units of B. SELL reverses both signs. Each leg is converted to the
account currency through available broker mid quotes, including inverse and
cross-pair routes. cTrader's AssetConverter is used if no quote path exists.
If neither can provide a valid rate, the panel suppresses all hedge suggestions.
Opposing legs net; gross
legs are shown separately. These are marked-to-market *exposures*, not incurred
or maximum losses.

The stress test strengthens or weakens **one currency at a time** by the
configured percentage against all other currencies. It revalues the complete
currency basket relative to the account currency, preserving consistent cross
rates. The largest modelled loss across these hypothetical shocks is shown in
account currency and as a fraction of equity. The default stress limit (2% of
equity), shock size (1%), and minimum hedge improvement (5%) are illustrative
user-adjustable screening settings, not recommended trading limits. A hedge
must reduce the worst shock by more than its approximate entry spread cost and
by at least the selected improvement threshold. It must also fit free margin
and the broker's minimum/step volume. The model fit ranking uses net improvement
after spread plus a smaller reward for lowering total absolute net currency
exposure. This distinguishes crosses that offset two existing currency risks
from those that offset one but add another. The selected trade's 50% reduction
is shown only if the remaining volume meets the broker minimum and step; full
closure is a simulation only.

This first version does **not** use correlation, forecast returns, or modelled
probabilities. It does not include commissions, swap, slippage, realized P/L
from reducing or closing, or guaranteed stop execution. The cTrader quote API
does not give this panel a quote timestamp, so the panel shows its calculation
time, warns that price freshness is unverified, and pauses hedge ranking when
any existing position's market is closed. Confirm actual prices and costs in
cTrader before any manual action. A hedge never recovers an existing loss.

## Build and install

From the project directory:

```powershell
& 'C:\Program Files\dotnet\dotnet.exe' build .\PandaCrossHedge.csproj -c Release
& 'C:\Program Files\dotnet\dotnet.exe' run --project .\Tests\Tests.csproj -c Release
```

The release `.algo` package is in `dist/Panda Cross-Hedge.algo`. Open it in
cTrader Windows or Mac, attach the indicator to a chart, and confirm the panel
and Algo log on the intended account. The build and deterministic maths tests
do not prove the panel renders or that broker prices/conversions are available.

The only engine change copies completed scoring rows to a local file; no
Panda scoring, Trade Plan, or strategy logic was changed. Telegram is a
possible later companion through the existing local cTrader MCP and requires
its own delivery and account checks.
