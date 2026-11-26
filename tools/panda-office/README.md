# Panda Engine Office

Local read-only pixel-art view of Panda Engine processes. The Stone Age cave map has nine named characters: Mr. Slate as the visual CEO, Fred, Wilma, Betty, Barney, Pebbles, Bamm-Bamm, Gazoo, and Dino. Eight characters represent observed Panda processes. Mr. Slate summarizes the connected feeds; he is not an autonomous CEO agent. The cave does not send Telegram messages, change scoring, approve licenses, or place trades.

## Start

From this folder, run `npm install`, `npm run build`, then `npm start`. Open `http://127.0.0.1:4318`. The server binds only to loopback. `START_OFFICE.ps1` starts the built office in a hidden PowerShell window and opens the page.

The observer reads the existing project `.env` on the server side for **read-only Supabase queries**. No key or private customer record is sent to the browser. The browser receives only aggregate status and redacted event labels. It also reads the local engine `/status` endpoint, snapshot file modification time, and the latest Panda Lines export modification times.

## Status meaning

- **Scoring:** latest engine `/status` and `engine_logs` scoring marker.
- **Snapshot:** local snapshot image modification time and recorded snapshot send result.
- **Alerts / Telegram:** `signal_alert_outbox` statuses and recorded snapshot send result. `sent` requires the recorded delivery state.
- **Licensing:** latest license record status and update time only; no names, account numbers, or credentials.
- **Panda Lines:** timestamp count of local `tbg_*.txt` exports. This is file freshness, not proof of chart rendering.
- **Send Check:** no distinct pre-send review event exists yet, so the character shows `No live feed`; the office does not gate delivery.
- **Previous day:** counts fresh local `tbg_*.txt` exports containing PDH and PDL fields. This confirms exported data, not visible chart drawing.

The office polls every 15 seconds and shows `No live feed` or `Unavailable` when a source cannot be verified. Walking, standing, and idle gestures are ambient visual animation; they do not claim that a live task was performed. Status and event text come from real Panda observations. Status history is kept only in memory while this viewer runs.
