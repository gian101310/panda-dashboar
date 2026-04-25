"""TBG -> PL Phase 5 - FINAL sweep"""
import os

DASHBOARD_DIR = r"C:\Users\Admin\panda-dashboard\pages"

RULES = [
    # Function names in signal-agent
    ("analyzeTBGConfirmation", "analyzePLConfirmation"),
    ("analyzeGapPlusTBG", "analyzeGapPlusPL"),
    # Pattern agent local vars
    ("tbgConf", "plConf"),
    ("tbgUnconf", "plUnconf"),
    # ai-chat.js remaining
    ("TBG = Panda Lines", "Panda Lines = proprietary confirmation layer"),
    ("TBG is the only", "Panda Lines is the only"),
    ("gaptbg", "gappl"),
    ("tbg:", "pl:"),
    # signal-analytics
    ("tbgZone", "plZone"),
    # dashboard tooltip var
    ("tbgTip", "plTip"),
    # BUG: tbg.color/tbg.bg was renamed inconsistently 
    ("tbg.color", "pl.color"),
    ("tbg.bg", "pl.bg"),
    ("tbg.border", "pl.border"),
    ("tbg.label", "pl.label"),
    ("tbg.valid", "pl.valid"),
]

def patch(fp, rules):
    with open(fp, 'r', encoding='utf-8') as f:
        c = f.read()
    o = c
    ch = []
    for p, r in rules:
        n = c.count(p)
        if n > 0:
            c = c.replace(p, r)
            ch.append(f"  [{p}] -> [{r}] ({n}x)")
    if c != o:
        with open(fp, 'w', encoding='utf-8', newline='\n') as f:
            f.write(c)
    return ch

js = []
for root, dirs, files in os.walk(DASHBOARD_DIR):
    for f in files:
        if f.endswith('.js'):
            js.append(os.path.join(root, f))

t = 0
for fp in sorted(js):
    ch = patch(fp, RULES)
    if ch:
        print(f"[OK] {os.path.relpath(fp, DASHBOARD_DIR)}")
        for c in ch:
            print(c)
        t += len(ch)
        print()
print(f"Done. {t} replacements.")
