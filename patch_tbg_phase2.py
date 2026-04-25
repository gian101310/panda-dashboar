"""
TBG -> PL comprehensive rename - Phase 2
Renames ALL remaining tbg references including variable names, DB column refs, function names.
"""
import os

DASHBOARD_DIR = r"C:\Users\Admin\panda-dashboard\pages"

RULES = [
    # DB column references (renamed in Supabase already)
    ("tbg_zone_at_open", "pl_zone_at_open"),
    ("tbg_g1_valid", "pl_g1_valid"),
    ("tbg_zone", "pl_zone"),
    ("tbg_bias", "pl_bias"),
    ("tbg_fl", "pl_fl"),
    ("tbg_st", "pl_st"),
    # Function names
    ("tbgZoneBadge", "plZoneBadge"),
    # Remaining display text in ai-chat.js
    ("TBG zone confirms", "Panda Lines zone confirms"),
    ("TBG zones", "Panda Lines zones"),
    ("TBG Zone", "Panda Lines Zone"),
    ("TBG zone", "Panda Lines zone"),
    ("TBG = SuperTrend", "Panda Lines = proprietary"),
    ("TBG data", "Panda Lines data"),
    ("TBG FLIPPED", "PL FLIPPED"),
    ("TBG confirmation", "Panda Lines confirmation"),
    ("TBG confirmed", "Panda Lines confirmed"),
    ("parse_tbg_file", "parse_pl_file"),
    ("tbg_data", "pl_data"),
    ("all_tbg_map", "all_pl_map"),
    ("tbg_map", "pl_map"),
    # Catch any remaining standalone TBG
    ("'TBG'", "'PL'"),
    ('"TBG"', '"PL"'),
    ("TBG +", "PL +"),
    (" TBG ", " Panda Lines "),
    (" TBG,", " Panda Lines,"),
    (" TBG.", " Panda Lines."),
    ("(TBG)", "(Panda Lines)"),
    (":TBG", ":PL"),
]

def patch_file(filepath, rules):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    original = content
    changes = []
    for pattern, replacement in rules:
        count = content.count(pattern)
        if count > 0:
            content = content.replace(pattern, replacement)
            changes.append(f"  {pattern} -> {replacement} ({count}x)")
    if content != original:
        with open(filepath, 'w', encoding='utf-8', newline='\n') as f:
            f.write(content)
        return changes
    return []

js_files = []
for root, dirs, files in os.walk(DASHBOARD_DIR):
    for f in files:
        if f.endswith('.js'):
            js_files.append(os.path.join(root, f))

print(f"Scanning {len(js_files)} files...\n")
total = 0
for fpath in sorted(js_files):
    changes = patch_file(fpath, RULES)
    if changes:
        print(f"[OK] {os.path.relpath(fpath, DASHBOARD_DIR)}")
        for c in changes:
            print(c)
        total += len(changes)
        print()

print(f"\nDone. {total} replacements.")
