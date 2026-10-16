# Panda Trade Plan — personal cTrader indicator

Visual planning, automatic by default, with optional explicit-click Limit / Stop / Market execution.
Automatic planning never submits orders. The indicator does not manage or cancel existing orders.
Built for the existing 21 Panda forex pairs; H1 context is used on any chart timeframe.

## Agreed behaviour

- Direction: the existing personal cTrader XTF scoring calculation, including
  gap >= 5 / <= -5 and hard-invalid checks. All 21 histories must be ready.
- Currency votes are kept as separate positive/negative counts per timeframe.
  The dominant side is used (`+3/-1 -> +3`), rather than netting opposing votes.
  The strongest raw component across all timeframes determines currency strength;
  equal opposing strongest magnitudes give zero. Any raw positive extreme >=4
  alongside a negative extreme <=-4 invalidates that currency. Both currencies
  below magnitude 4 is a separate neutral-matchup invalidation. These match the
  engine's extraction rules, using cTrader's own broker candles and box levels.
- Show score diagnostics (on by default) displays actual D1/H4/H1 vote splits;
  HARD_INVALID names the currency conflict or explains the neutral matchup.
- Default entry references: previous **day/week/month** highs and lows plus
  **H1/H4/D1 Panda Box edges**, choosing the nearest eligible level on the
  pullback side. Follow Line and SuperTrend are not entry candidates.
- Previous-year highs/lows are excluded from entries, targets and optional-guide
  range limits. No yearly fallback is used when nearer references are unavailable.
- The entry label identifies the selected reference, such as PDL or H1 Box Low.
- Default mode: ScoringBias. Entry follows scoring direction and the nearest
  eligible entry reference; TP1 uses the nearest eligible forward reference at
  least **50 pips from entry**. No forecast or fixed-distance entry is invented.
- Default SL distance is derived from Entry-to-TP1 distance: under 100 pips / 2;
  100 to under 200 / 3; 200 to under 300 / 4; 300+ / 5 (existing project tier).
  Round the resulting stop to the broker's price precision. SuperTrend/Follow
  Line are not entry or SL placement references in this final version.
- Optional PandaLinesConfirmed mode adds the existing H1 Panda Lines confirmation
  as an eligibility filter; it uses the same target and SL tiers. This is a
  personal planning/execution panel, separate from BB/INTRA and ongoing trade management.
- TP2/TP3 are optional further R-multiple guides, generated only when the furthest
  available reference leaves room. TP1 is the rule target. They are not additional
  existing strategy targets or automatic partial exits.
- Manual edits remain fixed. Native risk/reward handles follow cTrader's normal
  behaviour. Edits below the 50-pip TP1 minimum are flagged rather than silently moved.
- **Default retention: keep until Clear plan.** No daily/24-hour deletion.
  A bias change marks the plan INVALID and preserves its prices. Day/24-hour
  expiry and deletion on bias change are optional settings, off by default.
- Saved plans are restored for the same cTrader indicator instance. Changing
  reference settings refreshes unedited rule plans; manual plans stay fixed until
  explicitly refreshed. Old unedited plans migrate to the non-yearly rule version.
- Automatic planning retries while data/bias/references are unavailable and
  refreshes unedited valid plans every 15 seconds by default. It keeps manual
  edits and bias-invalid plans rather than silently replacing them. Automatic
  refresh does not move the chart view or change a hidden plan's visibility.

## Use

1. Attach **Panda Trade Plan** to a supported forex chart.
2. Wait for the panel's 21/21 histories. An eligible scoring-aligned plan appears
   automatically. Missing setups show a reason and retry without Reset. Plan BUY,
   Plan SELL and Refresh plan remain available for explicit recalculation.
3. Drag Entry/SL/TP lines, or edit the price fields and click Apply edited prices.
   Invalid geometry is flagged. SL pips and actual displayed R update accordingly.
4. Refresh plan recalculates and releases manual price locking. Hide/Show retains
   the plan. Clear deletes the plan and pauses auto creation, including across
   reloads; Resume auto starts it again. Pause auto freezes automatic refresh.

## Explicit order execution

- Select **Limit**, **Stop**, or **Market**. Limit uses pullback references; Stop
  uses the nearest eligible breakout reference beyond the live price; Market
  uses the current buy ask / sell bid. All retain scoring alignment and SL tiers.
- Selecting Stop unhides and fits its native risk/reward drawing. Once scoring
  context has a BUY/SELL bias, missing eligible breakout references show a clearly
  marked **MANUAL STOP DRAFT**, rather than leaving a Limit drawing or no drawing.
  Its initial 2-pip entry offset and minimum-distance TP are editable placeholders,
  not reference-based suggestions. Drag valid prices or Apply edited prices to
  confirm the draft; unconfirmed drafts cannot submit orders. An untouched draft
  can refresh into a rule-based setup when references become eligible.
- Dragging any native Entry/SL/TP handle updates the panel prices and risk metrics
  through chart events, with a one-second polling fallback. Temporarily invalid
  geometry also updates the fields and is flagged; it is never silently ignored.
  Manual drags freeze automatic price changes. Invalid geometry/TP minimum still
  block execution. No order is placed or modified by dragging.
- Enter **Lots**, default **0.01**. Broker minimum/step are shown. Invalid sizes
  are rejected rather than silently rounded or increased. Valid sizes update the
  native risk/reward volume preview. Default lots/type can be set in Parameters.
- Adjust the plan, click Apply edited prices, then **Place BUY/SELL [type]**.
  cTrader may request native TradingPermission on this click. No permission
  request or submission occurs during startup, planning, timer or chart edits.
- Pending orders carry absolute SL/TP1 prices. Market orders carry attached
  SL/TP distances with a configurable slippage bound (default 2 pips); actual
  filled entry/SL/TP replace the preview on success. Absolute levels can differ
  from the preview by fill slippage. TP2/TP3 are guides, never partial exits.
- Fresh bias, quote, geometry, minimum TP1, broker SL/TP distances and lot limits
  are checked immediately before submission, including after permission UI.
  Closed markets, invalid plans and unapplied price edits block submission.
- One successful submission consumes that plan; refresh explicitly to prepare
  another order. Failed/ambiguous submissions are never retried automatically.
  Check cTrader Orders/Positions before retrying any reported error.
- Successful submission pauses auto and preserves displayed levels. Editing this
  drawing afterward does **not** modify the submitted position/pending order;
  edit the actual order in cTrader. Market entry is read-only in this panel.

## Adjustable inputs

All settings are in the indicator's cTrader Parameters dialog, grouped by purpose.

| Group | Controls |
|---|---|
| Execution | Default order type; default lots (0.01); market slippage limit (2 pips) |
| Automation | Automatic planning on/off; refresh interval (5-300 seconds) |
| References (no year) | Previous day/week/month and H1/H4/D1 Box toggles; entry-reference selector |
| Placement | Minimum TP1 (at least 50 pips); maximum entry and target distance (0 disables a cap); four SL divisors, default 2/3/4/5 |
| Appearance | Risk/reward and guide thickness; drawing/guide opacity; label font size; drawing width; shading and guide visibility |
| Panel | Scale (default 80%); base width (280, giving 224px at 80%); background opacity; X/Y; remember dragged position; start collapsed |

Optional maximum distances constrain generated plans; manual edits remain possible.
Changing X/Y overrides the remembered drag position; subsequent dragging is saved
when Remember dragged position is enabled. Scale changes fonts, fields, margins and
button heights as well as width. The panel retains its minus/plus collapse control.
Defaults exclude yearly levels but do not invent a maximum distance for other levels;
set the distance caps if a remaining weekly/monthly reference is still too far away.

Entry/SL/TP1 use cTrader's **native risk/reward drawing** for shading, with
explicit short draggable horizontal segments and always-visible price labels.
Blue ENTRY, red SL and green TP1 labels show prices; SL/TP1 include pip distances
and TP1 includes the reward/risk ratio. Both endpoints can move the price, then
the segment is kept horizontal. These handles remain visible when the native
object is deselected and cTrader would otherwise show only its red/green fills.
They update the panel and native drawing together in both Limit and Stop modes.
Market entry follows the quote; its Entry segment is locked. These are bounded
segments, rather than full-chart horizontal lines. Its initial width is 12 bars and can be resized with the native
handles. TP2/TP3 use short bounded guide segments. Their R-multiple calculations
are unchanged. Risk and reward shading use 71% opacity for visibility, with thicker
optional guides and bold source/target labels. Native preview volume follows valid panel lots. The panel submits only when
Place order is clicked; cTrader's own drawing action remains a separate native control.

The panel is draggable, saves its position, and has a **minus/plus shrink button**.
Shrinking leaves a compact header/status chip while the drawing remains on chart.
**Fit plan** repositions the drawing near the latest candles and fits the price
scale to include the plan. New plans are fitted automatically; prices are unchanged.
Existing chart drawings and indicators are preserved.
On indicator removal, its own interactive drawings are cleaned up. Stable instance
names prevent duplicates during parameter reloads. No API token is required.

## Data boundaries

Period/Box and Panda Lines calculations are reused from the existing personal XTF/BOS
source in `2026-07-18/ctrader-panda-xtf-bos`; the original is unchanged. This planner's
aggregation has been corrected from net votes to dominant components. Native broker
H1 data, periods and prices may differ from the engine's MT4 feed. Yearly levels
are not used in this revision.
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

- C# release build: zero errors and zero warnings. Plan rules: 118 assertions pass,
  including exact 50/99/100/199/200/250/300-pip target and SL boundaries.
- A USDCAD regression uses USD `D1:+2 H4:+1/-1 H1:+1/-4` and CAD
  `D1:+2 H4:+2 H1:+3/-1`: USD=-4, CAD=+3, gap=-7, without HARD_INVALID.
  This demonstrates the fix; it is not a claim about current live cTrader scores.
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

- Execution revision: 118 offline assertions cover lot conversion/limits, fresh
  market quotes, order-type geometry, broker distance units, breakout references
  and duplicate-click gating. Release compile succeeds. No broker order was
  submitted in verification; live execution and Mac UI remain unverified.

## Fixed-size runtime crash correction

The live cTrader log revealed `InvalidOperationException: Can't set volume when
type is FixedSize.` The generic `ChartRiskReward.VolumeInUnits` setter must not
be used on this preview type. Volume changes now replace `rr.Type` with a new
`ChartRiskRewardFixedSizeType(units)` only when the requested size differs.
The previous crash occurred before price fields and explicit drawing handles
were populated. Initialization milestones and restore/render errors now appear
in the local indicator log rather than a swallowed restore exception.

Run the SDK regression with:
`dotnet run --project SdkTests/SdkTests.csproj -c Release`.
It exercises the production helper against a proxy that throws the exact live
exception for the prohibited setter, and verifies changed/unchanged lot updates.
The existing 118 pure planning assertions remain separate.

Live verification on USDCAD H1: corrected initialization completed; accessibility
reported Entry 1.41696, SL 1.42569 and TP1 1.40823 in panel fields, with native
risk/reward pip, lot and ratio values present. These are a retained plan snapshot,
not current trading advice or a fresh rules calculation. No new runtime exception
appeared in that verification window. Screenshot capture still times out and
coordinate input is unavailable, so chart drag/visual placement remains unverified.
No broker orders were placed or modified during these checks.
