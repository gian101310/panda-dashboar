"""
FINAL SYSTEM + EXECUTION TYPE
- STEP 2: Currency Strength (COT-like)
- STEP 3: Candle Structure Trends
- STEP 4: Pullback Regime Filter
- STEP 5: Execution_Type labeling
"""

from fastapi import FastAPI, HTTPException
from google.oauth2.service_account import Credentials
from googleapiclient.discovery import build
import yfinance as yf
from collections import defaultdict
import traceback

# ================= CONFIG =================

SPREADSHEET_ID = "10BPwSzcf4QtriHQVqaB159x36V3Voww8jXiXJ7WY0lE"
SHEET_NAME = "Sheet1"
CREDS_FILE = r"C:\Users\Admin\Desktop\ctrader_trend_scanner\service_account.json"
SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]

WRITE_COT_RANGE = "G2:I"
WRITE_TREND_RANGE = "C2:E"
WRITE_FILTER_RANGE = "F2:K"  # now includes Execution_Type

STRONG_RATIO = 0.65
WEAK_RATIO = 0.40

# =========================================

app = FastAPI()

credentials = Credentials.from_service_account_file(
    CREDS_FILE, scopes=SCOPES
)
service = build("sheets", "v4", credentials=credentials)


def get_rows():
    res = service.spreadsheets().values().get(
        spreadsheetId=SPREADSHEET_ID,
        range=f"{SHEET_NAME}!A2:K"
    ).execute()
    return res.get("values", [])


# ================= STEP 2 =================

def fetch_d1_candle(symbol):
    df = yf.download(f"{symbol}=X", period="5d", interval="1d", progress=False)
    if df is None or df.empty:
        return None
    if hasattr(df.columns, "levels"):
        df.columns = [c[0] if isinstance(c, tuple) else c for c in df.columns]
    last = df.iloc[-1]
    try:
        return float(last["Open"]), float(last["Close"])
    except Exception:
        return None


def cot_state(score):
    if score >= 3:
        return "BULLISH"
    if score <= -3:
        return "BEARISH"
    return "NEUTRAL"


@app.get("/run_cot")
def run_cot():
    try:
        rows = get_rows()
        currency_scores = defaultdict(int)

        for r in rows:
            symbol = r[0]
            base, quote = symbol[:3], symbol[3:6]
            candle = fetch_d1_candle(symbol)
            if not candle:
                continue
            o, c = candle
            if c > o:
                currency_scores[base] += 1
                currency_scores[quote] -= 1
            elif c < o:
                currency_scores[base] -= 1
                currency_scores[quote] += 1

        output = []
        for r in rows:
            symbol = r[0]
            base, quote = symbol[:3], symbol[3:6]
            bs = currency_scores.get(base, 0)
            qs = currency_scores.get(quote, 0)
            output.append([bs, qs, cot_state(bs - qs)])

        service.spreadsheets().values().update(
            spreadsheetId=SPREADSHEET_ID,
            range=f"{SHEET_NAME}!{WRITE_COT_RANGE}",
            valueInputOption="RAW",
            body={"values": output}
        ).execute()

        return {"status": "STEP 2 DONE"}

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# ================= STEP 3 =================

def fetch_tf_candle(symbol, interval):
    df = yf.download(f"{symbol}=X", period="10d", interval=interval, progress=False)
    if df is None or df.empty:
        return None
    if hasattr(df.columns, "levels"):
        df.columns = [c[0] if isinstance(c, tuple) else c for c in df.columns]
    last = df.iloc[-1]
    try:
        return float(last["Open"]), float(last["High"]), float(last["Low"]), float(last["Close"])
    except Exception:
        return None


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
        out = []
        for r in rows:
            symbol = r[0]
            d1 = classify_candle(*fetch_tf_candle(symbol, "1d"))
            h4 = classify_candle(*fetch_tf_candle(symbol, "4h"))
            h1 = classify_candle(*fetch_tf_candle(symbol, "1h"))
            out.append([d1, h4, h1])

        service.spreadsheets().values().update(
            spreadsheetId=SPREADSHEET_ID,
            range=f"{SHEET_NAME}!{WRITE_TREND_RANGE}",
            valueInputOption="RAW",
            body={"values": out}
        ).execute()

        return {"status": "STEP 3 DONE"}

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# ================= STEP 4 + EXECUTION TYPE =================

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
        output = []

        for r in rows:
            symbol, bias = r[0], r[1]
            d1, h4, h1 = norm(r[2]), norm(r[3]), norm(r[4])
            cot = r[8]

            market = "RANGING"
            result = "BLOCKED"
            exec_type = "NONE"

            # HARD BLOCKS
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
                # REGIME LOGIC
                if d1 == h4:
                    market = "BUY" if d1 == "UP" else "SELL"
                    if "WEAK" in bias or h1 == "RANGE":
                        result = "PARTIAL"
                    else:
                        result = "ALIGNED"
                        exec_type = "MARKET"
                else:
                    # PULLBACK REGIME
                    market = "RANGING"
                    if "WEAK" not in bias and h1 == d1:
                        result = "PARTIAL"
                        exec_type = "PULLBACK"
                    else:
                        result = "BLOCKED"

            output.append([market, "", "", "", result, exec_type])

        service.spreadsheets().values().update(
            spreadsheetId=SPREADSHEET_ID,
            range=f"{SHEET_NAME}!{WRITE_FILTER_RANGE}",
            valueInputOption="RAW",
            body={"values": output}
        ).execute()

        return {"status": "STEP 4 + EXECUTION TYPE DONE"}

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
