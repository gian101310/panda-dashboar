"""
PANDA FOREX ENGINE - FULL PRODUCTION SERVER
Persistent SAFE LOCK + ALL RUN ENDPOINTS
"""

from fastapi import FastAPI, HTTPException
from google.oauth2.service_account import Credentials
from googleapiclient.discovery import build
import yfinance as yf
from collections import defaultdict
import traceback
import asyncio
import os
import re
import json

# ================= CONFIG =================

SPREADSHEET_ID = "10BPwSzcf4QtriHQVqaB159x36V3Voww8jXiXJ7WY0lE"
SHEET_NAME = "Sheet1"
CREDS_FILE = r"C:\Users\Admin\Desktop\ctrader_trend_scanner\service_account.json"
PANDA_PATH = r"C:\Users\Admin\AppData\Roaming\MetaQuotes\Terminal\Common\Files"
CACHE_FILE = "gap_cache.json"

SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]

STRONG_RATIO = 0.65
WEAK_RATIO = 0.40

app = FastAPI()

credentials = Credentials.from_service_account_file(
    CREDS_FILE, scopes=SCOPES
)
service = build("sheets", "v4", credentials=credentials)

# ================= CACHE =================

def load_cache():
    if not os.path.exists(CACHE_FILE):
        return {}
    try:
        with open(CACHE_FILE, "r") as f:
            return json.load(f)
    except:
        return {}

def save_cache(cache):
    try:
        with open(CACHE_FILE, "w") as f:
            json.dump(cache, f)
    except:
        pass

last_gap_cache = load_cache()

# ================= UTIL =================

def get_rows():
    res = service.spreadsheets().values().get(
        spreadsheetId=SPREADSHEET_ID,
        range=f"{SHEET_NAME}!A2:N100"
    ).execute()

    rows = res.get("values", [])

    for r in rows:
        while len(r) < 14:
            r.append("")

    return rows


def update_sheet(rows):
    service.spreadsheets().values().update(
        spreadsheetId=SPREADSHEET_ID,
        range=f"{SHEET_NAME}!A2:N{len(rows)+1}",
        valueInputOption="RAW",
        body={"values": rows}
    ).execute()

# ================= GAP SAFE LOCK =================

def read_gap(symbol):
    for f in os.listdir(PANDA_PATH):
        if not f.startswith("panda_"):
            continue
        if symbol.upper() not in f.upper():
            continue

        path = os.path.join(PANDA_PATH, f)

        try:
            text = open(path, "r", encoding="utf-8").read()
        except:
            return None

        match = re.search(r"gap\s*score\s*:\s*(-?\d+)", text, re.IGNORECASE)

        if match:
            return int(match.group(1))

    return None


def compute_gap_bias(gap):
    g = abs(gap)

    if g < 5:
        return "INVALID", "NONE", "INVALID"

    bias = "BUY" if gap > 0 else "SELL"
    execution = "MARKET" if g >= 9 else "PULLBACK"

    if g >= 10:
        confidence = "HIGH"
    elif g >= 8:
        confidence = "MEDIUM"
    else:
        confidence = "LOW"

    return bias, execution, confidence


async def gap_auto_sync():
    await asyncio.sleep(5)
    global last_gap_cache

    while True:
        try:
            symbols = service.spreadsheets().values().get(
                spreadsheetId=SPREADSHEET_ID,
                range=f"{SHEET_NAME}!A2:A100"
            ).execute().get("values", [])

            for i, r in enumerate(symbols):
                symbol = r[0].strip()
                row_index = i + 2

                new_gap = read_gap(symbol)
                if new_gap is None:
                    continue

                old_gap = last_gap_cache.get(symbol)
                if old_gap == new_gap:
                    continue

                bias, execution, confidence = compute_gap_bias(new_gap)

                service.spreadsheets().values().update(
                    spreadsheetId=SPREADSHEET_ID,
                    range=f"{SHEET_NAME}!O{row_index}:R{row_index}",
                    valueInputOption="RAW",
                    body={"values": [[new_gap, bias, execution, confidence]]}
                ).execute()

                last_gap_cache[symbol] = new_gap
                save_cache(last_gap_cache)

                print(f"UPDATED {symbol} → {new_gap}")

        except Exception as e:
            print("GAP SYNC ERROR:", e)

        await asyncio.sleep(10)

@app.on_event("startup")
async def startup_event():
    print("Loaded GAP cache:", last_gap_cache)
    asyncio.create_task(gap_auto_sync())

# ================= STEP 2 (COT) =================

@app.get("/run_cot")
def run_cot():
    try:
        rows = get_rows()
        currency_scores = defaultdict(int)

        for r in rows:
            symbol = r[0]

            df = yf.download(f"{symbol}=X", period="5d", interval="1d", progress=False)
            if df is None or df.empty:
                continue

            if hasattr(df.columns, "levels"):
                df.columns = [c[0] if isinstance(c, tuple) else c for c in df.columns]

            last = df.iloc[-1]
            o = float(last["Open"])
            c = float(last["Close"])

            base, quote = symbol[:3], symbol[3:6]

            if c > o:
                currency_scores[base] += 1
                currency_scores[quote] -= 1
            elif c < o:
                currency_scores[base] -= 1
                currency_scores[quote] += 1

        for i, r in enumerate(rows):
            symbol = r[0]
            base, quote = symbol[:3], symbol[3:6]

            bs = currency_scores.get(base, 0)
            qs = currency_scores.get(quote, 0)

            rows[i][6] = bs
            rows[i][7] = qs

            diff = bs - qs
            rows[i][8] = "BULLISH" if diff >= 3 else \
                         "BEARISH" if diff <= -3 else "NEUTRAL"

        update_sheet(rows)
        return {"status": "STEP 2 DONE"}

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

# ================= STEP 3 (TRENDS) =================

def fetch_tf_candle(symbol, interval):
    df = yf.download(f"{symbol}=X", period="10d", interval=interval, progress=False)

    if df is None or df.empty:
        return None

    if hasattr(df.columns, "levels"):
        df.columns = [c[0] if isinstance(c, tuple) else c for c in df.columns]

    last = df.iloc[-1]

    return (
        float(last["Open"]),
        float(last["High"]),
        float(last["Low"]),
        float(last["Close"])
    )

def classify_candle(o, h, l, c):
    rng = h - l
    if rng <= 0:
        return "RANGE"

    body = abs(c - o)
    ratio = body / rng

    if ratio < WEAK_RATIO:
        return "RANGE"

    direction = "UP" if c > o else "DOWN"
    return f"RALLY_{'STRONG' if ratio >= STRONG_RATIO else 'WEAK'}_{direction}"

@app.get("/run_trends")
def run_trends():
    try:
        rows = get_rows()

        for i, r in enumerate(rows):
            symbol = r[0]

            d1 = fetch_tf_candle(symbol, "1d")
            h4 = fetch_tf_candle(symbol, "4h")
            h1 = fetch_tf_candle(symbol, "1h")

            if d1:
                rows[i][2] = classify_candle(*d1)
            if h4:
                rows[i][3] = classify_candle(*h4)
            if h1:
                rows[i][4] = classify_candle(*h1)

        update_sheet(rows)
        return {"status": "STEP 3 DONE"}

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

# ================= STEP 4 (FILTER) =================

def norm(t):
    if "UP" in t:
        return "UP"
    if "DOWN" in t:
        return "DOWN"
    return "RANGE"

@app.get("/run_filter")
def run_filter():
    try:
        rows = get_rows()

        for i, r in enumerate(rows):
            bias = r[1]
            d1 = norm(r[2])
            h4 = norm(r[3])
            h1 = norm(r[4])
            cot = r[8]

            market = "RANGING"
            result = "BLOCKED"
            exec_type = "NONE"

            if d1 == "RANGE":
                pass
            elif bias.startswith("BUY") and cot != "BULLISH":
                pass
            elif bias.startswith("SELL") and cot != "BEARISH":
                pass
            elif bias.startswith("BUY") and d1 == "DOWN":
                pass
            elif bias.startswith("SELL") and d1 == "UP":
                pass
            else:
                if d1 == h4:
                    market = "BUY" if d1 == "UP" else "SELL"
                    if "WEAK" in bias or h1 == "RANGE":
                        result = "PARTIAL"
                    else:
                        result = "ALIGNED"
                        exec_type = "MARKET"
                else:
                    if "WEAK" not in bias and h1 == d1:
                        result = "PARTIAL"
                        exec_type = "PULLBACK"

            rows[i][5] = market
            rows[i][9] = result
            rows[i][10] = exec_type

        update_sheet(rows)
        return {"status": "STEP 4 DONE"}

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

# ================= STEP 6 (UPGRADE) =================

@app.get("/upgrade_minimal")
def upgrade_minimal():
    try:
        rows = get_rows()

        for i, r in enumerate(rows):
            cot_base = float(r[6]) if r[6] != "" else 0
            cot_quote = float(r[7]) if r[7] != "" else 0
            total_strength = abs(cot_base) + abs(cot_quote)

            d1 = r[2]
            h4 = r[3]
            execution = r[10]

            if "UP" in d1 and "UP" in h4:
                bot_bias = "BUY"
            elif "DOWN" in d1 and "DOWN" in h4:
                bot_bias = "SELL"
            elif "UP" in d1:
                bot_bias = "BUY_WEAK"
            elif "DOWN" in d1:
                bot_bias = "SELL_WEAK"
            else:
                bot_bias = "NO_TRADE"

            score = 0
            if "UP" in d1 or "DOWN" in d1:
                score += 1
            if d1 == h4 and "RANGE" not in d1:
                score += 1
            if execution == "MARKET":
                score += 1
            if total_strength >= 9:
                score += 1

            rows[i][11] = total_strength
            rows[i][12] = bot_bias
            rows[i][13] = score

        update_sheet(rows)
        return {"status": "STEP 6 DONE"}

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

# ================= ROOT =================

@app.get("/")
def home():
    return {"status": "PANDA FULL SERVER ACTIVE"}
