"""
map_code.py — print a fresh component/function -> line-number index.
Usage:
  python3.11 map_code.py                 # maps pages/dashboard.js (default)
  python3.11 map_code.py pages/pricing.js pages/api/ai-chat.js
Cross-platform (Mac + Windows). Run this FIRST before editing big files:
read only the exact line ranges you need instead of scanning whole files.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PATTERNS = [
    (re.compile(r'^(?:export\s+default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)'), 'fn'),
    (re.compile(r'^const\s+([A-Z][\w$]*)\s*='), 'const'),
    (re.compile(r'^export\s+default\s+(?:async\s+)?function\s*([A-Za-z_$][\w$]*)?'), 'default'),
    (re.compile(r'^const\s+(TABS|FILTERS|SORTS|TAB_FEATURE|ALL_PAIRS|MOMENTUM_GUIDE)\b'), 'const'),
]

def map_file(rel):
    p = ROOT / rel
    if not p.exists():
        print(f'!! {rel}: not found')
        return
    lines = p.read_text(encoding='utf-8-sig', errors='replace').splitlines()
    print(f'== {rel} ({len(lines)} lines) ==')
    seen = set()
    for n, line in enumerate(lines, 1):
        for rx, kind in PATTERNS:
            m = rx.match(line)
            if m:
                name = m.group(1) if m.groups() and m.group(1) else '(anonymous default)'
                key = (n, name)
                if key not in seen:
                    seen.add(key)
                    print(f'{n:>6}  {kind:<8}{name}')
                break

if __name__ == '__main__':
    targets = sys.argv[1:] or ['pages/dashboard.js']
    for t in targets:
        map_file(t)
