"""TBG -> PL Phase 3 - catch ALL remaining local variable names"""
import os

DASHBOARD_DIR = r"C:\Users\Admin\panda-dashboard\pages"

RULES = [
    # Local variable names used as shorthand
    ("const tbg=", "const pl="),
    ("const tbg =", "const pl ="),
    ("let tbg=", "let pl="),
    ("let tbg =", "let pl ="),
    ("{tbg}", "{pl}"),
    ("(tbg)", "(pl)"),
    (" tbg.", " pl."),
    (" tbg,", " pl,"),
    (" tbg;", " pl;"),
    (" tbg ", " pl "),
    ("!tbg", "!pl"),
    ("=tbg", "=pl"),
    ("[tbg]", "[pl]"),
    (":tbg,", ":pl,"),
    (":tbg}", ":pl}"),
    (" tbg:", " pl:"),
    ("(tbg.", "(pl."),
    ("{tbg.", "{pl."),
    ("'tbg'", "'pl'"),
    # Remaining TBG in display strings
    ("TBG +", "PL +"),
    ("'TBG ", "'Panda Lines "),
    ('"TBG ', '"Panda Lines '),
    ("_TBG", "_PL"),
    (" TBG:", " PL:"),
    (",TBG", ",PL"),
    ("// TBG", "// Panda Lines"),
    ("// Panda Lines Panda Lines", "// Panda Lines"),  # fix double
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
            ch.append(f"  {p} -> {r} ({n}x)")
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
