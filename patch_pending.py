import re

path = r'C:\Users\Admin\panda-dashboard\pages\pending.js'
content = open(path, encoding='utf-8').read()

# Update instruction text
content = content.replace(
    "Contact admin on Telegram to activate your access. Mention your username.",
    "If you provided your Telegram username during signup, your credentials will be sent automatically once approved. If not, message @panda_engine_alerts_bot with your username to speed things up."
)

# Update button label
content = content.replace(
    "📨 CONTACT ON TELEGRAM",
    "📨 MESSAGE @panda_engine_alerts_bot"
)

open(path, 'w', encoding='utf-8').write(content)
print("DONE")
