from pathlib import Path
import re
from collections import Counter

# Cross-platform: resolve relative to this script's location (works on Mac + Windows)
src = Path(__file__).resolve().parent / 'pages' / 'dashboard.js'
code = src.read_text(encoding='utf-8-sig')

funcs = re.findall(r'function ([A-Za-z_][A-Za-z0-9_]*)\s*[\(\{]', code)
dupes = {f:c for f,c in Counter(funcs).items() if c>1}
print("DUPES:", dupes if dupes else "NONE")

checks = [
    ("Default filter VALID",     "useState('VALID')" in code),
    ("VALID in FILTERS array",   "'VALID'" in code[code.find("const FILTERS"):code.find("const FILTERS")+80]),
    ("displayed logic updated",  "filter==='VALID'" in code),
    ("VALID subtitle",           "VALID PAIRS" in code),
]
for label, ok in checks:
    print(f"{'PASS' if ok else 'FAIL'}: {label}")
