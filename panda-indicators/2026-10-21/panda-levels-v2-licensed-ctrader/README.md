# Panda Levels V2 Licensed - owner template

Edit the two constants near the top of `Panda Levels V2 Licensed.cs`:

```csharp
private const int LicensedAccountNumber = 0; // Replace with the user's trading account number.
private const string LicensedBrokerName = ""; // Optional; blank means account-only lock.
```

Account 0 is an unset placeholder and will never authorize. Use the cTrader trading account number, not the cTrader ID. Broker name is optional; if supplied, it must match `Account.BrokerName` (case-insensitive). Broker restriction avoids collisions between identical numbers at different brokers. Account-only restriction also treats live/demo accounts with the same number as identical.

The indicator is self-contained in `Panda Levels V2 Licensed.cs`: paste the entire file into a new cTrader indicator, edit the account placeholder, and Build. No separate helper file is required. Alternatively, build `PandaLevelsV2Licensed/PandaLevelsV2Licensed.csproj` in Release mode. Give the user only that build's `.algo`, exported without source. Do not distribute the original unrestricted V2 or any `.cs`, `.dll`, or project files. Use cTrader's user-restricted export as an additional protection when available.

The placeholder build intentionally shows **Account not licensed** and no overlay. Changing the constants requires rebuilding. Parameters are Fill Boxes, Box Fill Opacity (%), MT4 Server UTC Offset, and Show Panda Lines (on/off). SuperTrend and Follow Line use fixed existing defaults internally; the license is not a parameter.

Authorization is checked at initialization, every calculation, account-switch events, and once per second without ticks. Switching to an unauthorized account clears this instance's boxes, levels and all line outputs. Switching back restores them. Each instance uses its own drawing prefix.

This is an offline restriction, with no expiry or remote revocation. Runtime checks cannot prevent someone from forwarding the file or sharing access to the authorized trading account. Live account-switch behavior still requires verification in cTrader.

Tests: run `dotnet run --project tests/LicenseTests.csproj -c Release`.

## MT4 scoring box parity

Boxes now use the `GetBoxWindow` / `CalculateBoxBounds` rules from MT4 Panda Scoring v1 and v1.2, rather than counting observed candle dates:

- H1 / short: two trading days, offset by one trading day. Saturday/Sunday are skipped when stepping the boundaries; any Sunday H1 candles inside the resulting time window are included, exactly as MT4 scans them.
- H4 / medium: two Monday-based calendar weeks, offset by one week.
- D1 / long: two calendar months, offset by one month.
- Every range includes its start and excludes its end, and ignores bars with nonpositive high/low values.
- All box ranges use H1 high/low data, independent of the chart timeframe. Missing observed days/months no longer shift window selection.

**MT4 Server UTC Offset defaults to +3**, confirmed from the operator's Market Watch clock on 2026-10-21. This selects MT4 server-midnight boundaries and converts them back to UTC for cTrader H1 data and drawings. Adjust this setting if the MT4 broker changes to UTC+2 seasonally. Prior day/week/month/year reference levels still use cTrader's own higher-timeframe bars.

Identical windows do not guarantee identical prices across different broker feeds. Validate a same-symbol live comparison after installation; that comparison has not yet been performed.
