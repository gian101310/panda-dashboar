# Panda Raw Score Panel for cTrader

Read-only chart panel for the 21 Panda forex pairs. It mirrors the four raw
D1/H4/H1 and ADV lines plus ATR from the live `mt4_PAIR.txt` export. The gap,
bias, execution, and confidence come from the engine's `panda_score_PAIR.txt`.
The display-only BASE RAW and QUOTE RAW values are calculated from the chart's
raw lines; they do not replace the engine's pair score. Spread is measured from
the current cTrader bid and ask and shown in pips and broker tick points.

The panel reads MT4 Common Files on the same Windows PC. Both files must be
less than 20 minutes old by default. Stale or missing files clear the score
and bias. The panel refreshes every five seconds, can be dragged, and sends no
orders, alerts, or file writes.

Build from this directory:

```powershell
& 'C:\Program Files\dotnet\dotnet.exe' build PandaRawScorePanel.csproj -c Release
```

The build creates and installs `Panda Raw Score Panel.algo`. A copy ready to
import is in `dist/Panda Raw Score Panel.algo`. In cTrader, open a supported
pair chart and add **Panda Raw Score Panel** from Indicators. cTrader must
allow file access for this indicator. Its scores are sourced from the local
Panda/MT4 exporter, so the exporter and engine must be running on this PC.
