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
import os
import re
import requests
import time
import threading
from datetime import datetime, timezone, timedelta
from PIL import Image, ImageDraw, ImageFont
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

app = FastAPI()

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

LOGIN_ALERT_BOT_TOKEN = os.environ.get("LOGIN_ALERT_BOT_TOKEN", "")
LOGIN_ALERT_CHAT_ID   = os.environ.get("LOGIN_ALERT_CHAT_ID", "")
ENGINE_SECRET         = os.environ.get("ENGINE_SECRET", "")

# ---- OpenAI (AI Insights) ----
OPENAI_API_KEY        = os.environ.get("OPENAI_API_KEY", "")

PAIRS = [
    "AUDJPY","AUDCAD","AUDNZD","AUDUSD","CADJPY",
    "EURAUD","EURCAD","EURGBP","EURJPY","EURNZD","EURUSD",
    "GBPAUD","GBPCAD","GBPJPY","GBPNZD","GBPUSD",
    "NZDCAD","NZDJPY","NZDUSD","USDCAD","USDJPY",
]

LAST_QUARTER_MARK = None
LAST_HOUR_MARK    = None
LAST_NEWS_MARK    = None
PREV_MOMENTUM     = {}
PREV_GAP          = {}
PREV_BIAS         = {}
PREV_GAP_INITIALIZED = False

# ---- News alert state ----
NEWS_ALERTED      = set()   # event keys already alerted this week — prevents duplicates
NEWS_CACHE        = {"data": [], "fetched_at": None}   # 30-min in-memory cache
NEWS_CACHE_TTL    = 1800    # seconds
NEWS_ALERT_THRESHOLDS = (
    (2, "2M", "2 MIN"),
    (15, "15M", "15 MIN"),
    (60, "1H", "1 HOUR"),
    (180, "3H", "3 HOURS"),
)

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
SPIKE_COOLDOWN = {}        # {symbol: last_spike_datetime}
GAP_ALERT_COOLDOWN = {}    # {symbol: last_gap-alert_datetime} — gap 9-12 + valid PL
EARLY_ENTRY_COOLDOWN = {}  # {symbol: last_early_alert_datetime} — fires on gap threshold crossover
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
    """Parse score string like '+3/-1', '+6', '-2' -> dominant int value (sum of parts)."""
    s = s.strip()
    if "/" in s:
        total = 0
        for p in s.split("/"):
            try: total += int(p.strip())
            except: pass
        return total
    try: return int(s)
    except: return 0

def parse_mt4_file(symbol):
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
            r"^ADV\s*:\s*([A-Z]{3})\s*:\s*D1\s*:\s*([+\-\d/]+)\s*\|\s*H4\s*:\s*([+\-\d/]+)\s*\|\s*H1\s*:\s*([+\-\d/]+)",
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
            r"^\s*([A-Z]{3})\s*:\s*D1\s*:\s*([+\-\d/]+)\s*\|\s*H4\s*:\s*([+\-\d/]+)\s*\|\s*H1\s*:\s*([+\-\d/]+)",
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

    return result if (base_set and quote_set) else None


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
            "pdh": None, "pdl": None, "pwh": None, "pwl": None,
            "pmh": None, "pml": None, "pyh": None, "pyl": None,
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
    gap_deltas          = {}   # {symbol: current_gap - prev_gap} for snapshot logging
    stale_count         = 0
    hard_invalid_count  = 0

    # ---- STEP 1: Parse ALL pairs first (needed for cross-pair conflict scan) ----
    all_parsed_map = {}
    all_pl_map    = {}
    for symbol in PAIRS:
        p = parse_mt4_file(symbol)
        if p is not None:
            all_parsed_map[symbol] = p
        else:
            stale_count += 1
        pl = parse_pl_file(symbol)
        if pl is not None:
            all_pl_map[symbol] = pl

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
                "updated_at":       datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"),
            })
            gap_history_payload.append({"timestamp": timestamp, "symbol": symbol, "gap": 0})
            PREV_MOMENTUM[symbol] = "NEUTRAL"
            PREV_GAP[symbol]      = 0
            continue

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
        if is_spike:
            _now_spike = datetime.utcnow()
            _last_spike = SPIKE_COOLDOWN.get(symbol)
            _cooled = not _last_spike or (_now_spike - _last_spike).total_seconds() >= 14400
            if abs(gap) >= 5 and _cooled:
                SPIKE_COOLDOWN[symbol] = _now_spike
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
        _gap_just_crossed = (abs(_prev_gap_for_early) < 5 and abs(gap) >= 5 and bias != "INVALID")
        _gap_big_jump = (abs(gap) >= 5 and (delta_short or 0) != 0 and abs(delta_short or 0) >= 2 and bias != "INVALID")
        if _gap_just_crossed or _gap_big_jump:
            _now_early = datetime.utcnow()
            _last_early = EARLY_ENTRY_COOLDOWN.get(symbol)
            _early_cooled = not _last_early or (_now_early - _last_early).total_seconds() >= 7200
            if _early_cooled:
                EARLY_ENTRY_COOLDOWN[symbol] = _now_early
                _reason = "GAP CROSSOVER" if _gap_just_crossed else "GAP SURGE"
                early_alerts.append({
                    "symbol": symbol, "gap": gap, "bias": bias,
                    "reason": _reason, "delta_short": delta_short,
                    "prev_gap": _prev_gap_for_early, "execution": execution,
                    "confidence": confidence,
                })

        # ---- Signal entry: dual strategy (BB + INTRA) ----
        pl_data = all_pl_map.get(symbol, {})
        check_bb_entry(symbol, gap, scores, pl_data, momentum, parsed)
        check_intra_entry(symbol, gap, scores, pl_data, momentum, parsed)

        # ---- Gap Alert: abs(gap) 9–12 + valid Panda Lines ----
        _abs_gap = abs(gap)
        _pl_zone = pl_data.get("pl_zone")
        _panda_valid = (
            _pl_zone is not None and
            ((gap > 0 and _pl_zone == "ABOVE") or (gap < 0 and _pl_zone == "BELOW"))
        )
        if 9 <= _abs_gap <= 12 and _panda_valid:
            _now_ga  = datetime.utcnow()
            _last_ga = GAP_ALERT_COOLDOWN.get(symbol)
            _ga_cooled = not _last_ga or (_now_ga - _last_ga).total_seconds() >= 14400
            if _ga_cooled:
                GAP_ALERT_COOLDOWN[symbol] = _now_ga
                gap_alerts.append({
                    "symbol": symbol, "gap": gap, "bias": bias,
                    "pl_zone": _pl_zone, "execution": execution, "confidence": confidence,
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
            "updated_at":       datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"),
        })

        gap_history_payload.append({"timestamp": timestamp, "symbol": symbol, "gap": gap})

        if delta_mid is not None and accel is not None:
            strength_payload.append({"timestamp": timestamp, "symbol": symbol, "strength": strength})

    print(f"[ENGINE] Read {len(dashboard_payload)} pairs ({stale_count} stale, {hard_invalid_count} hard invalid)")

    # ---- AUTO-HEAL: Track consecutive stale cycles ----
    global CONSECUTIVE_STALE
    if stale_count > 5:
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
            snapshot_rows = []
            for row in dashboard_payload:
                bias_val = row.get("bias", "")
                hi = row.get("hard_invalid", False)
                gap_val = abs(row.get("gap", 0))
                # Valid = not hard_invalid, bias is BUY/SELL, |gap| >= 5
                # BB does not require PL zone confirmation
                is_valid = (not hi) and bias_val in ("BUY", "SELL") and gap_val >= 5
                snap = dict(row)
                snap["timestamp"] = snap_ts
                snap["is_valid"] = is_valid
                snap["gap_delta"] = gap_deltas.get(row.get("symbol", ""), 0)
                # Remove fields that don't exist in signal_snapshots table
                for _drop in ("updated_at", "pdh", "pdl", "pwh", "pwl", "pmh", "pml", "pyh", "pyl"):
                    snap.pop(_drop, None)
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
            for row in gap_history_payload:
                supabase_retry(
                    lambda r=row: supabase.table("gap_history").upsert(r, on_conflict="timestamp,symbol").execute(),
                    label="GapHistory"
                )
            print(f"[SUPABASE] Gap history: {len(gap_history_payload)} rows")
        except Exception as e:
            print("[SUPABASE ERROR] Gap history:", e)

    if strength_payload:
        try:
            for row in strength_payload:
                supabase_retry(
                    lambda r=row: supabase.table("strength_log").insert(r).execute(),
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
        print(f"[SPIKE] {len(spike_alerts)} new momentum spikes!")
        send_spike_alert(spike_alerts)
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
                        "notified":    True,
                    }).execute(),
                    label="SpikeEvent"
                )
            except Exception as e:
                print(f"[SPIKE EVENT ERROR]: {e}")

    if gap_alerts:
        print(f"[GAP ALERT] {len(gap_alerts)} pair(s) in 9-12 gap zone with valid Panda Lines!")
        send_gap_alert(gap_alerts)

    if early_alerts:
        print(f"[EARLY ENTRY] {len(early_alerts)} pair(s) just crossed into valid territory!")
        send_early_entry_alert(early_alerts)

    # ---- Evaluate pending signal results (price-based) ----
    evaluate_pending_signals(all_scores, all_pl_map)

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

# ================= SNAPSHOT GENERATOR =================
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
    row_h = 300
    row_gap = 16
    width = margin * 2 + card_w * columns + gutter * (columns - 1)
    height = header_h + rows_per_col * (row_h + row_gap) + footer_h
    return {
        "columns": columns,
        "rows_per_col": rows_per_col,
        "fields": ["PAIR", "GAP", "BIAS", "H1/H4", "PL", "SCORE"],
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
        "top_offsets": {"gap": 430, "bias": 680},
        "line_offsets": {"box": 112, "metrics": 198},
        "bottom_offsets": {"box": 0, "fl_st": 0, "score": 650},
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
    BOTTOM_OFFSETS = layout["bottom_offsets"]

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

    # ---- Header ----
    draw.rectangle([0, 0, width, HEADER_H], fill=BG_CARD)
    draw.rectangle([0, HEADER_H - 4, width, HEADER_H], fill=ACCENT)
    draw.text((MARGIN, 40), "PANDA ENGINE v3.0", fill=TEXT_HEAD, font=font_title)
    draw.text((MARGIN, 120), "PAIR  GAP  BIAS    H1/H4 BOX    PL       SCORE",
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
        draw.text((x + TOP_OFFSETS["gap"], top_y + 5), gap_str, fill=tc, font=font_bold)
        if bias_text == "INVALID":
            draw.text((x + TOP_OFFSETS["bias"], top_y + 5), bias_text, fill=tc, font=font_bold)
        else:
            draw.text((x + TOP_OFFSETS["bias"], top_y - 2), bias_text, fill=tc, font=font_bias)

        draw.text((x + BOTTOM_OFFSETS["box"], box_y), f"H1/H4 {p.get('box_badge', '-')}",
                  fill=tc, font=font_data)
        draw.text((x + BOTTOM_OFFSETS["fl_st"], metrics_y), f"PL {p.get('pl_zone', '-')}",
                  fill=tc, font=font_data)
        draw.text((x + BOTTOM_OFFSETS["score"], metrics_y), f"SCORE {p.get('score', '-')}",
                  fill=tc, font=font_data)

    # ---- Footer ----
    footer_y = height - FOOTER_H
    draw.rectangle([0, footer_y, width, footer_y + FOOTER_H], fill=BG_CARD)
    draw.rectangle([0, footer_y, width, footer_y + 4], fill=ACCENT)
    ts_str = datetime.now().strftime("%Y-%m-%d %H:%M")
    draw.text((MARGIN, footer_y + 30),
              f"PANDA ENGINE v3.0  |  {ts_str}", fill=TEXT_HEAD, font=font_sm)

    img.save("snapshot.png", quality=95)
    return "snapshot.png"

def build_snapshot_caption(buy_count, sell_count, yellow_count, white_count, now=None):
    ts = (now or datetime.now()).strftime("%Y-%m-%d %H:%M")
    return (
        "PANDA ENGINE v3.0\n"
        f"{ts}\n"
        f"BUY: {buy_count} | SELL: {sell_count}\n"
        f"Watch: {yellow_count} | Idle: {white_count}"
    )

# ================= TELEGRAM SNAPSHOT =================
def send_snapshot():
    if is_market_closed():
        print(f"[SNAPSHOT] Market closed - skipped ({market_time_label()})")
        return
    if not telegram_circuit.allow():
        print(f"[SNAPSHOT BLOCKED] Circuit breaker locked — failures: {telegram_circuit.failures}, locked_until: {telegram_circuit.locked_until}, now: {time.time():.0f}")
        return
    try:
        res  = supabase.table("dashboard").select("*").execute()
        data = res.data or []
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

            # Confidence score (exact port of dashboard computeConfidence)
            conf_score, conf_tier = _compute_confidence(r)
            conf_display = f"{conf_score} {conf_tier}"

            # Validity for Telegram: gap threshold + not hard_invalid (no PL filter)
            is_valid = (not hard_inv) and bias_val in ("BUY", "SELL") and abs_gap >= 5

            # YELLOW check: any individual TF score ±4/5/6 = STRONG or WEAK currency
            all_tf = [base_d1, base_h4, base_h1, quote_d1, quote_h4, quote_h1]
            has_strong_currency = any(abs(v) >= 4 for v in all_tf if v is not None)

            # Categorize for coloring
            if is_valid:
                category = "BUY" if bias_val == "BUY" else "SELL"
                if bias_val == "BUY":
                    buy_count += 1
                else:
                    sell_count += 1
            elif has_strong_currency:
                category = "YELLOW"
                yellow_count += 1
                bias_val = "BUY" if gap > 0 else "SELL" if gap < 0 else "WAIT"
            else:
                category = "WHITE"
                white_count += 1
                bias_val = "INVALID"

            pair_data.append({
                "symbol": symbol,
                "gap": gap,
                "bias": bias_val,
                "box_badge": box_badge,
                "pl_zone": pl_zone_v,
                "score": conf_display,
                "category": category,
            })

        # Sort alphabetically by symbol
        pair_data.sort(key=lambda p: p["symbol"])

        if not pair_data:
            pair_data = [{"symbol": "NO DATA", "gap": 0, "bias": "-", "box_badge": "-",
                          "pl_zone": "-", "score": 0, "category": "WHITE"}]

        img_path = generate_snapshot(pair_data)

        # Telegram sendPhoto rejects images taller than ~6000px.
        # Resize proportionally to max 4096px height before sending, or convert to JPEG if large.
        MAX_H = 4096
        send_path = img_path
        try:
            pil_img = Image.open(img_path)
            iw, ih = pil_img.size
            # check original file size too
            try:
                orig_size = os.path.getsize(img_path)
            except Exception:
                orig_size = None
            need_resize = (ih > MAX_H) or (orig_size and orig_size > 4_000_000)
            if need_resize:
                scale = min(1.0, MAX_H / float(ih)) if ih > 0 else 1.0
                new_w = int(iw * scale)
                new_h = int(ih * scale)
                resized = pil_img.resize((new_w, new_h), Image.LANCZOS)
                if resized.mode in ("RGBA", "P"):
                    resized = resized.convert("RGB")
                send_path = "snapshot_send.jpg"
                resized.save(send_path, format="JPEG", quality=85, optimize=True)
                print(f"[SNAPSHOT] Resized {iw}x{ih} → {new_w}x{new_h} and saved {send_path}")
        except Exception as resize_err:
            print(f"[SNAPSHOT] Resize skipped: {resize_err}")

        # Choose correct content-type based on file extension
        mime_type = "image/jpeg" if send_path.lower().endswith(('.jpg', '.jpeg')) else 'image/png'
        with open(send_path, "rb") as f:
            files = {"photo": (os.path.basename(send_path), f, mime_type)}
            response = requests.post(
                f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendPhoto",
                data={"chat_id": TELEGRAM_CHAT_ID,
                      "caption": build_snapshot_caption(buy_count, sell_count, yellow_count, white_count)},
                files=files, timeout=30
            )
        if response.status_code == 200:
            print("[TELEGRAM] Snapshot sent OK")
            telegram_circuit.success()
            try:
                supabase_retry(
                    lambda: supabase.table("engine_logs").insert({
                        "timestamp": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"),
                        "component": "telegram_snapshot_ok", "duration": 0, "error": None,
                    }).execute(),
                    label="SnapshotLog"
                )
            except: pass
        else:
            print("[TELEGRAM ERROR]", response.text)
            telegram_circuit.failure()
            try:
                supabase_retry(
                    lambda: supabase.table("engine_logs").insert({
                        "timestamp": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"),
                        "component": "telegram_snapshot_fail", "duration": 0,
                        "error": response.text[:500] if response else "no response",
                    }).execute(),
                    label="SnapshotErrLog"
                )
            except: pass
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

def send_spike_alert(spikes):
    if is_market_closed():
        print(f"[SPIKE ALERT] Market closed - skipped ({market_time_label()})")
        return
    if not telegram_circuit.allow():
        print(f"[SPIKE ALERT BLOCKED] Circuit breaker locked — failures: {telegram_circuit.failures}")
        return
    try:
        lines = ["⚡ <b>MOMENTUM SPIKE DETECTED</b>\n"]
        for s in spikes:
            bias_icon = "📈" if s["bias"]=="BUY" else "📉"
            mom_icon, action = MOMENTUM_GUIDE.get(s["momentum"], ("⚡", "MONITOR"))
            lines.append(
                f"{mom_icon} <b>{s['symbol']}</b>  {bias_icon} {s['bias']}\n"
                f"   Gap: <b>{s['gap']:+.0f}</b>  |  {s['momentum']}\n"
                f"   30min: {(s['delta_short'] or 0):+.1f}  2h: {(s['delta_mid'] or 0):+.1f}  Str: {s['strength']:.1f}\n"
                f"   👉 <b>{action}</b>\n"
            )
        lines.append(f"\n⏰ {datetime.now().strftime('%H:%M')}\n🐼 PANDA ENGINE v3.0")
        text = "\n".join(lines)[:4000]
        response = requests.post(
            f"https://api.telegram.org/bot{SIGNAL_BOT_TOKEN}/sendMessage",
            data={"chat_id": SIGNAL_CHAT_ID, "text": text, "parse_mode": "HTML"},
            timeout=15
        )
        if response.status_code == 200:
            print(f"[SPIKE ALERT] Sent {len(spikes)} spike(s) → signals bot")
            telegram_circuit.success()
        else:
            print("[SPIKE ALERT ERROR]", response.text)
            telegram_circuit.failure()
    except Exception as e:
        print("[SPIKE ALERT ERROR]:", e)
        telegram_circuit.failure()

# ================= GAP ZONE ALERT =================
def send_gap_alert(alerts):
    """Send Telegram alert for pairs with abs(gap) 9–12 and valid Panda Lines (zone confirms bias)."""
    if is_market_closed():
        print(f"[GAP ALERT] Market closed - skipped ({market_time_label()})")
        return
    if not telegram_circuit.allow(): return
    try:
        lines = ["🐼 <b>GAP ZONE ALERT — Pairs Good to Ride!</b>\n"]
        for a in alerts:
            bias_icon = "📈" if a["gap"] > 0 else "📉"
            sign = "+" if a["gap"] > 0 else ""
            lines.append(
                f"🐼 <b>{a['symbol']}</b> | Gap Score: <b>{sign}{int(a['gap'])}</b> | Panda Lines: Valid ✅\n"
                f"   — Pair is good to ride! 🚀\n"
                f"   {bias_icon} {a['bias']} | Execution: <b>{a['execution']}</b> | Conf: {a['confidence']}\n"
            )
        lines.append(f"\n⏰ {datetime.now().strftime('%H:%M')}\n🐼 PANDA ENGINE v3.0")
        text = "\n".join(lines)[:4000]
        response = requests.post(
            f"https://api.telegram.org/bot{SIGNAL_BOT_TOKEN}/sendMessage",
            data={"chat_id": SIGNAL_CHAT_ID, "text": text, "parse_mode": "HTML"},
            timeout=15
        )
        if response.status_code == 200:
            print(f"[GAP ALERT] Sent {len(alerts)} pair(s) in 9-12 gap zone → signals bot")
            telegram_circuit.success()
        else:
            print("[GAP ALERT ERROR]", response.text)
            telegram_circuit.failure()
    except Exception as e:
        print("[GAP ALERT ERROR]:", e)
        telegram_circuit.failure()

# ================= EARLY ENTRY ALERT =================
def send_early_entry_alert(alerts):
    """Fires BEFORE the rally — when gap first crosses into valid territory or surges."""
    if is_market_closed():
        print(f"[EARLY ENTRY] Market closed - skipped ({market_time_label()})")
        return
    if not telegram_circuit.allow(): return
    try:
        lines = ["🎯 <b>EARLY ENTRY — Move Starting NOW!</b>\n"]
        for a in alerts:
            bias_icon = "📈" if a["gap"] > 0 else "📉"
            sign = "+" if a["gap"] > 0 else ""
            lines.append(
                f"🎯 <b>{a['symbol']}</b> {bias_icon} <b>{a['bias']}</b>\n"
                f"   Gap: <b>{sign}{int(a['gap'])}</b> (was {int(a['prev_gap'])})\n"
                f"   Trigger: <b>{a['reason']}</b> | 10min Δ: {(a['delta_short'] or 0):+.1f}\n"
                f"   👉 <b>PREPARE ENTRY — Rally starting!</b>\n"
            )
        lines.append(f"\n⏰ {datetime.now().strftime('%H:%M')}\n🐼 PANDA ENGINE v3.0")
        text = "\n".join(lines)[:4000]
        response = requests.post(
            f"https://api.telegram.org/bot{SIGNAL_BOT_TOKEN}/sendMessage",
            data={"chat_id": SIGNAL_CHAT_ID, "text": text, "parse_mode": "HTML"},
            timeout=15
        )
        if response.status_code == 200:
            print(f"[EARLY ENTRY] Sent {len(alerts)} early alert(s) → signals bot")
            telegram_circuit.success()
        else:
            print("[EARLY ENTRY ERROR]", response.text)
            telegram_circuit.failure()
    except Exception as e:
        print("[EARLY ENTRY ERROR]:", e)
        telegram_circuit.failure()

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

def hourly_snapshot_due(now, last_hour_mark):
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
    return True, hour_mark

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

def check_news_alerts():
    """
    Check ForexFactory for HIGH impact events in the next 15-60 minutes.
    Sends Telegram alert once per event. Runs every engine cycle.
    """
    if is_market_closed():
        print(f"[NEWS ALERT] Market closed - skipped ({market_time_label()})")
        return
    if not telegram_circuit.allow():
        return
    try:
        events = fetch_news_feed()
        now_utc = datetime.now(timezone.utc)
        alerted_this_run = []

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
            threshold = select_news_alert_threshold(mins_away)
            if not threshold:
                continue
            _, threshold_label = threshold
            event_key = build_news_alert_key(ev, threshold_label)
            if event_key in NEWS_ALERTED:
                continue
            # Determine affected pairs from our 21
            affected = [p for p in CURRENCY_TO_PAIRS.get(currency,[]) if p in PAIRS]
            if not affected:
                continue
            NEWS_ALERTED.add(event_key)
            alerted_this_run.append((title, currency, mins_away, affected, event_dt, threshold_label, ev))

        for title, currency, mins_away, affected, event_dt, threshold_label, ev in alerted_this_run:
            pairs_str = ", ".join(affected[:6])
            dubai_time = event_dt.astimezone(timezone(timedelta(hours=4))).strftime("%Y-%m-%d %H:%M")
            forecast = (ev.get("forecast") or "").strip()
            previous = (ev.get("previous") or "").strip()
            data_line = ""
            if forecast or previous:
                data_line = f"\nForecast: <b>{forecast or '-'}</b> | Previous: <b>{previous or '-'}</b>\n"
            msg = (
                f"📰 <b>HIGH IMPACT NEWS ALERT</b>\n"
                f"━━━━━━━━━━━━━━━━━━━━━\n"
                f"📌 <b>{title}</b>\n"
                f"💱 Currency: <b>{currency}</b>\n"
                f"⏱️ In approx. <b>{int(mins_away)} minutes</b>\n\n"
                f"⚡ Affected pairs:\n<b>{pairs_str}</b>\n\n"
                f"<i>⚠️ High volatility expected. Currency bias data only — not financial advice.</i>\n"
                f"🐼 PANDA ENGINE"
            )
            msg = (
                f"<b>HIGH IMPACT NEWS IN {news_alert_label(threshold_label)}</b>\n"
                f"---------------------\n"
                f"<b>{title}</b>\n"
                f"Currency: <b>{currency}</b>\n"
                f"Countdown: <b>{max(0, int(mins_away))} minutes</b>\n"
                f"Dubai time: <b>{dubai_time}</b>\n"
                f"{data_line}\n"
                f"Affected pairs:\n<b>{pairs_str}</b>\n\n"
                f"<i>High volatility expected. Currency bias data only - not financial advice.</i>\n"
                f"PANDA ENGINE"
            )
            r = requests.post(
                f"https://api.telegram.org/bot{SIGNAL_BOT_TOKEN}/sendMessage",
                data={"chat_id": SIGNAL_CHAT_ID, "text": msg, "parse_mode": "HTML"},
                timeout=10
            )
            status = "✓" if r.status_code == 200 else "✗"
            print(f"[NEWS ALERT] {status} {currency} — {title} in {int(mins_away)}min → {pairs_str}")
            if r.status_code == 200:
                telegram_circuit.success()
            else:
                telegram_circuit.failure()
    except Exception as e:
        print(f"[NEWS ALERT ERROR]: {e}")

# ---- AI SNAPSHOT NARRATOR ----
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
        return
    try:
        # Fetch current dashboard data
        res = supabase.table("dashboard").select(
            "symbol, gap, bias, momentum, pl_zone, confidence, box_h1_trend, box_h4_trend"
        ).execute()
        pairs = res.data or []
        if not pairs:
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

        if response.status_code != 200:
            print(f"[AI SNAPSHOT] OpenAI error: {response.status_code}")
            return

        ai_text = response.json()["choices"][0]["message"]["content"].strip()
        now_str = datetime.now().strftime("%H:%M")

        msg = (
            f"🤖 <b>PANDA AI — Market Update</b>\n"
            f"━━━━━━━━━━━━━━━━━━━━━\n"
            f"🕐 {now_str} | 📍 {session} SESSION\n\n"
            f"{ai_text}\n\n"
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
    global LAST_QUARTER_MARK, LAST_HOUR_MARK, LAST_NEWS_MARK
    await asyncio.sleep(5)
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

            hourly_due, hour_mark = hourly_snapshot_due(now, LAST_HOUR_MARK)
            if hourly_due:
                async with ENGINE_LOCK:
                    try:
                        print(f"\n{'='*50}\n[HOURLY] Firing at {now.strftime('%H:%M:%S')}")
                        await run_scheduler_step("hourly-gap", run_gap_once)
                        # Auto-reset circuit breaker before hourly snapshot
                        # — ensures snapshot always attempts, even after transient failures
                        if not telegram_circuit.allow():
                            print("[HOURLY] Circuit breaker was locked — auto-resetting for snapshot")
                            telegram_circuit.failures = 0
                            telegram_circuit.locked_until = 0
                        await run_scheduler_step("hourly-alerts", send_snapshot, send_ai_snapshot, daily_cleanup)
                    except Exception as e:
                        print("[ENGINE ERROR - hourly]:", e)
                LAST_HOUR_MARK = hour_mark

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
