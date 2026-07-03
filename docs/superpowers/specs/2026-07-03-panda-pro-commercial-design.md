# Panda Pro Commercial cTrader Packages

## Goal

Create two compiled cTrader Automate packages named `Panda Pro Licensed.algo` and `Panda Pro No License.algo`. Both retain the Panda Lines v2 calculations while exposing no configurable inputs or descriptive strategy names.

## Shared Indicator Behavior

Both variants use one private, hardcoded configuration:

- SuperTrend period 10 and multiplier 3.0.
- BB period 21, deviation 1.0, and ATR period 5.
- Daily, weekly, monthly, and yearly S/R zones enabled.
- S/R zone width fixed at 0.02 percent.
- S/R zones extend 5000 chart bars left and 5000 estimated chart bars right.
- No S/R text labels, trend-transition icons, sounds, alerts, or user parameters.
- Four visible line outputs use generic Panda Pro names rather than SuperTrend or BB terminology.

The package requests no elevated filesystem permissions, performs no trading operations, and does not modify Panda Engine strategy logic.

## Unlicensed Package

`Panda Pro No License.algo` runs without account validation. It is intended for Boss-G's unrestricted distribution or internal testing.

## Licensed Package

`Panda Pro Licensed.algo` validates the active cTrader `Account.Number` against `https://pandaengine.app/api/indicator-license` using product code `panda_pro`. It also sends the cTrader broker name as `account_server`.

The licensed variant checks during initialization and then at most once per hour. A successful response grants a rolling 24-hour network grace period. Explicit denial fails closed immediately. A network failure may use only a previously established, unexpired grace period. Without approval, the indicator publishes `double.NaN`, removes its chart objects, and writes a generic status to the cTrader log without revealing strategy details.

HTTP uses cTrader's native `Http` API with `AccessRights.None`.

## Panda License Registry

Add a `panda_pro` entry to `lib/indicatorProducts.mjs` so the existing validation endpoint recognizes the new product. Do not redesign or otherwise repair the dashboard licensing workflow in this task.

## Packaging and Validation

Keep private C# sources inside a new dated Panda Pro workspace folder. Compile each source against the installed cTrader Automate API and retain only the two distributable `.algo` packages alongside the private sources. Verify that both packages compile without warnings or errors, contain no `[Parameter]` declarations, and preserve all existing unrelated workspace changes.
