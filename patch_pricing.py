import re

path = r'C:\Users\Admin\panda-dashboard\pages\pricing.js'
content = open(path, encoding='utf-8').read()

# 1. Add telegram state
content = content.replace(
    "  const [pfSignupErr, setPfSignupErr] = useState('');",
    "  const [pfSignupErr, setPfSignupErr] = useState('');\n  const [pfSignupTelegram, setPfSignupTelegram] = useState('');"
)

# 2. Reset telegram in pfOpenSignup
content = content.replace(
    "setPfSignupTier(tier); setPfSignupEmail(''); setPfSignupUsername('');",
    "setPfSignupTier(tier); setPfSignupEmail(''); setPfSignupUsername(''); setPfSignupTelegram('');"
)

# 3. Pass telegram in fetch body
content = content.replace(
    "body: JSON.stringify({ email: pfSignupEmail, username: pfSignupUsername, tier: pfSignupTier })",
    "body: JSON.stringify({ email: pfSignupEmail, username: pfSignupUsername, tier: pfSignupTier, telegram_username: pfSignupTelegram })"
)

# 4. Add telegram hint + input after username input
old_field = '                    <input value={pfSignupUsername} onChange={e => setPfSignupUsername(e.target.value)} placeholder="preferred username (optional)" style={{ background: \'#05080f\', border: \'1px solid #1a2540\', borderRadius: 6, padding: \'12px 14px\', color: \'#e8eaf0\', fontFamily: raj, fontSize: 14, outline: \'none\' }} />'
new_field = old_field + """
                    <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: 2, color: '#445566', marginTop: 4 }}>TELEGRAM — <span style={{color:'#00b4ff'}}>message @panda_engine_alerts_bot first to receive credentials instantly</span></div>
                    <input value={pfSignupTelegram} onChange={e => setPfSignupTelegram(e.target.value)} placeholder="@your_telegram (optional)" style={{ background: '#05080f', border: '1px solid #1a2540', borderRadius: 6, padding: '12px 14px', color: '#e8eaf0', fontFamily: raj, fontSize: 14, outline: 'none' }} />"""

if old_field in content:
    content = content.replace(old_field, new_field)
    print("field patched OK")
else:
    print("WARNING: field not found")

open(path, 'w', encoding='utf-8').write(content)
print("DONE")
