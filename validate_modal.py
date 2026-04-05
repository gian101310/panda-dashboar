src = open('pages/dashboard.js','r',encoding='utf-8').read()
lines = src.split('\n')

modal_start = None
first_return_line = None
hooks_in_modal = []
modal_end = None

for i, l in enumerate(lines):
    if 'function PairCardModal' in l:
        modal_start = i
    if modal_start is not None and i > modal_start:
        if 'React.useState' in l or 'React.useEffect' in l or 'React.useRef' in l:
            hooks_in_modal.append(i+1)
        if 'return null' in l and first_return_line is None:
            first_return_line = i+1
        if l.strip() == '}' and i > modal_start + 10:
            modal_end = i+1
            break

print('PairCardModal starts at line:', (modal_start+1) if modal_start is not None else 'NOT FOUND')
print('Modal ends at line:', modal_end)
print('Hooks at lines:', hooks_in_modal)
print('First early return at line:', first_return_line)

if hooks_in_modal and first_return_line:
    bad = [h for h in hooks_in_modal if h > first_return_line]
    if bad:
        print('ERROR - Hooks after early return (RULES OF HOOKS VIOLATION):', bad)
    else:
        print('OK - All hooks before early return')

# Fragment balance check
frags_open = 0
in_modal = False
for i, l in enumerate(lines):
    if 'function PairCardModal' in l:
        in_modal = True
    if in_modal:
        frags_open += l.count('<>') - l.count('</>')
        if l.strip() == '}' and i > (modal_start or 0) + 10:
            break
print('Fragment <> balance (should be 0):', frags_open)

# TradingViewChart check
tv_start = next((i for i, l in enumerate(lines) if 'function TradingViewChart' in l), None)
if tv_start is not None:
    tv_block = '\n'.join(lines[tv_start:tv_start+25])
    if 'useEffect' in tv_block:
        print('ERROR - useEffect still present in TradingViewChart!')
    else:
        print('OK - TradingViewChart has no useEffect')
    if 'iframe' in tv_block:
        print('OK - TradingViewChart uses iframe')
    else:
        print('ERROR - iframe not found in TradingViewChart!')
else:
    print('ERROR - TradingViewChart function not found!')

# TV URL check
if 'tradingview.com/widgetembed' in src:
    print('OK - TradingView iframe URL present')
else:
    print('ERROR - TradingView iframe URL missing!')

# Duplicate const bias check inside modal
if modal_start and modal_end:
    modal_src = '\n'.join(lines[modal_start:modal_end])
    bias_count = modal_src.count('const bias =')
    print('const bias declarations in modal:', bias_count, '(should be 1)')

print('\nAll checks done.')
