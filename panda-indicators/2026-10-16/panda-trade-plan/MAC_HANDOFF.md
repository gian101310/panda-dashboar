# Panda Trade Plan - cTrader Mac handoff

Pull `main` from `https://github.com/gian101310/panda-dashboar.git`.
Pull the latest revision, which excludes yearly references and adds automatic
planning plus grouped drawing/panel/placement inputs. The current package is in dist.

## Compatibility status

The indicator uses managed C# / net6.0 and the cTrader Automate API, with
AccessRights.None. There are no Windows paths, native DLLs, P/Invoke, MT4 files,
engine connection, credentials or order execution calls in this indicator.
It computes its own context from the broker's 21 forex H1 histories.

cTrader documents custom indicators and native risk/reward for Mac:
- https://help.ctrader.com/ctrader-algo/how-tos/indicators/use-indicators-in-ctrader/
- https://help.ctrader.com/ctrader-mac/charting/risk-reward/

This is a Mac candidate, not a Mac-tested release. Verify the installed Mac
version supports Chart.DrawRiskReward, Chart.Draggables and instance LocalStorage.
Windows compile is clean; final visual/drag/shrink checks were blocked by the
Windows control plugin returning HTTP 404. Do not treat API attachment as visual proof.

## Install and verify on Mac

1. Preserve existing local changes, fetch and pull main with --ff-only.
2. Open `dist/Panda Trade Plan.algo` in cTrader Mac and attach Panda Trade Plan
   to a supported forex chart. Check Algo logs for actual API/runtime errors.
3. If a rebuild is needed, open the included csproj in cTrader Algo or build it
   with a compatible .NET SDK. It links the three source files two folders above.
   Do not hardcode Windows paths or change the core scoring/placement rules.
4. Wait for all 21 histories; verify broker symbol suffixes resolve. A scoring-aligned
   plan should appear automatically when eligible and retry while no setup is ready.
5. Visually check native Entry/SL/TP1 handles, short 12-bar width, 71% shading,
   thicker TP2/TP3 guides and bold labels. Check Fit plan, panel dragging,
   minus/plus collapse, manual price edits, native drag synchronization and reload.
   Check scale/width/opacity/thickness/X-Y inputs; Clear must pause auto creation,
   Resume auto must restart it, and manual edits must survive automatic refresh.
6. If an API differs on the installed Mac build, adapt only the presentation
   layer. Prefer the native risk/reward object; any finite-line fallback must keep
   the same price/edit/retention behaviour and be described honestly.
7. Show the chart and report the actual Mac version, compile result and checks.
   Never submit an order while testing. Native risk/reward itself exposes cTrader
   order actions; the indicator does not call them.

## Preserve these user decisions

- Scoring bias determines BUY/SELL. Previous day/week/month highs/lows and
  Panda Box edges provide entry/target references. No Follow Line entries.
- Never use previous-year levels for entry or targets. Recalculate old unedited
  plans automatically; preserve manually edited prices. Default auto interval is
  15 seconds; valid unedited plans may update, while bias-invalid plans are retained.
- TP1 is at least 50 broker pips from Entry. SL distance: target <100 pips /2,
  100 to <200 /3, 200 to <300 /4, 300+ /5. Manual edits stay fixed.
- Keep plans until Clear plan. Bias changes mark INVALID without deleting/moving.
- Separate visual planner; no automatic execution or engine strategy changes.

Rule tests: `dotnet run --project Tests/Tests.csproj -c Release` (55 assertions).
Release project: `Panda Trade Plan/Panda Trade Plan/PandaTradePlan.csproj`.
