"""TBG -> PL Phase 4 - final sweep of camelCase and compound names"""
import os

DASHBOARD_DIR = r"C:\Users\Admin\panda-dashboard\pages"

RULES = [
    # CamelCase variable names
    ("tbgConfirmed", "plConfirmed"),
    ("tbgStr", "plStr"),
    ("tbgStatus", "plStatus"),
    ("tbg_status", "pl_status"),
    # memoryIndex bucket key
    ("gap_tbg", "gap_pl"),
    ("gap_plus_tbg", "gap_plus_pl"),
    # Any remaining standalone
    ("'tbg'", "'pl'"),
    ('"tbg"', '"pl"'),
    # Signal agent function names
    ("analyzeTbg", "analyzePl"),
    ("analyze_tbg", "analyze_pl"),
    # Pattern agent
    ("findTbgDiscipline", "findPlDiscipline"),
    # Remaining text in strings
    ("Panda Lines confirmation TBG", "Panda Lines confirmation PL"),
    (" TBG", " PL"),
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

print(f"Scanning {len(js)} files...\n")
t = 0
for fp in sorted(js):
    ch = patch(fp, RULES)
    if ch:
        print(f"[OK] {os.path.relpath(fp, DASHBOARD_DIR)}")
        for c in ch:
            print(c)
        t += len(ch)
        print()
print(f"\nDone. {t} replacements.")
