# Panda Signal Lifecycle (personal cTrader indicator)

This read-only chart panel explains the current Panda BUY/SELL phase for any of
the 21 supported pairs. It shows gap and recent price direction, H1/H4/D1 box
position, and related-pair agreement for both currencies. Related readings
include gap, H1 box confirmation, and price movement. A pair's base and quote
currency are summarized separately so the display does not present 21 related
pairs as independent probability votes.

Phases are deterministic evidence labels: baseline, starting, strengthening,
strong alignment/early, strong continuation, continuing, mixed/slowing,
weakening/possible end, and Panda signal ended. A new valid bias is marked
starting for its first 15 minutes. Brief counter-direction moves do not by
themselves mark a trend mature or ended; weakening requires repeated adverse
readings, while signal ended means Panda eligibility ceased. These labels are
not entry rules or trade
recommendations. The panel never sends orders or changes Panda scoring, BB,
INTRA, or cross-hedge eligibility. A missing or older-than-20-minute snapshot
displays no current reading. Price and zone context is excluded if its TBG file
has not updated for 20 minutes. The first fresh snapshot after a long gap is
marked baseline because a trend start cannot be inferred from it.
Strong continuation requires at least one hour of continuous observations;
earlier agreement is labelled strong alignment/early. A day high/low, previous
high/low, or box edge within five pips ahead receives an amber review line
without changing Panda's BUY/SELL bias.

The engine exports `panda_lifecycle_snapshot.json` every scoring cycle to
`Documents/cAlgo/Data/Indicators/Panda Signal Lifecycle/`. It also writes
compact local daily observations under that folder's `history/` directory.
The history feeds a local four-hour outcome test. A successful outcome means
the Panda bias remains valid four hours later and price moved at least three
pips with that bias.
Only nonoverlapping pair observations are counted. A pair/phase percentage is
shown only after at least 30 earlier observations, 15 later holdout observations,
10 distinct days, and stable early-versus-later results. Otherwise the panel
shows the sample count and withholds the percentage. The displayed percentage
is historical frequency for that exact outcome, not a guaranteed forecast.
The chart timeframe does not change the inputs: scores update every engine
cycle, H1/H4 boxes confirm direction, D1 supplies broader context, and the
outcome horizon is four hours.

If an older elevated engine process still owns port 8000, the Windows task
`Panda Signal Lifecycle Export` checks `tools/lifecycle_export_once.py` every
minute and exports when new score files arrive, using the existing local
`panda_score_*.txt`, MT4, and TBG files.
It skips a cycle when the main engine exporter has already written the snapshot.
The task never starts or stops the engine and never sends orders or alerts.
Reinstalling the indicator can clear its cTrader data folder; the task restores
the snapshot at its next check, and the panel waits instead of showing a file error.

Build with `C:\Program Files\dotnet\dotnet.exe build PandaSignalLifecycle.csproj -c Release`.
The build produces and installs `Panda Signal Lifecycle.algo` directly; do not
rename the dated package from an older build. A local install copy is available
at `dist/Panda Signal Lifecycle.algo`; attach `Panda Signal Lifecycle` from
cTrader's Add Indicator list to a supported pair chart. Re-add the indicator
after an update, then verify the displayed
timestamp and related symbols against the fresh local snapshot. Build success
does not verify chart rendering or live broker symbols.
