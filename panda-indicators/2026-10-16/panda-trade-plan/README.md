# Panda Trade Plan — personal cTrader indicator

Visual, on-demand pullback planning. It never places, modifies, or cancels orders.
Built for the existing 21 Panda forex pairs; H1 context is used on any chart timeframe.

## Agreed behaviour

- Direction: the existing personal cTrader XTF scoring calculation, including
  gap >= 5 / <= -5 and hard-invalid checks. All 21 histories must be ready.
- Default entry references: previous **day/week/month/year** highs and lows plus
  **H1/H4/D1 Panda Box edges**, choosing the nearest eligible level on the
  pullback side. Follow Line and SuperTrend are not entry candidates.
- The entry label identifies the selected reference, such as PDL or H1 Box Low.
- Default mode: ScoringBias. Entry follows scoring direction and the nearest
  eligible entry reference; TP1 uses the nearest eligible forward reference at
  least **50 pips from entry**. No forecast or fixed-distance entry is invented.
- SL distance is derived from Entry-to-TP1 distance: under 100 pips / 2;
  100 to under 200 / 3; 200 to under 300 / 4; 300+ / 5 (existing project tier).
  Round the resulting stop to the broker's price precision. SuperTrend/Follow
  Line are not entry or SL placement references in this final version.
- Optional PandaLinesConfirmed mode adds the existing H1 Panda Lines confirmation
  as an eligibility filter; it uses the same target and SL tiers. This is a
  placement preview, not BB/INTRA execution, trade management or strategy changes.
- TP2/TP3 are optional further R-multiple guides, generated only when the furthest
  available reference leaves room. TP1 is the rule target. They are not additional
  existing strategy targets or automatic partial exits.
- Manual edits remain fixed. Native risk/reward handles follow cTrader's normal
  behaviour. Edits below the 50-pip TP1 minimum are flagged rather than silently moved.
- **Default retention: keep until Clear plan.** No daily/24-hour deletion.
  A bias change marks the plan INVALID and preserves its prices. Day/24-hour
  expiry and deletion on bias change are optional settings, off by default.
- Saved plans are restored for the same cTrader indicator instance. Changing
  reference settings refreshes unedited rule plans; manual plans need Reset.

## Use

1. Attach **Panda Trade Plan** to a supported forex chart.
2. Wait for the panel's 21/21 histories. Click BUY LIMIT or SELL LIMIT in the
   scoring-bias direction. A missing/invalid setup shows a reason, not invented prices.
3. Drag Entry/SL/TP lines, or edit the price fields and click Apply edited prices.
   Invalid geometry is flagged. SL pips and actual displayed R update accordingly.
4. Reset to rules recalculates. Hide plan hides drawings while retaining the plan;
   Show plan restores it. Clear plan deletes this indicator's plan and saved state.

Entry/SL/TP1 use cTrader's **native risk/reward drawing**, rather than full-chart
horizontal lines. Its initial width is 12 bars and can be resized with the native
handles. TP2/TP3 use short bounded guide segments. Their R-multiple calculations
are unchanged. Native preview volume starts at the broker minimum; this indicator
does not calculate position sizing or submit the native tool's order action.

The panel is draggable, saves its position, and has a **minus/plus shrink button**.
Shrinking leaves a compact header/status chip while the drawing remains on chart.
**Fit plan** repositions the drawing near the latest candles and fits the price
scale to include the plan. New plans are fitted automatically; prices are unchanged.
Existing chart drawings and indicators are preserved.
On indicator removal, its own interactive drawings are cleaned up. Stable instance
names prevent duplicates during parameter reloads. No API token is required.

## Data boundaries

Scoring and Panda Lines calculations are reused from the existing personal XTF/BOS
source in `2026-07-18/ctrader-panda-xtf-bos`; the original is unchanged. Native broker
H1 data, periods and prices may differ from the engine's MT4 feed. Previous-year
levels are offered only when a full prior year's monthly candles are available.
The planner's H1 context does not switch to M5 when attached on an M5 chart.

## Build and tests

```powershell
& 'C:\Program Files\dotnet\dotnet.exe' run --project Tests/Tests.csproj -c Release
& 'C:\Program Files\dotnet\dotnet.exe' build 'Panda Trade Plan/Panda Trade Plan/PandaTradePlan.csproj' -c Release
```

The installed cTrader SDK publishes the compiled `.algo` into cTrader's Indicators
folder. `dist/Panda Trade Plan.algo` is the distributable. Tests exercise plan maths,
BUY/SELL geometry, JPY pip size, eligibility, reference selection, target/SL tiers,
optional guides, bias invalidation and retention boundaries.

The local cTrader MCP connection at port 9876 can attach it using
`addChartIndicator(typeName: "Panda Trade Plan")`. Enum parameters passed through
that connector require numeric values: retention ManualOnly=2; bias MarkInvalid=0;
references PreviousLevelsAndBoxes=0. Transparent price outputs expose planned
Entry/SL/TP1/TP2/TP3 through the data window/API without drawing extra visible lines.

## Session verification and limits

- C# release build: zero errors and zero warnings. Plan rules: 36 assertions pass,
  including exact 50/99/100/199/200/250/300-pip target and SL boundaries.
- Duplicate checker and Next.js production build pass.
- Existing JS suite: 216/218 pass. Unchanged failures are `active application
  surfaces no longer advertise Guardian or Hermes` and `Pine source contains the
  fixed personal scoring and Box contract`.
- The earlier line-based version was attached to active GBPAUD M5 using the existing
  local cTrader connection; it reported running with five live price outputs and
  one set of plan drawings. A native-connector line-edit test did not confirm price
  synchronization; the final renderer now uses native risk/reward edits plus polling.
- Windows screen capture returned `window capture timed out: timed out waiting on
  channel`. The local cTrader connection subsequently returned HTTP 404. The native
  risk/reward revision compiles and is published to cTrader's local Indicators
  folder, but final native drawing/drag/shrink behaviour needs live confirmation
  after the control plugin is available again. API attachment is not visual review.
