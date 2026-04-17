import re

path = r'C:\Users\Admin\panda-dashboard\pages\admin\pf-approvals.js'
content = open(path, encoding='utf-8').read()

# Remove pfApPass state
content = content.replace(
    "  const [pfApPass, setPfApPass] = useState('');",
    ""
)

# Remove pfApPass reset in pfOpenApprove
content = content.replace(
    "setPfApUser(s.username || (s.email || '').split('@')[0]);\n    setPfApPass('');\n    setPfApTier(s.tier || 'starter');",
    "setPfApUser(s.username || (s.email || '').split('@')[0]);\n    setPfApTier(s.tier || 'starter');"
)

# Change pfDoApprove validation - remove password check
content = content.replace(
    "if (!pfApUser || pfApPass.length < 6) { setPfApErr('Username + 6+ char password required'); return; }",
    "if (!pfApUser) { setPfApErr('Username required'); return; }"
)

# Remove password from POST body
content = content.replace(
    "body: JSON.stringify({ action: 'approve_signup', id: pfApproveOpen.id, username: pfApUser, password: pfApPass, tier: pfApTier, role: pfApRole })",
    "body: JSON.stringify({ action: 'approve_signup', id: pfApproveOpen.id, username: pfApUser, tier: pfApTier, role: pfApRole })"
)

# Remove password input field from modal
old_pass = """                <label style={{ fontFamily: mono, fontSize: 9, letterSpacing: 2, color: '#445566' }}>PASSWORD (min 6 chars)
                  <input type="text" value={pfApPass} onChange={e => setPfApPass(e.target.value)} placeholder="set initial password" style={{ display: 'block', width: '100%', marginTop: 4, background: '#05080f', border: '1px solid #1a2540', borderRadius: 6, padding: '10px 12px', color: '#e8eaf0', fontFamily: raj, fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
                </label>"""
new_pass = """                <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: 2, color: '#445566', padding: '8px 0' }}>PASSWORD — <span style={{color:'#00ff9f'}}>auto-generated and sent to user via Telegram</span></div>"""

if old_pass in content:
    content = content.replace(old_pass, new_pass)
    print("password field replaced OK")
else:
    print("WARNING: password field not found")

open(path, 'w', encoding='utf-8').write(content)
print("DONE")
