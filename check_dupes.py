import sys, os
sys.stdout = __import__('io').TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

# Cross-platform path — works on Windows and Mac
script_dir = os.path.dirname(os.path.abspath(__file__))
dashboard_path = os.path.join(script_dir, 'pages', 'dashboard.js')

c = open(dashboard_path, encoding='utf-8').read()
checks = ['function stateColor','function biasFromGap','function isValid','function scoreLabel','function getMatchup','function plZoneBadge']
ok = True
for f in checks:
    count = c.count(f)
    status = '✅' if count == 1 else '❌ DUPLICATE' if count > 1 else '❌ MISSING'
    print(f"{status} {f}: {count}")
    if count != 1: ok = False
print('READY TO DEPLOY' if ok else 'FIX BEFORE DEPLOYING')
