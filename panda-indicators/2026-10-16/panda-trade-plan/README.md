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
  least **50 pips from entry**, even when that level lies between the current
  quote and a pending limit entry. No forecast or fixed-distance entry is invented.
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
New plans render without forcing a price-range fit, and the indicator's
transparent outputs no longer rescale the candle chart. **Fit plan** still
repositions the drawing and explicitly fits the plan levels when requested.
If a previous fit left cTrader's price scale fixed, restore its Auto scale
setting once in the chart controls. Plan prices are unchanged.
Existing chart drawings and indicators are preserved.
On indicator removal, its own interactive drawings are cleaned up. Stable instance
names prevent duplicates during parameter reloads. No API token is required.

## Data boundaries

Period/Box and Panda Lines calculations are reused from the existing personal XTF/BOS
source in `2026-07-18/ctrader-panda-xtf-bos`; the original is unchanged. Scoring
is self-contained: it calculates each of the 21 pair votes from cTrader H1 box
history and live Bid prices using the MT4 Panda Scoring v1.2 calendar windows,
dominant-side totals and conflict rules. No MT4 export file, MCP bridge or
FullAccess permission is needed. All 21 quotes and sufficient broker history
must be available before a new plan or automatic order can be created.
MT4 and cTrader values can still differ when broker quotes, H1 candles or
server-time boundaries differ; matching the rules is not live score parity.
Yearly levels are excluded.
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

### Panda Trade Plan v1.2

`Panda Trade Plan v1.2/Panda Trade Plan v1.2/Panda Trade Plan v1.2.csproj`
builds a separate indicator; it does not replace the original Panda Trade Plan.
The same draggable panel has **Show dashboard** and **Show trade plan** views.
Minimizing the plan with `-` automatically shows the dashboard rows; `+`
restores the prior expanded view without clearing the plan drawing.
The dashboard view combines the overlay score and bias (for example `+8 BUY`)
above BASE/QUOTE XTF, H4/H1
box trends, Panda Lines, XTF and feed status. Its compact summary remains visible
in the plan view. The dashboard keeps the compact panel width and rows, with
brighter, bolder text. The plan view shows its own cTrader score and bias together.
BUY uses a darker green; SELL uses red. The feed refreshes at most once per 60 seconds.
The BUY/SELL plan buttons are omitted in v1.2 because they cannot override the
calculated bias; **Refresh plan** rebuilds the plan for the current bias.

Paste the existing Personal overlay operator token into `Operator token`; the
old indicator's saved parameter cannot be copied automatically. This v1.2
build is Personal-only; a separate licensed build would be needed for customer
distribution. Tokens are never embedded in the build. The
dashboard feed is **display-only**: plans and orders still use the cTrader-native
score labelled in the plan view, not the dashboard score. Feed errors cannot
authorize orders. The v1.2 indicator starts with auto orders off, dry run on,
and allowed account 0. It uses separate plan storage; existing plans and pending
orders are not migrated or cancelled when switching indicators.

### Panda Trade Plan v1.3

`Panda Trade Plan v1.3/Panda Trade Plan v1.3/Panda Trade Plan v1.3.csproj`
builds a separate indicator with the same planning, dashboard, and drawing
behavior as v1.2. Its only exposed parameter groups are **Execution** and
**Auto orders**. The dashboard feed no longer needs an operator token: it uses
the active cTrader account number and requires a separate approved
`ctrader_trade_plan_v13` license. The operator downloads the `.algo` from
License Admin's private Storage-backed download, sends it to the client, and
creates a manual license using the client's name and cTrader account number.
The operator then approves it; approval also marks the license as paid. The
trade-plan download is not public, and no contact detail or operator token is
required. All other settings are fixed at the v1.2 defaults: automatic
planning on, 15-second refresh, all previous-level
and Panda Box references on, minimum TP1 50 pips, and the compact panel at
80% scale. The on-panel Auto, Refresh plan, Hide plan, and manual edit controls
still work. Auto orders remain off, dry run remains on, and the allowed account
remains 0 until explicitly changed. Without a current approval, v1.3 hides its
plan drawings, blocks planning and all order submissions, and returns no ready
plan outputs. It rechecks approval about once a minute and fails closed if the
feed or license check becomes unavailable. Existing broker pending orders are
not cancelled by a license failure. v1.3 stores plans separately per account;
it does not migrate plans or cancel pending orders from v1.2. Remove a prior indicator
instance before enabling live auto orders on v1.3 to avoid duplicate automation.

The local cTrader MCP connection at port 9876 can attach it using
`addChartIndicator(typeName: "Panda Trade Plan")`. Enum parameters passed through
that connector require numeric values: retention ManualOnly=2; bias MarkInvalid=0;
references PreviousLevelsAndBoxes=0. Transparent price outputs expose planned
Entry/SL/TP1/TP2/TP3 through the data window/API without drawing extra visible lines.

The next two transparent outputs expose Limit order readiness (1 or 0) and
validated volume in units. They use the same `PrepareOrder` checks as the Place
button but do not submit an order. Run the read-only one-pair MCP probe with
`node tools/trade-plan-mcp-dry-run.mjs --symbol=EURGBP --account=YOUR_LIVE_LOGIN` after
opening that pair's chart. The probe never calls a trading tool. It fails closed
when the indicator is not ready, the live account is offline, or the symbol has
an existing order or position. MCP cannot currently prove which account is
selected for order placement, so this probe is not authorization for live trading.

## Optional native auto-limit orders

The indicator already plots plans automatically on its attached chart. One
running instance is needed for each symbol you want it to trade; each instance
loads the 21-pair scoring context itself. `Auto-place valid limits` defaults to
off, `Dry run only` defaults to on, and `Allowed account number` defaults to 0
(disabled). Live placement requires all three settings to be deliberately set,
trading permission already granted, a fresh valid Limit plan, and no existing
order or position on that symbol. The auto path reuses the Place button's
validation and never requests permission or places Stop/Market orders.

An auto order carries an instance-specific `PandaAuto-` label. The indicator
does not amend it after placement, so user edits in cTrader remain untouched.
When its scoring bias becomes unavailable, invalid, `WAIT`, or opposite, it
cancels only its own still-pending orders; it never closes filled positions or
touches manual orders. Dry-run mode logs the proposed placement/cancellation
but never sends broker actions. If dry run is turned on after a live auto order
was placed, its cancellation is also dry-run only; inspect and cancel that
pending order manually if needed. A cancelled order is not recreated from the
same saved plan. Refreshing the plan is an explicit rearm action.

## Session verification and limits

- C# release build: zero errors and zero warnings. Plan rules: 134 assertions pass,
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
