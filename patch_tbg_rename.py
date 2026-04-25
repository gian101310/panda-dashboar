"""
TBG → Panda Lines rename patch
Renames all user-facing TBG references across the dashboard codebase.
Preserves DB column names (tbg_zone) since those map to Supabase.
"""
import re, os

DASHBOARD_DIR = r"C:\Users\Admin\panda-dashboard\pages"

# Replacement rules: (pattern, replacement, files_to_apply)
# Order matters — more specific patterns first
RULES = [
    # === DISPLAY LABELS ===
    ("FL-ST", "PL", ["dashboard.js"]),
    
    # === COMMENTS & DESCRIPTIONS (user-visible in AI responses) ===
    ("TBG confirmed", "Panda Lines confirmed", None),  # None = all files
    ("TBG not confirmed", "Panda Lines not confirmed", None),
    ("TBG confirmation", "Panda Lines confirmation", None),
    ("TBG discipline", "Panda Lines discipline", None),
    ("TBG zone", "Panda Lines zone", None),
    ("TBG must confirm", "Panda Lines must confirm", None),
    ("TBG (SuperTrend + FollowLine from MT4)", "Panda Lines (proprietary confirmation layer)", None),
    ("TBG (SuperTrend + FollowLine)", "Panda Lines (proprietary confirmation)", None),
    ("SuperTrend + FollowLine agree", "Panda Lines agree", None),
    ("SuperTrend + FollowLine", "Panda Lines", None),
    ("TBG ABOVE", "PL ABOVE", None),
    ("TBG BELOW", "PL BELOW", None),
    ("TBG BETWEEN", "PL BETWEEN", None),
    ("TBG_FLIPPED", "PL_FLIPPED", None),
    ("No TBG validation", "No Panda Lines validation", None),
    ("No TBG required", "No Panda Lines required", None),
    ("tbg_confirmation", "pl_confirmation", None),
    ("tbg_discipline", "pl_discipline", None),
    # Catch remaining standalone "TBG" in display strings (NOT in variable names like tbg_zone)
    ("'TBG'", "'PL'", None),
    ('"TBG"', '"PL"', None),
    ("TBG adds", "Panda Lines adds", None),
    ("TBG confirmation adds", "Panda Lines confirmation adds", None),
    # Comments
    ("// TBG ", "// Panda Lines ", None),
    ("# TBG ", "# Panda Lines ", None),
    ("TBG data", "Panda Lines data", None),
    ("TBG indicator", "Panda Lines indicator", None),
]

def patch_file(filepath, rules):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    original = content
    changes = []
    
    for pattern, replacement, target_files in rules:
        if target_files is not None:
            basename = os.path.basename(filepath)
            if basename not in target_files:
                continue
        
        count = content.count(pattern)
        if count > 0:
            content = content.replace(pattern, replacement)
            changes.append(f"  {pattern} -> {replacement} ({count}x)")
    
    if content != original:
        with open(filepath, 'w', encoding='utf-8', newline='\n') as f:
            f.write(content)
        return changes
    return []

# Find all JS files
js_files = []
for root, dirs, files in os.walk(DASHBOARD_DIR):
    for f in files:
        if f.endswith('.js'):
            js_files.append(os.path.join(root, f))

print(f"Scanning {len(js_files)} files...\n")

total_changes = 0
for fpath in sorted(js_files):
    changes = patch_file(fpath, RULES)
    if changes:
        print(f"[OK] {os.path.relpath(fpath, DASHBOARD_DIR)}")
        for c in changes:
            print(c)
        total_changes += len(changes)
        print()

print(f"\nDone. {total_changes} replacements across {len(js_files)} files.")
