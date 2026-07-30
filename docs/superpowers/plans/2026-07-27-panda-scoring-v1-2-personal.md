# Panda Scoring v1.2 Personal Edition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a separate personal-use `Panda Scoring v1.2.mq4` with every original parameter exposed and the corrected non-overlapping panel layout.

**Architecture:** Copy the corrected Free-edition single-file indicator so the Free product remains unchanged. Change only the new file's name/version text and configuration storage classes; preserve all calculation and rendering call sites.

**Tech Stack:** MQL4/MetaTrader 4, Python source assertions, Next.js 14 build tooling, Git.

## Global Constraints

- Create only `panda-indicators/2026-07-20/mql4/Panda Scoring v1.2.mq4`.
- Keep `Panda Scoring Free.mq4` unchanged.
- Preserve scoring and signal calculations.
- Expose every original configuration parameter.
- Boxes, Panda Lines, SuperTrend, Follow Line, BOS, flips, triggers, and score grid default to off.
- Preserve the 410 px minimum panel width and 220 px value column.
- Add no license, expiry, account lock, network, dashboard, API, or external-file dependency.
- Do not start `app.py`.
- Run `python3 check_dupes.py` and `npx next build` before committing.
- Confirm `package.json`, `package-lock.json`, `vercel.json`, and `next.config.js` are not staged for deletion.

---

### Task 1: Create and Configure the Personal v1.2 Source

**Files:**
- Copy: `panda-indicators/2026-07-20/mql4/Panda Scoring Free.mq4`
- Create: `panda-indicators/2026-07-20/mql4/Panda Scoring v1.2.mq4`

**Interfaces:**
- Consumes: The complete corrected Free-edition MQL4 implementation.
- Produces: A standalone `Panda Scoring v1.2` indicator with the same functions and globals but a fully exposed input surface.

- [ ] **Step 1: Verify the repository state and source**

Run:

```bash
git status --short
test -f "panda-indicators/2026-07-20/mql4/Panda Scoring Free.mq4"
```

Expected: the Free source exists; the unrelated ZIP may remain untracked; no operation touches it.

- [ ] **Step 2: Create the v1.2 file from the corrected Free source**

Use `apply_patch` to copy the complete contents into:

```text
panda-indicators/2026-07-20/mql4/Panda Scoring v1.2.mq4
```

In the new file only, change:

```mql4
//|  Panda Scoring v1.2                                               |
```

and:

```mql4
IndicatorShortName("Panda Scoring v1.2");
```

- [ ] **Step 3: Run the input-surface assertion and confirm it fails**

Run:

```bash
python3 - <<'PY'
from pathlib import Path
import re

path = Path("panda-indicators/2026-07-20/mql4/Panda Scoring v1.2.mq4")
text = path.read_text()
actual = re.findall(
    r"(?m)^input\s+(?:bool|int|double|color|ENUM_TIMEFRAMES|ENUM_XTF|PANEL_CORNER)\s+([A-Za-z_][A-Za-z0-9_]*)",
    text,
)
expected = [
    "GapThreshold", "BoxCalcTF", "Box3Days", "Box3Offset", "Box1Weeks",
    "Box1Offset", "Box2Months", "Box2Offset", "RefreshSeconds",
    "ShowPandaLines", "ShowSuperTrend", "ShowFollowLine", "ST_Period",
    "ST_Multiplier", "BB_Period", "BB_Deviations", "BB_UseATR",
    "BB_ATRPeriod", "XtfStructure", "SwingLength", "ShowBoxes", "ShowBOS",
    "ShowFlips", "ShowTriggers", "EnableAlerts", "AlertPopup", "AlertSound",
    "Panel_Show", "PanelCorner", "Panel_X", "Panel_Y", "Panel_Width",
    "Panel_FontSize", "Panel_BgColor", "Panel_BorderColor", "ShowScoreGrid",
    "Panel_TitleColor", "Panel_BuyColor", "Panel_SellColor", "Panel_WaitColor",
    "Panel_TextColor", "Panel_LabelColor", "Box3Color", "Box1Color", "Box2Color",
]
assert actual == expected, (actual, expected)
PY
```

Expected: FAIL because the copied Free edition keeps advanced settings internal.

- [ ] **Step 4: Reopen all configuration declarations in the v1.2 file**

Replace the configuration block with:

```mql4
// ===== SCORING INPUTS =====
input int             GapThreshold   = 5;
input ENUM_TIMEFRAMES BoxCalcTF      = PERIOD_H1;
input int             Box3Days       = 2;
input int             Box3Offset     = 1;
input int             Box1Weeks      = 2;
input int             Box1Offset     = 1;
input int             Box2Months     = 2;
input int             Box2Offset     = 1;
input int             RefreshSeconds = 5;

// ===== PANDA LINES INPUTS =====
input bool   ShowPandaLines = false;
input bool   ShowSuperTrend = false;
input bool   ShowFollowLine = false;
input int    ST_Period      = 10;
input double ST_Multiplier  = 3.0;
input int    BB_Period      = 21;
input double BB_Deviations  = 1.0;
input bool   BB_UseATR      = true;
input int    BB_ATRPeriod   = 5;

// ===== XTF / BOS INPUTS =====
input ENUM_XTF XtfStructure = XTF_H1;
input int      SwingLength  = 5;
input bool     ShowBoxes    = false;
input bool     ShowBOS      = false;
input bool     ShowFlips    = false;
input bool     ShowTriggers = false;

// ===== ALERT INPUTS =====
input bool EnableAlerts = true;
input bool AlertPopup   = true;
input bool AlertSound   = true;

// ===== PANEL INPUTS =====
input bool         Panel_Show       = true;
input PANEL_CORNER PanelCorner      = PANEL_BOTTOM_LEFT;
input int          Panel_X          = 16;
input int          Panel_Y          = 16;
input int          Panel_Width      = 410;
input int          Panel_FontSize   = 9;
input color Panel_BgColor           = C'12,17,28';
input color Panel_BorderColor       = C'0,180,255';
input bool  ShowScoreGrid           = false;
input color Panel_TitleColor        = C'0,180,255';
input color Panel_BuyColor          = C'0,255,159';
input color Panel_SellColor         = C'255,77,109';
input color Panel_WaitColor         = C'255,209,102';
input color Panel_TextColor         = C'200,200,220';
input color Panel_LabelColor        = C'154,164,178';

input color Box3Color = C'255,160,50';
input color Box1Color = C'0,200,120';
input color Box2Color = C'70,120,255';
```

- [ ] **Step 5: Verify the exposed inputs, clean defaults, identity, and layout**

Run the assertion from Step 3, then:

```bash
python3 - <<'PY'
from pathlib import Path

text = Path("panda-indicators/2026-07-20/mql4/Panda Scoring v1.2.mq4").read_text()
for snippet in (
    'IndicatorShortName("Panda Scoring v1.2");',
    "input bool   ShowPandaLines = false;",
    "input bool     ShowBoxes    = false;",
    "input bool     ShowTriggers = false;",
    "input bool  ShowScoreGrid           = false;",
    "int panelWidth = MathMax(Panel_Width, 410);",
    "int valueX = _pLeft + 220;",
):
    assert snippet in text, snippet
PY
```

Expected: both commands pass with exit code 0.

---

### Task 2: Verify, Commit, and Hand Off for MetaEditor

**Files:**
- Verify/Create: `panda-indicators/2026-07-20/mql4/Panda Scoring v1.2.mq4`
- Verify unchanged: `panda-indicators/2026-07-20/mql4/Panda Scoring Free.mq4`

**Interfaces:**
- Consumes: The completed v1.2 source from Task 1.
- Produces: A repository-verified MQ4 file ready for MetaEditor compilation and chart inspection.

- [ ] **Step 1: Confirm the Free source did not change during v1.2 creation**

Run:

```bash
git diff -- "panda-indicators/2026-07-20/mql4/Panda Scoring Free.mq4"
```

Expected: no additional Free-file diff caused by this task.

- [ ] **Step 2: Run the mandatory duplicate checker**

Run:

```bash
python3 check_dupes.py
```

Expected: `DUPES: NONE` and all checks pass.

- [ ] **Step 3: Run the mandatory production build**

Run:

```bash
npx next build
```

Expected: exit code 0 and `Compiled successfully`.

- [ ] **Step 4: Verify protected files and review the exact staged scope**

Run:

```bash
test -f package.json
test -f package-lock.json
test -f vercel.json
test -f next.config.js
git diff --check
git status --short
```

Expected: all protected files exist; only the intended indicator work and pre-existing unrelated changes are shown.

- [ ] **Step 5: Commit only the personal v1.2 source**

Run:

```bash
git add -- "panda-indicators/2026-07-20/mql4/Panda Scoring v1.2.mq4"
git diff --cached --check
git commit -m "add-panda-scoring-v1-2-personal"
```

Expected: one commit containing only the new personal indicator source.

- [ ] **Step 6: Compile and inspect in MetaEditor**

Open `Panda Scoring v1.2.mq4` in MetaEditor and verify:

1. Compilation reports zero errors.
2. Every original parameter is visible.
3. Default attachment shows only the panel.
4. Boxes and each optional drawing can be enabled.
5. Market Structure H1/H4 labels remain separate from their values at all four corners.

Expected: all five checks pass before the file is treated as release-ready.

