# Panda Lines v2 cTrader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-contained cTrader Automate indicator that reproduces every feature and default in the supplied `Panda Lines v2.mq4`.

**Architecture:** One overlay `Indicator` owns four plotted outputs, five internal state series, higher-timeframe `Bars`, chart objects, and closed-bar alert state. The MT4 formulas are ported directly so cTrader built-in indicator smoothing does not change signals.

**Tech Stack:** C#, cTrader Automate API (`cAlgo.API`), Python 3.11/pytest for source-contract tests, local cTrader API assemblies for compilation.

## Global Constraints

- Create one self-contained file named `Panda Lines v2 cTrader.cs` under `panda-indicators/2026-07-02/panda-lines-v2-ctrader/`.
- Do not modify the source MQ4, Panda Engine strategy logic, or any locked project file.
- Preserve all source parameters, defaults, calculations, colors, arrows, alerts, and S/R periods.
- Alerts evaluate closed bars only and fire once per newly closed chart bar.
- Use `double.NaN` for undefined output segments.

---

### Task 1: Contract tests and complete indicator

**Files:**
- Create: `tests/test_panda_lines_v2_ctrader.py`
- Create: `panda-indicators/2026-07-02/panda-lines-v2-ctrader/Panda Lines v2 cTrader.cs`

**Interfaces:**
- Consumes: chart `Bars`; `MarketData.GetBars(TimeFrame.Daily|Weekly|Monthly, SymbolName)`; cTrader chart and notification APIs.
- Produces: `PandaLinesV2` overlay indicator with `STBullish`, `STBearish`, `BBTrendBull`, and `BBTrendBear` outputs.

- [ ] **Step 1: Write the failing source-contract test**

```python
from pathlib import Path

SOURCE = Path("panda-indicators/2026-07-02/panda-lines-v2-ctrader/Panda Lines v2 cTrader.cs")

def test_ctrader_indicator_contains_full_mt4_contract():
    text = SOURCE.read_text(encoding="utf-8")
    required = [
        "class PandaLinesV2", "ST Period", "ST Multiplier", "ST Use ATR",
        "BB Period", "BB Deviations", "BB Use ATR", "BB ATR Period",
        "S/R Daily", "S/R Weekly", "S/R Monthly", "S/R Yearly",
        "CalculateSuperTrend", "CalculateBBTrend", "DrawAllSrZones",
        "GetPreviousYearHighLow", "Notifications.PlaySound",
        "Chart.DrawRectangle", "Chart.DrawHorizontalLine", "Chart.DrawText",
        "Chart.DrawIcon", "MarketData.GetBars"
    ]
    assert all(token in text for token in required)

def test_port_uses_direct_sma_atr_and_population_stddev():
    text = SOURCE.read_text(encoding="utf-8")
    assert "sum / period" in text
    assert "Math.Sqrt(sum / period)" in text
    assert "Indicators.AverageTrueRange" not in text
    assert "Indicators.BollingerBands" not in text
```

- [ ] **Step 2: Run the test and confirm the missing-file failure**

Run: `py -3.11 -m pytest tests/test_panda_lines_v2_ctrader.py -q`

Expected: FAIL with `FileNotFoundError` for `Panda Lines v2 cTrader.cs`.

- [ ] **Step 3: Implement the self-contained cTrader indicator**

Use this public structure, expanding it with every parameter, output, internal series, and helper named in the requirements below:

```csharp
using System;
using cAlgo.API;
using cAlgo.API.Internals;

namespace cAlgo
{
    [Indicator(IsOverlay = true, TimeZone = TimeZones.UTC, AccessRights = AccessRights.None)]
    public class PandaLinesV2 : Indicator
    {
        [Parameter("ST Period", DefaultValue = 10, MinValue = 1)]
        public int StPeriod { get; set; }

        [Output("ST Bullish", LineColor = "Lime", Thickness = 2)]
        public IndicatorDataSeries STBullish { get; set; }

        protected override void Initialize()
        {
            _upBand = CreateDataSeries();
            _dailyBars = MarketData.GetBars(TimeFrame.Daily, SymbolName);
        }

        public override void Calculate(int index)
        {
            CalculateSuperTrend(index);
            CalculateBBTrend(index);
        }

        private IndicatorDataSeries _upBand;
        private Bars _dailyBars;
        private void CalculateSuperTrend(int index) { }
        private void CalculateBBTrend(int index) { }
    }
}
```

Implementation requirements:

- `TrueRange`, `AtrSma`, `SmaClose`, and `StdDevClose` must divide by the requested period exactly like the MQ4 source.
- SuperTrend must compare the previous close with previous trailing bands before updating direction.
- BB state must use the previous close against the previous SMA ± population deviation and trail the current bar low/high with optional ATR.
- Segment transitions must populate the adjacent output point to keep plotted lines visually connected.
- S/R levels must come from completed D1/W1/Month1 bars; yearly levels must scan monthly bars for `Server.Time.Year - 1`.
- Rectangles must use an alpha color, `IsFilled = true`, and unique `PandaLinesV2_SR_` names; lines and labels must share each level name.
- `Chart.DrawIcon` names must contain the bar open time ticks to remain idempotent.
- Alerts must only run for `index == Bars.Count - 1`, inspect indices `index - 1` and `index - 2`, and update one `_lastAlertedClosedBarTime` value.

- [ ] **Step 4: Run the contract tests**

Run: `py -3.11 -m pytest tests/test_panda_lines_v2_ctrader.py -q`

Expected: `2 passed`.

- [ ] **Step 5: Commit the working indicator and tests**

```powershell
git add -- "tests/test_panda_lines_v2_ctrader.py" "panda-indicators/2026-07-02/panda-lines-v2-ctrader/Panda Lines v2 cTrader.cs"
git commit -m "add-panda-lines-v2-ctrader-indicator"
```

### Task 2: Compile and project-level verification

**Files:**
- Modify only if compilation exposes an API mismatch: `panda-indicators/2026-07-02/panda-lines-v2-ctrader/Panda Lines v2 cTrader.cs`

**Interfaces:**
- Consumes: Task 1 indicator and installed cTrader Automate 5.7 API.
- Produces: compile-clean cTrader source and verification evidence.

- [ ] **Step 1: Copy the indicator into a temporary cTrader indicator project**

Create a temporary project under `$env:TEMP` based on an existing cTrader-generated `.csproj`, replace only its source file with `Panda Lines v2 cTrader.cs`, and leave the workspace source canonical.

- [ ] **Step 2: Build with cTrader's generated project configuration**

Run the build command declared by the copied cTrader project using the installed cTrader toolchain.

Expected: exit code 0 with no C# compiler errors. If the installed environment cannot invoke the toolchain non-interactively, open/import the canonical `.cs` in cTrader Automate and use its Build command.

- [ ] **Step 3: Run repository safety checks**

Run: `py -3.11 check_dupes.py`

Expected: exit code 0.

Run: `npx next build`

Expected: exit code 0; no dashboard regression.

- [ ] **Step 4: Confirm scoped git state**

Run: `git status --short`

Expected: no new modifications from this task; all pre-existing unrelated user changes remain untouched.

- [ ] **Step 5: Commit an API compatibility correction only if Step 2 required one**

```powershell
git add -- "panda-indicators/2026-07-02/panda-lines-v2-ctrader/Panda Lines v2 cTrader.cs"
git commit -m "fix-panda-lines-v2-ctrader-api-compatibility"
```
