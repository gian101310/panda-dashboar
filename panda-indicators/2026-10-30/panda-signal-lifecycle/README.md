# Panda Signal Lifecycle (personal cTrader indicator)

This read-only chart panel explains the current Panda BUY/SELL phase for any of
the 21 supported pairs. It shows gap and recent price direction, H1/H4/D1 box
position, and related-pair agreement for both currencies. Related readings
include gap, H1 box confirmation, and price movement. A pair's base and quote
currency are summarized separately so the display does not present 21 related
pairs as independent probability votes.

Phases are deterministic evidence labels: baseline, starting, strengthening,
strong continuation, continuing, mixed/slowing, mature/mixed, and weakening/
possible end. They are not calibrated probabilities, entry rules, or trade
recommendations. The panel never sends orders or changes Panda scoring, BB,
INTRA, or cross-hedge eligibility. A missing or older-than-20-minute snapshot
displays no current reading. Price and zone context is excluded if its TBG file
has not updated for 20 minutes. The first fresh snapshot after a long gap is
marked baseline because a trend start cannot be inferred from it.

The engine exports `panda_lifecycle_snapshot.json` every scoring cycle to
`Documents/cAlgo/Data/Indicators/Panda Signal Lifecycle/`. It also writes
compact local daily observations under that folder's `history/` directory.
The history is input for later four-hour outcome testing; the indicator does
not claim a numeric probability until real outcomes have been evaluated.

If an older elevated engine process still owns port 8000, the Windows task
`Panda Signal Lifecycle Export` runs `tools/lifecycle_export_once.py` every
five minutes from the existing local `panda_score_*.txt`, MT4, and TBG files.
It skips a cycle when the main engine exporter has already written the snapshot.
The task never starts or stops the engine and never sends orders or alerts.

Build with `dotnet build PandaSignalLifecycle.csproj -c Release`. A local
install copy is available at `dist/Panda Signal Lifecycle.algo`; install that
package in cTrader Desktop and attach `PandaSignalLifecycle` to a supported
pair chart. Re-add the indicator after an update, then verify the displayed
timestamp and related symbols against the fresh local snapshot. Build success
does not verify chart rendering or live broker symbols.
