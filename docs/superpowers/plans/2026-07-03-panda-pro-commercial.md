# Panda Pro Commercial Packages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build licensed and unrestricted `Panda Pro` cTrader packages with fixed private settings and no user inputs, labels, signals, or alerts.

**Architecture:** Maintain two self-contained C# indicator sources so each commercial package compiles independently. The unrestricted source contains only the indicator; the licensed source adds fail-closed account validation through Panda's existing endpoint. A single Python contract suite verifies both sources and the product registry before native cTrader compilation creates the two `.algo` artifacts.

**Tech Stack:** C#, cTrader Automate 5.7 API, Next.js API registry, Python 3.11 `unittest`, .NET 6 SDK.

## Global Constraints

- Package names are exactly `Panda Pro Licensed.algo` and `Panda Pro No License.algo`.
- Both sources contain zero `[Parameter]` declarations.
- S/R width is exactly 0.02 percent and extensions are exactly 5000 chart bars left and right.
- No S/R text, transition icons, sounds, notifications, or descriptive strategy output names.
- Licensed product code is exactly `panda_pro`.
- Licensed checks run at most hourly with a 24-hour grace period only after approval; explicit denial fails closed immediately.
- No trading operations or elevated filesystem access.
- Existing Panda Lines packages and unrelated workspace changes remain untouched.

---

### Task 1: Commercial source contracts and product registry

**Files:**
- Create: `tests/test_panda_pro_ctrader.py`
- Modify: `lib/indicatorProducts.mjs`

**Interfaces:**
- Consumes: `INDICATOR_PRODUCTS` registry and future Panda Pro C# sources.
- Produces: recognized `panda_pro` product and executable source-contract tests.

- [ ] **Step 1: Write failing tests for the registry and both sources**

```python
from pathlib import Path
import unittest

ROOT = Path("panda-indicators/2026-07-03/panda-pro")
LICENSED = ROOT / "Panda Pro Licensed.cs"
UNLICENSED = ROOT / "Panda Pro No License.cs"

class PandaProContractTests(unittest.TestCase):
    def test_registry_recognizes_panda_pro(self):
        registry = Path("lib/indicatorProducts.mjs").read_text(encoding="utf-8")
        self.assertIn("code: 'panda_pro'", registry)

    def test_both_variants_are_locked_down(self):
        for source in (LICENSED, UNLICENSED):
            text = source.read_text(encoding="utf-8")
            self.assertNotIn("[Parameter", text)
            self.assertIn("ZoneWidthPercent = 0.02", text)
            self.assertIn("ExtendBars = 5000", text)
            self.assertNotIn("Chart.DrawText", text)
            self.assertNotIn("Chart.DrawIcon", text)
            self.assertNotIn("Notifications.", text)

    def test_licensed_variant_is_fail_closed(self):
        text = LICENSED.read_text(encoding="utf-8")
        for token in ("panda_pro", "Account.Number", "Account.BrokerName", "Http.Send", "LicenseCheckInterval", "LicenseGracePeriod", "DisableOutputs"):
            self.assertIn(token, text)

    def test_unlicensed_variant_has_no_license_transport(self):
        text = UNLICENSED.read_text(encoding="utf-8")
        self.assertNotIn("indicator-license", text)
        self.assertNotIn("Http.Send", text)
```

- [ ] **Step 2: Run and verify RED**

Run: `py -3.11 -m unittest tests.test_panda_pro_ctrader -v`

Expected: failures for missing `panda_pro` and missing C# sources.

- [ ] **Step 3: Add the registry entry**

Add this object to `INDICATOR_PRODUCTS` without changing existing products:

```javascript
{
  code: 'panda_pro',
  name: 'Panda Pro',
  priceLabel: 'Contact for pricing',
},
```

- [ ] **Step 4: Run the focused registry assertion**

Run: `py -3.11 -m unittest tests.test_panda_pro_ctrader.PandaProContractTests.test_registry_recognizes_panda_pro -v`

Expected: PASS.

### Task 2: Unrestricted standalone indicator

**Files:**
- Create: `panda-indicators/2026-07-03/panda-pro/Panda Pro No License.cs`

**Interfaces:**
- Consumes: cTrader chart `Bars` and D1/W1/Month1 `MarketData`.
- Produces: `[Indicator] public class PandaProNoLicense : Indicator` with four generically named outputs.

- [ ] **Step 1: Implement the no-license indicator from the verified Panda Lines v2 formulas**

Use private constants rather than public properties:

```csharp
private const int TrendPeriod = 10;
private const double TrendMultiplier = 3.0;
private const int FollowPeriod = 21;
private const double FollowDeviation = 1.0;
private const int FollowAtrPeriod = 5;
private const double ZoneWidthPercent = 0.02;
private const int ExtendBars = 5000;
```

Expose four outputs named `Panda Pro 1`, `Panda Pro 2`, `Panda Pro 3`, and `Panda Pro 4`. Port the direct SMA true-range, population deviation, trailing-line, daily/weekly/monthly/yearly zone, and connected-segment calculations. Draw only rectangles and horizontal lines using internal `PandaPro_` object names.

- [ ] **Step 2: Run the unrestricted contract tests**

Run: `py -3.11 -m unittest tests.test_panda_pro_ctrader.PandaProContractTests.test_both_variants_are_locked_down tests.test_panda_pro_ctrader.PandaProContractTests.test_unlicensed_variant_has_no_license_transport -v`

Expected: the no-license assertions pass; the shared assertion remains blocked until the licensed source exists.

### Task 3: Licensed fail-closed indicator

**Files:**
- Create: `panda-indicators/2026-07-03/panda-pro/Panda Pro Licensed.cs`

**Interfaces:**
- Consumes: `Account.Number`, `Account.BrokerName`, cTrader `Http.Send(HttpRequest)`, and the existing text license endpoint.
- Produces: `[Indicator] public class PandaProLicensed : Indicator`, identical chart behavior only while approved or inside valid grace.

- [ ] **Step 1: Add account validation around the same private indicator implementation**

Use these exact license constants:

```csharp
private const string LicenseEndpoint = "https://pandaengine.app/api/indicator-license";
private const string ProductCode = "panda_pro";
private static readonly TimeSpan LicenseCheckInterval = TimeSpan.FromHours(1);
private static readonly TimeSpan LicenseGracePeriod = TimeSpan.FromHours(24);
```

POST form-encoded `product_code`, `account_number`, and `account_server`. Treat a successful response whose body starts with `OK|APPROVED` as approval. Set grace only after approval. Treat HTTP 403 or a `DENY|` body as immediate denial and clear grace. On transport exceptions, retain approval only until the established grace expiry. `DisableOutputs(index)` must publish `double.NaN` for all four series and remove all `PandaPro_` objects.

- [ ] **Step 2: Run all contract tests**

Run: `py -3.11 -m unittest tests.test_panda_pro_ctrader -v`

Expected: all tests PASS.

- [ ] **Step 3: Commit sources, tests, and product registration**

```powershell
git add -- "tests/test_panda_pro_ctrader.py" "lib/indicatorProducts.mjs" "panda-indicators/2026-07-03/panda-pro/Panda Pro No License.cs" "panda-indicators/2026-07-03/panda-pro/Panda Pro Licensed.cs"
git commit -m "add-panda-pro-commercial-sources"
```

### Task 4: Native cTrader packaging and repository verification

**Files:**
- Create: `panda-indicators/2026-07-03/panda-pro/Panda Pro No License.algo`
- Create: `panda-indicators/2026-07-03/panda-pro/Panda Pro Licensed.algo`

**Interfaces:**
- Consumes: the two C# sources and installed `cTrader.Automate` NuGet build target.
- Produces: two directly importable commercial `.algo` packages.

- [ ] **Step 1: Compile each source in an isolated temporary cTrader project**

Each temporary `.csproj` targets `net6.0`, disables default compile items, includes exactly one source file, and references `cTrader.Automate` version `*`. Run `C:\Program Files\dotnet\dotnet.exe build <project> --configuration Release`.

Expected for each build: `Build succeeded`, `0 Warning(s)`, `0 Error(s)`.

- [ ] **Step 2: Copy and hash the generated packages**

Copy each generated `.algo` into the canonical Panda Pro folder with the exact requested filename. Confirm each destination SHA-256 equals its build artifact SHA-256.

- [ ] **Step 3: Run all safety verification**

Run:

```powershell
py -3.11 -m unittest tests.test_panda_pro_ctrader -v
py -3.11 check_dupes.py
npx next build
```

Expected: all Panda Pro tests pass, duplicate check reports `DUPES: NONE`, and Next.js reports `Compiled successfully`.

- [ ] **Step 4: Commit only the generated packages**

```powershell
git add -- "panda-indicators/2026-07-03/panda-pro/Panda Pro No License.algo" "panda-indicators/2026-07-03/panda-pro/Panda Pro Licensed.algo"
git commit -m "package-panda-pro-commercial-builds"
```
