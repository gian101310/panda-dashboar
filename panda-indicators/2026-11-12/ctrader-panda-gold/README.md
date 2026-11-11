# Panda Gold cTrader

Personal cTrader port of the MT4 Panda Gold signal panel. Attach the compiled
`dist/Panda Gold cTrader.algo` to a gold chart in cTrader.

The indicator runs from broker chart data. It draws SuperTrend and confirmed
historical LONG/SHORT flip labels. New closed-bar flips can open a visual risk
plan: entry at the signal bar close, stop at the SuperTrend band, and targets at
1R, 2R, and 3R. The displayed stop moves to entry after TP1 when enabled.
It never places, changes, or closes an order.

The USD veto uses the same 21 forex pairs and D1/H4/H1 strongest-score method
as the MT4 version. With the filter enabled, a new signal waits until all 21
pair feeds are ready. An extreme positive USD score vetoes LONG; an extreme
negative USD score vetoes SHORT. Historical flip labels are unfiltered because
the current USD score cannot be reconstructed for old bars.

This build includes a local sound on a new signal. MT4 mobile push, popup,
and sound-file settings are not ported. The additional XTF/BOS controls come
from the shared cTrader calculation base and are hidden by default. Gold signals
are driven by the SuperTrend flip and USD veto, independent of XTF/BOS triggers.

Build: `dotnet build PandaGold.csproj -c Release` (cTrader.Automate 1.0.17).
The `.algo` builds with zero errors and warnings. Live chart appearance and
broker symbol availability still require verification in cTrader.
