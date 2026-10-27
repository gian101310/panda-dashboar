"""
PANDA FOREX ENGINE v3.0
========================
MAJOR CHANGE: Removed cBot dependency.
app.py now reads mt4_SYMBOL.txt directly and does ALL scoring:
  - Parses BASE/QUOTE currency TF scores (D1/H4/H1)
  - Parses ADV scores
  - Computes GAP SCORE, BIAS, HARD_INVALID, EXECUTION, CONFIDENCE
  - Reads ATR, SPREAD, BOX levels
  - Pushes all rich data to Supabase

panda_SYMBOL.txt is no longer needed.
cBot (PandaEngineMaster.cs) is now retired.
"""

import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')
import socket
socket.setdefaulttimeout(30)

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import html
import math
import os
import re
import requests
import time
import threading
import textwrap
from datetime import datetime, timezone, timedelta
from PIL import Image, ImageDraw, ImageFont
from dotenv import load_dotenv
from supabase import create_client
from news_results import resolve_news_actual, load_sent_results, mark_result_sent
from news_speeches import is_fed_chair_speech, resolve_speech_summary, speech_api_key
from lib.signal_alerts import RecoveryGate, consolidate_candidates, classify_gap_move
from lib.signal_alert_outbox import enqueue_alert, dispatch_pending
from lib.signal_price_levels import assess_price_levels, related_h4_breadth, summarize_nearby_levels

load_dotenv()

app = FastAPI()

def _env_float(name, default):
    try:
        return float(os.environ.get(name, str(default)) or default)
    except Exception:
        return default

def _env_int(name, default):
    try:
        return int(os.environ.get(name, str(default)) or default)
    except Exception:
        return default

# ================= CORS =================
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://pandaengine.app",
        "https://www.pandaengine.app",
        "https://panda-dashboard.vercel.app",
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ================= CONFIG =================
MT4_PATH              = os.environ.get("MT4_PATH", r"C:\Users\Admin\AppData\Roaming\MetaQuotes\Terminal\Common\Files")
TELEGRAM_TOKEN        = os.environ.get("TELEGRAM_TOKEN", "")
TELEGRAM_CHAT_ID      = os.environ.get("TELEGRAM_CHAT_ID", "")
# Health/ops alerts should go to a separate reports group, not the live signal room.
ENGINE_HEALTH_CHAT_ID = os.environ.get("ENGINE_HEALTH_CHAT_ID", TELEGRAM_CHAT_ID)
# Dedicated signals bot — sends only actionable alerts (early entry, spike, gap).
# Falls back to main bot if not configured.
SIGNAL_BOT_TOKEN      = os.environ.get("SIGNAL_BOT_TOKEN", TELEGRAM_TOKEN)
SIGNAL_CHAT_ID        = os.environ.get("SIGNAL_CHAT_ID", TELEGRAM_CHAT_ID)
SUPABASE_URL          = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY          = os.environ.get("SUPABASE_SERVICE_KEY", "")
MAX_FILE_AGE_SECONDS  = 300   # 5 mins — mt4 files update every ~2 mins
TRACK_SIGNAL_RESULTS  = os.environ.get("PANDA_TRACK_SIGNAL_RESULTS", "0").lower() in ("1", "true", "yes", "on")
TRACK_SHADOW_RESULTS  = os.environ.get("PANDA_TRACK_SHADOW_RESULTS", "0").lower() in ("1", "true", "yes", "on")

LOGIN_ALERT_BOT_TOKEN = os.environ.get("LOGIN_ALERT_BOT_TOKEN", "")
LOGIN_ALERT_CHAT_ID   = os.environ.get("LOGIN_ALERT_CHAT_ID", "")
ENGINE_SECRET         = os.environ.get("ENGINE_SECRET", "")
TWELVEDATA_API_KEY    = os.environ.get("TWELVEDATA_API_KEY", "")
GOLD_SYMBOL           = os.environ.get("PANDA_GOLD_SYMBOL", "XAUUSD").upper()
GOLD_TD_SYMBOL        = os.environ.get("PANDA_GOLD_TD_SYMBOL", "XAU/USD")
GOLD_INTERVAL         = os.environ.get("PANDA_GOLD_INTERVAL", "1h")
GOLD_ST_FACTOR        = _env_float("PANDA_GOLD_ST_FACTOR", 3.0)
GOLD_ST_ATR           = _env_int("PANDA_GOLD_ST_ATR", 10)
GOLD_USD_THRESHOLD    = _env_int("PANDA_GOLD_USD_THRESHOLD", 4)
GOLD_USD_QUORUM       = _env_int("PANDA_GOLD_USD_QUORUM", 18)
GOLD_BLOCK_OFFLINE    = os.environ.get("PANDA_GOLD_BLOCK_OFFLINE", "0").lower() in ("1", "true", "yes", "on")
GOLD_SIGNAL_MARK_FILE = os.environ.get("PANDA_GOLD_SIGNAL_MARK_FILE", os.path.join(MT4_PATH, "panda_gold_signal_mark.txt"))

# ---- OpenAI (AI Insights) ----
OPENAI_API_KEY        = os.environ.get("OPENAI_API_KEY", "")
SNAPSHOT_HOUR_MARK_FILE = os.environ.get(
    "PANDA_SNAPSHOT_MARK_FILE",
    os.path.join(MT4_PATH, "panda_snapshot_hour.txt"),
)
MARKET_DESK_DAY_MARK_FILE = os.environ.get(
    "PANDA_MARKET_DESK_MARK_FILE",
    os.path.join(MT4_PATH, "panda_market_desk_week.txt"),
)

PAIRS = [
    "AUDJPY","AUDCAD","AUDNZD","AUDUSD","CADJPY",
    "EURAUD","EURCAD","EURGBP","EURJPY","EURNZD","EURUSD",
    "GBPAUD","GBPCAD","GBPJPY","GBPNZD","GBPUSD",
    "NZDCAD","NZDJPY","NZDUSD","USDCAD","USDJPY",
]

LAST_QUARTER_MARK = None
LAST_HOUR_MARK    = None
LAST_HOUR_ATTEMPT = None
LAST_MARKET_DESK_DAY = None
LAST_NEWS_MARK    = None
PREV_MOMENTUM     = {}
PREV_GAP          = {}
PREV_BIAS         = {}
PREV_LEVEL_PRICE  = {}  # last fresh Panda Lines sample; Signal context only
PREV_GAP_INITIALIZED = False
PREV_ZONE         = {}   # pair -> last TBG_ZONE (ABOVE/BELOW); drives Panda Lines FLIP alerts
LAST_BOS_T        = {}   # pair -> last seen TBG_BOS_T (unix); first sighting seeds silently, never alerts on boot

# ---- News alert state ----
NEWS_ALERTED      = set()   # event keys already alerted this week — prevents duplicates
NEWS_CACHE        = {"data": [], "fetched_at": None}   # 30-min in-memory cache
NEWS_CACHE_TTL    = 1800    # seconds
NEWS_ALERT_THRESHOLDS = (
    (2, "2M", "2 MIN"),
    (15, "15M", "15 MIN"),
    (60, "1H", "1 HOUR"),
    (120, "2H", "2 HOURS"),
    (180, "3H", "3 HOURS"),
    (240, "4H", "4 HOURS"),
)
NEWS_RESULT_WINDOW_MINUTES = 24 * 60  # recover missed results after downtime

# ---- Currency → pairs mapping for news alert ----
CURRENCY_TO_PAIRS = {
    "USD": ["EURUSD","GBPUSD","AUDUSD","NZDUSD","USDCAD","USDJPY"],
    "EUR": ["EURUSD","EURJPY","EURGBP","EURAUD","EURCAD","EURNZD"],
    "GBP": ["GBPUSD","GBPJPY","GBPAUD","GBPCAD","GBPNZD","EURGBP"],
    "JPY": ["USDJPY","EURJPY","GBPJPY","AUDJPY","CADJPY","NZDJPY"],
    "AUD": ["AUDUSD","AUDJPY","AUDCAD","AUDNZD","EURAUD","GBPAUD"],
    "CAD": ["USDCAD","CADJPY","EURCAD","GBPCAD","AUDCAD","NZDCAD"],
    "NZD": ["NZDUSD","NZDJPY","NZDCAD","AUDNZD","EURNZD","GBPNZD"],
}

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# ================= SUPABASE RETRY WRAPPER =================
def supabase_retry(fn, retries=3, delay=2, label=""):
    """Retry a Supabase operation with exponential backoff for transient 522/timeout errors."""
    for attempt in range(retries):
        try:
            return fn()
        except Exception as e:
            err_str = str(e)
            is_transient = any(k in err_str for k in ("522", "timeout", "timed out", "ConnectionError", "ConnectionReset"))
            if is_transient and attempt < retries - 1:
                wait = delay * (2 ** attempt)
                print(f"[SUPABASE RETRY] {label} attempt {attempt+1}/{retries} failed: {e}. Retrying in {wait}s...")
                time.sleep(wait)
            else:
                raise

# ================= TELEGRAM CIRCUIT BREAKER =================
class TelegramCircuitBreaker:
    def __init__(self):
        self.failures   = 0
        self.locked_until = 0
        self._lock      = threading.Lock()

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
            if self.failures >= 5:
                self.locked_until = time.time() + 120
                print("[TELEGRAM COOLDOWN] 120s")
                self.failures = 0

telegram_circuit = TelegramCircuitBreaker()

# ================= ALERT & HEAL STATE =================
SIGNAL_RECOVERY = RecoveryGate()
PL_RECOVERY = RecoveryGate()
CONSECUTIVE_STALE = 0      # counter for auto-heal
DUBAI_TZ = timezone(timedelta(hours=4))

# ================= UTILS =================
def safe_float(v):
    try: return float(v)
    except: return None

def _as_utc(now_utc=None):
    if now_utc is None:
        return datetime.now(timezone.utc)
    if now_utc.tzinfo is None:
        return now_utc.replace(tzinfo=timezone.utc)
    return now_utc.astimezone(timezone.utc)

def market_time_label(now_utc=None):
    utc_now = _as_utc(now_utc)
    dubai_now = utc_now.astimezone(DUBAI_TZ)
    return f"{dubai_now.strftime('%A %H:%M')} Dubai / {utc_now.strftime('%A %H:%M')} UTC"

def is_market_closed(now_utc=None):
    """
    Weekly quiet window:
    - Last allowed cycle is Saturday 00:00 Dubai (Friday 20:00 UTC) minute.
    - Alerts stay quiet until Monday 02:00 Dubai (Sunday 22:00 UTC).
    """
    dubai_now = _as_utc(now_utc).astimezone(DUBAI_TZ)
    day = dubai_now.weekday()  # 0=Mon, 6=Sun
    hour = dubai_now.hour
    minute = dubai_now.minute

    if day == 5:  # Saturday
        return hour > 0 or minute > 0
    if day == 6:  # Sunday
        return True
    if day == 0 and hour < 2:  # Monday before forex reopen
        return True
    return False

def get_session():
    """Return current forex session based on UTC hour.
    ASIAN:    22:00-05:59 UTC  (Tokyo/Sydney)
    LONDON:   06:00-13:59 UTC
    NEW_YORK: 14:00-21:59 UTC
    Matches session labels used in ai_memory / Journal Agent.
    """
    h = datetime.utcnow().hour
    if h >= 22 or h < 6:  return "ASIAN"
    if h < 14:             return "LONDON"
    return "NEW_YORK"

# ================= MT4 FILE PARSER (reads mt4_SYMBOL.txt) =================

def parse_tf_score(s):
    """Display the dominant split component (+3/-1 -> +3), never its net sum.

    Equal opposing magnitudes display zero, matching strongest-score tie handling.
    Raw lines remain intact for the locked scorer's separate conflict checks.
    """
    values = []
    for part in s.strip().split("/"):
        try: values.append(int(part.strip()))
        except ValueError: pass
    positive = max((v for v in values if v > 0), default=0)
    negative = min((v for v in values if v < 0), default=0)
    if positive == -negative:
        return 0
    return positive if positive > -negative else negative

def parse_mt4_file(symbol, _incomplete_attempt=0):
    """
    Reads mt4_SYMBOL.txt from MetaQuotes Common Files.
    Returns dict with all parsed fields or None if file missing/stale.

    KEY: also stores raw_base_line / raw_quote_line for accurate scoring.
    extract_panda_score MUST run on raw lines to correctly handle split
    values like '+2/-1' (which must be treated as two separate values,
    NOT summed). The stored base_d1/h4/h1 ints are for display only.
    """
    path = os.path.join(MT4_PATH, f"mt4_{symbol.lower()}.txt")
    if not os.path.exists(path):
        return None
    file_age = time.time() - os.path.getmtime(path)
    # Allow stale files during the weekly quiet window to prevent false "21 stale" alerts.
    max_age = 259200 if is_market_closed() else MAX_FILE_AGE_SECONDS  # 72h weekend, 5min weekday
    if file_age > max_age:
        print(f"[STALE] {symbol} age={int(file_age)}s")
        return None
    lines = None
    max_retries = 6
    for attempt in range(max_retries):
        try:
            with open(path, "r", encoding="utf-8") as f:
                lines = f.readlines()
            break
        except PermissionError:
            if attempt < max_retries - 1:
                wait = 0.3 * (2 ** attempt)  # 0.3, 0.6, 1.2, 2.4, 4.8s
                print(f"[LOCK] {symbol}: attempt {attempt+1}/{max_retries}, retry in {wait:.1f}s")
                time.sleep(wait)
            else:
                total_wait = sum(0.3 * (2 ** i) for i in range(max_retries - 1))
                print(f"[READ ERROR] {symbol}: file locked after {max_retries} retries ({total_wait:.1f}s total)")
                return None
        except Exception as e:
            print(f"[READ ERROR] {symbol}: {e}")
            return None

    result = {
        "symbol": symbol,
        # Raw lines for scoring (MUST use these, not reconstructed lines)
        "raw_base_line":  "",
        "raw_quote_line": "",
        # Parsed values for display / Supabase storage
        "base_cur": None,  "base_d1": 0,  "base_h4": 0,  "base_h1": 0,
        "quote_cur": None, "quote_d1": 0, "quote_h4": 0, "quote_h1": 0,
        "adv_base_d1": 0,  "adv_base_h4": 0,  "adv_base_h1": 0,
        "adv_quote_d1": 0, "adv_quote_h4": 0, "adv_quote_h1": 0,
        "atr_current": None, "atr_reference": None,
        "spread": None, "boxes": [],
    }
    base_set = quote_set = False

    for line in lines:
        line = line.strip()
        if not line:
            continue

        # ADV lines — must check before normal currency lines
        adv_m = re.match(
            r"^ADV\s*:\s*([A-Z]{3})\s*:?[ \t]*D1\s*:\s*([+\-\d/]+)\s*(?:\|\s*)?H4\s*:\s*([+\-\d/]+)\s*(?:\|\s*)?H1\s*:\s*([+\-\d/]+)",
            line
        )
        if adv_m:
            cur = adv_m.group(1)
            d1  = parse_tf_score(adv_m.group(2))
            h4  = parse_tf_score(adv_m.group(3))
            h1  = parse_tf_score(adv_m.group(4))
            if result["base_cur"] and cur == result["base_cur"]:
                result.update({"adv_base_d1": d1, "adv_base_h4": h4, "adv_base_h1": h1})
            elif result["quote_cur"] and cur == result["quote_cur"]:
                result.update({"adv_quote_d1": d1, "adv_quote_h4": h4, "adv_quote_h1": h1})
            continue

        # Currency score lines (BASE then QUOTE)
        cur_m = re.match(
            r"^\s*([A-Z]{3})\s*:?[ \t]*D1\s*:\s*([+\-\d/]+)\s*(?:\|\s*)?H4\s*:\s*([+\-\d/]+)\s*(?:\|\s*)?H1\s*:\s*([+\-\d/]+)",
            line
        )
        if cur_m:
            cur = cur_m.group(1)
            d1  = parse_tf_score(cur_m.group(2))
            h4  = parse_tf_score(cur_m.group(3))
            h1  = parse_tf_score(cur_m.group(4))
            if not base_set:
                result.update({"base_cur": cur, "base_d1": d1, "base_h4": h4, "base_h1": h1,
                                "raw_base_line": line})
                base_set = True
            elif not quote_set:
                result.update({"quote_cur": cur, "quote_d1": d1, "quote_h4": h4, "quote_h1": h1,
                                "raw_quote_line": line})
                quote_set = True
            continue

        # ATR line: 'ATR : 942 : 1679 Points.'
        atr_m = re.match(r"^ATR\s*:\s*([\d.]+)\s*:\s*([\d.]+)\s*Points", line)
        if atr_m:
            result.update({"atr_current": safe_float(atr_m.group(1)), "atr_reference": safe_float(atr_m.group(2))})
            continue

        # SPREAD line: 'SPREAD : 24 Points.'
        sp_m = re.match(r"^SPREAD\s*:\s*([\d.]+)\s*Points", line)
        if sp_m:
            result["spread"] = safe_float(sp_m.group(1))
            continue

        # BOX lines: 'BOX|WagBox1|1772409600|1.17959|1773619200|1.14107'
        if line.startswith("BOX|"):
            parts = line.split("|")
            if len(parts) >= 6:
                result["boxes"].append({
                    "name":        parts[1],
                    "start_ts":    safe_float(parts[2]),
                    "open_price":  safe_float(parts[3].strip()),
                    "end_ts":      safe_float(parts[4]),
                    "close_price": safe_float(parts[5].strip()),
                })

    if base_set and quote_set:
        return result

    # MT4 writes this file in place. A read can succeed while the file contains
    # only its first currency line, so retry incomplete content just like a lock.
    if _incomplete_attempt < max_retries - 1:
        wait = 0.3 * (2 ** _incomplete_attempt)
        print(f"[INCOMPLETE] {symbol}: retry {_incomplete_attempt + 1}/{max_retries} in {wait:.1f}s")
        time.sleep(wait)
        return parse_mt4_file(symbol, _incomplete_attempt + 1)

    print(f"[READ ERROR] {symbol}: incomplete MT4 data after {max_retries} retries")
    return None


# ================= PL FILE PARSER (reads tbg_SYMBOL.txt) =================
def parse_pl_file(symbol):
    """
    Reads tbg_SYMBOL.txt written by TBG/Panda Lines indicator.
    Returns dict with pl_st, pl_fl, pl_bias, pl_zone, pl_g1_valid
    or None if file missing/stale.

    File format (cBot output — names kept for compatibility):
      TBG_ST   : 1.98450
      TBG_FL   : 1.97800
      TBG_BIAS : BUY
      TBG_ZONE : ABOVE      (ABOVE / BELOW / BETWEEN)
      TBG_G1   : VALID      (VALID / INVALID)
      TBG_PRICE: 1.98650
    """
    path = os.path.join(MT4_PATH, f"tbg_{symbol.upper()}.txt")
    if not os.path.exists(path):
        return None
    file_age = time.time() - os.path.getmtime(path)
    if file_age > 345600:  # pl files stale after 4 days (covers weekends + Monday morning)
        return None
    try:
        result = {
            "pl_st": None, "pl_fl": None, "pl_price": None,
            "pl_bias": None, "pl_zone": None, "pl_g1_valid": None,
            "pl_bos": None, "pl_bos_t": None,   # Break of Structure (H1): dir + break-bar unix time
            "pdh": None, "pdl": None, "pwh": None, "pwl": None,
            "pmh": None, "pml": None, "pyh": None, "pyl": None,
            # v2 exporter price context (optional — absent with v1 exporter)
            "pdo": None, "pdc": None, "prh": None, "prl": None,
            "dayo": None, "dayh": None,
            "dayl": None, "adr_d1": None, "h1r6": None,
        }
        raw_lines = None
        max_retries = 6
        for attempt in range(max_retries):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    raw_lines = f.readlines()
                break
            except PermissionError:
                if attempt < max_retries - 1:
                    wait = 0.3 * (2 ** attempt)
                    print(f"[PL LOCK] {symbol}: attempt {attempt+1}/{max_retries}, retry in {wait:.1f}s")
                    time.sleep(wait)
                else:
                    print(f"[PL READ ERROR] {symbol}: file locked after {max_retries} retries")
                    return None
        if raw_lines is None:
            return None
        for line in raw_lines:
                line = line.strip()
                if line.startswith("TBG_ST"):
                    result["pl_st"] = safe_float(line.split(":")[-1].strip())
                elif line.startswith("TBG_FL"):
                    result["pl_fl"] = safe_float(line.split(":")[-1].strip())
                elif line.startswith("TBG_BIAS"):
                    result["pl_bias"] = line.split(":")[-1].strip()
                elif line.startswith("TBG_ZONE"):
                    result["pl_zone"] = line.split(":")[-1].strip()
                elif line.startswith("TBG_G1"):
                    result["pl_g1_valid"] = line.split(":")[-1].strip() == "VALID"
                elif line.startswith("TBG_PRICE"):
                    result["pl_price"] = safe_float(line.split(":")[-1].strip())
                # Break of Structure (H1) — TBG_BOS_T MUST be tested before TBG_BOS (prefix overlap)
                elif line.startswith("TBG_BOS_T"):
                    try:
                        result["pl_bos_t"] = int(line.split(":", 1)[1].strip())
                    except Exception:
                        result["pl_bos_t"] = 0
                elif line.startswith("TBG_BOS"):
                    result["pl_bos"] = line.split(":", 1)[1].strip()   # BULLISH / BEARISH / NONE
                # S/R levels from Panda Lines
                elif line.startswith("PDH"):
                    result["pdh"] = safe_float(line.split(":")[-1].strip())
                elif line.startswith("PDL"):
                    result["pdl"] = safe_float(line.split(":")[-1].strip())
                elif line.startswith("PWH"):
                    result["pwh"] = safe_float(line.split(":")[-1].strip())
                elif line.startswith("PWL"):
                    result["pwl"] = safe_float(line.split(":")[-1].strip())
                elif line.startswith("PMH"):
                    result["pmh"] = safe_float(line.split(":")[-1].strip())
                elif line.startswith("PML"):
                    result["pml"] = safe_float(line.split(":")[-1].strip())
                elif line.startswith("PYH"):
                    result["pyh"] = safe_float(line.split(":")[-1].strip())
                elif line.startswith("PYL"):
                    result["pyl"] = safe_float(line.split(":")[-1].strip())
                # v2 exporter price context
                elif line.startswith("PDO"):
                    result["pdo"] = safe_float(line.split(":")[-1].strip())
                elif line.startswith("PDC"):
                    result["pdc"] = safe_float(line.split(":")[-1].strip())
                elif line.startswith("PRH"):
                    result["prh"] = safe_float(line.split(":")[-1].strip())
                elif line.startswith("PRL"):
                    result["prl"] = safe_float(line.split(":")[-1].strip())
                elif line.startswith("DAYO"):
                    result["dayo"] = safe_float(line.split(":")[-1].strip())
                elif line.startswith("DAYH"):
                    result["dayh"] = safe_float(line.split(":")[-1].strip())
                elif line.startswith("DAYL"):
                    result["dayl"] = safe_float(line.split(":")[-1].strip())
                elif line.startswith("ADR"):
                    result["adr_d1"] = safe_float(line.split(":")[-1].strip())
                elif line.startswith("H1R6"):
                    result["h1r6"] = safe_float(line.split(":")[-1].strip())
        return result if result["pl_zone"] else None
    except Exception as e:
        print(f"[PL PARSE ERROR] {symbol}: {e}")
        return None


# ================= BOX TREND DETECTION =================
def compute_box_trends(boxes):
    """
    Given the list of box dicts from parse_mt4_file, returns
    (h1_trend, h4_trend) using the 50% midpoint rule.

    Boxes sorted by time span:
      shortest span (~2d)  = H1 context (most recent activity)
      medium span  (~14d)  = H4 context (weekly structure)
      longest span (~62d)  = D1 context (monthly structure)

    H1 trend = midbox(14d) as former vs midbox(2d) as latter
    H4 trend = midbox(62d) as former vs midbox(14d) as latter
    """
    if not boxes or len(boxes) < 2:
        return "UNKNOWN", "UNKNOWN"

    valid = [b for b in boxes if b.get("start_ts") is not None and b.get("open_price") is not None and b.get("close_price") is not None]
    if len(valid) < 2:
        return "UNKNOWN", "UNKNOWN"

    def mid(b):
        return (b["open_price"] + b["close_price"]) / 2

    def span(b):
        return (b["end_ts"] or 0) - (b["start_ts"] or 0)

    def trend(former, latter):
        f_hi = max(former["open_price"], former["close_price"])
        f_lo = min(former["open_price"], former["close_price"])
        l_mid = mid(latter)
        if l_mid >= f_hi:   return "UPTREND"
        elif l_mid <= f_lo: return "DOWNTREND"
        else:               return "RANGING"

    # Sort by span ascending: shortest=H1, medium=H4, longest=D1
    by_span = sorted(valid, key=span)

    if len(by_span) >= 3:
        box_h1_ctx = by_span[0]   # ~2d  — H1 level
        box_h4_ctx = by_span[1]   # ~14d — H4 level
        box_d1_ctx = by_span[2]   # ~62d — D1 level
        h1_trend = trend(box_h4_ctx, box_h1_ctx)   # H4 former, H1 latter
        h4_trend = trend(box_d1_ctx, box_h4_ctx)   # D1 former, H4 latter
    else:
        # Only 2 boxes — use time order
        by_time = sorted(valid, key=lambda b: b["start_ts"])
        h1_trend = trend(by_time[0], by_time[1])
        h4_trend = "UNKNOWN"

    return h1_trend, h4_trend

# ================= SCORING ENGINE (exact match to PandaEngineMaster.cs) =================

def extract_panda_score(line):
    """
    Exact replica of ExtractPandaScore() from PandaEngineMaster.cs.
    WAGFX Playbook: Only +-4,+-5,+-6 are EXTREME (significant).
    +-1,+-2,+-3 are NEUTRAL and do NOT trigger HARD_INVALID.
    Any value >= 4 = significant pos, <= -4 = significant neg.
    Both sides present = HARD_INVALID.
    Returns (strongest_score, is_invalid).
    """
    if line.strip().startswith("ADV"):
        return 0, False

    matches = re.findall(r"(D1|H4|H1)\s*:\s*([+-]?\d+)(?:/([+-]?\d+))?", line)
    all_values, pos_sig, neg_sig = [], [], []

    for tf, v1s, v2s in matches:
        v1 = int(v1s)
        all_values.append(v1)
        if v1 >= 4:  pos_sig.append((tf, v1))   # FIXED: was >= 3
        if v1 <= -4: neg_sig.append((tf, v1))   # FIXED: was <= -3
        if v2s:
            v2 = int(v2s)
            all_values.append(v2)
            if v2 >= 4:  pos_sig.append((tf, v2))  # FIXED: was >= 3
            if v2 <= -4: neg_sig.append((tf, v2))  # FIXED: was <= -3

    if pos_sig and neg_sig:
        return 0, True
    if not all_values:
        return 0, False

    strongest_pos = max((v for v in all_values if v > 0), default=0)
    strongest_neg = min((v for v in all_values if v < 0), default=0)
    abs_pos, abs_neg = abs(strongest_pos), abs(strongest_neg)

    if abs_pos == abs_neg and abs_pos != 0: return 0, False
    if abs_neg > abs_pos: return strongest_neg, False
    return strongest_pos, False


def derive_score_tf(line):
    """
    Lists the timeframes whose Panda score is EXTREME (|value| >= 4, i.e.
    4/5/6 positive or negative). Non-extreme values (1/2/3) are ignored.
    Display/reporting only — never feeds back into gap or scoring.

    Reads raw split values (e.g. '+5/-1') and includes each extreme part.
    Returns a compact string of TF+signedvalue tokens in D1/H4/H1 order,
    e.g. "D1+4 H4+5" or "H1-6", or "" if no timeframe is extreme.
    """
    if line.strip().startswith("ADV"):
        return ""

    matches = re.findall(r"(D1|H4|H1)\s*:\s*([+-]?\d+)(?:/([+-]?\d+))?", line)
    order = {"D1": 0, "H4": 1, "H1": 2}
    out = []                       # list of (tf_order, tf, value)
    for tf, v1s, v2s in matches:
        for vs in (v1s, v2s):
            if not vs:
                continue
            v = int(vs)
            if abs(v) >= 4:        # only extreme 4/5/6 (or -4/-5/-6)
                out.append((order.get(tf, 9), tf, v))
    out.sort(key=lambda x: x[0])
    return " ".join(f"{tf}{'+' if v > 0 else ''}{v}" for _, tf, v in out)


def _build_currency_line(parsed, side):
    """
    Returns the RAW original line from the mt4 file for scoring.
    This is critical — split values like '+2/-1' must NOT be summed
    before passing to extract_panda_score.
    """
    if side == "base":
        return parsed.get("raw_base_line", "")
    return parsed.get("raw_quote_line", "")


def compute_scores_all_pairs(parsed_map):
    """
    Two-phase scoring — exact match to PandaEngineMaster.cs:
    Phase 1: score each line, collect globally invalid currencies.
    Phase 2: apply scores + propagate global currency conflict.
    """
    cache         = {}
    invalid_currs = set()

    # Phase 1
    for symbol, parsed in parsed_map.items():
        base_score,  base_inv  = extract_panda_score(_build_currency_line(parsed, "base"))
        quote_score, quote_inv = extract_panda_score(_build_currency_line(parsed, "quote"))
        cache[symbol + "_BASE"]  = (base_score,  base_inv)
        cache[symbol + "_QUOTE"] = (quote_score, quote_inv)
        if base_inv:  invalid_currs.add(parsed["base_cur"])
        if quote_inv: invalid_currs.add(parsed["quote_cur"])

    if invalid_currs:
        print(f"[GLOBAL INVALID] {sorted(invalid_currs)}")

    # Phase 2
    results = {}
    for symbol, parsed in parsed_map.items():
        base_cur  = parsed["base_cur"]
        quote_cur = parsed["quote_cur"]
        base_score,  base_inv  = cache[symbol + "_BASE"]
        quote_score, quote_inv = cache[symbol + "_QUOTE"]

        currency_conflict = (base_cur in invalid_currs) or (quote_cur in invalid_currs)
        neutral_matchup   = (not base_inv and not quote_inv and not currency_conflict
                             and abs(base_score) < 4 and abs(quote_score) < 4)
        hard_invalid      = base_inv or quote_inv or currency_conflict or neutral_matchup
        gap               = 0 if currency_conflict else (base_score - quote_score)

        if hard_invalid:
            conflict_parts = []
            if base_cur  in invalid_currs: conflict_parts.append(base_cur)
            if quote_cur in invalid_currs: conflict_parts.append(quote_cur)
            if neutral_matchup: conflict_parts.append("NEUTRAL_VS_NEUTRAL")
            results[symbol] = {
                "gap": 0, "base_score": base_score, "quote_score": quote_score,
                "bias": "HARD_INVALID", "execution": "NONE",
                "confidence": "INVALID", "hard_invalid": True,
                "conflict_detail": ",".join(conflict_parts),
            }
            continue

        abs_gap    = abs(gap)
        bias       = "BUY"    if gap    >= 5  else "SELL"    if gap    <= -5 else "INVALID"
        execution  = "MARKET" if abs_gap >= 9  else "PULLBACK" if abs_gap >= 5  else "NONE"
        confidence = "HIGH"   if abs_gap >= 10 else "MEDIUM"   if abs_gap >= 8  else "LOW" if abs_gap >= 5 else "INVALID"

        results[symbol] = {
            "gap": gap, "base_score": base_score, "quote_score": quote_score,
            "bias": bias, "execution": execution, "confidence": confidence,
            "hard_invalid": False, "conflict_detail": "",
        }

    return results


# ================= PANDA GOLD SIGNAL ADD-ON =================

def _gold_interval_seconds(interval):
    m = re.match(r"^(\d+)(min|h|day|week|month)$", str(interval).strip().lower())
    if not m:
        return 3600
    n = int(m.group(1))
    unit = m.group(2)
    if unit == "min": return n * 60
    if unit == "h": return n * 3600
    if unit == "day": return n * 86400
    if unit == "week": return n * 604800
    if unit == "month": return n * 2592000
    return 3600

def _parse_td_datetime(value):
    if not value:
        return None
    raw = str(value).replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(raw)
    except Exception:
        dt = None
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
            try:
                dt = datetime.strptime(str(value), fmt)
                break
            except Exception:
                pass
        if dt is None:
            return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)

def _fetch_gold_candles(outputsize=220):
    if not TWELVEDATA_API_KEY:
        return [], "TWELVEDATA_API_KEY missing"
    try:
        resp = requests.get(
            "https://api.twelvedata.com/time_series",
            params={
                "symbol": GOLD_TD_SYMBOL,
                "interval": GOLD_INTERVAL,
                "outputsize": outputsize,
                "apikey": TWELVEDATA_API_KEY,
            },
            timeout=12,
        )
        data = resp.json()
        values = data.get("values") if isinstance(data, dict) else None
        if not values:
            return [], data.get("message", "no values") if isinstance(data, dict) else "bad response"
        candles = []
        for v in values:
            dt = _parse_td_datetime(v.get("datetime"))
            candle = {
                "time": dt,
                "open": safe_float(v.get("open")),
                "high": safe_float(v.get("high")),
                "low": safe_float(v.get("low")),
                "close": safe_float(v.get("close")),
            }
            if candle["time"] and all(candle[k] is not None for k in ("open", "high", "low", "close")):
                candles.append(candle)
        candles.sort(key=lambda c: c["time"])
        if candles:
            last_close = candles[-1]["time"] + timedelta(seconds=_gold_interval_seconds(GOLD_INTERVAL))
            if datetime.now(timezone.utc) < last_close:
                candles = candles[:-1]
        return candles, None
    except Exception as e:
        return [], str(e)

def _rma(values, length):
    out = [None] * len(values)
    if len(values) < length:
        return out
    seed = sum(values[:length]) / length
    out[length - 1] = seed
    prev = seed
    for i in range(length, len(values)):
        prev = ((prev * (length - 1)) + values[i]) / length
        out[i] = prev
    return out

def _compute_gold_supertrend(candles):
    if len(candles) < GOLD_ST_ATR + 3:
        return []
    trs = []
    for i, c in enumerate(candles):
        if i == 0:
            trs.append(c["high"] - c["low"])
        else:
            prev_close = candles[i - 1]["close"]
            trs.append(max(c["high"] - c["low"], abs(c["high"] - prev_close), abs(c["low"] - prev_close)))
    atrs = _rma(trs, GOLD_ST_ATR)

    rows = []
    prev_final_upper = prev_final_lower = prev_st = prev_dir = None
    for i, c in enumerate(candles):
        atr = atrs[i]
        if atr is None:
            rows.append({**c, "atr": None, "st": None, "dir": None, "new_long": False, "new_short": False})
            continue
        hl2 = (c["high"] + c["low"]) / 2.0
        basic_upper = hl2 + GOLD_ST_FACTOR * atr
        basic_lower = hl2 - GOLD_ST_FACTOR * atr
        if prev_final_upper is None:
            final_upper = basic_upper
            final_lower = basic_lower
            direction = 1
        else:
            prev_close = candles[i - 1]["close"]
            final_lower = basic_lower if (basic_lower > prev_final_lower or prev_close < prev_final_lower) else prev_final_lower
            final_upper = basic_upper if (basic_upper < prev_final_upper or prev_close > prev_final_upper) else prev_final_upper
            if prev_st == prev_final_upper:
                direction = -1 if c["close"] > final_upper else 1
            else:
                direction = 1 if c["close"] < final_lower else -1
        st = final_lower if direction == -1 else final_upper
        rows.append({
            **c,
            "atr": atr,
            "st": st,
            "dir": direction,
            "new_long": direction == -1 and prev_dir == 1,
            "new_short": direction == 1 and prev_dir == -1,
        })
        prev_final_upper = final_upper
        prev_final_lower = final_lower
        prev_st = st
        prev_dir = direction
    return rows

def _mode_int(values):
    counts = {}
    for v in values:
        if v is not None:
            counts[int(v)] = counts.get(int(v), 0) + 1
    if not counts:
        return 0
    return sorted(counts.items(), key=lambda kv: (-kv[1], -abs(kv[0])))[0][0]

def _gold_usd_strength(parsed_map):
    d1_vals, h4_vals, h1_vals = [], [], []
    for parsed in parsed_map.values():
        if parsed.get("base_cur") == "USD":
            d1_vals.append(parsed.get("base_d1"))
            h4_vals.append(parsed.get("base_h4"))
            h1_vals.append(parsed.get("base_h1"))
        if parsed.get("quote_cur") == "USD":
            d1_vals.append(parsed.get("quote_d1"))
            h4_vals.append(parsed.get("quote_h4"))
            h1_vals.append(parsed.get("quote_h1"))
    d1 = _mode_int(d1_vals)
    h4 = _mode_int(h4_vals)
    h1 = _mode_int(h1_vals)
    positive = max(0, d1, h4, h1)
    negative = min(0, d1, h4, h1)
    strongest = 0 if abs(positive) == abs(negative) else negative if abs(negative) > abs(positive) else positive
    return strongest, {"D1": d1, "H4": h4, "H1": h1}

def _load_gold_mark():
    try:
        with open(GOLD_SIGNAL_MARK_FILE, "r", encoding="utf-8") as f:
            return f.read().strip()
    except Exception:
        return ""

def _save_gold_mark(mark):
    try:
        with open(GOLD_SIGNAL_MARK_FILE, "w", encoding="utf-8") as f:
            f.write(mark)
    except Exception as e:
        print(f"[GOLD] mark write failed: {e}")

def build_gold_signal(parsed_map):
    """
    Panda Gold V1.1 server-side add-on:
    SuperTrend flip on XAUUSD, filtered by Panda USD strength. This is deliberately
    separate from the locked 21-pair gap scorer.
    """
    basket_ready = len(parsed_map) >= GOLD_USD_QUORUM
    usd_strength, usd_tf = _gold_usd_strength(parsed_map) if basket_ready else (0, {"D1": 0, "H4": 0, "H1": 0})
    usd_offline = not basket_ready
    candles, err = _fetch_gold_candles()
    rows = _compute_gold_supertrend(candles)
    if err or not rows:
        return {
            "symbol": GOLD_SYMBOL, "status": "OFFLINE", "bias": "WAIT", "gap": 0,
            "entry": None, "sl": None, "tp1": None, "tp2": None, "tp3": None,
            "usd_strength": usd_strength, "usd_tf": usd_tf, "basket_ready": basket_ready,
            "filter": "OFFLINE", "error": err or "not enough candles", "new_signal": False,
            "signal_time": None, "price": None,
        }

    allow_long = not (basket_ready and usd_strength >= GOLD_USD_THRESHOLD) and not (usd_offline and GOLD_BLOCK_OFFLINE)
    allow_short = not (basket_ready and usd_strength <= -GOLD_USD_THRESHOLD) and not (usd_offline and GOLD_BLOCK_OFFLINE)
    in_trade = False
    trade_dir = 0
    entry = sl = tp1 = tp2 = tp3 = None
    tp1_hit = tp2_hit = tp3_hit = at_be = False
    last_signal = None

    for row in rows:
        new_long = row["new_long"] and allow_long
        new_short = row["new_short"] and allow_short
        if new_long or new_short:
            trade_dir = 1 if new_long else -1
            entry = row["close"]
            sl = row["st"]
            risk = abs(entry - sl) if sl is not None else 0
            tp1 = entry + risk if trade_dir == 1 else entry - risk
            tp2 = entry + 2.0 * risk if trade_dir == 1 else entry - 2.0 * risk
            tp3 = entry + 3.0 * risk if trade_dir == 1 else entry - 3.0 * risk
            tp1_hit = tp2_hit = tp3_hit = at_be = False
            in_trade = risk > 0
            last_signal = {"dir": trade_dir, "time": row["time"], "entry": entry, "sl": sl, "tp1": tp1, "tp2": tp2, "tp3": tp3}
            continue
        if in_trade:
            if trade_dir == 1:
                if not tp1_hit and row["high"] >= tp1:
                    tp1_hit = True
                    sl = entry
                    at_be = True
                if not tp2_hit and row["high"] >= tp2:
                    tp2_hit = True
                if not tp3_hit and row["high"] >= tp3:
                    tp3_hit = True
                    in_trade = False
                if row["low"] <= sl:
                    in_trade = False
            else:
                if not tp1_hit and row["low"] <= tp1:
                    tp1_hit = True
                    sl = entry
                    at_be = True
                if not tp2_hit and row["low"] <= tp2:
                    tp2_hit = True
                if not tp3_hit and row["low"] <= tp3:
                    tp3_hit = True
                    in_trade = False
                if row["high"] >= sl:
                    in_trade = False

    latest = rows[-1]
    latest_new_signal = bool(last_signal and last_signal["time"] == latest["time"])
    status = "LONG" if in_trade and trade_dir == 1 else "SHORT" if in_trade and trade_dir == -1 else "FLAT"
    bias = "BUY" if status == "LONG" else "SELL" if status == "SHORT" else "WAIT"
    filter_text = (
        "OFFLINE" if usd_offline else
        "USD strong - no longs" if basket_ready and usd_strength >= GOLD_USD_THRESHOLD else
        "USD weak - no shorts" if basket_ready and usd_strength <= -GOLD_USD_THRESHOLD else
        "CLEAR"
    )
    return {
        "symbol": GOLD_SYMBOL, "status": status, "bias": bias,
        "gap": 9 if status == "LONG" else -9 if status == "SHORT" else 0,
        "entry": entry, "sl": sl, "tp1": tp1, "tp2": tp2, "tp3": tp3,
        "tp1_hit": tp1_hit, "tp2_hit": tp2_hit, "tp3_hit": tp3_hit, "at_be": at_be,
        "usd_strength": usd_strength, "usd_tf": usd_tf, "basket_ready": basket_ready,
        "filter": filter_text, "error": None, "new_signal": latest_new_signal,
        "signal_time": latest["time"].isoformat() if latest_new_signal else None,
        "price": latest["close"], "st": latest["st"],
    }

def gold_signal_to_snapshot_card(gold):
    if not gold:
        return None
    status = gold.get("status") or "OFFLINE"
    entry = gold.get("entry")
    sl = gold.get("sl")
    tp1 = gold.get("tp1")
    score_bits = []
    if entry is not None:
        score_bits.append(f"E {entry:.2f}")
    if sl is not None:
        score_bits.append(("BE " if gold.get("at_be") else "SL ") + f"{sl:.2f}")
    score_text = " | ".join(score_bits) if score_bits else (gold.get("error") or "WAIT")
    tp_text = f"TP1 {'OK ' if gold.get('tp1_hit') else ''}{tp1:.2f}" if tp1 is not None else "-"
    filter_text = gold.get("filter") or "-"
    filter_label = (
        "USD+" if "strong" in filter_text.lower() else
        "USD-" if "weak" in filter_text.lower() else
        "OFFLINE" if "offline" in filter_text.lower() else
        filter_text
    )
    return {
        "symbol": GOLD_SYMBOL,
        "gap": gold.get("gap") or 0,
        "bias": (gold.get("bias") or "WAIT") if status != "OFFLINE" else "OFFLINE",
        "box_badge": f"ST {GOLD_INTERVAL}",
        "pl_zone": filter_label,
        "pdr": f"USD {gold.get('usd_strength', 0):+d}",
        "action": "GOLD" if status in ("LONG", "SHORT") else "WAIT",
        "score": score_text.replace(" | ", " "),
        "category": "BUY" if status == "LONG" else "SELL" if status == "SHORT" else "YELLOW" if status == "OFFLINE" else "WHITE",
        "xtf": tp_text,
    }

def _load_current_parsed_map_for_gold():
    parsed = {}
    for symbol in PAIRS:
        p = parse_mt4_file(symbol)
        if p is not None:
            parsed[symbol] = p
    return parsed


# ================= GAP HISTORY =================
def get_gap_history(symbol, n=26):
    try:
        res = supabase_retry(
            lambda: supabase.table("gap_history")
                .select("gap, timestamp")
                .eq("symbol", symbol)
                .order("timestamp", desc=True)
                .limit(n)
                .execute(),
            label=f"GapHistory-{symbol}"
        )
        if res.data:
            return [safe_float(r["gap"]) for r in res.data]
        return []
    except Exception as e:
        print(f"[HISTORY ERROR] {symbol}: {e}")
        return []

# ================= MOMENTUM CLASSIFICATION =================
def classify_momentum(gap, delta_short, delta_mid, delta_long):
    if gap >= 5:   direction = "BULL"
    elif gap <= -5: direction = "BEAR"
    else:           return "NEUTRAL", "NEUTRAL"

    s = (delta_short or 0) if direction == "BULL" else -(delta_short or 0)
    m = (delta_mid   or 0) if direction == "BULL" else -(delta_mid   or 0)
    l = (delta_long  or 0) if direction == "BULL" else -(delta_long  or 0)
    abs_gap = abs(gap)

    if   s >= 2 and m >= 4 and l >= 3 and abs_gap >= 6:  return "STRONG",        f"EXPAND_{direction}"
    elif s >= 2 and m >= 3:                               return "BUILDING",      f"EXPAND_{direction}"
    elif s >= 1.5 and m < 2:                              return "SPARK",         f"STABLE_{direction}"
    elif abs_gap >= 7 and s < 0 and s >= -5 and m >= -2: return "CONSOLIDATING", f"STABLE_{direction}"
    elif abs_gap >= 5 and s < 0 and m < 0 and l >= 1:    return "COOLING",       f"PULLBACK_{direction}"
    elif abs_gap <= 7 and s < -1 and m < -1 and l < 1:   return "FADING",        f"PULLBACK_{direction}"
    elif abs_gap <= 6 and s < -2 and m < -2 and l < 0:   return "REVERSING",     "NEUTRAL"
    else:                                                  return "STABLE",        f"STABLE_{direction}"

def should_close_alert(gap, momentum, delta_mid, prev_gap=None):
    abs_gap = abs(gap)
    if abs_gap < 5: return True
    if momentum in ("FADING", "REVERSING"): return True
    if prev_gap is not None:
        drop = abs(prev_gap) - abs_gap
        if drop >= 3 and (delta_mid or 0) * (-1 if gap < 0 else 1) < -3:
            return True
    return False

def classify_structural_state(gap, delta_mid, accel):
    if gap >= 5:    regime = "BULL"
    elif gap <= -5: regime = "BEAR"
    else:           return "NEUTRAL"
    T = 12
    if regime == "BULL":
        if   delta_mid >= T:  return "EXPAND_BULL"       if accel > 0 else "PULLBACK_BULL" if accel < 0 else "STABLE_BULL"
        elif delta_mid <= -T: return "DEEP_PULLBACK_BULL"
        return "STABLE_BULL"
    if   delta_mid <= -T: return "EXPAND_BEAR"       if accel < 0 else "PULLBACK_BEAR" if accel > 0 else "STABLE_BEAR"
    elif delta_mid >= T:  return "DEEP_PULLBACK_BEAR"
    return "STABLE_BEAR"


# ================= SIGNAL PERFORMANCE TRACKING V2 =================
# Two strategies: BB (Bias Based) and INTRA (Intraday)

def calc_pips(symbol, direction, entry_price, current_price):
    """Calculate pip movement in signal direction. JPY pairs use 0.01 pip size."""
    if not entry_price or not current_price:
        return 0
    pip = 0.01 if "JPY" in symbol.upper() else 0.0001
    raw = (current_price - entry_price) if direction == "BUY" else (entry_price - current_price)
    return round(raw / pip, 1)


def is_neutral_matchup(base_score, quote_score):
    """Neutral vs Neutral = both individual currency scores are weak (abs <= 1)."""
    return abs(base_score) <= 1 and abs(quote_score) <= 1


def has_pending_signal(symbol, strategy):
    """Check if symbol already has a PENDING signal for given strategy."""
    try:
        res = supabase.table("signal_results") \
            .select("id") \
            .eq("symbol", symbol) \
            .eq("strategy", strategy) \
            .eq("status", "PENDING") \
            .execute()
        return bool(res.data and len(res.data) > 0)
    except Exception as e:
        print(f"[SIGNAL] Check pending error: {e}")
        return True  # safe default: assume exists


def compute_signal_confidence(gap, pl_data, scores, momentum, parsed):
    """
    Server-side multi-factor confidence score (0-100).
    Mirrors dashboard.js computeConfidence() but without COT (COT not available server-side).
    Factors: gap magnitude (~30), PL zone (~20), box structure (~20), momentum (~10), reserve (~20 for COT/future).
    """
    pts = 0

    # Gap magnitude: 0-30 pts
    ag = abs(gap)
    if ag >= 15:   pts += 30
    elif ag >= 12: pts += 25
    elif ag >= 10: pts += 22
    elif ag >= 9:  pts += 20
    elif ag >= 7:  pts += 15
    elif ag >= 5:  pts += 10

    # Panda Lines zone confirmation: 0-20 pts
    zone = pl_data.get("pl_zone", "")
    direction = "BUY" if gap >= 5 else "SELL" if gap <= -5 else "WAIT"
    if (direction == "BUY" and zone == "ABOVE") or (direction == "SELL" and zone == "BELOW"):
        pts += 20
    elif zone == "BETWEEN":
        pts += 0
    # Wrong zone: 0 pts

    # Box structure alignment: 0-20 pts
    boxes = parsed.get("boxes", []) if parsed else []
    if boxes:
        h1_trend, h4_trend = compute_box_trends(boxes)
        aligned = 0
        if direction == "BUY":
            if h1_trend == "UPTREND": aligned += 1
            if h4_trend == "UPTREND": aligned += 1
        elif direction == "SELL":
            if h1_trend == "DOWNTREND": aligned += 1
            if h4_trend == "DOWNTREND": aligned += 1
        pts += aligned * 10  # 0, 10, or 20

    # Momentum quality: 0-10 pts
    if momentum in ("STRONG",):       pts += 10
    elif momentum in ("BUILDING",):   pts += 8
    elif momentum in ("SPARK",):      pts += 6
    elif momentum in ("CONSOLIDATING", "STABLE"): pts += 3

    return min(pts, 100)


def log_signal(symbol, direction, gap, strategy, entry_price, scores, pl_data, momentum="", parsed=None):
    """Log a new signal entry for either BB or INTRA strategy."""
    if not entry_price or entry_price <= 0:
        return
    try:
        boxes = parsed.get("boxes", []) if parsed else []
        box_h1, box_h4 = compute_box_trends(boxes)
        supabase.table("signal_results").insert({
            "symbol":       symbol,
            "direction":    direction,
            "strategy":     strategy,
            "entry_gap":    gap,
            "peak_gap":     abs(gap),
            "entry_price":  entry_price,
            "base_score":   scores.get("base_score", 0),
            "quote_score":  scores.get("quote_score", 0),
            "bias":         scores.get("bias", ""),
            "momentum":     momentum or "",
            "confidence":   compute_signal_confidence(gap, pl_data, scores, momentum, parsed),
            "pl_zone":      pl_data.get("pl_zone", ""),
            "pl_st":        pl_data.get("pl_st"),
            "pl_fl":        pl_data.get("pl_fl"),
            "session":      get_session(),
            "box_h1_trend": box_h1,
            "box_h4_trend": box_h4,
            "status":       "PENDING",
            "snapshots":    [],
        }).execute()
        print(f"[SIGNAL] ENTRY {strategy}: {symbol} {direction} gap={gap} price={entry_price} box={box_h1}/{box_h4}")
    except Exception as e:
        print(f"[SIGNAL] Entry error {strategy} {symbol}: {e}")


def check_bb_entry(symbol, gap, scores, pl_data, momentum="", parsed=None):
    """
    BB (Bias Based) strategy entry:
    - |gap| crosses from <5 to >=5
    - NOT neutral vs neutral matchup
    - No PL validation
    """
    prev = PREV_GAP.get(symbol, 0)
    if abs(prev) >= 5 or abs(gap) < 5:
        return
    if is_neutral_matchup(scores.get("base_score", 0), scores.get("quote_score", 0)):
        return
    if has_pending_signal(symbol, "BB"):
        return
    direction = "BUY" if gap >= 5 else "SELL"
    price = pl_data.get("pl_price")
    log_signal(symbol, direction, gap, "BB", price, scores, pl_data, momentum, parsed)


def check_intra_entry(symbol, gap, scores, pl_data, momentum="", parsed=None):
    """
    INTRA (Intraday) strategy entry:
    - |gap| >= 9
    - PL zone must confirm (ABOVE for BUY, BELOW for SELL)
    - Entry window: 2AM–4AM UAE (22:00–00:00 UTC)
    - No duplicates while PENDING
    """
    from datetime import datetime
    now = datetime.utcnow()
    # 2AM UAE = 22:00 UTC, 4AM UAE = 00:00 UTC — window covers hour 22 and 23
    hour = now.hour
    in_window = (hour == 22) or (hour == 23)
    if not in_window:
        return
    if abs(gap) < 9:
        return
    zone = pl_data.get("pl_zone", "")
    direction = "BUY" if gap >= 9 else "SELL"
    if direction == "BUY" and zone != "ABOVE":
        return
    if direction == "SELL" and zone != "BELOW":
        return
    if has_pending_signal(symbol, "INTRA"):
        return
    price = pl_data.get("pl_price")
    log_signal(symbol, direction, gap, "INTRA", price, scores, pl_data, momentum, parsed)


def evaluate_pending_signals(all_scores, all_pl_map):
    """
    Evaluate all PENDING signals each cycle.
    BB exits: gap <±5, gap drops 2+ from peak, Friday 3PM EST
    INTRA exits: 6 hours after entry (hard close)
    """
    from datetime import datetime, timezone, timedelta
    try:
        res = supabase_retry(
            lambda: supabase.table("signal_results").select("*").eq("status", "PENDING").execute(),
            label="SignalEvalFetch"
        )
        pending = res.data or []
    except Exception as e:
        print(f"[SIGNAL EVAL] Fetch error: {e}")
        return

    if not pending:
        return

    now = datetime.utcnow()
    # Friday 3PM EST = Friday 7PM UTC (hour 19)
    is_friday_close = (now.weekday() == 4 and now.hour >= 19)
    evaluated = 0

    for sig in pending:
        symbol = sig["symbol"]
        direction = sig["direction"]
        strategy = sig.get("strategy", "BB")
        entry_price = sig.get("entry_price")
        peak = sig.get("peak_gap", 0)

        # Get current data
        pair_scores = all_scores.get(symbol, {})
        current_gap = pair_scores.get("gap", 0)
        pl = all_pl_map.get(symbol, {})
        current_price = pl.get("pl_price")
        abs_gap = abs(current_gap)

        # Update peak
        new_peak = max(peak, abs_gap)

        # Calc pips
        pips = calc_pips(symbol, direction, entry_price, current_price)

        # Snapshot
        snapshot = {
            "gap": current_gap, "price": current_price,
            "pips": pips, "ts": now.isoformat()
        }
        snapshots = sig.get("snapshots", []) or []
        snapshots.append(snapshot)

        # === EXIT CHECK ===
        exit_reason = None
        drop_from_peak = new_peak - abs_gap

        if strategy == "INTRA":
            # INTRA: hard close at 10AM UAE (06:00 UTC) — no exceptions
            if now.hour >= 6 and now.hour < 22:
                exit_reason = "INTRA_10AM_CLOSE"
        else:
            # BB exits
            if abs_gap < 5:
                exit_reason = "BIAS_FLIP"
            elif drop_from_peak >= 2:
                exit_reason = "MOMENTUM_LOSS"

        # Both strategies: Friday force-close
        if not exit_reason and is_friday_close:
            exit_reason = "WEEKEND_CLOSE"

        if exit_reason:
            duration = None
            try:
                created = sig.get("created_at", "")
                entry_time = datetime.fromisoformat(created.replace("Z", "+00:00").replace("+00:00", ""))
                duration = round((now.replace(tzinfo=None) - entry_time.replace(tzinfo=None)).total_seconds() / 60, 1)
            except Exception:
                pass

            outcome = "WIN" if pips > 5 else ("LOSS" if pips < -5 else "FLAT")

            try:
                _sig_id = sig["id"]
                supabase_retry(
                    lambda: supabase.table("signal_results").update({
                        "peak_gap": new_peak,
                        "exit_gap": current_gap,
                        "exit_price": current_price,
                        "pips": pips,
                        "exit_reason": exit_reason,
                        "outcome": outcome,
                        "status": "DONE",
                        "snapshots": snapshots,
                        "duration_min": duration,
                        "closed_at": now.isoformat()
                    }).eq("id", _sig_id).execute(),
                    label=f"SignalExit-{symbol}"
                )
                evaluated += 1
                print(f"[SIGNAL] EXIT {strategy} {symbol} | {exit_reason} | {pips} pips | {outcome} | {duration}min")
            except Exception as e:
                print(f"[SIGNAL] Exit update error {symbol}: {e}")
        else:
            # Still holding
            try:
                _sig_id = sig["id"]
                supabase_retry(
                    lambda: supabase.table("signal_results").update({
                        "peak_gap": new_peak, "snapshots": snapshots
                    }).eq("id", _sig_id).execute(),
                    label=f"SignalHold-{symbol}"
                )
            except Exception:
                pass

    if evaluated:
        print(f"[SIGNAL EVAL] Closed {evaluated}/{len(pending)} signals")


# ================= PRICE CONTEXT (v2 EXPORTER) =================
def compute_price_context(pl, gap):
    """Derive live PDR / ADR-used / pullback / consolidation from v2 exporter
    price-context lines. Returns all-None dict when v1 exporter is running."""
    out = {"pdr_dir": None, "pdr_ratio": None, "pdr_strong_live": None,
           "adr_used_pct": None, "pullback_pct": None, "consolidating": None}
    if not pl:
        return out
    pdo, pdc   = pl.get("pdo"), pl.get("pdc")
    pdh, pdl   = pl.get("pdh"), pl.get("pdl")
    dayh, dayl = pl.get("dayh"), pl.get("dayl")
    adr, h1r6  = pl.get("adr_d1"), pl.get("h1r6")
    price      = pl.get("pl_price")

    # PDR from broker daily candle: body vs ADR + retracement check
    # PRH/PRL = high/low of the SAME bar as PDO/PDC (runt/Sunday candles skipped
    # by the v2 exporter); fall back to PDH/PDL for older exporter output.
    if pdo and pdc and adr:
        body = abs(pdc - pdo)
        out["pdr_dir"]   = "BULLISH" if pdc >= pdo else "BEARISH"
        out["pdr_ratio"] = round(body / adr, 2)
        rh = pl.get("prh") or pdh
        rl = pl.get("prl") or pdl
        if rh and rl and rh > rl:
            retr = ((rh - rl) - body) / (rh - rl)
            out["pdr_strong_live"] = bool(retr <= 0.5 and body > 0)

    # Today's range consumption + pullback depth off the day extreme
    if dayh and dayl and adr and dayh >= dayl:
        out["adr_used_pct"] = round((dayh - dayl) / adr * 100, 0)
        if price and dayh > dayl and gap is not None:
            if gap > 0:
                out["pullback_pct"] = round((dayh - price) / (dayh - dayl) * 100, 0)
            elif gap < 0:
                out["pullback_pct"] = round((price - dayl) / (dayh - dayl) * 100, 0)

    # Compression: last 6 H1 bars cover <25% of an average day
    if h1r6 and adr:
        out["consolidating"] = bool((h1r6 / adr) < 0.25)
    return out


# ================= SHADOW TRACKER (HIGH-GAP RESEARCH LOGGER) =================
# Write-only logger: records every |gap| crossing of tiers 9/10/11/12
# independently of BB's concurrent-position rule. Places NO trades,
# touches NO locked logic. Exits mirror BB rules for comparability.

SHADOW_TIERS = (9, 10, 11, 12)
_SHADOW_CACHE = set()       # {(symbol, tier)} currently PENDING
_SHADOW_CACHE_TS = None

def _refresh_shadow_cache(force=False):
    global _SHADOW_CACHE, _SHADOW_CACHE_TS
    from datetime import datetime as _dt
    now = _dt.utcnow()
    if not force and _SHADOW_CACHE_TS and (now - _SHADOW_CACHE_TS).total_seconds() < 60:
        return
    try:
        res = supabase.table("shadow_tracker").select("symbol,tier").eq("status", "PENDING").execute()
        _SHADOW_CACHE = {(r["symbol"], r["tier"]) for r in (res.data or [])}
        _SHADOW_CACHE_TS = now
    except Exception as e:
        print(f"[SHADOW] Cache refresh error: {e}")


def check_shadow_entry(symbol, gap, scores, pl_data, momentum=""):
    """Log a shadow entry each time |gap| crosses a tier boundary upward.
    Reads PREV_GAP (must be called BEFORE PREV_GAP is updated, same as BB/INTRA checks)."""
    prev = abs(PREV_GAP.get(symbol, 0) or 0)
    cur = abs(gap or 0)
    if cur < SHADOW_TIERS[0] or prev >= cur:
        return
    price = pl_data.get("pl_price")
    if not price or price <= 0:
        return
    direction = "BUY" if gap > 0 else "SELL"
    _refresh_shadow_cache()
    for tier in SHADOW_TIERS:
        if prev < tier <= cur and (symbol, tier) not in _SHADOW_CACHE:
            try:
                supabase.table("shadow_tracker").insert({
                    "symbol": symbol, "direction": direction, "tier": tier,
                    "entry_gap": gap, "peak_gap": cur, "entry_price": price,
                    "pl_zone": pl_data.get("pl_zone", ""),
                    "session": get_session(), "momentum": momentum or "",
                    "base_score": scores.get("base_score", 0),
                    "quote_score": scores.get("quote_score", 0),
                    "status": "PENDING", "snapshots": [],
                }).execute()
                _SHADOW_CACHE.add((symbol, tier))
                print(f"[SHADOW] ENTRY T{tier}: {symbol} {direction} gap={gap} price={price}")
            except Exception as e:
                print(f"[SHADOW] Entry error {symbol} T{tier}: {e}")


def evaluate_pending_shadows(all_scores, all_pl_map):
    """Close shadow entries with BB-style exits: bias flip (<5), 2-pt drop from peak, Friday close."""
    from datetime import datetime as _dt
    try:
        res = supabase_retry(
            lambda: supabase.table("shadow_tracker").select("*").eq("status", "PENDING").execute(),
            label="ShadowEvalFetch")
        pending = res.data or []
    except Exception as e:
        print(f"[SHADOW EVAL] Fetch error: {e}")
        return
    if not pending:
        return
    now = _dt.utcnow()
    is_friday_close = (now.weekday() == 4 and now.hour >= 19)
    closed = 0
    for sig in pending:
        symbol = sig["symbol"]
        current_gap = all_scores.get(symbol, {}).get("gap", 0)
        current_price = all_pl_map.get(symbol, {}).get("pl_price")
        abs_gap = abs(current_gap)
        new_peak = max(sig.get("peak_gap", 0) or 0, abs_gap)
        pips = calc_pips(symbol, sig["direction"], sig.get("entry_price"), current_price)
        exit_reason = None
        if abs_gap < 5:
            exit_reason = "BIAS_FLIP"
        elif (new_peak - abs_gap) >= 2:
            exit_reason = "MOMENTUM_LOSS"
        elif is_friday_close:
            exit_reason = "WEEKEND_CLOSE"
        try:
            _id = sig["id"]
            if exit_reason:
                duration = None
                try:
                    created = sig.get("created_at", "")
                    t0 = _dt.fromisoformat(created.replace("Z", "+00:00")).replace(tzinfo=None)
                    duration = round((now - t0).total_seconds() / 60, 1)
                except Exception:
                    pass
                outcome = "WIN" if pips > 5 else ("LOSS" if pips < -5 else "FLAT")
                supabase_retry(
                    lambda: supabase.table("shadow_tracker").update({
                        "peak_gap": new_peak, "exit_gap": current_gap,
                        "exit_price": current_price, "pips": pips,
                        "exit_reason": exit_reason, "outcome": outcome,
                        "status": "DONE", "duration_min": duration,
                        "closed_at": now.isoformat(),
                    }).eq("id", _id).execute(),
                    label=f"ShadowExit-{symbol}")
                _SHADOW_CACHE.discard((symbol, sig.get("tier")))
                closed += 1
                print(f"[SHADOW] EXIT T{sig.get('tier')} {symbol} | {exit_reason} | {pips} pips | {outcome}")
            else:
                supabase_retry(
                    lambda: supabase.table("shadow_tracker").update({
                        "peak_gap": new_peak,
                    }).eq("id", _id).execute(),
                    label=f"ShadowHold-{symbol}")
        except Exception as e:
            print(f"[SHADOW] Update error {symbol}: {e}")
    if closed:
        print(f"[SHADOW EVAL] Closed {closed}/{len(pending)}")


# ================= CORE ENGINE =================
def run_gap_once():
    global PREV_MOMENTUM, PREV_GAP, PREV_GAP_INITIALIZED
    _cycle_start = time.time()

    # Market hours check - skip when forex market is closed.
    _now = datetime.now(timezone.utc)
    if is_market_closed(_now):
        print(f"[ENGINE] Market closed - skipping ({market_time_label(_now)})")
        return []

    # Pre-load PREV_GAP on first run after any restart — prevents phantom BB signals
    # Without this, all pairs already at gap>=5 would fire false BB entries on restart
    if not PREV_GAP_INITIALIZED:
        try:
            _init = supabase_retry(
                lambda: supabase.table("dashboard").select("symbol,gap").execute(),
                label="PrevGapInit"
            )
            for _r in (_init.data or []):
                PREV_GAP[_r["symbol"]] = _r.get("gap", 0) or 0
            PREV_GAP_INITIALIZED = True
            print(f"[ENGINE] PREV_GAP pre-loaded ({len(PREV_GAP)} pairs) — phantom signals suppressed")
        except Exception as _e:
            print(f"[ENGINE] PREV_GAP pre-load failed: {_e}")

    timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M")
    print(f"\n[ENGINE v3.0] Running at {timestamp} UTC")

    dashboard_payload   = []
    strength_payload    = []
    gap_history_payload = []
    spike_alerts        = []
    gap_alerts          = []   # pairs in 9-12 gap zone with valid Panda Lines
    early_alerts        = []   # pairs where gap just crossed into valid territory
    structure_alerts    = []
    signal_now          = datetime.now(timezone.utc)
    signal_cycle_at     = signal_now.replace(
        minute=signal_now.minute - signal_now.minute % 5, second=0, microsecond=0
    ).isoformat()
    gap_deltas          = {}   # {symbol: current_gap - prev_gap} for snapshot logging
    stale_count         = 0
    hard_invalid_count  = 0

    # ---- STEP 1: Parse ALL pairs first (needed for cross-pair conflict scan) ----
    all_parsed_map = {}
    all_pl_map    = {}
    pl_ready_map  = {}
    for symbol in PAIRS:
        p = parse_mt4_file(symbol)
        if p is not None:
            all_parsed_map[symbol] = p
        else:
            stale_count += 1
            SIGNAL_RECOVERY.mark(symbol, False)
            PREV_ZONE.pop(symbol, None)
            LAST_BOS_T.pop(symbol, None)
        pl = parse_pl_file(symbol)
        if pl is not None:
            all_pl_map[symbol] = pl
        pl_ready_map[symbol] = PL_RECOVERY.mark(symbol, pl is not None, signal_cycle_at)

    # ---- STEP 2: Score ALL pairs (two-phase cBot-exact logic) ----
    all_scores = compute_scores_all_pairs(all_parsed_map)

    for symbol in PAIRS:
        if symbol not in all_parsed_map:
            continue
        parsed = all_parsed_map[symbol]
        scores = all_scores.get(symbol, {
            'gap': 0, 'base_score': 0, 'quote_score': 0,
            'bias': 'HARD_INVALID', 'execution': 'NONE',
            'confidence': 'INVALID', 'hard_invalid': True, 'conflict_detail': 'MISSING'
        })
        gap          = scores["gap"]
        hard_invalid = scores["hard_invalid"]
        bias         = scores["bias"]
        execution    = scores["execution"]
        confidence   = scores["confidence"]

        if hard_invalid:
            hard_invalid_count += 1
            SIGNAL_RECOVERY.mark(symbol, False)
            PL_RECOVERY.mark(symbol, False)
            PREV_ZONE.pop(symbol, None)
            LAST_BOS_T.pop(symbol, None)
            print(f"[HARD_INVALID] {symbol} — {scores['conflict_detail']}")
            dashboard_payload.append({
                "symbol":           symbol,
                "gap":              0,
                "state":            "HARD_INVALID",
                "momentum":         "NEUTRAL",
                "close_alert":      False,
                "delta_short":      None,
                "delta_mid":        None,
                "delta_long":       None,
                "strength":         0,
                "signal":           "NONE",
                "hard_invalid":     True,
                "bias":             "HARD_INVALID",
                "execution":        "NONE",
                "confidence":       "INVALID",
                "base_currency":    parsed["base_cur"],
                "quote_currency":   parsed["quote_cur"],
                "base_score_tf":    derive_score_tf(parsed.get("raw_base_line", "")),
                "quote_score_tf":   derive_score_tf(parsed.get("raw_quote_line", "")),
                "base_d1":          parsed["base_d1"],
                "base_h4":          parsed["base_h4"],
                "base_h1":          parsed["base_h1"],
                "quote_d1":         parsed["quote_d1"],
                "quote_h4":         parsed["quote_h4"],
                "quote_h1":         parsed["quote_h1"],
                "adv_base_d1":      parsed["adv_base_d1"],
                "adv_base_h4":      parsed["adv_base_h4"],
                "adv_base_h1":      parsed["adv_base_h1"],
                "adv_quote_d1":     parsed["adv_quote_d1"],
                "adv_quote_h4":     parsed["adv_quote_h4"],
                "adv_quote_h1":     parsed["adv_quote_h1"],
                "atr":              parsed["atr_current"],
                "atr_reference":    parsed["atr_reference"],
                "spread":           parsed["spread"],
                "box_h1_trend":     compute_box_trends(parsed.get("boxes", []))[0],
                "box_h4_trend":     compute_box_trends(parsed.get("boxes", []))[1],
                "pl_zone":         all_pl_map.get(symbol, {}).get("pl_zone"),
                "pl_bias":         all_pl_map.get(symbol, {}).get("pl_bias"),
                "pl_g1_valid":     all_pl_map.get(symbol, {}).get("pl_g1_valid"),
                "pl_st":           all_pl_map.get(symbol, {}).get("pl_st"),
                "pl_fl":           all_pl_map.get(symbol, {}).get("pl_fl"),
                "pl_price":        all_pl_map.get(symbol, {}).get("pl_price"),
                "pdh":             all_pl_map.get(symbol, {}).get("pdh"),
                "pdl":             all_pl_map.get(symbol, {}).get("pdl"),
                "pwh":             all_pl_map.get(symbol, {}).get("pwh"),
                "pwl":             all_pl_map.get(symbol, {}).get("pwl"),
                "pmh":             all_pl_map.get(symbol, {}).get("pmh"),
                "pml":             all_pl_map.get(symbol, {}).get("pml"),
                "pyh":             all_pl_map.get(symbol, {}).get("pyh"),
                "pyl":             all_pl_map.get(symbol, {}).get("pyl"),
                **compute_price_context(all_pl_map.get(symbol, {}), 0),
                "updated_at":       datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"),
            })
            gap_history_payload.append({"timestamp": timestamp, "symbol": symbol, "gap": 0})
            PREV_MOMENTUM[symbol] = "NEUTRAL"
            PREV_GAP[symbol]      = 0
            continue

        signal_ready = SIGNAL_RECOVERY.mark(symbol, True, signal_cycle_at)

        # ---- STEP 3: Momentum from gap history ----
        history     = get_gap_history(symbol, n=26)
        delta_short = delta_mid = delta_long = accel = None

        if len(history) >= 3:
            g0  = history[0]
            g2  = history[2]  if len(history) > 2  else None
            g8  = history[8]  if len(history) > 8  else None
            g9  = history[9]  if len(history) > 9  else None
            g24 = history[24] if len(history) > 24 else None

            if g2  is not None: delta_short = round(g0 - g2,  2)
            if g8  is not None: delta_mid   = round(g0 - g8,  2)
            if g24 is not None: delta_long  = round(g0 - g24, 2)
            if g8 is not None and g9 is not None and len(history) > 1:
                prev_delta_mid = round(history[1] - g9, 2)
                accel = round(delta_mid - prev_delta_mid, 2)

        momentum, state = classify_momentum(gap, delta_short, delta_mid, delta_long)

        struct_state = (
            classify_structural_state(gap, delta_mid, accel)
            if delta_mid is not None and accel is not None
            else state
        )

        if delta_mid is not None and accel is not None:
            strength = round(
                (abs(delta_mid)        * 0.45) +
                (abs(accel)            * 0.20) +
                (abs(gap)              * 0.15) +
                (abs(delta_short or 0) * 0.15) +
                (abs(delta_long  or 0) * 0.05),
                2
            )
        elif gap is not None:
            strength = round(abs(gap) * 0.3, 2)
        else:
            strength = 0

        signal = "STRONG" if strength >= 2 else "MODERATE" if strength >= 1 else "NONE"

        prev_gap_val = PREV_GAP.get(symbol)
        close_alert  = should_close_alert(gap, momentum, delta_mid, prev_gap_val)

        prev_mom = PREV_MOMENTUM.get(symbol, "NEUTRAL")
        is_spike = (
            momentum in ("SPARK", "BUILDING", "STRONG") and
            prev_mom not in ("SPARK", "BUILDING", "STRONG") and
            bias != "INVALID"
        )
        if is_spike and signal_ready and abs(gap) >= 5:
            try:
                recent_spike = (supabase.table("spike_events").select("id")
                                .eq("symbol", symbol)
                                .gte("fired_at", (datetime.now(timezone.utc) - timedelta(hours=4)).isoformat())
                                .limit(1).execute().data or [])
            except Exception as e:
                print(f"[SPIKE] Cooldown check unavailable for {symbol}: {e}")
                recent_spike = [True]  # avoid noisy duplicate observations on storage failure
            if not recent_spike:
                spike_alerts.append({
                    "symbol": symbol, "gap": gap, "bias": bias,
                    "momentum": momentum, "delta_short": delta_short,
                    "delta_mid": delta_mid, "strength": strength,
                    "execution": execution, "confidence": confidence,
                    "base_score": scores["base_score"],
                    "quote_score": scores["quote_score"],
                })

        PREV_MOMENTUM[symbol] = momentum

        # ---- EARLY ENTRY: detect gap threshold crossover (BEFORE the rally matures) ----
        _prev_gap_for_early = PREV_GAP.get(symbol, 0)
        _reason = classify_gap_move(_prev_gap_for_early, gap, bias)
        if signal_ready and _reason:
            early_alerts.append({
                "symbol": symbol, "gap": gap, "bias": bias,
                "reason": _reason, "delta_short": delta_short,
                "prev_gap": _prev_gap_for_early, "execution": execution,
                "confidence": confidence,
            })

        # ---- Signal entry: dual strategy (BB + INTRA) ----
        pl_data = all_pl_map.get(symbol, {})
        if TRACK_SIGNAL_RESULTS:
            check_bb_entry(symbol, gap, scores, pl_data, momentum, parsed)
            check_intra_entry(symbol, gap, scores, pl_data, momentum, parsed)
        if TRACK_SHADOW_RESULTS:
            check_shadow_entry(symbol, gap, scores, pl_data, momentum)
        structure_alerts.extend(check_structure_alerts(
            symbol, pl_data, signal_cycle_at, signal_ready and pl_ready_map[symbol]
        ))

        # ---- Gap Alert: abs(gap) 9–12 + valid Panda Lines ----
        _abs_gap = abs(gap)
        _pl_zone = pl_data.get("pl_zone")
        _pl_status = panda_lines_status(_pl_zone, pl_data.get("pl_price"),
                                        pl_data.get("pl_st"), pl_data.get("pl_fl"), symbol)
        _panda_valid = (
            (gap > 0 and _pl_status == "BELOW") or
            (gap < 0 and _pl_status == "ABOVE")
        )
        if signal_ready and pl_ready_map[symbol] and 9 <= _abs_gap <= 12 and _panda_valid:
            gap_alerts.append({
                "symbol": symbol, "gap": gap, "bias": bias,
                "pl_zone": _pl_zone, "pl_status": _pl_status,
                "execution": execution, "confidence": confidence,
            })

        gap_deltas[symbol] = round(gap - PREV_GAP.get(symbol, gap), 2)
        PREV_GAP[symbol]      = gap  # MUST be AFTER signal checks so they see previous cycle's gap

        dashboard_payload.append({
            "symbol":           symbol,
            "gap":              gap,
            "state":            struct_state,
            "momentum":         momentum,
            "close_alert":      close_alert,
            "delta_short":      delta_short,
            "delta_mid":        delta_mid,
            "delta_long":       delta_long,
            "strength":         strength,
            "signal":           signal,
            "hard_invalid":     False,
            "bias":             bias,
            "execution":        execution,
            "confidence":       confidence,
            "base_currency":    parsed["base_cur"],
            "quote_currency":   parsed["quote_cur"],
            "base_score_tf":    derive_score_tf(parsed.get("raw_base_line", "")),
            "quote_score_tf":   derive_score_tf(parsed.get("raw_quote_line", "")),
            "base_d1":          parsed["base_d1"],
            "base_h4":          parsed["base_h4"],
            "base_h1":          parsed["base_h1"],
            "quote_d1":         parsed["quote_d1"],
            "quote_h4":         parsed["quote_h4"],
            "quote_h1":         parsed["quote_h1"],
            "adv_base_d1":      parsed["adv_base_d1"],
            "adv_base_h4":      parsed["adv_base_h4"],
            "adv_base_h1":      parsed["adv_base_h1"],
            "adv_quote_d1":     parsed["adv_quote_d1"],
            "adv_quote_h4":     parsed["adv_quote_h4"],
            "adv_quote_h1":     parsed["adv_quote_h1"],
            "atr":              parsed["atr_current"],
            "atr_reference":    parsed["atr_reference"],
            "spread":           parsed["spread"],
            "box_h1_trend":     compute_box_trends(parsed.get("boxes", []))[0],
            "box_h4_trend":     compute_box_trends(parsed.get("boxes", []))[1],
            "pl_zone":         all_pl_map.get(symbol, {}).get("pl_zone"),
            "pl_bias":         all_pl_map.get(symbol, {}).get("pl_bias"),
            "pl_g1_valid":     all_pl_map.get(symbol, {}).get("pl_g1_valid"),
            "pl_st":           all_pl_map.get(symbol, {}).get("pl_st"),
            "pl_fl":           all_pl_map.get(symbol, {}).get("pl_fl"),
            "pl_price":        all_pl_map.get(symbol, {}).get("pl_price"),
            "pdh":             all_pl_map.get(symbol, {}).get("pdh"),
            "pdl":             all_pl_map.get(symbol, {}).get("pdl"),
            "pwh":             all_pl_map.get(symbol, {}).get("pwh"),
            "pwl":             all_pl_map.get(symbol, {}).get("pwl"),
            "pmh":             all_pl_map.get(symbol, {}).get("pmh"),
            "pml":             all_pl_map.get(symbol, {}).get("pml"),
            "pyh":             all_pl_map.get(symbol, {}).get("pyh"),
            "pyl":             all_pl_map.get(symbol, {}).get("pyl"),
            **compute_price_context(all_pl_map.get(symbol, {}), gap),
            "updated_at":       datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"),
        })

        gap_history_payload.append({"timestamp": timestamp, "symbol": symbol, "gap": gap})

        if delta_mid is not None and accel is not None:
            strength_payload.append({"timestamp": timestamp, "symbol": symbol, "strength": strength})

    print(f"[ENGINE] Read {len(dashboard_payload)} pairs ({stale_count} stale, {hard_invalid_count} hard invalid)")

    # ---- AUTO-HEAL: Track consecutive stale cycles ----
    global CONSECUTIVE_STALE
    # Skip auto-heal when the market is closed — stale files are EXPECTED then, so
    # don't self-restart (this was causing a restart + new-terminal loop every ~15 min on weekends).
    if stale_count > 5 and not is_market_closed():
        CONSECUTIVE_STALE += 1
        print(f"[HEAL] Consecutive stale cycles: {CONSECUTIVE_STALE}")
        if CONSECUTIVE_STALE >= 3:
            _heal_msg = f"⚠️ ENGINE AUTO-HEAL: {stale_count} pairs stale for {CONSECUTIVE_STALE} consecutive cycles. Restarting..."
            print(f"[HEAL] {_heal_msg}")
            try:
                requests.post(f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage",
                    data={"chat_id": ENGINE_HEALTH_CHAT_ID, "text": _heal_msg}, timeout=10)
            except: pass
            import sys
            sys.exit(1)
    else:
        CONSECUTIVE_STALE = 0

    # ---- STEP 4: Write to Supabase ----
    if dashboard_payload:
        try:
            supabase_retry(
                lambda: supabase.table("dashboard").upsert(dashboard_payload, on_conflict="symbol").execute(),
                label="Dashboard"
            )
            print(f"[SUPABASE] Dashboard: {len(dashboard_payload)} pairs")
        except Exception as e:
            print("[SUPABASE ERROR] Dashboard:", e)

    # ---- STEP 4b: Write score files for MT4 panel ----
    for row in dashboard_payload:
        try:
            sym = row.get("symbol", "")
            score_path = os.path.join(MT4_PATH, f"panda_score_{sym.upper()}.txt")
            # Compute confluence (0-100) — EXACT mirror of dashboard computeConfidence()
            _gap = abs(row.get("gap", 0) or 0)
            _bias = row.get("bias") or ""
            _is_buy = (row.get("gap", 0) or 0) > 0
            _conf_score = 0

            # 1. Gap magnitude (+25 or +15)
            if _gap >= 8:   _conf_score += 25
            elif _gap >= 5: _conf_score += 15

            # 2. Matchup spread — EXACT dashboard logic using individual TF scores
            _base_vals = [v for v in [row.get("base_d1"), row.get("base_h4"), row.get("base_h1")] if v is not None]
            _quote_vals = [v for v in [row.get("quote_d1"), row.get("quote_h4"), row.get("quote_h1")] if v is not None]
            if _is_buy:
                _bs_raw = max([v for v in _base_vals if v > 0] + [0])
                _qs_raw = min([v for v in _quote_vals if v < 0] + [0])
            else:
                _bs_raw = min([v for v in _base_vals if v < 0] + [0])
                _qs_raw = max([v for v in _quote_vals if v > 0] + [0])
            _mu_diff = abs(_bs_raw - _qs_raw)
            if _mu_diff >= 8:   _conf_score += 20
            elif _mu_diff >= 5: _conf_score += 10

            # 3. PL zone validation (+15 or -15)
            _pl = all_pl_map.get(sym, {})
            _pl_zone = _pl.get("pl_zone") or ""
            _pl_g1 = _pl.get("pl_g1_valid", False)
            _pl_valid = (_pl_zone == "ABOVE" and _is_buy) or (_pl_zone == "BELOW" and not _is_buy)
            if _pl_valid: _conf_score += 15

            # 4. Box alignment (+10 or +5)
            _good = "UPTREND" if _is_buy else "DOWNTREND"
            _h1t = row.get("box_h1_trend") or ""
            _h4t = row.get("box_h4_trend") or ""
            _h1ok = _h1t == _good
            _h4ok = _h4t == _good
            if _h1ok and _h4ok: _conf_score += 10
            elif _h1ok:         _conf_score += 5

            # 5. COT bias — not available server-side, skip (dashboard-only)

            # 6. Momentum bonus (+10 or +5)
            _mom = row.get("momentum") or ""
            if _mom == "STRONG":     _conf_score += 10
            elif _mom == "BUILDING": _conf_score += 5

            # 7. Strength bonus (+10 or +5)
            _str = abs(row.get("strength", 0) or 0)
            if _str >= 3:   _conf_score += 10
            elif _str >= 1: _conf_score += 5

            # 8. Penalties (applied AFTER bonuses, same as dashboard)
            if _h4t and _h4t != "UNKNOWN" and not _h4ok: _conf_score -= 10
            if not _pl_valid:                             _conf_score -= 15
            if _mom in ("FADING", "REVERSING", "COOLING", "NEUTRAL"): _conf_score -= 10

            _conf_score = max(0, min(100, _conf_score))

            with open(score_path, "w", encoding="utf-8") as sf:
                sf.write(f"GAP:{row.get('gap', 0) or 0}\n")
                sf.write(f"BIAS:{row.get('bias') or 'WAIT'}\n")
                sf.write(f"CONFIDENCE:{row.get('confidence') or 'INVALID'}\n")
                sf.write(f"EXECUTION:{row.get('execution') or 'NONE'}\n")
                sf.write(f"MOMENTUM:{row.get('momentum') or 'NEUTRAL'}\n")
                sf.write(f"STRENGTH:{row.get('strength', 0) or 0}\n")
                sf.write(f"HARD_INVALID:{1 if row.get('hard_invalid') else 0}\n")
                sf.write(f"PL_ZONE:{_pl_zone}\n")
                sf.write(f"PL_G1:{1 if _pl_g1 else 0}\n")
                sf.write(f"BOX_H1:{_h1t}\n")
                sf.write(f"BOX_H4:{_h4t}\n")
                sf.write(f"CONFLUENCE:{_conf_score}\n")
                sf.write(f"WRITE_TIME:{datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')}\n")
        except Exception as _sf_err:
            print(f"[SCORE FILE] {sym}: {_sf_err}")
    if dashboard_payload:
        print(f"[SCORE FILES] Wrote {len(dashboard_payload)} panda_score_*.txt files")

    # ---- SIGNAL SNAPSHOTS: Log all 21 pairs every cycle ----
    if dashboard_payload:
        try:
            snap_ts = datetime.utcnow().isoformat()
            # Allowlist of columns that actually exist in the signal_snapshots table.
            # (timestamp / is_valid / gap_delta are set explicitly below; id is auto.)
            _SNAPSHOT_COLS = (
                "symbol","gap","bias","confidence","execution","momentum","state",
                "strength","signal","hard_invalid","close_alert","delta_short",
                "delta_mid","delta_long","base_d1","base_h4","base_h1","quote_d1",
                "quote_h4","quote_h1","adv_base_d1","adv_base_h4","adv_base_h1",
                "adv_quote_d1","adv_quote_h4","adv_quote_h1","atr","atr_reference",
                "spread","box_h1_trend","box_h4_trend","pl_zone","pl_bias",
                "pl_g1_valid","base_currency","quote_currency","base_score_tf","quote_score_tf",
            )
            snapshot_rows = []
            for row in dashboard_payload:
                bias_val = row.get("bias", "")
                hi = row.get("hard_invalid", False)
                gap_val = abs(row.get("gap", 0))
                # Valid = not hard_invalid, bias is BUY/SELL, |gap| >= 5
                # BB does not require PL zone confirmation
                is_valid = (not hi) and bias_val in ("BUY", "SELL") and gap_val >= 5
                # Keep ONLY real table columns (allowlist) so payload additions
                # (pl_st/pl_fl/pl_price, price-context, etc.) can't 400 the whole insert.
                snap = {k: row.get(k) for k in _SNAPSHOT_COLS if k in row}
                snap["timestamp"] = snap_ts
                snap["is_valid"] = is_valid
                snap["gap_delta"] = gap_deltas.get(row.get("symbol", ""), 0)
                snapshot_rows.append(snap)
            supabase_retry(
                lambda: supabase.table("signal_snapshots").insert(snapshot_rows).execute(),
                label="Snapshots"
            )
            valid_count = sum(1 for r in snapshot_rows if r["is_valid"])
            print(f"[SUPABASE] Snapshots: {len(snapshot_rows)} pairs ({valid_count} valid)")
        except Exception as e:
            print("[SUPABASE ERROR] Snapshots:", e)

    if gap_history_payload:
        try:
            supabase_retry(
                lambda: supabase.table("gap_history").upsert(gap_history_payload, on_conflict="timestamp,symbol").execute(),
                label="GapHistory"
            )
            print(f"[SUPABASE] Gap history: {len(gap_history_payload)} rows")
        except Exception as e:
            print("[SUPABASE ERROR] Gap history:", e)

    if strength_payload:
        try:
            supabase_retry(
                lambda: supabase.table("strength_log").insert(strength_payload).execute(),
                label="StrengthLog"
            )
            print(f"[SUPABASE] Strength log: {len(strength_payload)} rows")
        except Exception as e:
            print("[SUPABASE ERROR] Strength:", e)

    try:
        supabase_retry(
            lambda: supabase.table("engine_logs").insert({
                "timestamp": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"),
                "component": "run_gap_once_v3", "duration": 0, "error": None,
            }).execute(),
            label="EngineLog"
        )
    except: pass

    if spike_alerts:
        print(f"[SPIKE] {len(spike_alerts)} new momentum observations")
        for s in spike_alerts:
            try:
                supabase_retry(
                    lambda s=s: supabase.table("spike_events").insert({
                        "symbol":      s["symbol"],
                        "gap":         s["gap"],
                        "bias":        s["bias"],
                        "momentum":    s["momentum"],
                        "strength":    s["strength"],
                        "delta_short": s["delta_short"],
                        "delta_mid":   s["delta_mid"],
                        "execution":   s.get("execution"),
                        "confidence":  s.get("confidence"),
                        "base_score":  s.get("base_score"),
                        "quote_score": s.get("quote_score"),
                        "fired_at":    datetime.utcnow().isoformat(),
                        "notified":    False,  # confirmed delivery is recorded in signal_alert_outbox
                    }).execute(),
                    label="SpikeEvent"
                )
            except Exception as e:
                print(f"[SPIKE EVENT ERROR]: {e}")

    if gap_alerts:
        print(f"[GAP ALERT] {len(gap_alerts)} confirmed pair(s) eligible for Signal alert")

    # ---- Panda Gold add-on: SuperTrend flip + USD strength filter (separate from locked gap scorer) ----
    try:
        gold_signal = build_gold_signal(all_parsed_map)
        if gold_signal.get("status") != "OFFLINE":
            print(f"[GOLD] {gold_signal.get('status')} {GOLD_SYMBOL} | USD {gold_signal.get('usd_strength', 0):+d} | {gold_signal.get('filter')}")
        else:
            print(f"[GOLD] OFFLINE {GOLD_SYMBOL}: {gold_signal.get('error')}")
    except Exception as e:
        print(f"[GOLD ERROR]: {e}")
        gold_signal = None

    level_assessments = {}
    queued_symbols = dispatch_signal_candidates(
        signal_cycle_at, structure_alerts, gap_alerts, early_alerts, spike_alerts, gold_signal,
        all_parsed_map, all_pl_map, dashboard_payload, level_assessments
    )
    try:
        send_phase_digest(dashboard_payload, queued_symbols, signal_cycle_at, level_assessments)
        dispatch_signal_outbox()
    except Exception as e:
        print(f"[SIGNAL OUTBOX] Dispatch error: {e}")

    # ---- Evaluate pending signal results (price-based) ----
    if TRACK_SIGNAL_RESULTS:
        evaluate_pending_signals(all_scores, all_pl_map)
    if TRACK_SHADOW_RESULTS:
        evaluate_pending_shadows(all_scores, all_pl_map)

    # ---- Signal Tracker: update cycle via Vercel API ----
    try:
        import requests as _req
        _req.post("https://pandaengine.app/api/signal-tracker", json={},
                  headers={"X-Engine-Secret": ENGINE_SECRET}, timeout=10)
        print("[TRACKER] Update cycle triggered")
    except Exception as e:
        print(f"[TRACKER] Skipped: {e}")

    # ---- Engine Heartbeat: write cycle completion to Supabase ----
    try:
        supabase_retry(
            lambda: supabase.table("engine_heartbeat").insert({
                "cycle_type": "gap_cycle",
                "pairs_processed": len(dashboard_payload),
                "signals_pushed": len([r for r in dashboard_payload if abs(r.get("gap", 0)) >= 5]),
                "errors": None,
                "duration_sec": round(time.time() - _cycle_start, 2),
            }).execute(),
            label="Heartbeat"
        )
    except Exception as e:
        print(f"[HEARTBEAT ERROR]: {e}")

    print(f"[ENGINE] Cycle complete")
    return dashboard_payload

# ================= PHASE DIGEST (Telegram, grouped by action) =================
def classify_phase_server(row):
    """Server-side mirror of dashboard computePhase — view logic only, no locked formulas."""
    gap = row.get("gap") or 0
    ag = abs(gap)
    if ag < 5 or row.get("hard_invalid"):
        return None
    state = row.get("state") or ""
    mom   = row.get("momentum") or ""
    fading   = mom in ("FADING", "COOLING", "REVERSING", "REVERSAL")
    igniting = mom in ("SPARK", "BUILDING", "EMERGING")
    adr_used = row.get("adr_used_pct")

    if state.startswith("DEEP_PULLBACK"):                       ph = "RISK"
    elif state.startswith("PULLBACK"):                          ph = "PULLBACK"
    elif fading:                                                ph = "LATE"
    elif (igniting or state.startswith("EXPAND")) and ag <= 9:  ph = "START"
    elif igniting or state.startswith("EXPAND"):                ph = "MID"
    elif ag >= 12:                                              ph = "LATE"
    else:                                                       ph = "MID"
    if adr_used is not None and adr_used >= 70 and ph in ("START", "MID"):
        ph = "LATE"

    direction = "BUY" if gap > 0 else "SELL"
    pdr_ok = bool(row.get("pdr_strong_live")) and (
        (direction == "BUY" and row.get("pdr_dir") == "BULLISH") or
        (direction == "SELL" and row.get("pdr_dir") == "BEARISH"))
    pb = row.get("pullback_pct")
    ready_pb = (ph == "PULLBACK" and pdr_ok and pb is not None and 30 <= pb <= 60)
    return {"phase": ph, "dir": direction, "gap": gap, "pdr_ok": pdr_ok, "pb": pb, "ready_pb": ready_pb}


def in_pullback_zone_now(row):
    """Live pullback detection: 30-60% retrace of today's move OR price at a Panda
    Line AFTER a real retrace. Guards: the day must have moved (>=30% ADR used)
    and price must have retraced >=20% — proximity without a prior move is NOT
    a pullback."""
    pb = row.get("pullback_pct")
    adr_used = row.get("adr_used_pct")
    moved = adr_used is not None and adr_used >= 30
    retraced = pb is not None and pb >= 20
    pb_ok = moved and pb is not None and 30 <= pb <= 60
    line_ok = False
    price, st, fl, atr = row.get("pl_price"), row.get("pl_st"), row.get("pl_fl"), row.get("atr")
    if moved and retraced and price and atr and (st is not None or fl is not None):
        pip = 0.01 if "JPY" in (row.get("symbol") or "").upper() else 0.0001
        lines = [x for x in (st, fl) if x is not None]
        dist_pips = min(abs(price - l) for l in lines) / pip
        line_ok = dist_pips <= (atr * 0.15)
    return pb_ok or line_ok


def verdict_action_word(row, c):
    """Snapshot ACTION word — Boss-G execution rules.
    gap>=9 + PL agree = EXECUTE. Valid bias otherwise = pullback play. PDR = bonus only."""
    if c is None:
        return "WAIT"
    if c["phase"] == "RISK":
        return "CLOSE?"
    if c["phase"] == "LATE":
        return "NO CHASE"
    gap = row.get("gap") or 0
    ag = abs(gap)
    direction = "BUY" if gap > 0 else "SELL"
    status = panda_lines_status(row.get("pl_zone"), row.get("pl_price"), row.get("pl_st"),
                                row.get("pl_fl"), row.get("symbol"))
    pl_valid = (direction == "BUY" and status == "BELOW") or (direction == "SELL" and status == "ABOVE")
    if ag >= 9 and pl_valid:
        return "EXECUTE"
    if in_pullback_zone_now(row):
        return "ENTER PB"
    return "PB WAIT"


def send_phase_digest(dashboard_rows, excluded_symbols, cycle_at, level_assessments=None):
    """Grouped action message to the SPIKE bot/group (SIGNAL_*).
    Anti-spam: persisted 2h minimum, changed content, and no immediate repeats."""
    # Phase digest now goes to the SPIKE bot/group (SIGNAL_*), not the main snapshot group.
    if not SIGNAL_BOT_TOKEN or not SIGNAL_CHAT_ID:
        return
    if is_market_closed():
        return
    try:
        recent = (supabase.table("signal_alert_outbox").select("payload,sent_at")
                  .eq("alert_type", "digest").eq("status", "sent")
                  .order("sent_at", desc=True).limit(1).execute().data or [])
        unresolved = (supabase.table("signal_alert_outbox").select("id")
                      .eq("alert_type", "digest")
                      .in_("status", ["pending", "sending", "uncertain"])
                      .gte("created_at", (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat())
                      .limit(1).execute().data or [])
    except Exception as e:
        print(f"[PHASE DIGEST] Could not read delivery state: {e}")
        return
    if unresolved:
        return
    if recent and recent[0].get("sent_at"):
        last = datetime.fromisoformat(recent[0]["sent_at"].replace("Z", "+00:00"))
        if (datetime.now(timezone.utc) - last).total_seconds() < 7200:
            return

    groups = {"EXEC": [], "PBNOW": [], "PBWAIT": [], "WATCH": [], "CLOSE": []}
    for r in dashboard_rows:
        if r.get("symbol") in excluded_symbols:
            continue
        c = classify_phase_server(r)
        if not c:
            continue
        tag = f"{r.get('symbol')} {c['dir']} {c['gap']:+.0f}"
        tag += f" PL {panda_lines_status(r.get('pl_zone'), r.get('pl_price'), r.get('pl_st'), r.get('pl_fl'), r.get('symbol'))}"
        level = (level_assessments or {}).get(r.get("symbol")) or {}
        if level.get("priority") == "LOW PRIORITY":
            tag += " [LOW PRIORITY: LEVELS]"
        elif level.get("priority") in ("CAUTION", "REVIEW"):
            tag += " [LEVEL REVIEW]"
        if level.get("short_label"):
            tag += f" · {level['short_label']}"
        star = " ★" if c.get("pdr_ok") else ""
        w = verdict_action_word(r, c)
        if w == "CLOSE?":     groups["CLOSE"].append(tag)
        elif w == "NO CHASE": groups["WATCH"].append(tag)
        elif w == "EXECUTE":  groups["EXEC"].append(tag + star)
        elif w == "ENTER PB": groups["PBNOW"].append(tag + star)
        else:                 groups["PBWAIT"].append(tag)

    sig = "|".join(",".join(sorted(v)) for v in groups.values())
    if (recent and sig == (recent[0].get("payload") or {}).get("signature")) or not any(groups.values()):
        return

    lines = ["🐼 <b>PANDA PHASE DIGEST</b>", datetime.now().strftime("%d %b %H:%M"), ""]
    def _sec(icon, title, items, hint):
        if not items:
            return
        lines.append(f"{icon} <b>{title}</b>")
        for t in items:
            lines.append(f"   {t}")
        lines.append(f"   <i>{hint}</i>")
        lines.append("")
    _sec("🟢", "GAP 9+ & PL CONFIRMED", groups["EXEC"], "★ = PDR bonus aligned")
    _sec("🎯", "IN PULLBACK AREA", groups["PBNOW"], "price is at the observed pullback area")
    _sec("🟡", "PULLBACK ZONE PENDING", groups["PBWAIT"], "bias is confirmed; retrace has not arrived")
    _sec("⚠️", "LATE OR EXHAUSTED", groups["WATCH"], "momentum requires caution")
    _sec("🔴", "TREND RISK", groups["CLOSE"], "trend may be weakening")
    if any((level_assessments or {}).get(r.get("symbol"), {}).get("priority") in ("LOW PRIORITY", "CAUTION", "REVIEW")
           for r in dashboard_rows if r.get("symbol") not in excluded_symbols):
        lines.append("Level labels mean check the chart; nearby lines alone do not cancel a setup.")
    msg = "\n".join(lines).strip()
    try:
        enqueue_alert(supabase, {"symbol": "DIGEST", "alert_type": "digest",
                                 "cycle_at": cycle_at, "event_id": f"{sig}|{int(datetime.fromisoformat(cycle_at).timestamp() // 900)}", "text": msg,
                                 "signature": sig}, ttl_seconds=240)
    except Exception as e:
        print(f"[PHASE DIGEST] Queue error: {e}")


# ================= NIGHTLY ANALYST (private — Boss-G only) =================
LAST_ANALYST_DATE = None

def _agg_signal_rows(rows, key_fn):
    groups = {}
    for r in rows:
        k = key_fn(r) or "?"
        g = groups.setdefault(k, {"n": 0, "w": 0, "l": 0, "net": 0.0})
        pips = float(r.get("pips") or 0)
        g["n"] += 1
        g["net"] += pips
        if pips > 5: g["w"] += 1
        elif pips < -5: g["l"] += 1
    return groups

def nightly_analyst():
    """Trailing-30-day performance digest → LOGIN_ALERT bot (admin private chat).
    Runs once per day via master_scheduler."""
    if not LOGIN_ALERT_BOT_TOKEN or not LOGIN_ALERT_CHAT_ID:
        print("[ANALYST] Skipped — login alert bot not configured")
        return
    try:
        since = (datetime.utcnow() - timedelta(days=30)).isoformat()
        res = supabase.table("signal_results") \
            .select("symbol,strategy,session,entry_gap,pips,created_at") \
            .eq("status", "DONE").gte("created_at", since).limit(8000).execute()
        rows = res.data or []

        sh = supabase.table("shadow_tracker").select("tier,pips,status,created_at") \
            .gte("created_at", since).limit(4000).execute()
        shadow = sh.data or []
        shadow_done = [r for r in shadow if r.get("status") == "DONE"]

        lines = ["🐼 NIGHTLY ANALYST — last 30 days", ""]

        if rows:
            net = sum(float(r.get("pips") or 0) for r in rows)
            wins = sum(1 for r in rows if float(r.get("pips") or 0) > 5)
            losses = sum(1 for r in rows if float(r.get("pips") or 0) < -5)
            lines.append(f"SIGNALS: {len(rows)} closed | {wins}W/{losses}L | net {net:+.0f} pips")

            by_sess = _agg_signal_rows(rows, lambda r: r.get("session"))
            sess_str = " | ".join(f"{k}: {v['net']:+.0f}p (n={v['n']})" for k, v in sorted(by_sess.items()) if k and k != "?")
            if sess_str: lines.append(f"SESSIONS: {sess_str}")

            hi = [r for r in rows if abs(r.get("entry_gap") or 0) >= 9]
            if hi:
                hi_net = sum(float(r.get("pips") or 0) for r in hi)
                lines.append(f"GAP 9+: {len(hi)} signals, {hi_net:+.0f} pips ({hi_net/len(hi):+.1f}/signal)")

            by_pair = _agg_signal_rows(rows, lambda r: r.get("symbol"))
            ranked = sorted(by_pair.items(), key=lambda kv: kv[1]["net"], reverse=True)
            if ranked:
                best = ", ".join(f"{k} {v['net']:+.0f}" for k, v in ranked[:3])
                worst = ", ".join(f"{k} {v['net']:+.0f}" for k, v in ranked[-3:])
                lines.append(f"BEST: {best}")
                lines.append(f"WORST: {worst}")
        else:
            lines.append("SIGNALS: none closed in window")

        lines.append("")
        if shadow:
            sd_net = sum(float(r.get("pips") or 0) for r in shadow_done)
            sd_w = sum(1 for r in shadow_done if float(r.get("pips") or 0) > 5)
            sd_l = sum(1 for r in shadow_done if float(r.get("pips") or 0) < -5)
            open_n = len(shadow) - len(shadow_done)
            avg = (sd_net / len(shadow_done)) if shadow_done else 0
            lines.append(f"SHADOW 9+: {len(shadow)} entries ({open_n} open) | {sd_w}W/{sd_l}L | net {sd_net:+.0f}p | avg {avg:+.1f}/trade")
        else:
            lines.append("SHADOW 9+: no entries yet")

        msg = "\n".join(lines)
        r = requests.post(
            f"https://api.telegram.org/bot{LOGIN_ALERT_BOT_TOKEN}/sendMessage",
            data={"chat_id": LOGIN_ALERT_CHAT_ID, "text": msg},
            timeout=15)
        print(f"[ANALYST] {'Sent' if r.status_code == 200 else f'Telegram error {r.status_code}'}")
    except Exception as e:
        print(f"[ANALYST] Error: {e}")


def maybe_run_nightly_analyst(now):
    """Fire once daily at 01:00 local (before the 2-4AM UAE trade window)."""
    global LAST_ANALYST_DATE
    if now.hour == 1 and LAST_ANALYST_DATE != now.date():
        LAST_ANALYST_DATE = now.date()
        nightly_analyst()


# ================= SNAPSHOT GENERATOR =================
PL_DISPLAY_BUFFER_PIPS = 10.0


def panda_lines_status(zone, price, st, fl, symbol):
    """Confirmed line position after a 10-pip clearance from both lines."""
    if zone == "BETWEEN":
        return "BETWEEN"
    if zone not in ("ABOVE", "BELOW"):
        return "UNVERIFIED"
    try:
        price, st, fl = float(price), float(st), float(fl)
    except (TypeError, ValueError):
        return "UNVERIFIED"
    if not all(math.isfinite(v) and v > 0 for v in (price, st, fl)):
        return "UNVERIFIED"
    pip = 0.01 if "JPY" in (symbol or "").upper() else 0.0001
    clearance = PL_DISPLAY_BUFFER_PIPS * pip
    if zone == "ABOVE" and price > max(st, fl):
        return "BELOW" if price - max(st, fl) + 1e-10 >= clearance else "NEAR"
    if zone == "BELOW" and price < min(st, fl):
        return "ABOVE" if min(st, fl) - price + 1e-10 >= clearance else "NEAR"
    return "BETWEEN" if min(st, fl) <= price <= max(st, fl) else "UNVERIFIED"


def panda_lines_position(zone):
    """Display line position relative to price; stored zone describes price relative to lines."""
    return {"ABOVE": "BELOW", "BELOW": "ABOVE"}.get(zone, zone or "-")


def _score_label(raw_score):
    """Exact match to dashboard.js scoreLabel — uses single strongest TF value, NOT sum."""
    v = raw_score or 0
    if v >= 4:  return "STRONG"
    if v <= -4: return "WEAK"
    return "NEUTRAL"

def _compute_confidence(r):
    """
    Exact port of dashboard.js computeConfidence(row, trend, cotBias).
    trend/cotBias not available in engine context — those bonuses skipped.
    Returns (score_int, tier_label) e.g. (68, 'MOD').
    """
    gap = abs(r.get("gap") or 0)
    is_buy = (r.get("gap") or 0) > 0
    base_vals = [v for v in [r.get("base_d1"), r.get("base_h4"), r.get("base_h1")] if v is not None]
    quote_vals = [v for v in [r.get("quote_d1"), r.get("quote_h4"), r.get("quote_h1")] if v is not None]
    if is_buy:
        bs_raw = max([v for v in base_vals if v > 0] or [0])
        qs_raw = min([v for v in quote_vals if v < 0] or [0])
    else:
        bs_raw = min([v for v in base_vals if v < 0] or [0])
        qs_raw = max([v for v in quote_vals if v > 0] or [0])
    score = 0
    if gap >= 8: score += 25
    elif gap >= 5: score += 15
    diff = abs(bs_raw - qs_raw)
    if diff >= 8: score += 20
    elif diff >= 5: score += 10
    bias_label = "BUY" if (r.get("gap") or 0) >= 5 else "SELL" if (r.get("gap") or 0) <= -5 else "WAIT"
    pl_zone_val = r.get("pl_zone")
    fl_valid = (bias_label == "BUY" and pl_zone_val == "ABOVE") or (bias_label == "SELL" and pl_zone_val == "BELOW")
    if fl_valid: score += 15
    good_trend = "UPTREND" if is_buy else "DOWNTREND"
    h1_ok = r.get("box_h1_trend") == good_trend
    h4_ok = r.get("box_h4_trend") == good_trend
    if h1_ok and h4_ok: score += 10
    elif h1_ok: score += 5
    mom = r.get("momentum", "")
    if mom == "STRONG": score += 10
    elif mom == "BUILDING": score += 5
    strength = abs(r.get("strength") or 0)
    if strength >= 3: score += 10
    elif strength >= 1: score += 5
    if r.get("box_h4_trend") and r.get("box_h4_trend") != "UNKNOWN" and not h4_ok: score -= 10
    if not fl_valid: score -= 15
    if mom in ("FADING", "REVERSING", "COOLING", "NEUTRAL"): score -= 10
    score = max(0, min(100, score))
    if score >= 90: tier = "ELITE"
    elif score >= 75: tier = "HIGH"
    elif score >= 60: tier = "MOD"
    elif score >= 40: tier = "LOW"
    else: tier = "WEAK"
    return score, tier

def _load_snapshot_font(font_name, size):
    candidates = [
        font_name,
        os.path.join(os.environ.get("WINDIR", r"C:\Windows"), "Fonts", font_name),
    ]
    for candidate in candidates:
        if os.path.isabs(candidate) and os.path.exists(candidate):
            return ImageFont.truetype(candidate, size)
    try:
        return ImageFont.truetype(font_name, size)
    except Exception:
        return ImageFont.load_default()


def snapshot_pair_levels(row):
    """Nearby support/resistance label, matching the dashboard Pair Card."""
    symbol = row.get("symbol") or ""
    try:
        price = float(row.get("pl_price"))
    except (TypeError, ValueError):
        return None
    if not math.isfinite(price) or price <= 0:
        return None
    pip = 0.01 if "JPY" in symbol.upper() else 0.0001
    support, resistance = [], []
    has_level = False
    for name in ("PDH", "PDL", "PWH", "PWL"):
        try:
            level = float(row.get(name.lower()))
        except (TypeError, ValueError):
            continue
        if math.isfinite(level) and level > 0:
            has_level = True
            distance = abs(level - price) / pip
            if distance > 30:
                continue
            if level <= price:
                support.append((distance, name))
            if level >= price:
                resistance.append((distance, name))
    if not has_level:
        return None
    support.sort()
    resistance.sort()
    if support and resistance:
        return "BETWEEN SUPPORT & RESISTANCE"
    levels = support or resistance
    if not levels:
        return ""
    stacked = len(levels) > 1 and levels[1][0] - levels[0][0] <= 10
    side = "SUPPORT" if support else "RESISTANCE"
    names = " + ".join(name for _, name in levels[:2 if stacked else 1])
    return f"{'STACKED' if stacked else 'NEAR'} {side} ({names})"


def snapshot_adv_forecast(row, now=None):
    """Compact display-only ADV gap, using the Pair Card's horizon inputs."""
    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    dubai_day = (now.astimezone(timezone.utc) + timedelta(hours=4)).weekday()
    if dubai_day <= 3:
        horizon = "TMRW"
        base_keys = ("base_d1", "base_h4", "adv_base_h1")
        quote_keys = ("quote_d1", "quote_h4", "adv_quote_h1")
    else:
        horizon = "WK"
        base_keys = ("base_d1", "adv_base_h4", "adv_base_h1")
        quote_keys = ("quote_d1", "adv_quote_h4", "adv_quote_h1")

    def currency_score(keys):
        try:
            values = [float(row[key]) for key in keys]
        except (KeyError, TypeError, ValueError):
            return None
        if not all(math.isfinite(value) for value in values):
            return None
        positive = max((value for value in values if value > 0), default=0)
        negative = min((value for value in values if value < 0), default=0)
        if positive == -negative:
            return 0
        return positive if positive > -negative else negative

    base_score = currency_score(base_keys)
    quote_score = currency_score(quote_keys)
    if base_score is None or quote_score is None:
        return None
    gap = base_score - quote_score
    return f"{horizon} {gap:+g}" if gap else f"{horizon} 0"


def snapshot_pl_verdict(bias, status):
    """Read-only PL confirmation of a displayed BUY/SELL bias."""
    if bias not in ("BUY", "SELL"):
        return "—"
    if status == "UNVERIFIED":
        return "N/A"
    if status == "NEAR":
        return "NEAR"
    expected = "BELOW" if bias == "BUY" else "ABOVE"
    return "VALID" if status == expected else "INVALID"

def build_snapshot_layout(pair_count):
    """
    Telegram previews tall portrait images as narrow thumbnails. Keep 21 pairs in
    two columns so the preview stays wide enough for the row text to be readable.
    """
    columns = 2 if pair_count > 12 else 1
    rows_per_col = max(1, (pair_count + columns - 1) // columns)
    card_w = 1700
    margin = 36
    gutter = 32
    header_h = 220
    footer_h = 120
    row_h = 360
    row_gap = 14
    width = margin * 2 + card_w * columns + gutter * (columns - 1)
    height = header_h + rows_per_col * (row_h + row_gap) + footer_h
    return {
        "columns": columns,
        "rows_per_col": rows_per_col,
        "fields": ["PAIR", "GAP", "BIAS", "MATCHUP", "H1/H4", "PL", "XTF", "LEVEL"],
        "width": width,
        "height": height,
        "card_w": card_w,
        "margin": margin,
        "gutter": gutter,
        "header_h": header_h,
        "footer_h": footer_h,
        "row_h": row_h,
        "row_gap": row_gap,
        "accent_w": 18,
        "top_offsets": {"gap_label": 425, "gap_value": 555, "bias": 770, "matchup": 1190},
        "line_offsets": {"box": 104, "metrics": 188, "levels": 274},
    }

def generate_snapshot(pair_data):
    """
    Renders PNG cards: ALL 21 pairs, alphabetical, color-coded.
    GREEN=valid BUY, RED=valid SELL, YELLOW=invalid+strong currency, WHITE=invalid+weak.
    """
    # ---- SNAPSHOT v8: two columns for readable Telegram previews ----
    layout = build_snapshot_layout(len(pair_data))
    width    = layout["width"]
    height   = layout["height"]
    rows_per_col = layout["rows_per_col"]
    CARD_W   = layout["card_w"]
    MARGIN   = layout["margin"]
    GUTTER   = layout["gutter"]
    ROW_H    = layout["row_h"]
    ROW_GAP  = layout["row_gap"]
    HEADER_H = layout["header_h"]
    FOOTER_H = layout["footer_h"]
    ACCENT_W = layout["accent_w"]
    TOP_OFFSETS = layout["top_offsets"]
    LINE_OFFSETS = layout["line_offsets"]

    # ---- Palette (light theme with high-visibility signal rows) ----
    BG_PAGE   = (214, 220, 226)
    BG_CARD   = (236, 239, 243)
    BG_CARD2  = (226, 231, 236)
    BG_BUY    = (125, 210, 160)
    BG_BUY2   = (105, 195, 145)
    BG_SELL   = (248, 130, 152)
    BG_SELL2  = (232, 108, 132)
    BG_YELLOW = (255, 210, 72)
    BG_YELLOW2= (242, 190, 42)
    TEXT_HEAD = (24, 30, 42)
    ACCENT    = (0, 110, 205)
    C_BUY     = (0,  88, 44)
    C_SELL    = (170, 0,  28)
    C_YELLOW  = (118, 62, 0)
    C_WHITE   = (70, 82, 102)

    img  = Image.new("RGB", (width, height), BG_PAGE)
    draw = ImageDraw.Draw(img)

    # ---- Fonts sized for improved readability on small previews ----
    font_title = _load_snapshot_font("arialbd.ttf", 72)
    font_pair  = _load_snapshot_font("arialbd.ttf", 72)
    font_bias  = _load_snapshot_font("arialbd.ttf", 96)
    font_data  = _load_snapshot_font("arial.ttf",   56)
    font_bold  = _load_snapshot_font("arialbd.ttf", 72)
    font_hdr   = _load_snapshot_font("arialbd.ttf", 52)
    font_sm    = _load_snapshot_font("arial.ttf",   44)
    font_match = _load_snapshot_font("arial.ttf",   38)
    font_label = _load_snapshot_font("arialbd.ttf", 42)
    font_level = [_load_snapshot_font("arialbd.ttf", size) for size in (60, 54, 48, 42)]
    font_adv = _load_snapshot_font("arialbd.ttf", 48)
    font_xtf = [_load_snapshot_font("arial.ttf", size) for size in (54, 48, 42, 36)]

    # ---- Header ----
    draw.rectangle([0, 0, width, HEADER_H], fill=BG_CARD)
    draw.rectangle([0, HEADER_H - 4, width, HEADER_H], fill=ACCENT)
    draw.text((MARGIN, 40), "PANDA ENGINE v3.0", fill=TEXT_HEAD, font=font_title)
    draw.text((MARGIN, 120), "LIVE PAIR SNAPSHOT  |  NEARBY LEVELS WITHIN 30 PIPS",
              fill=TEXT_HEAD, font=font_hdr)

    # ---- Data rows ----
    for idx, p in enumerate(pair_data):
        col = idx // rows_per_col
        row = idx % rows_per_col
        x_card = MARGIN + col * (CARD_W + GUTTER)
        y_card = HEADER_H + row * (ROW_H + ROW_GAP) + ROW_GAP
        y_end  = y_card + ROW_H
        cat    = p.get("category", "WHITE")

        # Row background
        if cat == "BUY":
            bg = BG_BUY if idx % 2 == 0 else BG_BUY2
        elif cat == "SELL":
            bg = BG_SELL if idx % 2 == 0 else BG_SELL2
        elif cat == "YELLOW":
            bg = BG_YELLOW if idx % 2 == 0 else BG_YELLOW2
        else:
            bg = BG_CARD if idx % 2 == 0 else BG_CARD2
        draw.rectangle([x_card, y_card, x_card + CARD_W, y_end], fill=bg)
        draw.rectangle([x_card, y_end - 1, x_card + CARD_W, y_end], fill=(200, 205, 215))

        # Thick accent bar
        if cat == "BUY":
            draw.rectangle([x_card, y_card, x_card + ACCENT_W, y_end], fill=C_BUY)
        elif cat == "SELL":
            draw.rectangle([x_card, y_card, x_card + ACCENT_W, y_end], fill=C_SELL)
        elif cat == "YELLOW":
            draw.rectangle([x_card, y_card, x_card + ACCENT_W, y_end], fill=C_YELLOW)

        # Text color
        if cat == "BUY":      tc = C_BUY
        elif cat == "SELL":   tc = C_SELL
        elif cat == "YELLOW": tc = C_YELLOW
        else:                 tc = C_WHITE

        gap_val = p.get("gap", 0)
        gap_str = f"{gap_val:+.0f}" if gap_val != 0 else "0"
        bias_text = str(p.get("bias", "-"))
        x = x_card + ACCENT_W + 28
        top_y = y_card + 20
        box_y = y_card + LINE_OFFSETS["box"]
        metrics_y = y_card + LINE_OFFSETS["metrics"]

        draw.text((x, top_y), str(p.get("symbol", "")), fill=tc, font=font_pair)
        draw.text((x + TOP_OFFSETS["gap_label"], top_y + 23), "GAP", fill=tc, font=font_label)
        draw.text((x + TOP_OFFSETS["gap_value"], top_y + 5), gap_str, fill=tc, font=font_bold)
        if bias_text in ("INVALID", "OFFLINE"):
            draw.text((x + TOP_OFFSETS["bias"], top_y + 5), bias_text, fill=tc, font=font_bold)
        else:
            draw.text((x + TOP_OFFSETS["bias"], top_y - 2), bias_text, fill=tc, font=font_bias)
        draw.text((x + TOP_OFFSETS["matchup"], top_y + 30), str(p.get("matchup") or "-"),
                  fill=tc, font=font_match)

        if "box_h1" in p:
            draw.text((x, box_y + 8), "H1", fill=tc, font=font_label)
            draw.text((x + 115, box_y), p["box_h1"], fill=tc, font=font_data)
            draw.text((x + 360, box_y + 8), "H4", fill=tc, font=font_label)
            draw.text((x + 475, box_y), p["box_h4"], fill=tc, font=font_data)
        else:
            draw.text((x, box_y + 8), "BOX", fill=tc, font=font_label)
            draw.text((x + 155, box_y), str(p.get("box_badge") or "-"), fill=tc, font=font_data)
        draw.text((x + 800, box_y + 8), "PDR", fill=tc, font=font_label)
        draw.text((x + 950, box_y), str(p.get("pdr") or "-"), fill=tc, font=font_data)
        pl_verdict = p.get("pl_verdict") or "N/A"
        pl_color = C_YELLOW if pl_verdict in ("NEAR", "INVALID") else C_WHITE if pl_verdict == "N/A" else tc
        draw.text((x, metrics_y + 8), "PL", fill=tc, font=font_label)
        draw.text((x + 110, metrics_y), pl_verdict, fill=pl_color, font=font_data)

        # EXTREME TF line (v9) — timeframes at ±4/5/6 per currency, e.g. "GBP D1+5 H4+5 | JPY H1-5"
        draw.text((x + 550, metrics_y + 8), "XTF", fill=tc, font=font_label)
        xtf_text = str(p.get("xtf") or "-")
        xtf_width = CARD_W - 760
        xtf_font = next((font for font in font_xtf
                         if draw.textbbox((0, 0), xtf_text, font=font)[2] <= xtf_width), font_xtf[-1])
        full_xtf = xtf_text
        while xtf_text and draw.textbbox((0, 0), xtf_text + "…", font=xtf_font)[2] > xtf_width:
            xtf_text = xtf_text[:-1]
        if xtf_text != full_xtf:
            xtf_text += "…"
        draw.text((x + 680, metrics_y), xtf_text, fill=tc, font=xtf_font)

        level_y = y_card + LINE_OFFSETS["levels"]
        draw.line((x, level_y - 12, x_card + CARD_W - 26, level_y - 12), fill=tc, width=2)
        draw.text((x, level_y + 6), "LEVEL", fill=tc, font=font_sm)
        nearby = p.get("level")
        level_text = "N/A" if nearby is None else nearby or "NO NEAR LEVEL"
        adv_text = f"ADV {p['adv_forecast']}" if p.get("adv_forecast") else ""
        adv_width = draw.textbbox((0, 0), adv_text, font=font_adv)[2] if adv_text else 0
        adv_x = x_card + CARD_W - 26 - adv_width
        level_width = (adv_x - 30 if adv_text else x_card + CARD_W - 26) - (x + 210)
        level_font = next((font for font in font_level
                           if draw.textbbox((0, 0), level_text, font=font)[2] <= level_width),
                          font_level[-1]) if nearby else font_data
        draw.text((x + 210, level_y), level_text, fill=tc, font=level_font)
        if adv_text:
            draw.text((adv_x, level_y + 8), adv_text, fill=tc, font=font_adv)

    # ---- Footer (clean — legend lives on the dashboard Overview tab) ----
    footer_y = height - FOOTER_H
    draw.rectangle([0, footer_y, width, footer_y + FOOTER_H], fill=BG_CARD)
    draw.rectangle([0, footer_y, width, footer_y + 4], fill=ACCENT)
    ts_str = datetime.now().strftime("%Y-%m-%d %H:%M")
    draw.text((MARGIN, footer_y + 30),
              f"PANDA ENGINE v3.0  |  {ts_str}", fill=TEXT_HEAD, font=font_sm)

    img.save("snapshot.png", quality=95)
    return "snapshot.png"

def generate_adv_scorecard(rows):
    """
    Renders a second Telegram image focused on score internals:
    BASE/QUOTE D1-H4-H1 plus ADV D1-H4-H1. Visual only; scoring is unchanged.
    """
    rows = sorted(rows, key=lambda r: r.get("symbol") or "")
    columns = 2 if len(rows) > 12 else 1
    rows_per_col = max(1, (len(rows) + columns - 1) // columns)
    card_w = 1700
    margin = 36
    gutter = 32
    header_h = 230
    footer_h = 110
    row_h = 235
    row_gap = 14
    width = margin * 2 + card_w * columns + gutter * (columns - 1)
    height = header_h + rows_per_col * (row_h + row_gap) + footer_h

    bg_page = (214, 220, 226)
    bg_card = (236, 239, 243)
    bg_card2 = (226, 231, 236)
    bg_buy = (125, 210, 160)
    bg_buy2 = (105, 195, 145)
    bg_sell = (248, 130, 152)
    bg_sell2 = (232, 108, 132)
    bg_yellow = (255, 210, 72)
    bg_yellow2 = (242, 190, 42)
    text_head = (24, 30, 42)
    text_dark = (48, 58, 74)
    accent = (0, 110, 205)
    buy_col = (0, 88, 44)
    sell_col = (170, 0, 28)
    watch_col = (118, 62, 0)
    muted_col = (70, 82, 102)

    img = Image.new("RGB", (width, height), bg_page)
    draw = ImageDraw.Draw(img)
    font_title = _load_snapshot_font("arialbd.ttf", 72)
    font_hdr = _load_snapshot_font("arialbd.ttf", 48)
    font_pair = _load_snapshot_font("arialbd.ttf", 58)
    font_data = _load_snapshot_font("arial.ttf", 48)
    font_bold = _load_snapshot_font("arialbd.ttf", 50)
    font_sm = _load_snapshot_font("arial.ttf", 40)

    draw.rectangle([0, 0, width, header_h], fill=bg_card)
    draw.rectangle([0, header_h - 4, width, header_h], fill=accent)
    draw.text((margin, 38), "PANDA ADV SCORECARD", fill=text_head, font=font_title)
    draw.text((margin, 122), "PAIR  GAP  BIAS    BASE/QUOTE RAW TF     ADV BASE/QUOTE TF",
              fill=text_head, font=font_hdr)

    def _tf_line(prefix, d1, h4, h1):
        return f"{prefix} D1 {int(d1 or 0):+d} H4 {int(h4 or 0):+d} H1 {int(h1 or 0):+d}"

    def _adv_row_category(r):
        gap = r.get("gap") or 0
        bias = r.get("bias") or ""
        if not r.get("hard_invalid") and bias == "BUY" and abs(gap) >= 5:
            return "BUY"
        if not r.get("hard_invalid") and bias == "SELL" and abs(gap) >= 5:
            return "SELL"
        base_vals = [r.get("base_d1"), r.get("base_h4"), r.get("base_h1")]
        quote_vals = [r.get("quote_d1"), r.get("quote_h4"), r.get("quote_h1")]
        base_extreme = any(abs(v or 0) >= 4 for v in base_vals)
        quote_extreme = any(abs(v or 0) >= 4 for v in quote_vals)
        base_signs = {1 if v > 0 else -1 for v in base_vals if v is not None and abs(v) >= 4}
        quote_signs = {1 if v > 0 else -1 for v in quote_vals if v is not None and abs(v) >= 4}
        same_side_conflict = bool(base_signs and quote_signs and base_signs == quote_signs)
        return "YELLOW" if (base_extreme or quote_extreme) and not same_side_conflict else "WHITE"

    for idx, r in enumerate(rows):
        col = idx // rows_per_col
        row = idx % rows_per_col
        x_card = margin + col * (card_w + gutter)
        y_card = header_h + row * (row_h + row_gap) + row_gap
        y_end = y_card + row_h
        cat = _adv_row_category(r)
        if cat == "BUY":
            fill = bg_buy if idx % 2 == 0 else bg_buy2
            tc = buy_col
        elif cat == "SELL":
            fill = bg_sell if idx % 2 == 0 else bg_sell2
            tc = sell_col
        elif cat == "YELLOW":
            fill = bg_yellow if idx % 2 == 0 else bg_yellow2
            tc = watch_col
        else:
            fill = bg_card if idx % 2 == 0 else bg_card2
            tc = muted_col
        symbol = r.get("symbol") or "-"
        gap = r.get("gap") or 0
        bias = r.get("bias") or "INVALID"
        if cat == "YELLOW":
            bias = "WATCH"
        elif bias not in ("BUY", "SELL") or abs(gap) < 5 or r.get("hard_invalid"):
            bias = "INVALID"
        base_cur = r.get("base_currency") or symbol[:3]
        quote_cur = r.get("quote_currency") or symbol[3:6]

        draw.rectangle([x_card, y_card, x_card + card_w, y_end], fill=fill)
        draw.rectangle([x_card, y_card, x_card + 16, y_end], fill=tc)
        x = x_card + 42
        draw.text((x, y_card + 22), symbol, fill=tc, font=font_pair)
        draw.text((x + 360, y_card + 28), f"{gap:+.0f}" if gap else "0", fill=tc, font=font_bold)
        draw.text((x + 520, y_card + 28), bias, fill=tc, font=font_bold)

        raw_base = _tf_line(base_cur, r.get("base_d1"), r.get("base_h4"), r.get("base_h1"))
        raw_quote = _tf_line(quote_cur, r.get("quote_d1"), r.get("quote_h4"), r.get("quote_h1"))
        adv_base = _tf_line("ADV " + base_cur, r.get("adv_base_d1"), r.get("adv_base_h4"), r.get("adv_base_h1"))
        adv_quote = _tf_line("ADV " + quote_cur, r.get("adv_quote_d1"), r.get("adv_quote_h4"), r.get("adv_quote_h1"))

        draw.text((x, y_card + 96), raw_base, fill=text_dark, font=font_data)
        draw.text((x + 780, y_card + 96), adv_base, fill=text_dark, font=font_data)
        draw.text((x, y_card + 158), raw_quote, fill=text_dark, font=font_data)
        draw.text((x + 780, y_card + 158), adv_quote, fill=text_dark, font=font_data)

    footer_y = height - footer_h
    draw.rectangle([0, footer_y, width, footer_y + footer_h], fill=bg_card)
    draw.rectangle([0, footer_y, width, footer_y + 4], fill=accent)
    draw.text((margin, footer_y + 28), f"PANDA ENGINE v3.0  |  ADV SCORECARD  |  {datetime.now().strftime('%Y-%m-%d %H:%M')}",
              fill=text_head, font=font_sm)

    img.save("snapshot_adv.png", quality=95)
    return "snapshot_adv.png"

def _desk_score_read(values):
    vals = [int(v or 0) for v in values]
    strongest_pos = max((v for v in vals if v > 0), default=0)
    strongest_neg = min((v for v in vals if v < 0), default=0)
    if abs(strongest_pos) == abs(strongest_neg) and strongest_pos != 0:
        return 0
    return strongest_neg if abs(strongest_neg) > abs(strongest_pos) else strongest_pos

def _desk_score_class(score):
    if score >= 4:
        return "STRONG"
    if score <= -4:
        return "WEAK"
    return "NEUTRAL"

def _snapshot_pair_matchup(row):
    def classify(prefix):
        values = [row.get(f"{prefix}_{tf}") for tf in ("d1", "h4", "h1")]
        if all(value is None for value in values):
            return "NO DATA"
        if any((value or 0) >= 4 for value in values) and any((value or 0) <= -4 for value in values):
            return "MIXED"
        score = row.get(f"{prefix}_score")
        return _desk_score_class(int(score) if score is not None else _desk_score_read(values))

    return f"{classify('base')} vs {classify('quote')}"

def _desk_fmt_score(score):
    score = int(score or 0)
    return f"{score:+d}" if score else "0"

def _market_desk_currency_rows(rows):
    by_cur = {}
    for r in rows:
        symbol = r.get("symbol") or ""
        for side, prefix in (("base", "base"), ("quote", "quote")):
            cur = r.get(f"{prefix}_currency") or (symbol[:3] if side == "base" else symbol[3:6])
            if not cur:
                continue
            d1 = int(r.get(f"{prefix}_d1") or 0)
            h4 = int(r.get(f"{prefix}_h4") or 0)
            h1 = int(r.get(f"{prefix}_h1") or 0)
            explicit_score = r.get(f"{prefix}_score")
            score = int(explicit_score) if explicit_score is not None else _desk_score_read([d1, h4, h1])
            existing = by_cur.get(cur)
            if existing is None or abs(score) > abs(existing["score"]):
                by_cur[cur] = {"cur": cur, "d1": d1, "h4": h4, "h1": h1, "score": score}
    out = []
    for cur in sorted(by_cur):
        item = by_cur[cur]
        score = item["score"]
        cls = _desk_score_class(score)
        if cls == "STRONG":
            note = "score strength catalyst"
        elif cls == "WEAK":
            note = "score weakness catalyst"
        else:
            note = "mixed or neutral read"
        out.append([
            cur,
            _desk_fmt_score(item["d1"]),
            _desk_fmt_score(item["h4"]),
            _desk_fmt_score(item["h1"]),
            _desk_fmt_score(score),
            cls,
            note,
        ])
    return out

def _market_desk_pair_rows(rows):
    candidates = []
    for r in rows:
        symbol = r.get("symbol") or ""
        gap = r.get("gap") or 0
        bias = r.get("bias") or "INVALID"
        if r.get("hard_invalid") or bias not in ("BUY", "SELL") or abs(gap) < 5:
            continue
        base_cur = r.get("base_currency") or symbol[:3]
        quote_cur = r.get("quote_currency") or symbol[3:6]
        base_score = r.get("base_score")
        quote_score = r.get("quote_score")
        if base_score is None:
            base_score = _desk_score_read([r.get("base_d1"), r.get("base_h4"), r.get("base_h1")])
        if quote_score is None:
            quote_score = _desk_score_read([r.get("quote_d1"), r.get("quote_h4"), r.get("quote_h1")])
        base_cls = _desk_score_class(int(base_score))
        quote_cls = _desk_score_class(int(quote_score))
        strong_vs_weak = {base_cls, quote_cls} == {"STRONG", "WEAK"}
        directional_catalyst = (
            (bias == "BUY" and (base_cls == "STRONG" or quote_cls == "WEAK")) or
            (bias == "SELL" and (base_cls == "WEAK" or quote_cls == "STRONG"))
        )
        if not directional_catalyst:
            continue
        pl_zone = r.get("pl_zone") or "-"
        pl_ok = (bias == "BUY" and pl_zone == "ABOVE") or (bias == "SELL" and pl_zone == "BELOW")
        if strong_vs_weak:
            catalyst = "STRONG"
        else:
            catalyst = "SECONDARY"
        direction = "bullish" if bias == "BUY" else "bearish"
        if strong_vs_weak and pl_ok:
            plan = f"{direction.capitalize()} strong-score catalyst. Wait for structure continuation and risk check."
        elif strong_vs_weak:
            plan = f"{direction.capitalize()} strong-score watch. Need structure + Panda Line/G1 confirmation."
        elif pl_ok:
            plan = f"{direction.capitalize()} one-sided score catalyst. Structure confirmed; still treat as secondary."
        else:
            plan = f"{direction.capitalize()} secondary watch only. Need structure + Panda Line/G1 confirmation."
        context = (
            f"{base_cur} {_desk_fmt_score(base_score)} {base_cls} "
            f"vs {quote_cur} {_desk_fmt_score(quote_score)} {quote_cls}"
        )
        candidates.append({
            "symbol": symbol,
            "gap": gap,
            "bias": bias,
            "catalyst": catalyst,
            "rank_group": 0 if strong_vs_weak else 1,
            "pl_ok": pl_ok,
            "context": context,
            "plan": plan,
        })
    candidates.sort(key=lambda r: (r["rank_group"], 0 if r["pl_ok"] else 1, -abs(r["gap"]), r["symbol"]))
    out = []
    for idx, r in enumerate(candidates[:6], start=1):
        source = next((row for row in rows if row.get("symbol") == r["symbol"]), {})
        level = summarize_nearby_levels(r["symbol"], None, source)
        level_note = f" | {level['label']} ({level['names']})" if level["label"] else ""
        out.append([
            str(idx),
            r["symbol"],
            r["context"],
            f"{r['bias']} {r['gap']:+.0f}",
            r["catalyst"],
            r["plan"] + level_note,
        ])
    if not out:
        out.append(["-", "NO SETUP", "No clean score gap >= 5", "WAIT", "NONE", "Stand down until score + structure align."])
    return out

def generate_market_desk_report(rows):
    rows = rows or []
    width, height = 1700, 2900
    margin = 70
    page_bg = (255, 255, 255)
    black = (20, 20, 20)
    grid = (170, 170, 170)
    head = (218, 218, 218)
    soft = (242, 242, 242)
    sell_fill = (248, 224, 228)
    watch_fill = (255, 244, 205)

    img = Image.new("RGB", (width, height), page_bg)
    draw = ImageDraw.Draw(img)
    font_title = _load_snapshot_font("arialbd.ttf", 62)
    font_sub = _load_snapshot_font("arialbd.ttf", 30)
    font_h = _load_snapshot_font("arialbd.ttf", 32)
    font_th = _load_snapshot_font("arialbd.ttf", 23)
    font = _load_snapshot_font("arial.ttf", 23)
    font_b = _load_snapshot_font("arialbd.ttf", 23)
    font_sm = _load_snapshot_font("arial.ttf", 19)

    def _wrap_text(text, px_width):
        chars = max(6, int(px_width / 12.5))
        return textwrap.wrap(str(text), width=chars) or [""]

    def _section(y, title):
        draw.text((margin, y), title, fill=black, font=font_h)
        return y + 46

    def _table(y, headers, table_rows, widths, row_h=50, fills=None):
        x = margin
        draw.rectangle([margin, y, width - margin, y + row_h], fill=head, outline=grid)
        for i, header in enumerate(headers):
            draw.text((x + 8, y + 13), header, fill=black, font=font_th)
            draw.line([x, y, x, y + row_h], fill=grid, width=1)
            x += widths[i]
        draw.line([width - margin, y, width - margin, y + row_h], fill=grid, width=1)
        y += row_h
        for ridx, row in enumerate(table_rows):
            wrapped = [_wrap_text(cell, widths[i] - 16) for i, cell in enumerate(row)]
            max_lines = max(len(lines) for lines in wrapped)
            h = max(row_h, 30 + max_lines * 27)
            fill = fills[ridx] if fills else ((255, 255, 255) if ridx % 2 == 0 else soft)
            draw.rectangle([margin, y, width - margin, y + h], fill=fill, outline=grid)
            x = margin
            for i, lines in enumerate(wrapped):
                draw.line([x, y, x, y + h], fill=grid, width=1)
                use_font = font_b if i in (1, 4) and len(row) > 4 else font
                for line_idx, line in enumerate(lines[:5]):
                    draw.text((x + 8, y + 11 + line_idx * 27), line, fill=black, font=use_font)
                x += widths[i]
            draw.line([width - margin, y, width - margin, y + h], fill=grid, width=1)
            y += h
        return y + 28

    y = 58
    draw.text((width // 2, y), "PANDA MARKET DESK", fill=black, font=font_title, anchor="ma")
    y += 72
    draw.text((width // 2, y), "DAILY BIAS -> GAMEPLAY WATCHLIST", fill=black, font=font_sub, anchor="ma")
    y += 44
    draw.text((width // 2, y), "2 AM DUBAI WATCHLIST - CONDITIONAL, NOT SIGNALS", fill=black, font=font_th, anchor="ma")
    y += 36
    draw.line([margin, y, width - margin, y], fill=black, width=2)
    y += 22

    y = _section(y, "1. LATEST PANDA CURRENCY READ")
    y = _table(
        y,
        ["CUR", "D1", "H4", "H1", "READ", "CLASS", "NOTE"],
        _market_desk_currency_rows(rows),
        [105, 95, 95, 95, 115, 165, 890],
        row_h=46,
    )

    pair_rows = _market_desk_pair_rows(rows)
    row_fills = []
    for row in pair_rows:
        if "SELL" in row[3]:
            row_fills.append(sell_fill)
        elif row[4] in ("SECONDARY", "CAUTION", "WATCH"):
            row_fills.append(watch_fill)
        else:
            row_fills.append((218, 242, 226))
    y = _section(y, "2. TOP WATCHLIST - CONDITIONAL, NOT SIGNALS")
    y = _table(
        y,
        ["RANK", "PAIR", "SCORE CONTEXT", "BIAS", "CATALYST", "PLAN"],
        pair_rows,
        [90, 145, 430, 115, 155, 625],
        row_h=50,
        fills=row_fills,
    )

    y = _section(y, "3. EXECUTION ROUTINE")
    y = _table(
        y,
        ["STEP", "RULE"],
        [
            ["1. SCORE", "Classify currencies by strongest score: +4 to +6 STRONG, -4 to -6 WEAK, everything else NEUTRAL."],
            ["2. MAP", "Pair strongest vs weakest. Gap is base score minus quote score; no D1/H4/H1 summing."],
            ["3. FILTER", "Remove hard invalid, same-side conflict, neutral-vs-neutral, and unclear gap."],
            ["4. GAMEPLAY", "Apply the structure and Panda Line filters of your chosen gameplay before entry."],
            ["5. RISK", "News, spread, session timing, and invalidation come before any entry."],
        ],
        [215, 1345],
        row_h=48,
    )

    y = _section(y, "4. FUNDAMENTAL CATALYST CHECKLIST")
    y = _table(
        y,
        ["DRIVER", "WHAT TO MONITOR", "WHY IT MATTERS"],
        [
            ["USD", "Fed speakers, CPI/PPI, labor data", "Can confirm or weaken USD strength."],
            ["CAD", "Oil, BoC tone, Canada employment/inflation", "Can support or invalidate CAD bias."],
            ["AUD/NZD", "China data, commodities, risk sentiment", "Risk appetite can reverse weak/neutral reads."],
            ["JPY", "Intervention headlines, yields, safe-haven flows", "Can override score advantage quickly."],
        ],
        [200, 630, 730],
        row_h=48,
    )

    y += 12
    box_h = 132
    draw.rectangle([margin, y, width - margin, y + box_h], fill=soft, outline=grid)
    draw.text((margin + 18, y + 18), "PANDA DESK READ:", fill=black, font=font_b)
    note = (
        "Bias sets direction. Structure filters entries. "
        "Choose your gameplay, then look for a pullback with favorable risk/reward. This watchlist is not an entry signal."
    )
    for idx, line in enumerate(textwrap.wrap(note, width=112)):
        draw.text((margin + 260, y + 18 + idx * 29), line, fill=black, font=font)
    y += box_h + 42

    draw.text((width // 2, y), "BIAS IS KING. STRUCTURE IS THE FILTER.", fill=black, font=font_sub, anchor="ma")
    y += 48
    draw.text((margin, y), f"PANDA ENGINE v3.0 | {datetime.now().strftime('%Y-%m-%d %H:%M')}", fill=black, font=font_sm)

    path = "panda_market_desk.png"
    img.crop((0, 0, width, min(height, y + 60))).save(path, quality=95)
    return path

def _send_telegram_photo(path, caption, component="telegram_photo"):
    max_h = 4096
    send_path = path
    try:
        pil_img = Image.open(path)
        iw, ih = pil_img.size
        try:
            orig_size = os.path.getsize(path)
        except Exception:
            orig_size = None
        need_resize = (ih > max_h) or (orig_size and orig_size > 4_000_000)
        if need_resize:
            scale = min(1.0, max_h / float(ih)) if ih > 0 else 1.0
            new_w = int(iw * scale)
            new_h = int(ih * scale)
            resized = pil_img.resize((new_w, new_h), Image.LANCZOS)
            if resized.mode in ("RGBA", "P"):
                resized = resized.convert("RGB")
            base, _ = os.path.splitext(path)
            send_path = f"{base}_send.jpg"
            resized.save(send_path, format="JPEG", quality=85, optimize=True)
            print(f"[SNAPSHOT] Resized {iw}x{ih} -> {new_w}x{new_h} and saved {send_path}")
    except Exception as resize_err:
        print(f"[SNAPSHOT] Resize skipped: {resize_err}")

    mime_type = "image/jpeg" if send_path.lower().endswith((".jpg", ".jpeg")) else "image/png"
    with open(send_path, "rb") as f:
        files = {"photo": (os.path.basename(send_path), f, mime_type)}
        response = requests.post(
            f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendPhoto",
            data={"chat_id": TELEGRAM_CHAT_ID, "caption": caption},
            files=files,
            timeout=30,
        )
    if response.status_code == 200:
        print(f"[TELEGRAM] {component} sent OK")
        return True, response
    print(f"[TELEGRAM ERROR] {component}: {response.text}")
    return False, response

def build_snapshot_caption(buy_count, sell_count, yellow_count, white_count, now=None):
    ts = (now or datetime.now()).strftime("%Y-%m-%d %H:%M")
    return (
        "PANDA ENGINE v3.0\n"
        f"{ts}\n"
        f"BUY: {buy_count} | SELL: {sell_count}\n"
        f"Watch: {yellow_count} | Idle: {white_count}"
    )

def send_daily_market_desk():
    if not telegram_circuit.allow():
        print(f"[MARKET DESK BLOCKED] Circuit breaker locked — failures: {telegram_circuit.failures}")
        return False
    try:
        res = supabase.table("dashboard").select("*").execute()
        data = res.data or []
        if not data:
            print("[MARKET DESK] No dashboard rows available")
            return False
        report_path = generate_market_desk_report(data)
        ok, response = _send_telegram_photo(
            report_path,
            f"PANDA MARKET DESK\n{datetime.now().strftime('%Y-%m-%d %H:%M')}\nDaily 2 AM pre-market score -> structure map",
            component="Market Desk",
        )
        try:
            supabase_retry(
                lambda: supabase.table("engine_logs").insert({
                    "timestamp": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"),
                    "component": "telegram_market_desk_ok" if ok else "telegram_market_desk_fail",
                    "duration": 0,
                    "error": None if ok else (response.text[:500] if response else "no response"),
                }).execute(),
                label="MarketDeskLog"
            )
        except Exception as log_err:
            print(f"[MARKET DESK LOG ERROR] {log_err}")
        if ok:
            telegram_circuit.success()
        else:
            telegram_circuit.failure()
        return ok
    except Exception as e:
        print(f"[MARKET DESK ERROR] {e}")
        telegram_circuit.failure()
        try:
            supabase_retry(
                lambda: supabase.table("engine_logs").insert({
                    "timestamp": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"),
                    "component": "telegram_market_desk_exception",
                    "duration": 0,
                    "error": str(e)[:500],
                }).execute(),
                label="MarketDeskExcLog"
            )
        except Exception:
            pass
        return False

# ================= TELEGRAM SNAPSHOT =================
def send_snapshot():
    if is_market_closed():
        print(f"[SNAPSHOT] Market closed - skipped ({market_time_label()})")
        return True
    if not telegram_circuit.allow():
        print(f"[SNAPSHOT BLOCKED] Circuit breaker locked — failures: {telegram_circuit.failures}, locked_until: {telegram_circuit.locked_until}, now: {time.time():.0f}")
        return False
    try:
        res  = supabase.table("dashboard").select("*").execute()
        data = res.data or []

        # ---- PDR map (from pdr_cache, refreshed by /api/pdr on the dashboard) ----
        pdr_map = {}
        try:
            _pdr_res = supabase.table("pdr_cache").select("symbol,pdr_strength,pdr_strong,pdr_direction").execute()
            for _p in (_pdr_res.data or []):
                if _p.get("symbol"):
                    pdr_map[_p["symbol"]] = _p
        except Exception as _pe:
            print(f"[SNAPSHOT] PDR fetch skipped: {_pe}")

        pair_data    = []
        buy_count    = 0
        sell_count   = 0
        yellow_count = 0
        white_count  = 0

        for r in data:
            symbol     = r.get("symbol")
            gap        = r.get("gap", 0)
            hard_inv   = r.get("hard_invalid", False)
            pl_zone_v  = r.get("pl_zone") or "-"
            pl_status_v = panda_lines_status(pl_zone_v, r.get("pl_price"), r.get("pl_st"),
                                             r.get("pl_fl"), symbol)
            base_d1  = r.get("base_d1") or 0
            base_h4  = r.get("base_h4") or 0
            base_h1  = r.get("base_h1") or 0
            quote_d1 = r.get("quote_d1") or 0
            quote_h4 = r.get("quote_h4") or 0
            quote_h1 = r.get("quote_h1") or 0

            if not symbol or gap is None:
                continue

            abs_gap  = abs(gap)
            bias_val = "BUY" if gap >= 5 else "SELL" if gap <= -5 else "WAIT"

            # Box Badge: H1 + H4 box trends from dashboard (shortened labels)
            _box_short = {"UPTREND": "UP", "DOWNTREND": "DOWN", "RANGING": "RANGE", "UNKNOWN": "-"}
            box_h1 = _box_short.get(r.get("box_h1_trend", ""), "-")
            box_h4 = _box_short.get(r.get("box_h4_trend", ""), "-")
            box_badge = f"H1:{box_h1}  H4:{box_h4}"

            # Validity for Telegram: gap threshold + not hard_invalid (no PL filter)
            is_valid = (not hard_inv) and bias_val in ("BUY", "SELL") and abs_gap >= 5

            # WATCH check: one-sided extreme currency stays yellow.
            # If both currencies are extreme in the same direction (e.g. EUR weak + NZD weak),
            # it is a same-side conflict and should display as white INVALID.
            base_tf_vals = [base_d1, base_h4, base_h1]
            quote_tf_vals = [quote_d1, quote_h4, quote_h1]
            base_extreme = any(abs(v) >= 4 for v in base_tf_vals if v is not None)
            quote_extreme = any(abs(v) >= 4 for v in quote_tf_vals if v is not None)
            base_extreme_signs = {1 if v > 0 else -1 for v in base_tf_vals if v is not None and abs(v) >= 4}
            quote_extreme_signs = {1 if v > 0 else -1 for v in quote_tf_vals if v is not None and abs(v) >= 4}
            same_side_conflict = bool(base_extreme_signs and quote_extreme_signs and base_extreme_signs == quote_extreme_signs)
            has_watch_currency = (base_extreme or quote_extreme) and not same_side_conflict

            # Categorize for coloring
            if is_valid:
                category = "BUY" if bias_val == "BUY" else "SELL"
                if bias_val == "BUY":
                    buy_count += 1
                else:
                    sell_count += 1
            elif has_watch_currency:
                category = "YELLOW"
                yellow_count += 1
                bias_val = "WATCH"
            else:
                category = "WHITE"
                white_count += 1
                bias_val = "INVALID"

            # PDR in plain words RELATIVE TO BIAS (live broker data preferred):
            #   SUPPORTS = yesterday moved with the bias and held (continuation backdrop)
            #   WEAK SUP = right direction, no conviction
            #   AGAINST  = yesterday opposed the bias (trend-turn risk)
            _pdir, _pstrong, _pratio = r.get("pdr_dir"), bool(r.get("pdr_strong_live")), r.get("pdr_ratio")
            if _pdir is None:
                _pc_row = pdr_map.get(symbol)
                if _pc_row and _pc_row.get("pdr_strength") is not None:
                    _pdir = "BULLISH" if (_pc_row.get("pdr_direction") or "") == "BULLISH" else "BEARISH"
                    _pstrong = bool(_pc_row.get("pdr_strong"))
                    _pratio = _pc_row.get("pdr_strength")
            if _pdir is None:
                pdr_display = "-"
            elif bias_val in ("BUY", "SELL"):
                _aligned = (bias_val == "BUY" and _pdir == "BULLISH") or (bias_val == "SELL" and _pdir == "BEARISH")
                if _aligned and _pstrong: pdr_display = "SUPPORTS"
                elif _aligned:            pdr_display = "WEAK SUP"
                else:                     pdr_display = "AGAINST"
            else:
                _arrow = "▲" if _pdir == "BULLISH" else "▼"
                pdr_display = f"{_arrow}{float(_pratio or 0):.1f}{'S' if _pstrong else 'w'}"

            # EXTREME TF string from derive_score_tf fields (v9)
            _b_tf = (r.get("base_score_tf") or "").strip()
            _q_tf = (r.get("quote_score_tf") or "").strip()
            _xtf_parts = []
            if _b_tf: _xtf_parts.append(f"{r.get('base_currency') or symbol[:3]} {_b_tf}")
            if _q_tf: _xtf_parts.append(f"{r.get('quote_currency') or symbol[3:6]} {_q_tf}")
            xtf_str = " | ".join(_xtf_parts) if _xtf_parts else "NONE"
            level = snapshot_pair_levels(r)
            adv_forecast = snapshot_adv_forecast(r)

            pair_data.append({
                "symbol": symbol,
                "gap": gap,
                "bias": bias_val,
                "box_badge": box_badge,
                "box_h1": box_h1,
                "box_h4": box_h4,
                "pl_zone": pl_zone_v,
                "pl_status": pl_status_v,
                "pl_verdict": snapshot_pl_verdict(bias_val, pl_status_v),
                "pdr": pdr_display,
                "category": category,
                "xtf": xtf_str,
                "level": level,
                "adv_forecast": adv_forecast,
                "matchup": _snapshot_pair_matchup(r),
            })

        # Sort alphabetically by symbol
        pair_data.sort(key=lambda p: p["symbol"])

        # One extra snapshot slot for Panda Gold. This is intentionally appended
        # outside the locked 21-pair gap engine and does not affect forex scoring.
        try:
            gold_card = gold_signal_to_snapshot_card(build_gold_signal(_load_current_parsed_map_for_gold()))
            if gold_card:
                pair_data.append(gold_card)
        except Exception as gold_snapshot_err:
            print(f"[SNAPSHOT GOLD] skipped: {gold_snapshot_err}")

        if not pair_data:
            pair_data = [{"symbol": "NO DATA", "gap": 0, "bias": "-", "box_badge": "-",
                          "pl_zone": "-", "category": "WHITE", "xtf": "-"}]

        img_path = generate_snapshot(pair_data)

        def _log_snapshot_event(component, error=None):
            try:
                supabase_retry(
                    lambda: supabase.table("engine_logs").insert({
                        "timestamp": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"),
                        "component": component,
                        "duration": 0,
                        "error": error,
                    }).execute(),
                    label=component
                )
            except Exception as log_err:
                print(f"[SNAPSHOT LOG ERROR] {component}: {log_err}")

        sent_ok, response = _send_telegram_photo(
            img_path,
            build_snapshot_caption(buy_count, sell_count, yellow_count, white_count),
            component="Snapshot",
        )
        if sent_ok:
            telegram_circuit.success()
            _log_snapshot_event("telegram_snapshot_ok")
            try:
                adv_path = generate_adv_scorecard(data)
                adv_ok, adv_response = _send_telegram_photo(
                    adv_path,
                    f"PANDA ADV SCORECARD\n{datetime.now().strftime('%Y-%m-%d %H:%M')}\nRaw + ADV D1/H4/H1",
                    component="ADV scorecard",
                )
                if adv_ok:
                    _log_snapshot_event("telegram_adv_scorecard_ok")
                else:
                    _log_snapshot_event(
                        "telegram_adv_scorecard_fail",
                        adv_response.text[:500] if adv_response else "no response",
                    )
            except Exception as adv_err:
                print(f"[ADV SNAPSHOT ERROR]: {adv_err}")
                _log_snapshot_event("telegram_adv_scorecard_exception", str(adv_err)[:500])
        else:
            telegram_circuit.failure()
            _log_snapshot_event(
                "telegram_snapshot_fail",
                response.text[:500] if response else "no response",
            )
        return sent_ok
    except Exception as e:
        print("[TELEGRAM ERROR]:", e)
        telegram_circuit.failure()
        try:
            supabase_retry(
                lambda: supabase.table("engine_logs").insert({
                    "timestamp": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"),
                    "component": "telegram_snapshot_exception", "duration": 0,
                    "error": str(e)[:500],
                }).execute(),
                label="SnapshotExcLog"
            )
        except: pass
        return False

# ================= SPIKE ALERT =================
MOMENTUM_GUIDE = {
    "STRONG":        ("🔥", "RIDE IT — Trend fully aligned"),
    "BUILDING":      ("🚀", "ENTER NOW — Momentum confirmed"),
    "SPARK":         ("⚡", "WATCH — Wait for confirmation"),
    "CONSOLIDATING": ("🔵", "HOLD — Normal pause, do NOT close"),
    "COOLING":       ("🌡️", "TIGHTEN SL — Protect profits"),
    "FADING":        ("📉", "CONSIDER CLOSING — Gap shrinking"),
    "REVERSING":     ("⚠️", "CLOSE POSITION — Trend breaking"),
    "STABLE":        ("▬",  "MONITOR — No strong momentum"),
    "NEUTRAL":       ("○",  "WAIT — No valid signal"),
}

# ================= STRUCTURE ALERTS (Panda Lines FLIP + H1 BOS) =================
def check_structure_alerts(pair, pl, cycle_at, ready):
    """
    Return FLIP/BOS candidates. First sighting after boot or invalid data seeds silently.
    Changed state is committed only after the candidate is queued durably.
    """
    if not pl:
        PREV_ZONE.pop(pair, None)
        LAST_BOS_T.pop(pair, None)
        return []
    candidates = []
    zone  = pl.get("pl_zone")
    bos   = (pl.get("pl_bos") or "NONE")
    bos_t = int(pl.get("pl_bos_t") or 0)

    # ---- FLIP: TBG_ZONE crossing ABOVE <-> BELOW (BETWEEN = no side, no spam) ----
    prev = PREV_ZONE.get(pair)
    if zone in ("ABOVE", "BELOW"):
        if ready and prev in ("ABOVE", "BELOW") and prev != zone:
            direction = "BULLISH" if zone == "ABOVE" else "BEARISH"
            candidates.append({"symbol": pair, "alert_type": "structure", "cycle_at": cycle_at,
                               "detail": f"Panda Lines FLIP ({direction}); PL {panda_lines_status(zone, pl.get('pl_price'), pl.get('pl_st'), pl.get('pl_fl'), pair)} now",
                               "event_id": f"flip:{prev}:{zone}:{cycle_at}", "state_zone": zone,
                               "bias": "BUY" if zone == "ABOVE" else "SELL"})
        else:
            PREV_ZONE[pair] = zone
    elif prev is None:
        PREV_ZONE[pair] = zone   # seed only (may be BETWEEN/None); a real side is set above

    # ---- BOS: new H1 break, deduped on break-bar time ----
    if pair not in LAST_BOS_T or not ready:
        LAST_BOS_T[pair] = bos_t   # first-sighting seed — never alerts on a stale/boot value
    elif bos in ("BULLISH", "BEARISH") and bos_t > 0 and bos_t != LAST_BOS_T[pair]:
        candidates.append({"symbol": pair, "alert_type": "structure", "cycle_at": cycle_at,
                           "detail": f"{bos} H1 BOS confirmed", "event_id": f"bos:{bos_t}",
                           "state_bos_t": bos_t,
                           "bias": "BUY" if bos == "BULLISH" else "SELL"})
    return candidates


def _fresh_signal_level_file(symbol):
    try:
        path = os.path.join(MT4_PATH, f"tbg_{symbol.upper()}.txt")
        return 0 <= time.time() - os.path.getmtime(path) <= 600
    except OSError:
        return False


def dispatch_signal_candidates(cycle_at, structure, gaps, early, spikes, gold,
                               parsed_map=None, pl_map=None, dashboard_rows=None,
                               level_assessments=None):
    """Queue one prioritized event per pair; the outbox groups pairs on delivery."""
    candidates = list(structure)
    for item in gaps:
        pl = (pl_map or {}).get(item["symbol"]) or {}
        status = item.get("pl_status") or panda_lines_status(item.get("pl_zone"), pl.get("pl_price"),
                                                              pl.get("pl_st"), pl.get("pl_fl"), item["symbol"])
        candidates.append({"symbol": item["symbol"], "alert_type": "gap_zone",
                           "cycle_at": cycle_at, "gap": item["gap"], "bias": item["bias"],
                           "detail": f"PL {status} confirms gap zone" if status in ("BELOW", "ABOVE") else f"PL {status}; buffer unconfirmed"})
    for item in early:
        candidates.append({"symbol": item["symbol"], "alert_type": "early_entry",
                           "cycle_at": cycle_at, "gap": item["gap"], "bias": item["bias"],
                           "detail": (f"{item['reason']}: gap {item['prev_gap']:+.0f} → {item['gap']:+.0f} "
                                      f"(magnitude {abs(item['gap']) - abs(item['prev_gap']):+.0f} since previous cycle)")})
    for item in spikes:
        candidates.append({"symbol": item["symbol"], "alert_type": "momentum",
                           "cycle_at": cycle_at, "gap": item["gap"], "bias": item["bias"],
                           "detail": f"Momentum {item['momentum']}"})
    gold_mark = None
    if gold and gold.get("new_signal") and gold.get("status") in ("LONG", "SHORT"):
        gold_mark = f"{gold['status']}|{gold.get('signal_time') or ''}"
        if gold_mark != _load_gold_mark():
            levels = []
            for label, key in (("Entry", "entry"), ("SL", "sl"), ("TP1", "tp1"),
                               ("TP2", "tp2"), ("TP3", "tp3")):
                value = gold.get(key)
                if isinstance(value, (int, float)):
                    levels.append(f"{label} {value:.2f}")
            detail = "SuperTrend flip; " + " | ".join(levels)
            detail += f"; USD strength {int(gold.get('usd_strength') or 0):+d}; filter {gold.get('filter') or 'CLEAR'}"
            candidates.append({"symbol": GOLD_SYMBOL, "alert_type": "gold",
                               "cycle_at": cycle_at, "event_id": gold_mark,
                               "bias": gold["status"],
                               "detail": detail})
    row_map = {row.get("symbol"): row for row in (dashboard_rows or [])}
    fresh_pl_map = {symbol: pl for symbol, pl in (pl_map or {}).items()
                    if pl and _fresh_signal_level_file(symbol)}
    assessments = level_assessments if level_assessments is not None else {}
    for symbol, row in row_map.items():
        parsed, pl = (parsed_map or {}).get(symbol), fresh_pl_map.get(symbol)
        if not parsed or not pl or row.get("bias") not in ("BUY", "SELL"):
            continue
        try:
            breadth = related_h4_breadth(symbol, row["bias"], parsed_map, fresh_pl_map)
            assessment = assess_price_levels(
                symbol, parsed, pl, row["bias"], row.get("gap"), row.get("momentum"),
                PREV_LEVEL_PRICE.get(symbol), breadth
            )
            assessments[symbol] = {**assessment, "bias": row["bias"],
                                   "short_label": summarize_nearby_levels(symbol, parsed, pl)["label"]}
        except Exception as context_error:
            print(f"[SIGNAL LEVELS] {symbol}: {context_error}")
    queued = set()
    for candidate in consolidate_candidates(candidates):
        if candidate["alert_type"] == "momentum":
            continue  # quiet observation; the phase digest carries it
        symbol = candidate["symbol"]
        pl = fresh_pl_map.get(symbol)
        parsed = (parsed_map or {}).get(symbol)
        if parsed and pl:
            try:
                assessment = assessments.get(symbol)
                if not assessment or assessment.get("bias") != candidate.get("bias"):
                    row = row_map.get(symbol) or {}
                    breadth = related_h4_breadth(symbol, candidate.get("bias"), parsed_map, fresh_pl_map)
                    assessment = assess_price_levels(
                        symbol, parsed, pl, candidate.get("bias"), row.get("gap"),
                        row.get("momentum"), PREV_LEVEL_PRICE.get(symbol), breadth
                    )
                candidate["price_context"] = summarize_nearby_levels(symbol, parsed, pl)["label"]
                candidate["level_priority"] = assessment["priority"]
            except Exception as context_error:
                print(f"[SIGNAL LEVELS] {symbol}: {context_error}")
        kind = candidate["alert_type"]
        cooldown = {"structure": 0, "gold": 0, "gap_zone": 14400, "early_entry": 7200}[kind]
        ttl = 1800 if kind == "structure" else 3600 if kind == "gold" else 240
        try:
            row = enqueue_alert(supabase, candidate, cooldown_seconds=cooldown, ttl_seconds=ttl)
        except Exception as e:
            print(f"[SIGNAL OUTBOX] Could not queue {candidate['symbol']} {kind}: {e}")
            continue
        if row:
            queued.add(candidate["symbol"])
        for source in candidates:
            if source["symbol"] != candidate["symbol"]:
                continue
            if source.get("state_zone"):
                PREV_ZONE[source["symbol"]] = source["state_zone"]
            if source.get("state_bos_t"):
                LAST_BOS_T[source["symbol"]] = source["state_bos_t"]
    for symbol in PAIRS:
        pl = (pl_map or {}).get(symbol)
        if pl and pl.get("pl_price") and _fresh_signal_level_file(symbol):
            PREV_LEVEL_PRICE[symbol] = pl["pl_price"]
        else:
            PREV_LEVEL_PRICE.pop(symbol, None)
    return queued


def signal_outbox_relevant(row):
    """Check live inputs again before a delayed Signal-group delivery."""
    payload = row.get("payload") or {}
    kind = row.get("alert_type") or payload.get("alert_type")
    if kind == "digest":
        return True
    symbol = row.get("symbol") or payload.get("symbol")
    if kind == "structure":
        pl = parse_pl_file(symbol)
        if not pl:
            return None
        if payload.get("state_zone") and pl.get("pl_zone") != payload["state_zone"]:
            return False
        if payload.get("state_bos_t") and int(pl.get("pl_bos_t") or 0) != payload["state_bos_t"]:
            return False
        if payload.get("state_bos_t") and pl.get("pl_bos") != ("BULLISH" if payload.get("bias") == "BUY" else "BEARISH"):
            return False
        return True
    if kind == "gold":
        parsed = {symbol: value for symbol in PAIRS if (value := parse_mt4_file(symbol)) is not None}
        latest = build_gold_signal(parsed)
        current_mark = f"{latest.get('status')}|{latest.get('signal_time') or ''}"
        return None if latest.get("status") == "OFFLINE" else bool(latest.get("new_signal") and current_mark == payload.get("event_id"))
    current = (supabase.table("dashboard")
               .select("symbol,gap,bias,hard_invalid,pl_zone,updated_at")
               .eq("symbol", symbol).limit(1).execute().data or [])
    if not current:
        return None
    live = current[0]
    stamp = datetime.fromisoformat(str(live.get("updated_at") or "").replace("Z", "+00:00"))
    if stamp.tzinfo is None:
        stamp = stamp.replace(tzinfo=timezone.utc)
    if (datetime.now(timezone.utc) - stamp).total_seconds() > 420:
        return None
    gap = float(live.get("gap") or 0)
    if live.get("hard_invalid") or live.get("bias") != payload.get("bias"):
        return False
    if kind == "gap_zone":
        zone = "ABOVE" if gap > 0 else "BELOW"
        return 9 <= abs(gap) <= 12 and live.get("pl_zone") == zone
    if kind == "early_entry":
        return abs(gap) >= 5
    return False


def dispatch_signal_outbox():
    return dispatch_pending(supabase, SIGNAL_BOT_TOKEN, SIGNAL_CHAT_ID,
                            relevant=signal_outbox_relevant,
                            market_open=lambda: not is_market_closed())


# ================= LOGIN ALERT =================
@app.post("/api/login-alert")
async def login_alert(data: dict):
    username = data.get("username", "Unknown")
    dubai_tz = timezone(timedelta(hours=4))
    now      = datetime.now(dubai_tz)
    message  = (
        f"🐼 <b>PANDA ENGINE — Login Alert</b>\n"
        f"━━━━━━━━━━━━━━━━━━━━━━\n"
        f"👤 <b>User:</b> {username}\n"
        f"🕐 <b>Time:</b> {now.strftime('%Y-%m-%d %H:%M:%S')} (Dubai)\n"
        f"📅 <b>Day:</b> {now.strftime('%A')}\n"
        f"━━━━━━━━━━━━━━━━━━━━━━\n"
        f"🌐 <a href='https://pandaengine.app/dashboard'>Open Dashboard</a>"
    )
    try:
        response = requests.post(
            f"https://api.telegram.org/bot{LOGIN_ALERT_BOT_TOKEN}/sendMessage",
            json={"chat_id": LOGIN_ALERT_CHAT_ID, "text": message,
                  "parse_mode": "HTML", "disable_web_page_preview": True},
            timeout=10,
        )
        status = "sent" if response.status_code == 200 else "error"
        print(f"[LOGIN ALERT] {status} for {username}")
        return {"status": status}
    except Exception as e:
        print(f"[LOGIN ALERT ERROR] {e}")
        return {"status": "error", "detail": str(e)}

# ================= SCHEDULER =================
ENGINE_LOCK = asyncio.Lock()

def hourly_snapshot_due(now, last_hour_mark, last_attempt=None):
    """
    Return whether the hourly Telegram snapshot should run.
    The scheduler can be busy during the first seconds after :01, especially
    in the 2-4 AM Dubai INTRA window, so allow any late tick in the hour.
    """
    if now.minute < 1:
        return False, last_hour_mark
    hour_mark = now.replace(minute=0, second=0, microsecond=0)
    if last_hour_mark == hour_mark:
        return False, last_hour_mark
    if last_attempt and last_attempt.replace(minute=0, second=0, microsecond=0) == hour_mark:
        if (now - last_attempt).total_seconds() < 60:
            return False, hour_mark
    return True, hour_mark

def daily_market_desk_due(now, last_day_mark):
    """
    Send one Panda Market Desk report daily at 2 AM Dubai time on trading days.
    The scheduler checks this inside the hourly block, so the send lands around
    02:01 with the same MAIN Telegram route as snapshots.
    """
    if is_market_closed():
        return False, last_day_mark
    if now.hour < 2:
        return False, last_day_mark
    day_mark = now.date().isoformat()
    if last_day_mark == day_mark:
        return False, last_day_mark
    return True, day_mark

def load_snapshot_hour_mark():
    try:
        with open(SNAPSHOT_HOUR_MARK_FILE, "r", encoding="utf-8") as f:
            raw = f.read().strip()
        return datetime.fromisoformat(raw) if raw else None
    except FileNotFoundError:
        return None
    except Exception as e:
        print(f"[HOURLY] Could not load snapshot hour mark: {e}")
        return None

def load_market_desk_day_mark():
    try:
        with open(MARKET_DESK_DAY_MARK_FILE, "r", encoding="utf-8") as f:
            return f.read().strip() or None
    except FileNotFoundError:
        return None
    except Exception as e:
        print(f"[MARKET DESK] Could not load daily mark: {e}")
        return None

def persist_snapshot_hour_mark(hour_mark):
    if not hour_mark:
        return
    try:
        tmp_path = f"{SNAPSHOT_HOUR_MARK_FILE}.tmp"
        with open(tmp_path, "w", encoding="utf-8") as f:
            f.write(hour_mark.isoformat())
        os.replace(tmp_path, SNAPSHOT_HOUR_MARK_FILE)
    except Exception as e:
        print(f"[HOURLY] Could not persist snapshot hour mark: {e}")

def persist_market_desk_day_mark(day_mark):
    if not day_mark:
        return
    try:
        tmp_path = f"{MARKET_DESK_DAY_MARK_FILE}.tmp"
        with open(tmp_path, "w", encoding="utf-8") as f:
            f.write(str(day_mark))
        os.replace(tmp_path, MARKET_DESK_DAY_MARK_FILE)
    except Exception as e:
        print(f"[MARKET DESK] Could not persist daily mark: {e}")

async def run_scheduler_step(label, *steps):
    """Run blocking engine work outside FastAPI's event loop."""
    for step in steps:
        await asyncio.to_thread(step)

# ---- NEWS ALERT ----
def fetch_news_feed():
    """Fetch ForexFactory JSON feed with 30-min in-memory cache."""
    global NEWS_CACHE
    now = time.time()
    if NEWS_CACHE["data"] and NEWS_CACHE["fetched_at"] and (now - NEWS_CACHE["fetched_at"]) < NEWS_CACHE_TTL:
        return NEWS_CACHE["data"]
    try:
        r = requests.get("https://nfs.faireconomy.media/ff_calendar_thisweek.json",
                         headers={"Accept":"application/json"}, timeout=8)
        if r.status_code == 200:
            NEWS_CACHE["data"] = r.json() or []
            NEWS_CACHE["fetched_at"] = now
            return NEWS_CACHE["data"]
    except Exception as e:
        print(f"[NEWS] Feed fetch error: {e}")
    return NEWS_CACHE["data"]  # return stale if fresh fetch fails

def parse_news_time(date_str, time_str):
    """Parse FF date/time string to UTC datetime. Returns None if unparseable."""
    _ds = (date_str or "").strip()
    # New FF format: `date` is a full ISO datetime WITH offset (e.g.
    # "2026-07-28T21:30:00-04:00") and there is no separate `time` field.
    if "T" in _ds:
        try:
            _dt = datetime.fromisoformat(_ds)
            if _dt.tzinfo is None:
                _dt = _dt.replace(tzinfo=timezone.utc)
            return _dt.astimezone(timezone.utc)
        except Exception:
            return None
    if not time_str or time_str.lower() in ("all day","tentative","","tbd"):
        return None
    try:
        # Date: try ISO first, then MM-DD-YYYY
        try:
            d = datetime.strptime(date_str.strip(), "%Y-%m-%d")
        except:
            d = datetime.strptime(date_str.strip(), "%m-%d-%Y")
        # Time: "8:30am" or "08:30:00" or "8:30am ET"
        ts = time_str.strip().lower().replace(" et","").replace(" est","").replace(" edt","")
        try:
            t = datetime.strptime(ts, "%I:%M%p")
        except:
            try:
                t = datetime.strptime(ts, "%H:%M:%S")
            except:
                t = datetime.strptime(ts, "%H:%M")
        # ForexFactory times are in ET — convert to UTC (+4 DST, +5 EST)
        # Use +4 (DST/summer) as default; close enough for alerting purposes
        naive = datetime(d.year, d.month, d.day, t.hour, t.minute)
        return naive.replace(tzinfo=timezone.utc) - timedelta(hours=0) + timedelta(hours=4)
    except:
        return None

def select_news_alert_threshold(mins_away):
    """Return the current news warning bucket for a future event."""
    if mins_away < 0:
        return None
    for minutes, label, _ in NEWS_ALERT_THRESHOLDS:
        if mins_away <= minutes:
            return minutes, label
    return None

def news_alert_label(threshold_label):
    for _, label, display in NEWS_ALERT_THRESHOLDS:
        if label == threshold_label:
            return display
    return threshold_label

def build_news_alert_key(ev, threshold_label):
    currency = (ev.get("country") or "").upper()
    title = (ev.get("title") or "").strip()[:40]
    return f"{currency}_{ev.get('date','')}_{ev.get('time','')}_{title}_{threshold_label}"

def _news_parse_number(value):
    raw = (value or "").strip()
    if not raw:
        return None
    cleaned = raw.replace("%", "").replace(",", "").replace("+", "").strip()
    if cleaned.startswith("(") and cleaned.endswith(")"):
        cleaned = "-" + cleaned[1:-1]
    multiplier = 1.0
    suffix = cleaned[-1:].upper()
    if suffix in ("K", "M", "B"):
        cleaned = cleaned[:-1].strip()
        multiplier = {"K": 1_000.0, "M": 1_000_000.0, "B": 1_000_000_000.0}[suffix]
    try:
        return float(cleaned) * multiplier
    except Exception:
        return None

def _news_metric_profile(title):
    t = (title or "").lower()
    if any(k in t for k in ("unemployment", "jobless", "claimant", "claims")):
        return "inverse", "labor risk"
    if any(k in t for k in ("cpi", "ppi", "pce", "inflation", "earnings", "wage")):
        return "inflation", "inflation/rate expectations"
    if any(k in t for k in ("employment", "non-farm", "nonfarm", "payroll", "jobs")):
        return "positive", "labor strength"
    if any(k in t for k in ("retail", "sales", "gdp", "pmi", "ism", "production", "confidence")):
        return "positive", "growth momentum"
    if any(k in t for k in ("rate", "statement", "minutes", "press conference", "speech")):
        return "policy", "central-bank guidance"
    return "positive", "macro momentum"

def build_news_forecast_read(title, currency, forecast, previous):
    f_val = _news_parse_number(forecast)
    p_val = _news_parse_number(previous)
    profile, driver = _news_metric_profile(title)
    if f_val is None or p_val is None:
        return {
            "bias": "NEUTRAL",
            "summary": "No clean forecast-vs-previous edge.",
            "detail": "Forecast/previous data is incomplete, so treat this as volatility risk only.",
            "driver": driver,
        }

    if abs(f_val - p_val) < 1e-9:
        return {
            "bias": "NEUTRAL",
            "summary": f"{currency} forecast is in line with previous.",
            "detail": "No directional fundamental edge before the actual result.",
            "driver": driver,
        }

    hotter = f_val > p_val
    if profile == "inverse":
        supportive = not hotter
        direction_text = "lower than previous" if supportive else "higher than previous"
        detail = "Lower labor-risk data can support the currency." if supportive else "Higher labor-risk data can weigh on the currency."
    elif profile == "policy":
        supportive = None
        direction_text = "different from previous"
        detail = "Policy events need the actual wording/tone; forecast alone is not enough."
    else:
        supportive = hotter
        direction_text = "higher than previous" if hotter else "lower than previous"
        if profile == "inflation":
            detail = "Hotter inflation can support the currency through rate expectations, but actual/core details matter."
        else:
            detail = "Stronger growth/labor data can support the currency if actual confirms."

    if supportive is True:
        bias = "SUPPORT"
        summary = f"{currency} forecast is {direction_text} - possible {currency} support."
    elif supportive is False:
        bias = "RISK"
        summary = f"{currency} forecast is {direction_text} - possible {currency} risk."
    else:
        bias = "NEUTRAL"
        summary = f"{currency} forecast is {direction_text} - wait for actual tone."

    return {"bias": bias, "summary": summary, "detail": detail, "driver": driver}

def _news_bias_from_move(title, currency, actual_value, reference_value, reference_label):
    profile, driver = _news_metric_profile(title)
    if actual_value is None or reference_value is None:
        return {
            "bias": "NEUTRAL",
            "summary": "Actual result has no clean numeric comparison.",
            "detail": "Treat this as volatility context and wait for structure.",
            "driver": driver,
        }
    if abs(actual_value - reference_value) < 1e-9:
        return {
            "bias": "NEUTRAL",
            "summary": f"Actual matched {reference_label}.",
            "detail": "No clean surprise from the headline number.",
            "driver": driver,
        }

    higher = actual_value > reference_value
    if profile == "inverse":
        supportive = not higher
        direction_text = f"lower than {reference_label}" if supportive else f"higher than {reference_label}"
        detail = "Lower labor-risk data can support the currency." if supportive else "Higher labor-risk data can weigh on the currency."
    elif profile == "policy":
        supportive = None
        direction_text = f"different from {reference_label}"
        detail = "Policy events need the actual wording/tone; headline comparison is not enough."
    else:
        supportive = higher
        direction_text = f"higher than {reference_label}" if higher else f"lower than {reference_label}"
        if profile == "inflation":
            detail = "Hotter inflation can support the currency through rate expectations; cooler inflation can weigh on it."
        else:
            detail = "Stronger growth/labor data can support the currency; weaker data can weigh on it."

    if supportive is True:
        bias = "SUPPORT"
        summary = f"Actual came {direction_text} - {currency} supportive."
    elif supportive is False:
        bias = "RISK"
        summary = f"Actual came {direction_text} - {currency} risk."
    else:
        bias = "NEUTRAL"
        summary = f"Actual came {direction_text} - read the policy tone."

    return {"bias": bias, "summary": summary, "detail": detail, "driver": driver}

def build_news_actual_read(title, currency, actual, forecast, previous):
    actual_value = _news_parse_number(actual)
    forecast_value = _news_parse_number(forecast)
    previous_value = _news_parse_number(previous)
    forecast_read = build_news_forecast_read(title, currency, forecast, previous)

    if actual_value is None:
        return {
            "bias": "NEUTRAL",
            "summary": "Actual printed, but it is not a clean numeric value.",
            "detail": "Use the event wording, price reaction, and structure before reading the result.",
            "driver": _news_metric_profile(title)[1],
            "result": "Actual did not create a clean numeric catalyst.",
            "forecast_summary": forecast_read["summary"],
        }

    if forecast_value is not None:
        actual_read = _news_bias_from_move(title, currency, actual_value, forecast_value, "forecast")
    elif previous_value is not None:
        actual_read = _news_bias_from_move(title, currency, actual_value, previous_value, "previous")
    else:
        actual_read = {
            "bias": "NEUTRAL",
            "summary": "Actual printed, but no forecast/previous comparison is available.",
            "detail": "Use price reaction and structure before reading the event.",
            "driver": _news_metric_profile(title)[1],
        }

    forecast_bias = forecast_read["bias"]
    actual_bias = actual_read["bias"]
    if forecast_bias in ("SUPPORT", "RISK") and actual_bias == forecast_bias:
        result = "Actual confirmed the pre-news forecast read."
    elif forecast_bias in ("SUPPORT", "RISK") and actual_bias in ("SUPPORT", "RISK"):
        result = "Actual cancelled the pre-news forecast read."
    elif actual_bias in ("SUPPORT", "RISK"):
        result = "Actual created a fresh directional catalyst."
    else:
        result = "Actual did not create a clean directional catalyst."

    return {
        "bias": actual_bias,
        "summary": actual_read["summary"],
        "detail": actual_read["detail"],
        "driver": actual_read["driver"],
        "result": result,
        "forecast_summary": forecast_read["summary"],
    }

def build_news_panda_alignment(currency, affected, catalyst_bias):
    if catalyst_bias not in ("SUPPORT", "RISK"):
        return "Panda alignment: wait for actual result; no clean pre-news directional edge."
    try:
        res = supabase.table("dashboard").select(
            "symbol,gap,bias,base_currency,quote_currency"
        ).execute()
        rows = [r for r in (res.data or []) if r.get("symbol") in affected]
    except Exception as e:
        print(f"[NEWS ALERT] Panda alignment lookup failed: {e}")
        return "Panda alignment: unavailable right now."

    aligned = []
    conflict = []
    for r in rows:
        symbol = r.get("symbol") or ""
        bias = r.get("bias") or "WAIT"
        gap = float(r.get("gap") or 0)
        if bias not in ("BUY", "SELL") or abs(gap) < 5:
            continue
        base = r.get("base_currency") or symbol[:3]
        quote = r.get("quote_currency") or symbol[3:6]
        supports_currency = (currency == base and bias == "BUY") or (currency == quote and bias == "SELL")
        risks_currency = (currency == base and bias == "SELL") or (currency == quote and bias == "BUY")
        item = f"{symbol} {bias} gap {gap:+.0f}"
        if catalyst_bias == "SUPPORT" and supports_currency:
            aligned.append(item)
        elif catalyst_bias == "RISK" and risks_currency:
            aligned.append(item)
        elif supports_currency or risks_currency:
            conflict.append(item)

    if aligned:
        return "Panda alignment: " + ", ".join(aligned[:3]) + " agrees with the forecast read."
    if conflict:
        return "Panda alignment: " + ", ".join(conflict[:2]) + " conflicts with the forecast read; wait for actual."
    return "Panda alignment: no valid gap >= 5 is clearly aligned yet."

def check_news_alerts():
    """
    Check high-impact warnings and released results every scheduler minute.
    US PPI actuals fall back to the dated official release when absent in FF.
    """
    if is_market_closed():
        print(f"[NEWS ALERT] Market closed - skipped ({market_time_label()})")
        return
    if not telegram_circuit.allow():
        return
    try:
        events = fetch_news_feed()
        NEWS_ALERTED.update(load_sent_results())
        now_utc = datetime.now(timezone.utc)
        alerted_this_run = []
        result_this_run = []
        speech_this_run = []

        for ev in events:
            impact = (ev.get("impact") or "").strip()
            if impact.lower() != "high":
                continue
            currency = (ev.get("country") or "").upper()
            if currency not in CURRENCY_TO_PAIRS:
                continue
            title = ev.get("title","").strip()
            date_str = ev.get("date","")
            time_str = ev.get("time","")
            event_dt = parse_news_time(date_str, time_str)
            if not event_dt:
                continue
            mins_away = (event_dt - now_utc).total_seconds() / 60
            # Determine affected pairs from our 21
            affected = [p for p in CURRENCY_TO_PAIRS.get(currency,[]) if p in PAIRS]
            if not affected:
                continue

            if -NEWS_RESULT_WINDOW_MINUTES <= mins_away <= 0:
                if is_fed_chair_speech(ev):
                    speech_key = build_news_alert_key(ev, "SPEECH")
                    if speech_key not in NEWS_ALERTED and mins_away <= -15:
                        report = resolve_speech_summary(ev, event_dt, speech_api_key(OPENAI_API_KEY), now_utc)
                        stage = "SPEECH" if report["status"] == "ready" else "SPEECH_PENDING"
                        if build_news_alert_key(ev, stage) not in NEWS_ALERTED:
                            speech_this_run.append((ev, event_dt, report, stage))
                    continue
                result_key = build_news_alert_key(ev, "RESULT")
                if result_key not in NEWS_ALERTED:
                    result_ev = resolve_news_actual(ev, event_dt)
                    if str(result_ev.get("actual") or "").strip():
                        result_this_run.append((title, currency, mins_away, affected, event_dt, result_ev))

            threshold = select_news_alert_threshold(mins_away)
            if not threshold:
                continue
            _, threshold_label = threshold
            event_key = build_news_alert_key(ev, threshold_label)
            if event_key in NEWS_ALERTED:
                continue
            NEWS_ALERTED.add(event_key)
            alerted_this_run.append((title, currency, mins_away, affected, event_dt, threshold_label, ev))

        for title, currency, mins_away, affected, event_dt, threshold_label, ev in alerted_this_run:
            pairs_str = ", ".join(affected[:6])
            dubai_time = event_dt.astimezone(timezone(timedelta(hours=4))).strftime("%Y-%m-%d %H:%M")
            forecast = (ev.get("forecast") or "").strip()
            previous = (ev.get("previous") or "").strip()
            forecast_read = build_news_forecast_read(title, currency, forecast, previous)
            alignment_line = build_news_panda_alignment(currency, affected, forecast_read["bias"])
            data_line = ""
            if forecast or previous:
                data_line = f"\nForecast: <b>{forecast or '-'}</b> | Previous: <b>{previous or '-'}</b>\n"
            title_safe = html.escape(title)
            currency_safe = html.escape(currency)
            pairs_safe = html.escape(pairs_str)
            forecast_safe = html.escape(forecast or "-")
            previous_safe = html.escape(previous or "-")
            summary_safe = html.escape(forecast_read["summary"])
            detail_safe = html.escape(forecast_read["detail"])
            driver_safe = html.escape(forecast_read["driver"])
            alignment_safe = html.escape(alignment_line)
            if forecast or previous:
                data_line = f"\nForecast: <b>{forecast_safe}</b> | Previous: <b>{previous_safe}</b>\n"
            msg = (
                f"<b>HIGH IMPACT NEWS IN {news_alert_label(threshold_label)}</b>\n"
                f"---------------------\n"
                f"<b>{title_safe}</b>\n"
                f"Currency: <b>{currency_safe}</b>\n"
                f"Countdown: <b>{max(0, int(mins_away))} minutes</b>\n"
                f"Dubai time: <b>{dubai_time}</b>\n"
                f"{data_line}\n"
                f"<b>Forecast read:</b>\n"
                f"{summary_safe}\n"
                f"Driver: {driver_safe}\n"
                f"{detail_safe}\n\n"
                f"<b>Panda context:</b>\n"
                f"{alignment_safe}\n\n"
                f"Affected pairs:\n<b>{pairs_safe}</b>\n\n"
                f"<i>Forecast context only. Actual result + structure confirms or cancels. Not financial advice.</i>\n"
                f"PANDA ENGINE"
            )
            r = requests.post(
                f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage",
                data={"chat_id": TELEGRAM_CHAT_ID, "text": msg, "parse_mode": "HTML"},
                timeout=10
            )
            status = "✓" if r.status_code == 200 else "✗"
            print(f"[NEWS ALERT] {status} {currency} — {title} in {int(mins_away)}min → {pairs_str}")
            if r.status_code == 200:
                telegram_circuit.success()
            else:
                telegram_circuit.failure()

        for ev, event_dt, report, stage in speech_this_run:
            title_safe = html.escape(ev.get("title") or "Fed chair speech")
            dubai_time = event_dt.astimezone(timezone(timedelta(hours=4))).strftime("%Y-%m-%d %H:%M")
            if stage == "SPEECH":
                body = "\n".join("• " + html.escape(point) for point in report["bullets"])
                sources = "\n".join(f'<a href="{html.escape(url, quote=True)}">Source {i+1}</a>' for i, url in enumerate(report["sources"]))
                msg = (f"<b>FED CHAIR — POST-EVENT SUMMARY</b>\n{title_safe}\n"
                       f"Event Dubai time: {dubai_time}\n\n{body}\n\n{sources}\n\n"
                       "<i>AI summary of linked reporting, not an official transcript. "
                       "A speech is not a numeric release or rate decision. Context only.</i>\nPANDA ENGINE")
            else:
                msg = (f"<b>FED CHAIR — SUMMARY PENDING</b>\n{title_safe}\n"
                       f"Event Dubai time: {dubai_time}\n\n"
                       "The scheduled start has passed. No source-linked summary is available yet. "
                       "This event has no numeric actual value. Checking again every 30 minutes "
                       "for up to 24 hours after the event.\nPANDA ENGINE")
            try:
                r = requests.post(f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage",
                                  data={"chat_id": TELEGRAM_CHAT_ID, "text": msg, "parse_mode": "HTML"}, timeout=10)
                payload = r.json() if r.status_code == 200 else {}
                if r.status_code == 200 and payload.get("ok") is True:
                    key = build_news_alert_key(ev, stage)
                    mark_result_sent(key, (payload.get("result") or {}).get("message_id"))
                    NEWS_ALERTED.add(key)
                    telegram_circuit.success()
                    print(f"[NEWS SPEECH] {stage} delivered: {ev.get('title')}")
                else:
                    telegram_circuit.failure()
                    print("[NEWS SPEECH] Delivery failed; will retry")
            except Exception as exc:
                telegram_circuit.failure()
                print(f"[NEWS SPEECH] Delivery failed ({type(exc).__name__}); will retry")

        for title, currency, mins_away, affected, event_dt, ev in result_this_run:
            pairs_str = ", ".join(affected[:6])
            dubai_time = event_dt.astimezone(timezone(timedelta(hours=4))).strftime("%Y-%m-%d %H:%M")
            actual = (ev.get("actual") or "").strip()
            forecast = (ev.get("forecast") or "").strip()
            previous = (ev.get("previous") or "").strip()
            actual_read = build_news_actual_read(title, currency, actual, forecast, previous)
            if not actual_read:
                continue
            alignment_line = build_news_panda_alignment(currency, affected, actual_read["bias"])
            alignment_line = alignment_line.replace("forecast read", "actual result").replace("wait for actual", "wait for structure")
            source = ev.get("actual_source") or ""
            source_line = f'Source: <a href="{html.escape(source, quote=True)}">Official BLS / DOL release</a>\n\n' if source else ""

            title_safe = html.escape(title)
            currency_safe = html.escape(currency)
            pairs_safe = html.escape(pairs_str)
            actual_safe = html.escape(actual or "-")
            forecast_safe = html.escape(forecast or "-")
            previous_safe = html.escape(previous or "-")
            forecast_summary_safe = html.escape(actual_read["forecast_summary"])
            result_safe = html.escape(actual_read["result"])
            summary_safe = html.escape(actual_read["summary"])
            detail_safe = html.escape(actual_read["detail"])
            driver_safe = html.escape(actual_read["driver"])
            alignment_safe = html.escape(alignment_line)
            released_mins = max(0, int(abs(mins_away)))

            msg = (
                f"<b>HIGH IMPACT NEWS RESULT</b>\n"
                f"---------------------\n"
                f"<b>{title_safe}</b>\n"
                f"Currency: <b>{currency_safe}</b>\n"
                f"Released: <b>{released_mins} minutes ago</b>\n"
                f"Dubai time: <b>{dubai_time}</b>\n\n"
                f"Actual: <b>{actual_safe}</b> | Forecast: <b>{forecast_safe}</b> | Previous: <b>{previous_safe}</b>\n\n"
                f"{source_line}"
                f"<b>Before news:</b>\n"
                f"{forecast_summary_safe}\n\n"
                f"<b>After actual:</b>\n"
                f"{result_safe}\n"
                f"{summary_safe}\n"
                f"Driver: {driver_safe}\n"
                f"{detail_safe}\n\n"
                f"<b>Panda context:</b>\n"
                f"{alignment_safe}\n\n"
                f"Affected pairs:\n<b>{pairs_safe}</b>\n\n"
                f"<i>Actual result context only. Structure confirms or cancels. Not financial advice.</i>\n"
                f"PANDA ENGINE"
            )
            try:
                r = requests.post(
                    f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage",
                    data={"chat_id": TELEGRAM_CHAT_ID, "text": msg, "parse_mode": "HTML"},
                    timeout=10
                )
                payload = r.json() if r.status_code == 200 else {}
                delivered = r.status_code == 200 and payload.get("ok") is True
            except Exception as exc:
                print(f"[NEWS RESULT] Delivery failed ({type(exc).__name__}); will retry")
                telegram_circuit.failure()
                continue
            status = "OK" if delivered else "FAILED"
            print(f"[NEWS RESULT] {status} {currency} - {title} {released_mins}min ago -> {pairs_str}")
            if delivered:
                telegram_circuit.success()
                result_key = build_news_alert_key(ev, "RESULT")
                NEWS_ALERTED.add(result_key)
                try:
                    mark_result_sent(result_key, (payload.get("result") or {}).get("message_id"))
                except Exception as exc:
                    print(f"[NEWS RESULT] Delivery mark failed ({type(exc).__name__})")
            else:
                telegram_circuit.failure()
    except Exception as e:
        print(f"[NEWS ALERT ERROR]: {e}")

# ---- AI SNAPSHOT NARRATOR ----
def build_ai_snapshot_fallback(active, session):
    if not active:
        return (
            f"{session} session is quiet right now, with no active pairs above the signal gap threshold.\n"
            "Current dashboard data is still available in the snapshot image."
        )

    buy_count = len([p for p in active if p.get("bias") == "BUY"])
    sell_count = len([p for p in active if p.get("bias") == "SELL"])
    top_pairs = []
    for p in active[:4]:
        symbol = p.get("symbol", "-")
        bias = p.get("bias", "WAIT")
        gap = p.get("gap") or 0
        momentum = p.get("momentum") or "UNKNOWN"
        pl_zone = panda_lines_status(p.get("pl_zone"), p.get("pl_price"), p.get("pl_st"),
                                     p.get("pl_fl"), symbol)
        top_pairs.append(f"{symbol} {bias} ({abs(gap):.1f} gap, {momentum}, PL {pl_zone})")

    return (
        f"{session} session has {len(active)} active bias setups: {buy_count} BUY and {sell_count} SELL.\n"
        f"Strongest names: {', '.join(top_pairs)}.\n"
        "Use the snapshot image for full pair context and current validation state."
    )


def send_ai_snapshot():
    """
    Calls OpenAI to generate a brief market narration and sends it to Telegram.
    Narrator mode only — describes data, no trade recommendations.
    Non-blocking: any failure is logged and ignored.
    """
    if is_market_closed():
        print(f"[AI SNAPSHOT] Market closed - skipped ({market_time_label()})")
        return
    if not telegram_circuit.allow():
        print(f"[AI SNAPSHOT] Skipped - Telegram circuit locked (locked_until={telegram_circuit.locked_until}, now={time.time():.0f})")
        return
    try:
        # Fetch current dashboard data
        res = supabase.table("dashboard").select(
            "symbol, gap, bias, momentum, pl_zone, pl_price, pl_st, pl_fl, confidence, box_h1_trend, box_h4_trend"
        ).execute()
        pairs = res.data or []
        if not pairs:
            print("[AI SNAPSHOT] Skipped - dashboard returned 0 pairs")
            return

        # Build compact market summary for prompt
        session = get_session()
        active = [p for p in pairs if abs(p.get("gap") or 0) >= 5 and p.get("bias") in ("BUY","SELL")]
        active.sort(key=lambda x: abs(x.get("gap") or 0), reverse=True)

        pair_lines = []
        for p in active[:8]:
            pl = "✓PL" if (
                (p["bias"]=="BUY" and p.get("pl_zone")=="ABOVE") or
                (p["bias"]=="SELL" and p.get("pl_zone")=="BELOW")
            ) else "✗PL"
            pair_lines.append(
                f"{p['symbol']} {p['bias']} gap:{p['gap']:+.1f} "
                f"mom:{p.get('momentum','?')} {pl}"
            )

        market_text = "\n".join(pair_lines) if pair_lines else "No active signals"
        prompt = (
            f"SESSION: {session}\n"
            f"ACTIVE PAIRS ({len(active)} valid signals):\n{market_text}\n\n"
            f"Write a 3-4 line market update for forex traders. "
            f"Describe the current bias landscape and session context. "
            f"Mention any strong setups by name. "
            f"Data description only — no trade recommendations. "
            f"Keep under 150 words. Use plain text, no markdown."
        )

        # Retry OpenAI up to 3 times with exponential backoff
        ai_text = None
        for attempt in range(1, 4):
            try:
                response = requests.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={"Authorization": f"Bearer {OPENAI_API_KEY}", "Content-Type": "application/json"},
                    json={
                        "model": "gpt-4o-mini",
                        "messages": [
                            {"role": "system", "content": "You are Panda AI — a currency bias narrator. Describe market data factually. Never recommend trades."},
                            {"role": "user", "content": prompt}
                        ],
                        "max_tokens": 200,
                        "temperature": 0.3
                    },
                    timeout=20
                )
                if response.status_code == 200:
                    ai_text = response.json()["choices"][0]["message"]["content"].strip()
                    break
                else:
                    print(f"[AI SNAPSHOT] OpenAI error {response.status_code} (attempt {attempt}/3)")
            except Exception as oai_err:
                print(f"[AI SNAPSHOT] OpenAI request failed (attempt {attempt}/3): {oai_err}")
            if attempt < 3:
                time.sleep(2 ** attempt)  # 2s, 4s backoff

        # Fallback: send data-only update if OpenAI completely failed
        if not ai_text:
            print("[AI SNAPSHOT] OpenAI failed all 3 attempts — sending polished data fallback")
            ai_text = build_ai_snapshot_fallback(active, session)
        now_str = datetime.now().strftime("%H:%M")
        safe_ai_text = html.escape(ai_text)

        msg = (
            f"🤖 <b>PANDA AI — Market Update</b>\n"
            f"━━━━━━━━━━━━━━━━━━━━━\n"
            f"🕐 {now_str} | 📍 {session} SESSION\n\n"
            f"{safe_ai_text}\n\n"
            f"<i>⚠️ Currency bias data only. Not financial advice.</i>\n"
            f"🐼 PANDA ENGINE"
        )

        r = requests.post(
            f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage",
            data={"chat_id": TELEGRAM_CHAT_ID, "text": msg, "parse_mode": "HTML"},
            timeout=15
        )
        if r.status_code == 200:
            print(f"[AI SNAPSHOT] Sent — {len(active)} active pairs, {session} session")
            telegram_circuit.success()
        else:
            print(f"[AI SNAPSHOT] Telegram error: {r.text}")
            telegram_circuit.failure()

    except Exception as e:
        print(f"[AI SNAPSHOT ERROR]: {e}")

LAST_CLEANUP_DATE = None

def daily_cleanup():
    """Purge rows older than 7 days from high-growth tables. Runs once per day."""
    global LAST_CLEANUP_DATE
    today = datetime.utcnow().strftime("%Y-%m-%d")
    if LAST_CLEANUP_DATE == today:
        return
    LAST_CLEANUP_DATE = today
    cutoff_ts = (datetime.utcnow() - timedelta(days=7)).isoformat()
    cutoff_str = (datetime.utcnow() - timedelta(days=7)).strftime("%Y-%m-%d %H:%M")
    cleanup_targets = [
        # (table, column, cutoff, uses_timestamptz)
        ("signal_snapshots", "timestamp", cutoff_ts, True),
        ("gap_history",      "timestamp", cutoff_str, False),
        ("strength_log",     "timestamp", cutoff_str, False),
        ("engine_logs",      "timestamp", cutoff_str, False),
    ]
    total_deleted = 0
    for tbl, col, cutoff, _ in cleanup_targets:
        try:
            supabase_retry(
                lambda t=tbl, c=col, v=cutoff: supabase.table(t).delete().lt(c, v).execute(),
                label=f"Cleanup-{tbl}"
            )
            print(f"[CLEANUP] {tbl}: purged rows before {cutoff}")
            total_deleted += 1
        except Exception as e:
            print(f"[CLEANUP ERROR] {tbl}: {e}")
    print(f"[CLEANUP] Daily cleanup complete — {total_deleted}/{len(cleanup_targets)} tables cleaned")

async def master_scheduler():
    global LAST_QUARTER_MARK, LAST_HOUR_MARK, LAST_HOUR_ATTEMPT, LAST_MARKET_DESK_DAY, LAST_NEWS_MARK
    await asyncio.sleep(5)
    if LAST_HOUR_MARK is None:
        LAST_HOUR_MARK = load_snapshot_hour_mark()
    if LAST_MARKET_DESK_DAY is None:
        LAST_MARKET_DESK_DAY = load_market_desk_day_mark()
    print("[SCHEDULER] Started — waiting for next 15-min mark...")

    while True:
        try:
            now = datetime.now()

            if now.second < 10:
                news_mark = now.replace(second=0, microsecond=0)
                if LAST_NEWS_MARK != news_mark:
                    try:
                        await run_scheduler_step("news", check_news_alerts)
                    except Exception as e:
                        print("[NEWS ERROR - 1min]:", e)
                    async with ENGINE_LOCK:
                        try:
                            await run_scheduler_step(
                                "signal-retry",
                                dispatch_signal_outbox,
                            )
                        except Exception as e:
                            print("[SIGNAL OUTBOX] Retry error:", e)
                    LAST_NEWS_MARK = news_mark

            if now.minute % 5 == 0 and now.second < 10:
                quarter_mark = now.replace(second=0, microsecond=0)
                if LAST_QUARTER_MARK != quarter_mark:
                    async with ENGINE_LOCK:
                        try:
                            print(f"\n{'='*50}\n[5MIN] Firing at {now.strftime('%H:%M:%S')}")
                            await run_scheduler_step("5min", run_gap_once)
                        except Exception as e:
                            print("[ENGINE ERROR - 15min]:", e)
                    LAST_QUARTER_MARK = quarter_mark

            hourly_due, hour_mark = hourly_snapshot_due(now, LAST_HOUR_MARK, LAST_HOUR_ATTEMPT)
            if hourly_due:
                async with ENGINE_LOCK:
                    first_attempt = (LAST_HOUR_ATTEMPT is None or
                                     LAST_HOUR_ATTEMPT.replace(minute=0, second=0, microsecond=0) != hour_mark)
                    LAST_HOUR_ATTEMPT = now
                    try:
                        print(f"\n{'='*50}\n[HOURLY] Firing at {now.strftime('%H:%M:%S')}")
                        # The 5-minute cycle refreshes dashboard data. Do not let a
                        # second score pass delay or suppress hourly delivery.
                        # Auto-reset circuit breaker before hourly snapshot
                        # — ensures snapshot always attempts, even after transient failures
                        if not telegram_circuit.allow():
                            print("[HOURLY] Circuit breaker was locked — auto-resetting for snapshot")
                            telegram_circuit.failures = 0
                            telegram_circuit.locked_until = 0
                        snapshot_ok = await asyncio.to_thread(send_snapshot)
                        if snapshot_ok:
                            LAST_HOUR_MARK = hour_mark
                            persist_snapshot_hour_mark(hour_mark)
                        else:
                            print("[HOURLY] Snapshot not confirmed; will retry in 60 seconds")
                        if first_attempt:
                            # AI and Market Desk retain their hourly/daily cadence
                            # even when the main snapshot needs another attempt.
                            if not telegram_circuit.allow():
                                print("[HOURLY] Circuit breaker tripped during snapshot — resetting for AI market update")
                                telegram_circuit.failures = 0
                                telegram_circuit.locked_until = 0
                            await run_scheduler_step("hourly-ai-update", send_ai_snapshot)
                            daily_desk_due, day_mark = daily_market_desk_due(now, LAST_MARKET_DESK_DAY)
                            if daily_desk_due:
                                if not telegram_circuit.allow():
                                    print("[MARKET DESK] Circuit breaker was locked — auto-resetting for daily report")
                                    telegram_circuit.failures = 0
                                    telegram_circuit.locked_until = 0
                                market_desk_ok = await asyncio.to_thread(send_daily_market_desk)
                                if market_desk_ok:
                                    persist_market_desk_day_mark(day_mark)
                                    LAST_MARKET_DESK_DAY = day_mark
                            await run_scheduler_step("hourly-cleanup", daily_cleanup)
                            if TRACK_SIGNAL_RESULTS or TRACK_SHADOW_RESULTS:
                                maybe_run_nightly_analyst(now)
                    except Exception as e:
                        print("[ENGINE ERROR - hourly]:", e)

        except Exception as e:
            print("[SCHEDULER ERROR]:", e)

        await asyncio.sleep(5)

# ================= STARTUP =================
@app.on_event("startup")
async def startup():
    print("\n🐼 PANDA ENGINE v3.0 STARTING...")
    print("   Source: mt4_SYMBOL.txt (cBot RETIRED)")
    print("   Scoring: Python engine (GAP, BIAS, EXECUTION, CONFIDENCE, HARD_INVALID)")
    print("   Momentum: BUILDING / STRONG / SPARK / CONSOLIDATING / COOLING / FADING / REVERSING")
    print("   Login Alert: ENABLED")
    asyncio.create_task(master_scheduler())


# ================= TELEGRAM WEBHOOK =================
@app.post("/telegram-webhook")
async def telegram_webhook(request: Request):
    """Saves chat_id when user sends /start to the bot."""
    try:
        body = await request.json()
        message = body.get("message") or body.get("edited_message")
        if not message:
            return {"ok": True}
        chat_id   = str(message.get("chat", {}).get("id", ""))
        text      = (message.get("text") or "").strip()
        tg_user   = (message.get("from", {}).get("username") or "").lower()
        if text.startswith("/start") and chat_id:
            if tg_user:
                supabase.table("pf_telegram_chats").upsert(
                    {"telegram_username": tg_user, "chat_id": chat_id},
                    on_conflict="telegram_username"
                ).execute()
            welcome = (
                "🐼 <b>PANDA ENGINE</b>\n"
                "━━━━━━━━━━━━━━━━━━━━━━\n"
                "You're now registered to receive your credentials automatically.\n\n"
                "👉 Visit panda-dashboard.vercel.app/pricing to request access.\n\n"
                "🐼 See you inside."
            )
            requests.post(
                f"https://api.telegram.org/bot{LOGIN_ALERT_BOT_TOKEN}/sendMessage",
                json={"chat_id": chat_id, "text": welcome, "parse_mode": "HTML", "disable_web_page_preview": True},
                timeout=10
            )
            print(f"[TG WEBHOOK] /start @{tg_user} {chat_id}")
    except Exception as e:
        print(f"[TG WEBHOOK ERROR] {e}")
    return {"ok": True}

# ================= ROUTES =================
@app.get("/")
def home():
    return {
        "status":   "PANDA ENGINE v3.0",
        "source":   "mt4_SYMBOL.txt (cBot retired)",
        "scoring":  "Python engine",
        "pairs":    len(PAIRS),
    }

@app.get("/telegram-health")
def telegram_health():
    """Diagnose Telegram connectivity: circuit breaker state + send test message."""
    cb_locked = not telegram_circuit.allow()
    cb_failures = telegram_circuit.failures
    cb_locked_until = telegram_circuit.locked_until
    remaining = max(0, cb_locked_until - time.time()) if cb_locked else 0

    # Try a test message
    test_result = "skipped"
    if TELEGRAM_TOKEN and TELEGRAM_CHAT_ID:
        try:
            r = requests.post(
                f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage",
                data={"chat_id": TELEGRAM_CHAT_ID, "text": f"🐼 TELEGRAM HEALTH CHECK\n✅ Engine alive\n⏰ {datetime.now().strftime('%H:%M:%S')}\nCircuit: {'LOCKED' if cb_locked else 'OK'} (failures: {cb_failures})", "parse_mode": "HTML"},
                timeout=10
            )
            test_result = "sent_ok" if r.status_code == 200 else f"error_{r.status_code}: {r.text[:200]}"
            if r.status_code == 200:
                telegram_circuit.success()  # Reset breaker on success
        except Exception as e:
            test_result = f"exception: {str(e)[:200]}"
    else:
        test_result = "no_credentials"

    return {
        "circuit_breaker": {
            "locked": cb_locked,
            "failures": cb_failures,
            "locked_for_seconds": round(remaining),
        },
        "telegram_token_set": bool(TELEGRAM_TOKEN),
        "telegram_chat_id_set": bool(TELEGRAM_CHAT_ID),
        "test_message": test_result,
    }

@app.get("/telegram-reset")
def telegram_reset():
    """Force-reset the Telegram circuit breaker and send a snapshot immediately."""
    telegram_circuit.failures = 0
    telegram_circuit.locked_until = 0
    try:
        send_snapshot()
        return {"status": "Circuit breaker reset + snapshot sent"}
    except Exception as e:
        return {"status": "Circuit reset OK but snapshot failed", "error": str(e)}

@app.get("/weekly-market-desk")
def weekly_market_desk():
    """Force-send the Panda Market Desk report to the main Telegram snapshot group."""
    telegram_circuit.failures = 0
    telegram_circuit.locked_until = 0
    ok = send_daily_market_desk()
    if ok:
        now = datetime.now()
        day_mark = now.date().isoformat()
        persist_market_desk_day_mark(day_mark)
        global LAST_MARKET_DESK_DAY
        LAST_MARKET_DESK_DAY = day_mark
    return {"status": "sent" if ok else "failed"}

@app.get("/market-desk")
def market_desk():
    return weekly_market_desk()

@app.get("/force")
def force_run():
    try:
        # Reset circuit breaker before forcing snapshot
        telegram_circuit.failures = 0
        telegram_circuit.locked_until = 0
        run_gap_once()
        send_snapshot()
        return {"status": "Force run + snapshot sent (circuit breaker reset)"}
    except Exception as e:
        return {"status": "ERROR", "message": str(e)}

@app.get("/force-gap")
def force_gap_only():
    try:
        result = run_gap_once()
        return {"status": "OK", "pairs": len(result) if result else 0}
    except Exception as e:
        return {"status": "ERROR", "message": str(e)}

# ================= PANDA STRAT EA API =================
# Returns per-symbol signal data for the Panda Strat MT5 EA.
# The EA polls this endpoint every 30s. Engine does the filtering,
# EA just reads the verdict and executes.

PANDA_A_TIER_SET = {"EURAUD", "AUDJPY", "EURNZD", "NZDUSD", "GBPUSD", "EURJPY"}
PANDA_BLACKLIST_SET = {"CADJPY", "AUDCAD", "AUDUSD"}
PANDA_GOOD_MOM_SET = {"STRONG", "BUILDING", "SPARK"}

@app.get("/api/ea/panda")
def ea_panda_signal(request: Request, symbol: str = ""):
    """
    Returns Panda Strat signal for a single symbol.
    EA calls: GET /api/ea/panda?symbol=EURCAD
    Auth: ENGINE_SECRET in X-Engine-Secret header.
    Response: {action: "BUY"|"SELL"|"NONE", gap, momentum, box_h4, session, reason}
    """
    secret = request.headers.get("x-engine-secret", "")
    if not ENGINE_SECRET or secret != ENGINE_SECRET:
        return {"error": "unauthorized"}

    if not symbol or len(symbol) < 6:
        return {"action": "NONE", "reason": "no_symbol"}

    sym = symbol.upper()[:6]

    # Pair filter
    if sym in PANDA_BLACKLIST_SET:
        return {"action": "NONE", "reason": "blacklisted", "symbol": sym}
    if sym not in PANDA_A_TIER_SET:
        return {"action": "NONE", "reason": "not_a_tier", "symbol": sym}

    # Session filter
    session = get_session()
    if session == "LONDON":
        return {"action": "NONE", "reason": "london_session", "symbol": sym, "session": session}

    # Get live dashboard data
    try:
        res = supabase.table("dashboard").select("*").eq("symbol", sym).limit(1).execute()
        if not res.data:
            return {"action": "NONE", "reason": "no_data", "symbol": sym}
        row = res.data[0]
    except Exception as e:
        return {"action": "NONE", "reason": f"db_error: {e}", "symbol": sym}

    gap = row.get("gap", 0)
    abs_gap = abs(gap)
    momentum = row.get("momentum", "")
    box_h4 = row.get("box_h4_trend", "")
    hard_invalid = row.get("hard_invalid", True)

    # Hard invalid
    if hard_invalid:
        return {"action": "NONE", "reason": "hard_invalid", "symbol": sym, "gap": gap}

    # Gap threshold
    if abs_gap < 6:
        return {"action": "NONE", "reason": "gap_below_6", "symbol": sym, "gap": gap}

    # Direction
    direction = "BUY" if gap >= 6 else "SELL" if gap <= -6 else "NONE"
    if direction == "NONE":
        return {"action": "NONE", "reason": "no_bias", "symbol": sym, "gap": gap}

    # Momentum filter
    if momentum not in PANDA_GOOD_MOM_SET:
        return {"action": "NONE", "reason": f"bad_momentum:{momentum}", "symbol": sym, "gap": gap, "momentum": momentum}

    # Box H4 alignment
    expected_box = "UPTREND" if direction == "BUY" else "DOWNTREND"
    if box_h4 != expected_box:
        return {"action": "NONE", "reason": f"box_h4_mismatch:{box_h4}", "symbol": sym, "gap": gap, "box_h4": box_h4}

    # Check for existing PENDING signal (prevent stacking)
    try:
        pending = supabase.table("signal_results").select("id").eq("symbol", sym).eq("strategy", "PANDA").eq("status", "PENDING").execute()
        has_pending = bool(pending.data and len(pending.data) > 0)
    except Exception:
        has_pending = False

    return {
        "action": direction,
        "symbol": sym,
        "gap": gap,
        "momentum": momentum,
        "box_h4": box_h4,
        "session": session,
        "has_pending_signal": has_pending,
        "reason": "all_filters_passed"
    }


@app.get("/api/ea/panda/exit")
def ea_panda_exit(request: Request, symbol: str = ""):
    """
    Returns exit signal for an open PANDA trade.
    EA calls: GET /api/ea/panda/exit?symbol=EURCAD
    Response: {should_exit: true|false, reason, gap, pips_flat_hours}
    """
    secret = request.headers.get("x-engine-secret", "")
    if not ENGINE_SECRET or secret != ENGINE_SECRET:
        return {"error": "unauthorized"}

    sym = symbol.upper()[:6] if symbol else ""
    if not sym:
        return {"should_exit": false, "reason": "no_symbol"}

    try:
        res = supabase.table("dashboard").select("gap,momentum,bias").eq("symbol", sym).limit(1).execute()
        if not res.data:
            return {"should_exit": False, "reason": "no_data"}
        row = res.data[0]
    except Exception as e:
        return {"should_exit": False, "reason": f"db_error: {e}"}

    gap = row.get("gap", 0)
    abs_gap = abs(gap)

    # Exit conditions
    if abs_gap < 5:
        return {"should_exit": True, "reason": "BIAS_FLIP", "gap": gap}

    return {"should_exit": False, "reason": "hold", "gap": gap, "momentum": row.get("momentum", "")}


@app.get("/status")
def get_status():
    try:
        hb          = supabase.table("engine_heartbeat").select("created_at").order("created_at", desc=True).limit(1).execute()
        res         = supabase.table("engine_logs").select("timestamp").order("timestamp", desc=True).limit(1).execute()
        last_run    = (
            hb.data[0]["created_at"] if hb.data
            else res.data[0]["timestamp"] if res.data
            else "Never"
        )
        dash        = supabase.table("dashboard").select("symbol,gap,momentum,hard_invalid,execution,updated_at").execute()
        all_pairs   = dash.data or []
        valid       = [r for r in all_pairs if abs(r.get("gap") or 0) >= 5 and not r.get("hard_invalid")]
        hard_inv    = [r for r in all_pairs if r.get("hard_invalid")]
        market_exec = [r for r in valid if r.get("execution") == "MARKET"]
        return {
            "status":        "ACTIVE",
            "version":       "3.0 (cBot retired)",
            "last_run":      last_run,
            "total_pairs":   len(all_pairs),
            "valid_pairs":   len(valid),
            "hard_invalid":  len(hard_inv),
            "buy_pairs":     len([r for r in valid if (r.get("gap") or 0) >= 5]),
            "sell_pairs":    len([r for r in valid if (r.get("gap") or 0) <= -5]),
            "market_exec":   len(market_exec),
        }
    except Exception as e:
        return {"status": "ERROR", "message": str(e)}


# ================= HERMES FEED =================
# Compact JSON feed for Hermes supervisor agent.
# Returns: current dashboard state (compact), recent signals, deltas, and health.
# Auth: requires ENGINE_SECRET in X-Engine-Secret header.

HERMES_SECRET = os.environ.get("HERMES_SECRET", ENGINE_SECRET)

@app.get("/api/hermes/feed")
def hermes_feed(request: Request, limit: int = 20):
    """Compact feed for Hermes autonomous learning agent."""
    # ---- Auth check ----
    secret = request.headers.get("X-Engine-Secret") or request.query_params.get("secret")
    if not secret or secret != HERMES_SECRET:
        return {"error": "unauthorized"}

    try:
        # ---- 1. Dashboard state (compact keys) ----
        dash = supabase.table("dashboard").select(
            "symbol,gap,bias,execution,momentum,confidence,hard_invalid,"
            "pl_zone,box_h1_trend,box_h4_trend,delta_short,delta_mid,delta_long,"
            "strength,updated_at"
        ).execute()
        pairs = []
        for r in (dash.data or []):
            pairs.append({
                "p":   r["symbol"],
                "g":   r.get("gap", 0),
                "b":   r.get("bias", "WAIT"),
                "ex":  r.get("execution", "WAIT"),
                "m":   r.get("momentum", "FLAT"),
                "c":   r.get("confidence", 0),
                "hi":  r.get("hard_invalid", False),
                "pl":  r.get("pl_zone", ""),
                "bx1": r.get("box_h1_trend", ""),
                "bx4": r.get("box_h4_trend", ""),
                "ds":  r.get("delta_short"),
                "dm":  r.get("delta_mid"),
                "dl":  r.get("delta_long"),
                "str": r.get("strength"),
                "ts":  r.get("updated_at", ""),
            })

        # ---- 2. Recent signals (last N from signal_results) ----
        sig = supabase.table("signal_results").select(
            "id,symbol,direction,strategy,entry_gap,peak_gap,momentum,confidence,"
            "pl_zone,session,box_h1_trend,box_h4_trend,status,created_at"
        ).order("created_at", desc=True).limit(limit).execute()
        signals = []
        for s in (sig.data or []):
            signals.append({
                "id":  s["id"],
                "p":   s["symbol"],
                "d":   s["direction"],
                "st":  s["strategy"],
                "eg":  s.get("entry_gap", 0),
                "pg":  s.get("peak_gap", 0),
                "m":   s.get("momentum", ""),
                "c":   s.get("confidence", 0),
                "pl":  s.get("pl_zone", ""),
                "ses": s.get("session", ""),
                "bx1": s.get("box_h1_trend", ""),
                "bx4": s.get("box_h4_trend", ""),
                "res": s.get("status", "PENDING"),
                "at":  s.get("created_at", ""),
            })

        # ---- 3. Health summary ----
        logs = supabase.table("engine_logs").select("timestamp").order("timestamp", desc=True).limit(1).execute()
        last_run = logs.data[0]["timestamp"] if logs.data else "Never"
        hb = supabase.table("engine_heartbeat").select("created_at").order("created_at", desc=True).limit(1).execute()
        last_hb = hb.data[0]["created_at"] if hb.data else "Never"

        active = [p for p in pairs if abs(p["g"]) >= 5 and p["b"] in ("BUY", "SELL") and not p["hi"]]
        stale  = [p for p in pairs if p["hi"]]

        health = {
            "last_run":    last_run,
            "last_hb":     last_hb,
            "total":       len(pairs),
            "active":      len(active),
            "stale":       len(stale),
            "buy":         len([p for p in active if p["b"] == "BUY"]),
            "sell":        len([p for p in active if p["b"] == "SELL"]),
            "market_exec": len([p for p in active if p["ex"] == "MARKET"]),
        }

        # ---- 4. Deltas only (pairs that changed since last cycle) ----
        changed = [p for p in pairs if p["ds"] is not None and abs(p["ds"]) > 0]

        return {
            "v":        "1.0",
            "ts":       datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
            "health":   health,
            "pairs":    pairs,
            "changed":  [p["p"] for p in changed],
            "signals":  signals,
        }
    except Exception as e:
        return {"error": str(e)}
