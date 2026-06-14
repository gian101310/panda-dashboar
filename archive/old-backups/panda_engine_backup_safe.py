"""
PANDA FOREX ENGINE - FINAL FULL PRODUCTION BUILD

Sheet1 Primary Engine
GAP_HISTORY Source of Truth
TRADE_MATRIX Full Deterministic Rebuild
STRUCTURAL_LOG Full Deterministic Rebuild
STRENGTH_LOG Incremental Logger
TRADE_EVENTS Incremental Logger
DASHBOARD Mirror (Market_State + Strength)
15-Minute Clock Aligned Scheduler
Hourly FULL FORCE SYNC Before Telegram
Circuit Breaker Active
All Systems Locked
"""

from fastapi import FastAPI
from google.oauth2.service_account import Credentials
from googleapiclient.discovery import build
import asyncio
import os
import re
import requests
import time
import threading
from datetime import datetime
from PIL import Image, ImageDraw, ImageFont

# ================= CONFIG =================

SPREADSHEET_ID = "10BPwSzcf4QtriHQVqaB159x36V3Voww8jXiXJ7WY0lE"

SHEET_NAME = "Sheet1"
DASHBOARD_SHEET = "Dashboard"
GAP_HISTORY_SHEET = "GAP_HISTORY"
TRADE_MATRIX_SHEET = "TRADE_MATRIX"
STRUCTURAL_LOG_SHEET = "STRUCTURAL_LOG"
TRADE_EVENTS_SHEET = "TRADE_EVENTS"
STRENGTH_LOG_SHEET = "STRENGTH_LOG"

CREDS_FILE = r"C:\Users\Admin\Desktop\ctrader_trend_scanner\service_account.json"
PANDA_PATH = r"C:\Users\Admin\AppData\Roaming\MetaQuotes\Terminal\Common\Files"

TELEGRAM_TOKEN = "REDACTED"
TELEGRAM_CHAT_ID = "-1003857801976"

THRESHOLD = 2

app = FastAPI()

credentials = Credentials.from_service_account_file(
    CREDS_FILE,
    scopes=["https://www.googleapis.com/auth/spreadsheets"]
)

service = build("sheets", "v4", credentials=credentials)

LAST_QUARTER_MARK = None
LAST_HOUR_MARK = None

# ================= TELEGRAM CIRCUIT =================

class TelegramCircuitBreaker:
    def __init__(self):
        self.failures = 0
        self.locked_until = 0
        self._lock = threading.Lock()

    def allow(self):
        with self._lock:
            return time.time() >= self.locked_until

    def success(self):
        with self._lock:
            self.failures = 0

    def failure(self):
        with self._lock:
            self.failures += 1
            if self.failures >= 5:
                self.locked_until = time.time() + 120
                self.failures = 0

telegram_circuit = TelegramCircuitBreaker()

# ================= UTIL =================

def safe_float(v):
    try:
        return float(v)
    except:
        return None

# ================= SHEET1 ENGINE =================

def get_rows():
    res = service.spreadsheets().values().get(
        spreadsheetId=SPREADSHEET_ID,
        range=f"{SHEET_NAME}!A2:I200"
    ).execute()

    rows = res.get("values", [])
    for r in rows:
        while len(r) < 9:
            r.append("")
    return rows


def update_sheet(rows):
    service.spreadsheets().values().update(
        spreadsheetId=SPREADSHEET_ID,
        range=f"{SHEET_NAME}!A2:I{len(rows)+1}",
        valueInputOption="RAW",
        body={"values": rows}
    ).execute()

# ================= GAP HISTORY =================

def get_history_headers():
    headers = service.spreadsheets().values().get(
        spreadsheetId=SPREADSHEET_ID,
        range=f"{GAP_HISTORY_SHEET}!A1:ZZ1"
    ).execute().get("values", [[]])[0]
    return [h.strip().upper() for h in headers]


def get_last_n_rows(n=9):
    rows = service.spreadsheets().values().get(
        spreadsheetId=SPREADSHEET_ID,
        range=f"{GAP_HISTORY_SHEET}!A2:ZZ"
    ).execute().get("values", [])
    if len(rows) < n:
        return None
    return rows[-n:]


def write_gap_history_row(symbol_gap_map):
    headers = get_history_headers()
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")

    existing = service.spreadsheets().values().get(
        spreadsheetId=SPREADSHEET_ID,
        range=f"{GAP_HISTORY_SHEET}!A2:A"
    ).execute().get("values", [])

    if existing and existing[-1][0] == timestamp:
        return

    row = [""] * len(headers)
    row[0] = timestamp

    for symbol, gap in symbol_gap_map.items():
        if symbol in headers:
            row[headers.index(symbol)] = gap

    service.spreadsheets().values().append(
        spreadsheetId=SPREADSHEET_ID,
        range=f"{GAP_HISTORY_SHEET}!A:ZZ",
        valueInputOption="RAW",
        body={"values": [row]}
    ).execute()

# ================= PANDA FILE READER =================

def read_gap(symbol):
    try:
        path = os.path.join(PANDA_PATH, f"panda_{symbol.lower()}.txt")
        with open(path, "r", encoding="utf-8") as f:
            text = f.read()
        m = re.search(r"GAP SCORE\s*:\s*(.*)", text)
        return float(m.group(1).strip()) if m else None
    except:
        return None

# ================= CORE GAP ENGINE =================

def run_gap_once():

    rows = get_rows()
    headers = get_history_headers()
    history = get_last_n_rows(9)

    symbol_gap_map = {}

    for i, r in enumerate(rows):

        symbol = r[0].strip().upper()
        if not symbol:
            continue

        gap = read_gap(symbol)
        if gap is None:
            continue

        if gap >= 5:
            gap_bias = "BUY"
        elif gap <= -5:
            gap_bias = "SELL"
        else:
            gap_bias = "INVALID"

        rows[i][3] = gap_bias

        trend = "▬"
        delta = ""
        accel = ""
        trade = "NO"

        if history and symbol in headers:

            idx = headers.index(symbol)

            g0 = gap
            g_prev = safe_float(history[-2][idx])
            g8 = safe_float(history[0][idx])
            g_prev8 = safe_float(history[1][idx])

            if None not in (g_prev, g8, g_prev8):

                structural_delta = g0 - g8
                previous_structural_delta = g_prev - g_prev8
                acceleration = structural_delta - previous_structural_delta

                delta = round(structural_delta, 2)
                accel = round(acceleration, 2)

                if structural_delta >= THRESHOLD:
                    trend = "▲"
                elif structural_delta <= -THRESHOLD:
                    trend = "▼"

                if gap >= 5 and structural_delta >= 2 and acceleration >= 0:
                    trade = "BUY"
                elif gap <= -5 and structural_delta <= -2 and acceleration <= 0:
                    trade = "SELL"

        rows[i][2] = gap
        rows[i][5] = trend
        rows[i][6] = delta
        rows[i][7] = accel
        rows[i][8] = trade

        symbol_gap_map[symbol] = gap

    update_sheet(rows)
    write_gap_history_row(symbol_gap_map)

# ================= TRADE MATRIX =================

def classify_structural_state(gap, delta, accel):

    maturity = ""

    if 5 <= gap <= 7 or -7 <= gap <= -5:
        maturity = "EARLY"
    elif 8 <= gap <= 10 or -10 <= gap <= -8:
        maturity = "MATURE"
    elif 11 <= gap <= 12 or -12 <= gap <= -11:
        maturity = "EXTENDED"

    if gap >= 5 and delta >= 2:
        if accel > 0:
            return f"EXPAND_BULL_{maturity}"
        elif accel < 0:
            return f"PULLBACK_BULL_{maturity}"
        return f"STABLE_BULL_{maturity}"

    if gap <= -5 and delta <= -2:
        if accel < 0:
            return f"EXPAND_BEAR_{maturity}"
        elif accel > 0:
            return f"PULLBACK_BEAR_{maturity}"
        return f"STABLE_BEAR_{maturity}"

    return "NEUTRAL"


def rebuild_trade_matrix():

    history = service.spreadsheets().values().get(
        spreadsheetId=SPREADSHEET_ID,
        range=f"{GAP_HISTORY_SHEET}!A1:ZZ"
    ).execute().get("values", [])

    if len(history) < 10:
        return

    headers = history[0]
    rows = history[1:]

    matrix_output = []

    for i in range(len(rows)):

        row = rows[i]
        timestamp = row[0]
        matrix_row = [timestamp]

        for col in range(1, len(headers)):

            try:
                gap_now = float(row[col])
            except:
                matrix_row.append("NEUTRAL")
                continue

            if i < 8:
                matrix_row.append("NEUTRAL")
                continue

            try:
                gap_8 = float(rows[i-8][col])
                prev_gap = float(rows[i-1][col])
                prev_gap_8 = float(rows[i-9][col])
            except:
                matrix_row.append("NEUTRAL")
                continue

            delta = gap_now - gap_8
            prev_delta = prev_gap - prev_gap_8
            accel = delta - prev_delta

            state = classify_structural_state(gap_now, delta, accel)
            matrix_row.append(state)

        matrix_output.append(matrix_row)

    service.spreadsheets().values().update(
        spreadsheetId=SPREADSHEET_ID,
        range=f"{TRADE_MATRIX_SHEET}!A1",
        valueInputOption="RAW",
        body={"values": [headers]}
    ).execute()

    service.spreadsheets().values().update(
        spreadsheetId=SPREADSHEET_ID,
        range=f"{TRADE_MATRIX_SHEET}!A2",
        valueInputOption="RAW",
        body={"values": matrix_output}
    ).execute()

# ================= STRUCTURAL LOG =================

def rebuild_structural_log():

    history = service.spreadsheets().values().get(
        spreadsheetId=SPREADSHEET_ID,
        range=f"{GAP_HISTORY_SHEET}!A1:ZZ"
    ).execute().get("values", [])

    if len(history) < 10:
        return

    headers = history[0]
    rows = history[1:]

    structural_headers = ["Timestamp"]

    for symbol in headers[1:]:
        structural_headers.append(f"{symbol}_DELTA")
        structural_headers.append(f"{symbol}_ACCEL")

    output = []

    for i in range(len(rows)):

        row = rows[i]
        timestamp = row[0]
        structural_row = [timestamp]

        for col in range(1, len(headers)):

            try:
                gap_now = float(row[col])
            except:
                structural_row.extend(["", ""])
                continue

            if i < 8:
                structural_row.extend(["", ""])
                continue

            try:
                gap_8 = float(rows[i-8][col])
                prev_gap = float(rows[i-1][col])
                prev_gap_8 = float(rows[i-9][col])
            except:
                structural_row.extend(["", ""])
                continue

            delta = gap_now - gap_8
            prev_delta = prev_gap - prev_gap_8
            accel = delta - prev_delta

            structural_row.extend([round(delta, 2), round(accel, 2)])

        output.append(structural_row)

    service.spreadsheets().values().update(
        spreadsheetId=SPREADSHEET_ID,
        range=f"{STRUCTURAL_LOG_SHEET}!A1",
        valueInputOption="RAW",
        body={"values": [structural_headers]}
    ).execute()

    service.spreadsheets().values().update(
        spreadsheetId=SPREADSHEET_ID,
        range=f"{STRUCTURAL_LOG_SHEET}!A2",
        valueInputOption="RAW",
        body={"values": output}
    ).execute()

# ================= STRENGTH LOG =================

def append_strength_row():

    structural = service.spreadsheets().values().get(
        spreadsheetId=SPREADSHEET_ID,
        range=f"{STRUCTURAL_LOG_SHEET}!A1:ZZ"
    ).execute().get("values", [])

    if len(structural) < 2:
        return

    latest = structural[-1]
    timestamp = latest[0]
    strength_row = [timestamp]

    for i in range(1, len(latest), 2):
        delta = safe_float(latest[i])
        accel = safe_float(latest[i+1]) if i+1 < len(latest) else None

        if delta is None or accel is None:
            strength_row.append("")
        else:
            strength_row.append(round(abs(delta) + abs(accel), 2))

    service.spreadsheets().values().append(
        spreadsheetId=SPREADSHEET_ID,
        range=f"{STRENGTH_LOG_SHEET}!A:ZZ",
        valueInputOption="RAW",
        body={"values": [strength_row]}
    ).execute()

# ================= TRADE EVENTS =================

def append_trade_event_row():

    matrix = service.spreadsheets().values().get(
        spreadsheetId=SPREADSHEET_ID,
        range=f"{TRADE_MATRIX_SHEET}!A1:ZZ"
    ).execute().get("values", [])

    if len(matrix) < 3:
        return

    previous_row = matrix[-2]
    latest_row = matrix[-1]

    timestamp = latest_row[0]
    event_row = [timestamp]
    has_event = False

    for col in range(1, len(latest_row)):

        prev_state = previous_row[col] if col < len(previous_row) else ""
        current_state = latest_row[col] if col < len(latest_row) else ""

        if current_state != prev_state and current_state not in ("", "NEUTRAL"):
            event_row.append(current_state)
            has_event = True
        else:
            event_row.append("")

    if not has_event:
        return

    service.spreadsheets().values().append(
        spreadsheetId=SPREADSHEET_ID,
        range=f"{TRADE_EVENTS_SHEET}!A:ZZ",
        valueInputOption="RAW",
        body={"values": [event_row]}
    ).execute()

# ================= DASHBOARD MIRROR =================

def update_dashboard_projection():

    matrix = service.spreadsheets().values().get(
        spreadsheetId=SPREADSHEET_ID,
        range=f"{TRADE_MATRIX_SHEET}!A1:ZZ"
    ).execute().get("values", [])

    structural = service.spreadsheets().values().get(
        spreadsheetId=SPREADSHEET_ID,
        range=f"{STRUCTURAL_LOG_SHEET}!A1:ZZ"
    ).execute().get("values", [])

    if len(matrix) < 2 or len(structural) < 2:
        return

    matrix_headers = matrix[0]
    latest_matrix = matrix[-1]

    structural_headers = structural[0]
    latest_structural = structural[-1]

    dashboard_symbols = service.spreadsheets().values().get(
        spreadsheetId=SPREADSHEET_ID,
        range=f"{DASHBOARD_SHEET}!A2:A200"
    ).execute().get("values", [])

    state_output = []
    strength_output = []

    for row in dashboard_symbols:

        if not row:
            state_output.append([""])
            strength_output.append([""])
            continue

        symbol = row[0].strip().upper()

        if symbol in matrix_headers:
            idx = matrix_headers.index(symbol)
            state = latest_matrix[idx] if idx < len(latest_matrix) else "NEUTRAL"
        else:
            state = "NEUTRAL"

        state_output.append([state])

        delta_col = f"{symbol}_DELTA"
        accel_col = f"{symbol}_ACCEL"

        if delta_col in structural_headers and accel_col in structural_headers:
            d_idx = structural_headers.index(delta_col)
            a_idx = structural_headers.index(accel_col)

            delta = safe_float(latest_structural[d_idx]) if d_idx < len(latest_structural) else None
            accel = safe_float(latest_structural[a_idx]) if a_idx < len(latest_structural) else None

            if delta is not None and accel is not None:
                strength = round(abs(delta) + abs(accel), 2)
            else:
                strength = ""
        else:
            strength = ""

        strength_output.append([strength])

    service.spreadsheets().values().update(
        spreadsheetId=SPREADSHEET_ID,
        range=f"{DASHBOARD_SHEET}!L2:L{len(state_output)+1}",
        valueInputOption="RAW",
        body={"values": state_output}
    ).execute()

    service.spreadsheets().values().update(
        spreadsheetId=SPREADSHEET_ID,
        range=f"{DASHBOARD_SHEET}!M2:M{len(strength_output)+1}",
        valueInputOption="RAW",
        body={"values": strength_output}
    ).execute()

# ================= SNAPSHOT =================

def generate_snapshot(rows):

    headers = ["Symbol", "Gap_Score", "Gap_Bias", "Market_State", "Strength"]
    col_widths = [200, 120, 120, 220, 120]
    row_height = 70

    width = sum(col_widths)
    height = row_height * (len(rows) + 1)

    img = Image.new("RGB", (width, height), (15, 18, 30))
    draw = ImageDraw.Draw(img)

    try:
        font = ImageFont.truetype("arial.ttf", 22)
    except:
        font = ImageFont.load_default()

    x = 0
    for i, h in enumerate(headers):
        draw.rectangle([x, 0, x + col_widths[i], row_height], fill=(40, 45, 70))
        draw.text((x + 15, 22), h, fill=(240, 240, 240), font=font)
        x += col_widths[i]

    for idx, row in enumerate(rows):
        y = (idx + 1) * row_height
        x = 0
        for j, val in enumerate(row):
            draw.rectangle([x, y, x + col_widths[j], y + row_height], outline=(70, 80, 120))
            draw.text((x + 15, y + 22), str(val), fill=(240, 240, 240), font=font)
            x += col_widths[j]

    img.save("snapshot.png", quality=95)
    return "snapshot.png"


def send_snapshot():

    if not telegram_circuit.allow():
        return

    rows = service.spreadsheets().values().get(
        spreadsheetId=SPREADSHEET_ID,
        range=f"{DASHBOARD_SHEET}!A2:M200"
    ).execute().get("values", [])

    clean = []

    for r in rows:
        if len(r) >= 13 and r[0]:
            clean.append([r[0], r[2], r[3], r[11], r[12]])

    if not clean:
        return

    img = generate_snapshot(clean)

    try:
        with open(img, "rb") as f:
            requests.post(
                f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendPhoto",
                data={
                    "chat_id": TELEGRAM_CHAT_ID,
                    "caption": "🔥 PANDA DASHBOARD\n⏰ " + datetime.now().strftime("%Y-%m-%d %H:%M")
                },
                files={"photo": f},
                timeout=15
            )
        telegram_circuit.success()
    except:
        telegram_circuit.failure()

# ================= SCHEDULER =================

async def master_scheduler():

    global LAST_QUARTER_MARK, LAST_HOUR_MARK

    await asyncio.sleep(5)

    while True:
        try:

            now = datetime.now()
            quarter_mark = now.replace(second=0, microsecond=0)
            hour_mark = now.replace(minute=0, second=0, microsecond=0)

            if now.minute % 15 == 0:
                if LAST_QUARTER_MARK != quarter_mark:
                    run_gap_once()
                    rebuild_trade_matrix()
                    rebuild_structural_log()
                    append_strength_row()
                    append_trade_event_row()
                    update_dashboard_projection()
                    LAST_QUARTER_MARK = quarter_mark

            if now.minute == 0:
                if LAST_HOUR_MARK != hour_mark:
                    run_gap_once()
                    rebuild_trade_matrix()
                    rebuild_structural_log()
                    append_strength_row()
                    append_trade_event_row()
                    update_dashboard_projection()
                    send_snapshot()
                    LAST_HOUR_MARK = hour_mark

        except Exception as e:
            print("MASTER LOOP ERROR:", e)

        await asyncio.sleep(60)

@app.on_event("startup")
async def startup():
    asyncio.create_task(master_scheduler())

@app.get("/")
def home():
    return {"status": "PANDA FULL PRODUCTION ENGINE ACTIVE"}