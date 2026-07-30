# Panda Scoring Free Market Edition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the existing MT4 Panda Scoring indicator into a permanently free, panel-first MQL Market edition with hidden advanced configuration, no box drawings, optional triggers, and readable Market Structure rows.

**Architecture:** Keep the existing single-file MQL4 indicator and preserve every calculation and signal path. Change only which configuration values use the `input` storage class, the drawing defaults, and the panel layout calculations; add source-level regression checks before the required repository and MetaEditor build verification.

**Tech Stack:** MQL4/MetaTrader 4, repository Python duplicate checker, Next.js 14 build tooling, Git.

## Global Constraints

- Modify only `panda-indicators/2026-07-20/mt4-xtf-bos/Panda Scoring v1.mq4`.
- Do not modify the external Claude output copy.
- Preserve all scoring formulas and signal logic.
- Keep alerts, panel placement/appearance/colors, and trigger visibility customer-configurable.
- Default to a panel-only chart: boxes, Panda Lines, SuperTrend, Follow Line, BOS arrows, flip dots, score grid, and triggers are off.
- Do not add account locks, expiry dates, remote shutdowns, network calls, dashboard dependencies, or custom licensing.
- Do not start `app.py`.
- Do not touch the unrelated untracked ZIP in `panda-indicators/2026-07-17/`.
- Pull `origin/main` before editing and never force-push.
- Run `py -3.11 check_dupes.py` in the required Windows environment (or the locally equivalent Python 3.11 command), then `npx next build`, before implementation is committed.
- Before pushing, confirm `package.json`, `package-lock.json`, `vercel.json`, and `next.config.js` are not staged for deletion.

---

### Task 1: Restrict the Free Edition Inputs and Drawing Defaults

**Files:**
- Modify: `panda-indicators/2026-07-20/mt4-xtf-bos/Panda Scoring v1.mq4:33-87`
- Verify: `panda-indicators/2026-07-20/mt4-xtf-bos/Panda Scoring v1.mq4:689-765`
- Verify: `panda-indicators/2026-07-20/mt4-xtf-bos/Panda Scoring v1.mq4:798-882`

**Interfaces:**
- Consumes: Existing configuration identifiers used throughout the indicator, including `GapThreshold`, `ShowPandaLines`, `ShowBoxes`, and `ShowTriggers`.
- Produces: The same identifiers and MQL4 types, with only approved customer controls declared as `input`; all calculation call sites continue compiling unchanged.

- [ ] **Step 1: Pull and inspect the exact working state**

Run:

```bash
git pull origin main
git status --short
git log -3 --oneline
```

Expected: pull reports up to date or a clean fast-forward; the unrelated ZIP may remain untracked; no tracked indicator changes are present.

- [ ] **Step 2: Run the source-level input regression check and confirm the current file fails**

Run:

```bash
python3 - <<'PY'
from pathlib import Path
import re

path = Path("panda-indicators/2026-07-20/mt4-xtf-bos/Panda Scoring v1.mq4")
text = path.read_text()
actual = re.findall(r"(?m)^input\s+(?:bool|int|double|color|PANEL_CORNER)\s+([A-Za-z_][A-Za-z0-9_]*)", text)
expected = [
    "ShowTriggers",
    "EnableAlerts", "AlertPopup", "AlertSound",
    "Panel_Show", "PanelCorner", "Panel_X", "Panel_Y", "Panel_Width", "Panel_FontSize",
    "Panel_BgColor", "Panel_BorderColor", "Panel_TitleColor", "Panel_BuyColor",
    "Panel_SellColor", "Panel_WaitColor", "Panel_TextColor", "Panel_LabelColor",
]
assert actual == expected, (actual, expected)
assert re.search(r"(?m)^input bool\s+ShowTriggers\s*=\s*false\s*;", text)
assert re.search(r"(?m)^bool\s+ShowBoxes\s*=\s*false\s*;", text)
assert re.search(r"(?m)^bool\s+ShowPandaLines\s*=\s*false\s*;", text)
PY
```

Expected: FAIL because advanced settings are still `input`, `ShowBoxes` and `ShowPandaLines` are true, and `ShowTriggers` is true.

- [ ] **Step 3: Convert advanced inputs to internal values and set free-edition defaults**

Replace the configuration declarations at the top of the indicator with this exact storage-class split:

```mql4
// ===== INTERNAL FREE-EDITION SETTINGS =====
int             GapThreshold   = 5;
ENUM_TIMEFRAMES BoxCalcTF      = PERIOD_H1;
int             Box3Days       = 2;
int             Box3Offset     = 1;
int             Box1Weeks      = 2;
int             Box1Offset     = 1;
int             Box2Months     = 2;
int             Box2Offset     = 1;
int             RefreshSeconds = 5;

bool   ShowPandaLines = false;
bool   ShowSuperTrend = false;
bool   ShowFollowLine = false;
int    ST_Period      = 10;
double ST_Multiplier  = 3.0;
int    BB_Period      = 21;
double BB_Deviations  = 1.0;
bool   BB_UseATR      = true;
int    BB_ATRPeriod   = 5;

ENUM_XTF XtfStructure = XTF_H1;
int      SwingLength  = 5;
bool     ShowBoxes    = false;
bool     ShowBOS      = false;
bool     ShowFlips    = false;
bool     ShowScoreGrid = false;

color Box3Color = C'255,160,50';
color Box1Color = C'0,200,120';
color Box2Color = C'70,120,255';

// ===== CUSTOMER INPUTS =====
input bool ShowTriggers = false;

input bool EnableAlerts = true;
input bool AlertPopup   = true;
input bool AlertSound   = true;

input bool         Panel_Show       = true;
input PANEL_CORNER PanelCorner      = PANEL_BOTTOM_LEFT;
input int          Panel_X          = 16;
input int          Panel_Y          = 16;
input int          Panel_Width      = 410;
input int          Panel_FontSize   = 9;
input color Panel_BgColor           = C'12,17,28';
input color Panel_BorderColor       = C'0,180,255';
input color Panel_TitleColor        = C'0,180,255';
input color Panel_BuyColor          = C'0,255,159';
input color Panel_SellColor         = C'255,77,109';
input color Panel_WaitColor         = C'255,209,102';
input color Panel_TextColor         = C'200,200,220';
input color Panel_LabelColor        = C'154,164,178';
```

Do not alter any downstream formulas or conditions that consume these identifiers.

- [ ] **Step 4: Run the input and default regression check**

Run the Python command from Step 2 again.

Expected: PASS with exit code 0 and no output.

- [ ] **Step 5: Confirm all default-hidden drawing paths still consume their unchanged identifiers**

Run:

```bash
rg -n "if\\(!ShowPandaLines \\|\\| !ShowSuperTrend\\)|if\\(!ShowPandaLines \\|\\| !ShowFollowLine\\)|if\\(!ShowBoxes \\|\\| !valid\\)|if\\(bosBull && ShowBOS\\)|if\\(bosBear && ShowBOS\\)|if\\(ShowFlips\\)|if\\(ShowTriggers\\)" "panda-indicators/2026-07-20/mt4-xtf-bos/Panda Scoring v1.mq4"
```

Expected: matches for SuperTrend, Follow Line, box deletion, BOS, flips, and both BUY/SELL trigger drawing gates. No drawing condition is bypassed.

- [ ] **Step 6: Review the focused input-surface diff**

Run:

```bash
git diff --check
git diff -- "panda-indicators/2026-07-20/mt4-xtf-bos/Panda Scoring v1.mq4"
```

Expected: only the intended indicator configuration/default changes appear. Defer the commit until the mandatory duplicate check and Next.js build pass.

---

### Task 2: Make Market Structure Rows Readable at Every Configured Width

**Files:**
- Modify: `panda-indicators/2026-07-20/mt4-xtf-bos/Panda Scoring v1.mq4:962-1016`

**Interfaces:**
- Consumes: Customer `Panel_Width` and `Panel_FontSize`, plus existing panel origin variables `_pLeft`, `_pTop`, and `_rowH`.
- Produces: Effective layout variables `panelWidth` and `valueX`; `PanelRow` receives `valueX` so all eight rows align without label/value overlap.

- [ ] **Step 1: Run a source-level layout regression check and confirm it fails**

Run:

```bash
python3 - <<'PY'
from pathlib import Path

text = Path("panda-indicators/2026-07-20/mt4-xtf-bos/Panda Scoring v1.mq4").read_text()
assert "void PanelRow(const int r, const int valueX," in text
assert "int panelWidth = MathMax(Panel_Width, 410);" in text
assert "int valueX = _pLeft + 220;" in text
assert "ObjectSetInteger(0, bg, OBJPROP_XSIZE, panelWidth);" in text
assert 'PanelRow(r++, valueX, "MARKET STRUCTURE H1"' in text
assert 'PanelRow(r++, valueX, "MARKET STRUCTURE H4"' in text
PY
```

Expected: FAIL because `PanelRow` currently hardcodes the value column at `_pLeft + 150` and the background uses `Panel_Width` directly.

- [ ] **Step 2: Parameterize the panel row value column**

Change `PanelRow` to accept the computed value-column position:

```mql4
void PanelRow(const int r, const int valueX, const string label, const string value, const color clr)
{
   int y = _pTop + 6 + r * _rowH;
   color lblClr = (r == 0) ? Panel_TitleColor : Panel_LabelColor;
   PanelLabel(PANEL + "l" + IntegerToString(r), _pLeft + 8, y, label, lblClr);
   PanelLabel(PANEL + "v" + IntegerToString(r), valueX, y, value, clr);
}
```

- [ ] **Step 3: Pass the effective width into the background renderer**

Change the renderer signature and width assignment:

```mql4
void DrawPanelBg(const int H, const int panelWidth)
{
   string bg = PANEL + "bg";
   if(ObjectFind(0, bg) < 0) ObjectCreate(0, bg, OBJ_RECTANGLE_LABEL, 0, 0, 0);
   ObjectSetInteger(0, bg, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, bg, OBJPROP_XDISTANCE, _pLeft);
   ObjectSetInteger(0, bg, OBJPROP_YDISTANCE, _pTop);
   ObjectSetInteger(0, bg, OBJPROP_XSIZE, panelWidth);
   ObjectSetInteger(0, bg, OBJPROP_YSIZE, H);
   ObjectSetInteger(0, bg, OBJPROP_BGCOLOR, Panel_BgColor);
   ObjectSetInteger(0, bg, OBJPROP_BORDER_TYPE, BORDER_FLAT);
   ObjectSetInteger(0, bg, OBJPROP_COLOR, Panel_BorderColor);
   ObjectSetInteger(0, bg, OBJPROP_WIDTH, 1);
   ObjectSetInteger(0, bg, OBJPROP_BACK, false);
   ObjectSetInteger(0, bg, OBJPROP_SELECTABLE, false);
}
```

- [ ] **Step 4: Compute a safe width and non-overlapping value position**

Inside `DrawPanel`, immediately after computing `cw` and `ch`, add the effective width:

```mql4
int panelWidth = MathMax(Panel_Width, 410);
```

Compute `_pLeft` with `panelWidth`, not raw `Panel_Width`:

```mql4
_pLeft = isRight ? (cw - Panel_X - panelWidth) : Panel_X;
```

Because `valueX` depends on the finalized `_pLeft`, assign it after `_pLeft` is calculated:

```mql4
int valueX = _pLeft + 220;
```

Call:

```mql4
DrawPanelBg(H, panelWidth);
```

Update every one of the eight calls to:

```mql4
PanelRow(r++, valueX, "PANDA SCORING", CurrentPair == "" ? Symbol() : CurrentPair, Panel_TitleColor);
PanelRow(r++, valueX, "BIAS", MainBias, StatusColor(MainBias));
PanelRow(r++, valueX, "GAP", gapTxt, StatusColor(gapTxt));
PanelRow(r++, valueX, "EXECUTION", Execution, StatusColor(Execution));
PanelRow(r++, valueX, "SETUP", SignalStatus, StatusColor(SignalStatus));
PanelRow(r++, valueX, "MARKET STRUCTURE H1", BoxH1Trend, StatusColor(BoxH1Trend));
PanelRow(r++, valueX, "MARKET STRUCTURE H4", BoxH4Trend, StatusColor(BoxH4Trend));
PanelRow(r++, valueX, "PANDA LINES", plText, StatusColor(plText));
```

- [ ] **Step 5: Run the layout regression check**

Run the Python command from Step 1 again.

Expected: PASS with exit code 0 and no output.

- [ ] **Step 6: Review the complete implementation diff**

Run:

```bash
git diff --check
git diff -- "panda-indicators/2026-07-20/mt4-xtf-bos/Panda Scoring v1.mq4"
```

Expected: the diff contains only the approved input-surface, drawing-default, and panel-layout changes. Defer the commit until the mandatory verification passes.

---

### Task 3: Perform Release Verification and Push

**Files:**
- Verify: `panda-indicators/2026-07-20/mt4-xtf-bos/Panda Scoring v1.mq4`
- Verify: `package.json`
- Verify: `package-lock.json`
- Verify: `vercel.json`
- Verify: `next.config.js`

**Interfaces:**
- Consumes: The completed free-edition indicator source from Tasks 1 and 2.
- Produces: Verified MQL4 source on `main`, pushed to `origin/main`; the later Windows/MetaEditor compilation produces the distributable `.ex4`.

- [ ] **Step 1: Run both source regression checks together**

Run:

```bash
python3 - <<'PY'
from pathlib import Path
import re

path = Path("panda-indicators/2026-07-20/mt4-xtf-bos/Panda Scoring v1.mq4")
text = path.read_text()
actual = re.findall(r"(?m)^input\s+(?:bool|int|double|color|PANEL_CORNER)\s+([A-Za-z_][A-Za-z0-9_]*)", text)
expected = [
    "ShowTriggers",
    "EnableAlerts", "AlertPopup", "AlertSound",
    "Panel_Show", "PanelCorner", "Panel_X", "Panel_Y", "Panel_Width", "Panel_FontSize",
    "Panel_BgColor", "Panel_BorderColor", "Panel_TitleColor", "Panel_BuyColor",
    "Panel_SellColor", "Panel_WaitColor", "Panel_TextColor", "Panel_LabelColor",
]
assert actual == expected, (actual, expected)
for pattern in (
    r"(?m)^input bool\s+ShowTriggers\s*=\s*false\s*;",
    r"(?m)^bool\s+ShowBoxes\s*=\s*false\s*;",
    r"(?m)^bool\s+ShowPandaLines\s*=\s*false\s*;",
):
    assert re.search(pattern, text), pattern
for snippet in (
    "void PanelRow(const int r, const int valueX,",
    "int panelWidth = MathMax(Panel_Width, 410);",
    "int valueX = _pLeft + 220;",
    "ObjectSetInteger(0, bg, OBJPROP_XSIZE, panelWidth);",
    'PanelRow(r++, valueX, "MARKET STRUCTURE H1"',
    'PanelRow(r++, valueX, "MARKET STRUCTURE H4"',
):
    assert snippet in text, snippet
PY
```

Expected: PASS with exit code 0 and no output.

- [ ] **Step 2: Run the mandatory duplicate check**

Run on the project Windows environment:

```powershell
py -3.11 check_dupes.py
```

Run on macOS only when Python 3.11 is installed under that name:

```bash
python3.11 check_dupes.py
```

Expected: exit code 0 with no duplicate-definition failures.

- [ ] **Step 3: Run the mandatory Next.js production build**

Run:

```bash
npx next build
```

Expected: exit code 0 and a successful production build.

- [ ] **Step 4: Compile and inspect in MetaTrader 4**

On the Windows MT4 development machine:

1. Open `panda-indicators/2026-07-20/mt4-xtf-bos/Panda Scoring v1.mq4` in MetaEditor.
2. Compile it and confirm `0 error(s)`.
3. Attach it to a chart with default inputs.
4. Confirm only the eight-row panel is visible.
5. Confirm boxes, Panda Lines, SuperTrend, Follow Line, BOS arrows, flip dots, score grid, and triggers are absent.
6. Confirm the Inputs tab exposes only triggers, alerts, and panel controls/colors.
7. Enable `ShowTriggers`, then confirm trigger markers can render while all other drawings remain hidden.
8. Test all four `PanelCorner` values.
9. Set `Panel_Width` below `410`; confirm the effective panel remains wide enough and both Market Structure rows are readable.

Expected: zero compiler errors and all nine visual checks pass.

- [ ] **Step 5: Confirm the protected build files are present and not deleted**

Run:

```bash
test -f package.json
test -f package-lock.json
test -f vercel.json
test -f next.config.js
git status --short
git diff --name-status origin/main...HEAD
```

Expected: all four `test` commands exit 0; none of the four protected files has `D` status; the unrelated ZIP remains unstaged.

- [ ] **Step 6: Commit the verified implementation**

Run:

```bash
git add -- "panda-indicators/2026-07-20/mt4-xtf-bos/Panda Scoring v1.mq4"
git diff --cached --check
git status --short
git commit -m "prepare-panda-scoring-free-market-edition"
```

Expected: one implementation commit containing only the indicator source. The four protected build files are not staged for deletion and the unrelated ZIP remains unstaged.

- [ ] **Step 7: Push the verified commits**

Run:

```bash
git push origin main
```

Expected: push succeeds without force and updates only `gian101310/panda-dashboar` on `main`.

- [ ] **Step 8: Verify the Vercel deployment**

Use the Vercel project bound to `panda-dashboar` and confirm:

- Project: `panda-dashboard`
- Source repository: `gian101310/panda-dashboar`
- Branch: `main`
- State: `READY`
- Build duration: greater than 20 seconds

Expected: the production deployment reaches `READY` and is not a two-second empty build.
