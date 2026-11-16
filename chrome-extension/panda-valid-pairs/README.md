# Panda Engine Valid Pairs for Chrome

Read-only Chrome side panel showing the current valid pairs from Panda Engine, ordered by absolute gap. It includes all pairs with `|gap| >= 5` and `hard_invalid = false`; gaps 5–6 are highlighted yellow, matching the Telegram snapshot display. It does not place trades or change scoring.

## Install privately

1. Sign in at https://pandaengine.app in Chrome.
2. Open `chrome://extensions`, enable **Developer mode**, then select **Load unpacked**.
3. Choose this `chrome-extension/panda-valid-pairs` folder.
4. Pin **Panda Engine Valid Pairs** and click its icon to open the side panel.

The panel refreshes every five minutes and has a manual refresh button. It requires access only to the Panda Engine domains and their login cookie. The cookie value is sent only to Panda Engine's read-only valid-pairs route and is never saved in extension storage. If the Panda session expires, sign in again and refresh the panel.
