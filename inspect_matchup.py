import sys
sys.stdout = __import__('io').TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
c = open('pages/dashboard.js', encoding='utf-8').read()

idx = c.find('function getMatchup(')
print('=== getMatchup function ===')
print(c[idx:idx+600])
print()

print('=== getMatchup() call sites ===')
search = 'getMatchup('
pos = 0
count = 0
while True:
    p = c.find(search, pos)
    if p == -1:
        break
    line = c[:p].count('\n') + 1
    print(f'Line {line}: {c[max(0,p-50):p+80]}')
    pos = p + 1
    count += 1
print(f'Total: {count} calls')
