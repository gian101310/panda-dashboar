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

# ===== WINDOWS SOCKET FIX =====
import socket
socket.setdefaulttimeout(30)

from fastapi import FastAPI
from google.oauth2.service_account import Credentials
import asyncio
import os
import re
import requests
import time
import threading
from datetime import datetime
from PIL import Image, ImageDraw, ImageFont

# Create FastAPI app
app = FastAPI()
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

TELEGRAM_TOKEN = "8556482762:AAGd6I7M6fFZ84f-8r2O8fyVktRCF3rUosA"
TELEGRAM_CHAT_ID = "-1003857801976"

THRESHOLD = 4
MAX_FILE_AGE_SECONDS = 180

LAST_SENT_HASH = None
LAST_ENGINE_RUN = 0

# Scheduler markers
LAST_QUARTER_MARK = None
LAST_HOUR_MARK = None

# ================= GOOGLE SHEETS REST CONNECTION =================

import google.auth.transport.requests

SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]

credentials = Credentials.from_service_account_file(
    CREDS_FILE,
    scopes=SCOPES
)

BASE_URL = "https://sheets.googleapis.com/v4/spreadsheets"

ACCESS_TOKEN = None
TOKEN_TIME = 0


def get_access_token():

    global ACCESS_TOKEN, TOKEN_TIME

    try:

        # reuse token for ~50 minutes
        if ACCESS_TOKEN and (time.time() - TOKEN_TIME) < 3000:
            return ACCESS_TOKEN

        auth_req = google.auth.transport.requests.Request()
        credentials.refresh(auth_req)

        ACCESS_TOKEN = credentials.token
        TOKEN_TIME = time.time()

        return ACCESS_TOKEN

    except Exception as e:
        print("GOOGLE TOKEN ERROR:", e)
        return None


# ================= SHEET GET =================

def sheet_get(range_name):

    try:

        token = get_access_token()
        if not token:
            return []

        url = f"{BASE_URL}/{SPREADSHEET_ID}/values/{range_name}"

        headers = {
            "Authorization": f"Bearer {token}"
        }

        r = requests.get(url, headers=headers, timeout=30)

        if r.status_code not in (200, 201):
            print("SHEET GET ERROR:", r.text)
            return []

        return r.json().get("values", [])

    except Exception as e:
        print("SHEET GET EXCEPTION:", e)
        return []


# ================= SHEET UPDATE =================

def sheet_update(range_name, values):

    try:

        token = get_access_token()
        if not token:
            return

        url = f"{BASE_URL}/{SPREADSHEET_ID}/values/{range_name}?valueInputOption=RAW"

        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }

        body = {"values": values}

        r = requests.put(url, headers=headers, json=body, timeout=30)

        if r.status_code not in (200, 201):
            print("SHEET UPDATE ERROR:", r.text)

    except Exception as e:
        print("SHEET UPDATE EXCEPTION:", e)


# ================= SHEET APPEND =================

def sheet_append(range_name, values):

    try:

        token = get_access_token()
        if not token:
            return

        url = f"{BASE_URL}/{SPREADSHEET_ID}/values/{range_name}:append?valueInputOption=RAW"

        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }

        body = {"values": values}

        r = requests.post(url, headers=headers, json=body, timeout=30)

        if r.status_code not in (200, 201):
            print("SHEET APPEND ERROR:", r.text)

    except Exception as e:
        print("SHEET APPEND EXCEPTION:", e)


# ================= TELEGRAM CIRCUIT =================

class TelegramCircuitBreaker:

    def __init__(self):
        self.failures = 0
        self.locked_until = 0
        self._lock = threading.Lock()

    def allow(self):

        with self._lock:
            if time.time() < self.locked_until:
                print("[TELEGRAM LOCKED]")
                return False
            return True

    def success(self):

        with self._lock:
            self.failures = 0

    def failure(self):

        with self._lock:
            self.failures += 1
            print(f"[TELEGRAM FAILURE] Count={self.failures}")

            if self.failures >= 5:
                self.locked_until = time.time() + 120
                print("[TELEGRAM COOLDOWN] 120 seconds")
                self.failures = 0


telegram_circuit = TelegramCircuitBreaker()

# ================= UTIL =================

def safe_float(v):
    try:
        return float(v)
    except:
        return None


def safe_get(row, idx):
    if row is None:
        return None
    if idx >= len(row):
        return None
    return safe_float(row[idx])

# ================= SHEET1 ENGINE =================

def get_rows():

    try:
        url = f"{BASE_URL}/{SPREADSHEET_ID}/values/{SHEET_NAME}!A2:I200"

        headers = {
            "Authorization": f"Bearer {get_access_token()}"
        }

        r = requests.get(url, headers=headers, timeout=30)

        if r.status_code != 200:
            print("Google API ERROR:", r.text)
            return []

        rows = r.json().get("values", [])

        for row in rows:
            while len(row) < 9:
                row.append("")

        return rows

    except Exception as e:
        print("Google GET ERROR:", e)
        return []


def update_sheet(rows):

    try:
        url = f"{BASE_URL}/{SPREADSHEET_ID}/values/{SHEET_NAME}!A2:I{len(rows)+1}?valueInputOption=RAW"

        headers = {
            "Authorization": f"Bearer {get_access_token()}",
            "Content-Type": "application/json"
        }

        body = {
            "values": rows
        }

        r = requests.put(url, headers=headers, json=body, timeout=30)

        if r.status_code != 200:
            print("Google UPDATE ERROR:", r.text)

    except Exception as e:
        print("Google UPDATE EXCEPTION:", e)
# ================= GAP HISTORY =================

def get_history_headers():

    token = get_access_token()

    url = f"{BASE_URL}/{SPREADSHEET_ID}/values/{GAP_HISTORY_SHEET}!A1:ZZ1"

    headers = {
        "Authorization": f"Bearer {token}"
    }

    r = requests.get(url, headers=headers, timeout=30)

    if r.status_code != 200:
        print("Google HEADER ERROR:", r.text)
        return []

    values = r.json().get("values", [])

    if not values:
        return []

    return [h.strip().upper() for h in values[0]]


def get_last_n_rows(n=9):

    token = get_access_token()

    url = f"{BASE_URL}/{SPREADSHEET_ID}/values/{GAP_HISTORY_SHEET}!A2:ZZ"

    headers = {
        "Authorization": f"Bearer {token}"
    }

    r = requests.get(url, headers=headers, timeout=30)

    if r.status_code != 200:
        print("Google HISTORY ERROR:", r.text)
        return None

    rows = r.json().get("values", [])

    if len(rows) < n:
        return None

    return rows[-n:]


def write_gap_history_row(symbol_gap_map):

    headers = get_history_headers()
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")

    token = get_access_token()

    # ===== Get existing timestamps =====
    url = f"{BASE_URL}/{SPREADSHEET_ID}/values/{GAP_HISTORY_SHEET}!A2:A"

    auth = {
        "Authorization": f"Bearer {token}"
    }

    r = requests.get(url, headers=auth, timeout=30)

    if r.status_code != 200:
        print("Google READ ERROR:", r.text)
        return

    existing = r.json().get("values", [])

    if existing and existing[-1][0] == timestamp:
        return

    # ===== Build row =====
    row = [""] * len(headers)
    row[0] = timestamp

    for symbol, gap in symbol_gap_map.items():
        if symbol in headers:
            row[headers.index(symbol)] = gap

    # ===== Append row =====
    url = f"{BASE_URL}/{SPREADSHEET_ID}/values/{GAP_HISTORY_SHEET}!A:ZZ:append?valueInputOption=RAW"

    body = {
        "values": [row]
    }

    headers_req = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }

    r = requests.post(url, headers=headers_req, json=body, timeout=30)

    if r.status_code != 200:
        print("Google APPEND ERROR:", r.text)
# ================= PANDA FILE READER =================

def read_gap(symbol):
    try:
        path = os.path.join(PANDA_PATH, f"panda_{symbol.lower()}.txt")

        if not os.path.exists(path):
            return None

        file_age = time.time() - os.path.getmtime(path)

        if file_age > MAX_FILE_AGE_SECONDS:
            print(f"[STALE FILE] {symbol} age={int(file_age)}s")
            return None

        with open(path, "r", encoding="utf-8") as f:
            text = f.read()

        m = re.search(r"GAP SCORE\s*:\s*(-?\d+)", text)
        return float(m.group(1)) if m else None

    except Exception as e:
        print("[READ ERROR]", symbol, e)
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
            g_prev = safe_get(history[-2], idx)
            g8 = safe_get(history[0], idx)
            g_prev8 = safe_get(history[1], idx)

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

    if gap >= 5:
        regime = "BULL"
    elif gap <= -5:
        regime = "BEAR"
    else:
        return "NEUTRAL"

    if regime == "BULL":

        if delta >= THRESHOLD:
            if accel > 0:
                return "EXPAND_BULL"
            elif accel < 0:
                return "PULLBACK_BULL"
            else:
                return "STABLE_BULL"

        elif delta <= -THRESHOLD:
            return "DEEP_PULLBACK_BULL"

        else:
            return "STABLE_BULL"

    if regime == "BEAR":

        if delta <= -THRESHOLD:
            if accel < 0:
                return "EXPAND_BEAR"
            elif accel > 0:
                return "PULLBACK_BEAR"
            else:
                return "STABLE_BEAR"

        elif delta >= THRESHOLD:
            return "DEEP_PULLBACK_BEAR"

        else:
            return "STABLE_BEAR"


def rebuild_trade_matrix():

    try:
        history = sheet_get(f"{GAP_HISTORY_SHEET}!A1:ZZ")

        if not history or len(history) < 10:
            return

        headers = history[0]
        rows = history[1:]

        matrix_output = []

        for i in range(len(rows)):

            row = rows[i]
            timestamp = row[0] if len(row) > 0 else ""
            matrix_row = [timestamp]

            for col in range(1, len(headers)):

                # ===== Safe gap read =====
                gap_now = None
                if col < len(row):
                    gap_now = safe_float(row[col])

                if gap_now is None:
                    matrix_row.append("NEUTRAL")
                    continue

                if i < 8:
                    matrix_row.append("NEUTRAL")
                    continue

                try:

                    gap_8 = safe_float(rows[i-8][col]) if col < len(rows[i-8]) else None
                    prev_gap = safe_float(rows[i-1][col]) if col < len(rows[i-1]) else None
                    prev_gap_8 = safe_float(rows[i-9][col]) if col < len(rows[i-9]) else None

                    if None in (gap_8, prev_gap, prev_gap_8):
                        matrix_row.append("NEUTRAL")
                        continue

                except:
                    matrix_row.append("NEUTRAL")
                    continue

                delta = gap_now - gap_8
                prev_delta = prev_gap - prev_gap_8
                accel = delta - prev_delta

                state = classify_structural_state(gap_now, delta, accel)

                matrix_row.append(state)

            matrix_output.append(matrix_row)

        # ===== Write results =====
        sheet_update(f"{TRADE_MATRIX_SHEET}!A1", [headers])
        sheet_update(f"{TRADE_MATRIX_SHEET}!A2", matrix_output)

    except Exception as e:
        print("TRADE MATRIX ERROR:", e)


# ================= STRUCTURAL LOG =================

def rebuild_structural_log():

    try:
        history = sheet_get(f"{GAP_HISTORY_SHEET}!A1:ZZ")

        if not history or len(history) < 10:
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

            timestamp = row[0] if len(row) > 0 else ""
            structural_row = [timestamp]

            for col in range(1, len(headers)):

                # ===== Safe gap read =====
                gap_now = None
                if col < len(row):
                    gap_now = safe_float(row[col])

                if gap_now is None:
                    structural_row.extend(["", ""])
                    continue

                if i < 8:
                    structural_row.extend(["", ""])
                    continue

                try:

                    gap_8 = safe_float(rows[i-8][col]) if col < len(rows[i-8]) else None
                    prev_gap = safe_float(rows[i-1][col]) if col < len(rows[i-1]) else None
                    prev_gap_8 = safe_float(rows[i-9][col]) if col < len(rows[i-9]) else None

                    if None in (gap_8, prev_gap, prev_gap_8):
                        structural_row.extend(["", ""])
                        continue

                except:
                    structural_row.extend(["", ""])
                    continue

                delta = gap_now - gap_8
                prev_delta = prev_gap - prev_gap_8
                accel = delta - prev_delta

                structural_row.extend([round(delta, 2), round(accel, 2)])

            output.append(structural_row)

        # ===== Write to sheet =====
        sheet_update(f"{STRUCTURAL_LOG_SHEET}!A1", [structural_headers])
        sheet_update(f"{STRUCTURAL_LOG_SHEET}!A2", output)

    except Exception as e:
        print("STRUCTURAL LOG ERROR:", e)

# ================= STRENGTH LOG =================

def append_strength_row():

    try:
        structural = sheet_get(f"{STRUCTURAL_LOG_SHEET}!A1:ZZ")
        sheet_rows = sheet_get(f"{SHEET_NAME}!A2:I200")

        if not structural or len(structural) < 2:
            return

        latest_structural = structural[-1]

        timestamp = latest_structural[0] if len(latest_structural) > 0 else ""
        strength_row = [timestamp]

        gap_map = {}

        # ===== Build symbol → gap map =====
        for r in sheet_rows:
            if len(r) >= 3 and r[0]:
                symbol = r[0].strip().upper()
                gap_map[symbol] = safe_float(r[2])

        headers = structural[0]

        col_index = 1

        while col_index < len(latest_structural):

            # ===== Safe delta read =====
            delta = None
            if col_index < len(latest_structural):
                delta = safe_float(latest_structural[col_index])

            # ===== Safe accel read =====
            accel = None
            if col_index + 1 < len(latest_structural):
                accel = safe_float(latest_structural[col_index + 1])

            # ===== Safe header read =====
            symbol = ""
            if col_index < len(headers):
                symbol = headers[col_index].replace("_DELTA", "")

            gap = gap_map.get(symbol)

            if None in (delta, accel, gap):
                strength_row.append("")
            else:
                strength = (
                    (abs(delta) * 0.6) +
                    (abs(accel) * 0.25) +
                    (abs(gap) * 0.15)
                )

                strength_row.append(round(strength, 2))

            col_index += 2

        # ===== Append row to sheet =====
        sheet_append(f"{STRENGTH_LOG_SHEET}!A:ZZ", [strength_row])

    except Exception as e:
        print("STRENGTH LOG ERROR:", e)

# ================= TRADE EVENTS =================

def append_trade_event_row():

    matrix = sheet_get(f"{TRADE_MATRIX_SHEET}!A1:ZZ")

    if len(matrix) < 3:
        return

    previous_row = matrix[-2]
    latest_row = matrix[-1]

    timestamp = latest_row[0]
    event_row = [timestamp]

    has_event = False

    for col in range(1, len(latest_row)):

        prev_state = previous_row[col] if col < len(previous_row) else ""
        current_state = latest_row[col]

        if current_state != prev_state and current_state not in ("", "NEUTRAL"):
            event_row.append(current_state)
            has_event = True
        else:
            event_row.append("")

    if not has_event:
        return

    sheet_append(f"{TRADE_EVENTS_SHEET}!A:ZZ", [event_row])

# ================= DASHBOARD MIRROR =================

def update_dashboard_projection():

    try:

        matrix = sheet_get(f"{TRADE_MATRIX_SHEET}!A1:ZZ")
        structural = sheet_get(f"{STRUCTURAL_LOG_SHEET}!A1:ZZ")
        sheet_rows = sheet_get(f"{SHEET_NAME}!A2:I200")

        if len(matrix) < 2 or len(structural) < 2:
            return

        matrix_headers = matrix[0]
        latest_matrix = matrix[-1]

        structural_headers = structural[0]
        latest_structural = structural[-1]

        # ===== Build GAP map =====
        gap_map = {}

        for r in sheet_rows:
            if len(r) >= 3 and r[0]:
                gap_map[r[0].strip().upper()] = safe_float(r[2])

        dashboard_symbols = sheet_get(f"{DASHBOARD_SHEET}!A2:A200")

        state_output = []
        strength_output = []

        for row in dashboard_symbols:

            if not row:
                state_output.append([""])
                strength_output.append([""])
                continue

            symbol = row[0].strip().upper()

            # ===== MARKET STATE =====
            if symbol in matrix_headers:

                idx = matrix_headers.index(symbol)

                if idx < len(latest_matrix):
                    state = latest_matrix[idx]
                else:
                    state = "NEUTRAL"

            else:
                state = "NEUTRAL"

            state_output.append([state])

            # ===== STRUCTURAL =====
            delta_col = f"{symbol}_DELTA"
            accel_col = f"{symbol}_ACCEL"

            if delta_col in structural_headers and accel_col in structural_headers:

                d_idx = structural_headers.index(delta_col)
                a_idx = structural_headers.index(accel_col)

                delta = safe_float(latest_structural[d_idx]) if d_idx < len(latest_structural) else None
                accel = safe_float(latest_structural[a_idx]) if a_idx < len(latest_structural) else None
                gap = gap_map.get(symbol)

                if None not in (delta, accel, gap):

                    strength = round(
                        (abs(delta) * 0.6) +
                        (abs(accel) * 0.25) +
                        (abs(gap) * 0.15),
                        2
                    )

                else:
                    strength = ""

            else:
                strength = ""

            strength_output.append([strength])

        # ===== WRITE DASHBOARD =====
        sheet_update(
            f"{DASHBOARD_SHEET}!L2:L{len(state_output)+1}",
            state_output
        )

        sheet_update(
            f"{DASHBOARD_SHEET}!M2:M{len(strength_output)+1}",
            strength_output
        )

    except Exception as e:
        print("DASHBOARD PROJECTION ERROR:", e)
# ================= SNAPSHOT =================

def generate_snapshot(rows):

    headers = ["Symbol", "Gap_Score", "Gap_Bias", "Market_State", "Strength"]
    col_widths = [200, 120, 120, 300, 120]
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

    rows = sheet_get(f"{DASHBOARD_SHEET}!A2:M200")

    clean = []

    for r in rows:

        if len(r) >= 13 and r[0]:

            symbol = r[0]
            gap = r[2] if len(r) > 2 else ""
            bias = r[3] if len(r) > 3 else ""
            state = r[11] if len(r) > 11 else ""
            strength = r[12] if len(r) > 12 else ""

            # Only BUY or SELL
            if bias in ("BUY", "SELL"):
                clean.append([symbol, gap, bias, state, strength])

    if not clean:
        clean = [["NO SIGNALS", "", "", "", ""]]

    img = generate_snapshot(clean)

    try:

        with open(img, "rb") as f:

            response = requests.post(
                f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendPhoto",
                data={
                    "chat_id": TELEGRAM_CHAT_ID,
                    "caption": "🔥 PANDA DASHBOARD\n⏰ " + datetime.now().strftime("%Y-%m-%d %H:%M")
                },
                files={"photo": f},
                timeout=20
            )

        print("Telegram:", response.status_code, response.text)
        telegram_circuit.success()

    except Exception as e:

        print("Telegram ERROR:", e)
        telegram_circuit.failure()
# ================= SCHEDULER =================

ENGINE_LOCK = asyncio.Lock()

async def master_scheduler():

    global LAST_QUARTER_MARK, LAST_HOUR_MARK

    await asyncio.sleep(5)

    while True:
        try:
            now = datetime.now()

            # Run at minute 1, 16, 31, 46 (gives GAP bot time to update)
            if now.minute % 15 == 1 and now.second < 10:

                quarter_mark = now.replace(second=0, microsecond=0)

                if LAST_QUARTER_MARK != quarter_mark:

                    async with ENGINE_LOCK:
                        run_gap_once()
                        rebuild_trade_matrix()
                        rebuild_structural_log()
                        append_strength_row()
                        append_trade_event_row()
                        update_dashboard_projection()

                    LAST_QUARTER_MARK = quarter_mark

            # Hourly full sync + Telegram at minute 1
            if now.minute == 1 and now.second < 10:

                hour_mark = now.replace(minute=now.minute, second=0, microsecond=0)

                if LAST_HOUR_MARK != hour_mark:

                    async with ENGINE_LOCK:
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

        await asyncio.sleep(5)


@app.on_event("startup")
async def startup():
    asyncio.create_task(master_scheduler())

@app.get("/")
def home():
    return {"status": "PANDA FULL PRODUCTION ENGINE ACTIVE"}
@app.get("/force")
def force_run():
    run_gap_once()
    rebuild_trade_matrix()
    rebuild_structural_log()
    append_strength_row()
    append_trade_event_row()
    update_dashboard_projection()
    send_snapshot()
    return {"status": "Forced update + Telegram sent"}