# Panda Levels V2 Licensed - owner template

Edit the two constants near the top of `Panda Levels V2 Licensed.cs`:

```csharp
private const int LicensedAccountNumber = 0; // Replace with the user's trading account number.
private const string LicensedBrokerName = ""; // Optional; blank means account-only lock.
```

Account 0 is an unset placeholder and will never authorize. Use the cTrader trading account number, not the cTrader ID. Broker name is optional; if supplied, it must match `Account.BrokerName` (case-insensitive). Broker restriction avoids collisions between identical numbers at different brokers. Account-only restriction also treats live/demo accounts with the same number as identical.

The indicator is self-contained in `Panda Levels V2 Licensed.cs`: paste the entire file into a new cTrader indicator, edit the account placeholder, and Build. No separate helper file is required. Alternatively, build `PandaLevelsV2Licensed/PandaLevelsV2Licensed.csproj` in Release mode. Give the user only that build's `.algo`, exported without source. Do not distribute the original unrestricted V2 or any `.cs`, `.dll`, or project files. Use cTrader's user-restricted export as an additional protection when available.

The placeholder build intentionally shows **Account not licensed** and no overlay. Changing the constants requires rebuilding. Parameters are limited to Fill Boxes, Box Fill Opacity (%), and Show Panda Lines (on/off). SuperTrend and Follow Line use fixed existing defaults internally; the license is not a parameter.

Authorization is checked at initialization, every calculation, account-switch events, and once per second without ticks. Switching to an unauthorized account clears this instance's boxes, levels and all line outputs. Switching back restores them. Each instance uses its own drawing prefix.

This is an offline restriction, with no expiry or remote revocation. Runtime checks cannot prevent someone from forwarding the file or sharing access to the authorized trading account. Live account-switch behavior still requires verification in cTrader.

Tests: run `dotnet run --project tests/LicenseTests.csproj -c Release`.
