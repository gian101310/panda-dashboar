import sys
sys.stdout = __import__('io').TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
c = open(r'C:\Users\Admin\panda-dashboard\pages\dashboard.js', encoding='utf-8').read()
checks = ['function stateColor','function biasFromGap','function isValid','function scoreLabel','function getMatchup','function plZoneBadge']
ok = True
for f in checks:
    count = c.count(f)
    status = '✅' if count == 1 else '❌ DUPLICATE' if count > 1 else '❌ MISSING'
    print(f"{status} {f}: {count}")
    if count != 1: ok = False
print('READY TO DEPLOY' if ok else 'FIX BEFORE DEPLOYING')
