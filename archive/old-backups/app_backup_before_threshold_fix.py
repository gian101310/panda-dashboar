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

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import os
import re
import requests
import time
import threading
from datetime import datetime, timezone, timedelta
from PIL import Image, ImageDraw, ImageFont
from supabase import create_client

app = FastAPI()

# ================= CORS =================
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://panda-dashboar.vercel.app",
        "https://panda-dashboard.vercel.app",
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ================= CONFIG =================
MT4_PATH         = r"C:\Users\Admin\AppData\Roaming\MetaQuotes\Terminal\Common\Files"
TELEGRAM_TOKEN   = "REDACTED"
TELEGRAM_CHAT_ID = "-1003857801976"
SUPABASE_URL     = "https://jxkelchxitwuilpbrwxk.supabase.co"
SUPABASE_KEY     = "REDACTED"
MAX_FILE_AGE_SECONDS = 300   # 5 mins — mt4 files update every ~2 mins

LOGIN_ALERT_BOT_TOKEN = "REDACTED"
LOGIN_ALERT_CHAT_ID   = "REDACTED"

PAIRS = [
    "AUDJPY","AUDCAD","AUDNZD","AUDUSD","CADJPY",
    "EURAUD","EURCAD","EURGBP","EURJPY","EURNZD","EURUSD",
    "GBPAUD","GBPCAD","GBPJPY","GBPNZD","GBPUSD",
    "NZDCAD","NZDJPY","NZDUSD","USDCAD","USDJPY",
]

LAST_QUARTER_MARK = None
LAST_HOUR_MARK    = None
PREV_MOMENTUM     = {}
PREV_GAP          = {}

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

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

# ================= UTILS =================
def safe_float(v):
    try: return float(v)
    except: return None

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
    if file_age > MAX_FILE_AGE_SECONDS:
        print(f"[STALE] {symbol} age={int(file_age)}s")
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            lines = f.readlines()
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
    Any value >= 3 = significant pos, <= -3 = significant neg.
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
        if v1 >= 3:  pos_sig.append((tf, v1))
        if v1 <= -3: neg_sig.append((tf, v1))
        if v2s:
            v2 = int(v2s)
            all_values.append(v2)
            if v2 >= 3:  pos_sig.append((tf, v2))
            if v2 <= -3: neg_sig.append((tf, v2))

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
        hard_invalid      = base_inv or quote_inv or currency_conflict
        gap               = 0 if currency_conflict else (base_score - quote_score)

        if hard_invalid:
            conflict_parts = []
            if base_cur  in invalid_currs: conflict_parts.append(base_cur)
            if quote_cur in invalid_currs: conflict_parts.append(quote_cur)
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
        res = supabase.table("gap_history") \
            .select("gap, timestamp") \
            .eq("symbol", symbol) \
            .order("timestamp", desc=True) \
            .limit(n) \
            .execute()
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

    if   s >= 3 and m >= 6 and l >= 4 and abs_gap >= 7:  return "STRONG",        f"EXPAND_{direction}"
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

# ================= CORE ENGINE =================
def run_gap_once():
    global PREV_MOMENTUM, PREV_GAP

    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
    print(f"\n[ENGINE v3.0] Running at {timestamp}")

    dashboard_payload   = []
    strength_payload    = []
    gap_history_payload = []
    spike_alerts        = []
    stale_count         = 0
    hard_invalid_count  = 0

    # ---- STEP 1: Parse ALL pairs first (needed for cross-pair conflict scan) ----
    all_parsed_map = {}
    for symbol in PAIRS:
        p = parse_mt4_file(symbol)
        if p is not None:
            all_parsed_map[symbol] = p
        else:
            stale_count += 1

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
                "updated_at":       datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
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
            spike_alerts.append({
                "symbol": symbol, "gap": gap, "bias": bias,
                "momentum": momentum, "delta_short": delta_short,
                "delta_mid": delta_mid, "strength": strength,
                "execution": execution, "confidence": confidence,
                "base_score": scores["base_score"],
                "quote_score": scores["quote_score"],
            })

        PREV_MOMENTUM[symbol] = momentum
        PREV_GAP[symbol]      = gap

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
            "updated_at":       datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        })

        gap_history_payload.append({"timestamp": timestamp, "symbol": symbol, "gap": gap})

        if delta_mid is not None and accel is not None:
            strength_payload.append({"timestamp": timestamp, "symbol": symbol, "strength": strength})

    print(f"[ENGINE] Read {len(dashboard_payload)} pairs ({stale_count} stale, {hard_invalid_count} hard invalid)")

    # ---- STEP 4: Write to Supabase ----
    if dashboard_payload:
        try:
            supabase.table("dashboard").upsert(dashboard_payload, on_conflict="symbol").execute()
            print(f"[SUPABASE] Dashboard: {len(dashboard_payload)} pairs")
        except Exception as e:
            print("[SUPABASE ERROR] Dashboard:", e)

    if gap_history_payload:
        try:
            for row in gap_history_payload:
                supabase.table("gap_history").upsert(row, on_conflict="timestamp,symbol").execute()
            print(f"[SUPABASE] Gap history: {len(gap_history_payload)} rows")
        except Exception as e:
            print("[SUPABASE ERROR] Gap history:", e)

    if strength_payload:
        try:
            for row in strength_payload:
                supabase.table("strength_log").insert(row).execute()
            print(f"[SUPABASE] Strength log: {len(strength_payload)} rows")
        except Exception as e:
            print("[SUPABASE ERROR] Strength:", e)

    try:
        supabase.table("engine_logs").insert({
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "component": "run_gap_once_v3", "duration": 0, "error": None,
        }).execute()
    except: pass

    if spike_alerts:
        print(f"[SPIKE] {len(spike_alerts)} new momentum spikes!")
        send_spike_alert(spike_alerts)
        for s in spike_alerts:
            try:
                supabase.table("spike_events").insert({
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
                    "fired_at":    datetime.now().isoformat(),
                    "notified":    True,
                }).execute()
            except Exception as e:
                print(f"[SPIKE EVENT ERROR]: {e}")

    print(f"[ENGINE] Cycle complete")
    return dashboard_payload

# ================= SNAPSHOT GENERATOR =================
def generate_snapshot(rows):
    headers    = ["Symbol", "Gap", "Bias", "Exec", "Momentum", "Str"]
    col_widths = [180, 90, 110, 130, 210, 90]
    row_height = 65
    width  = sum(col_widths)
    height = row_height * (len(rows) + 1)
    img    = Image.new("RGB", (width, height), (10, 13, 25))
    draw   = ImageDraw.Draw(img)
    try:
        font      = ImageFont.truetype("arial.ttf",   20)
        font_bold = ImageFont.truetype("arialbd.ttf", 20)
    except:
        font = font_bold = ImageFont.load_default()

    x = 0
    for i, h in enumerate(headers):
        draw.rectangle([x, 0, x+col_widths[i], row_height], fill=(30,35,60))
        draw.text((x+10, 20), h, fill=(180,190,220), font=font_bold)
        x += col_widths[i]

    mom_colors = {
        "STRONG":"#00ff9f","BUILDING":"#66ffcc","SPARK":"#ffd166",
        "CONSOLIDATING":"#00b4ff","STABLE":"#8892aa",
        "COOLING":"#ffaa44","FADING":"#ff7744","REVERSING":"#ff4d6d","NEUTRAL":"#445566",
    }
    exec_colors = {"MARKET":"#00ff9f","PULLBACK":"#ffd166","NONE":"#445566"}

    for idx, row in enumerate(rows):
        y  = (idx+1)*row_height
        x  = 0
        bg = (14,18,32) if idx%2==0 else (18,22,38)
        draw.rectangle([0, y, width, y+row_height], fill=bg)
        for j, val in enumerate(row):
            color = (220,220,220)
            if j == 2:  # Bias
                color = (0,255,159) if str(val)=="BUY" else (255,77,109) if str(val)=="SELL" else (255,120,50)
            elif j == 3:  # Execution
                hex_c = exec_colors.get(str(val), "#445566")
                color = tuple(int(hex_c[i:i+2],16) for i in (1,3,5))
            elif j == 4:  # Momentum
                hex_c = mom_colors.get(str(val), "#8892aa")
                color = tuple(int(hex_c[i:i+2],16) for i in (1,3,5))
            elif j == 1:  # Gap
                try:
                    gv = float(val)
                    color = (0,255,159) if gv>0 else (255,77,109) if gv<0 else (200,200,200)
                except: pass
            draw.text((x+10, y+18), str(val), fill=color, font=font)
            x += col_widths[j]

    img.save("snapshot.png", quality=95)
    return "snapshot.png"

# ================= TELEGRAM SNAPSHOT =================
def send_snapshot():
    if not telegram_circuit.allow(): return
    try:
        res  = supabase.table("dashboard").select("*").execute()
        data = res.data or []
        buy_signals = []
        sell_signals = []
        invalid_count = 0

        for r in data:
            symbol   = r.get("symbol")
            gap      = r.get("gap")
            strength = r.get("strength")
            momentum = r.get("momentum", "NEUTRAL")
            execution = r.get("execution", "NONE")
            hard_inv = r.get("hard_invalid", False)

            if not symbol or gap is None: continue
            if hard_inv:
                invalid_count += 1
                continue

            if gap >= 5:    bias = "BUY"
            elif gap <= -5: bias = "SELL"
            else:           continue

            label = "🔥" if (strength or 0) >= 2 else "⚡" if (strength or 0) >= 1 else "•"
            row = [f"{label} {symbol}", round(gap,1), bias, execution, momentum, round(strength,2) if strength else 0]
            if bias == "BUY":  buy_signals.append(row)
            else:               sell_signals.append(row)

        buy_signals  = sorted(buy_signals,  key=lambda x: x[1], reverse=True)
        sell_signals = sorted(sell_signals, key=lambda x: abs(x[1]), reverse=True)
        clean = buy_signals + sell_signals
        if not clean: clean = [["NO SIGNALS","","","","",""]]

        img = generate_snapshot(clean)
        with open(img, "rb") as f:
            response = requests.post(
                f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendPhoto",
                data={"chat_id": TELEGRAM_CHAT_ID,
                      "caption": (f"🐼 PANDA ENGINE v3.0\n"
                                  f"⏰ {datetime.now().strftime('%Y-%m-%d %H:%M')}\n"
                                  f"📈 BUY: {len(buy_signals)} | 📉 SELL: {len(sell_signals)} | ⚠️ INVALID: {invalid_count}")},
                files={"photo": f}, timeout=20
            )
        if response.status_code == 200:
            print("[TELEGRAM] Snapshot sent OK")
            telegram_circuit.success()
        else:
            print("[TELEGRAM ERROR]", response.text)
            telegram_circuit.failure()
    except Exception as e:
        print("[TELEGRAM ERROR]:", e)
        telegram_circuit.failure()

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
    if not telegram_circuit.allow(): return
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
            f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage",
            data={"chat_id": TELEGRAM_CHAT_ID, "text": text, "parse_mode": "HTML"},
            timeout=15
        )
        if response.status_code == 200:
            print(f"[SPIKE ALERT] Sent {len(spikes)} spike(s)")
            telegram_circuit.success()
        else:
            print("[SPIKE ALERT ERROR]", response.text)
            telegram_circuit.failure()
    except Exception as e:
        print("[SPIKE ALERT ERROR]:", e)
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
        f"🌐 <a href='https://panda-dashboar.vercel.app/dashboard'>Open Dashboard</a>"
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

async def master_scheduler():
    global LAST_QUARTER_MARK, LAST_HOUR_MARK
    await asyncio.sleep(5)
    print("[SCHEDULER] Started — waiting for next 15-min mark...")

    while True:
        try:
            now = datetime.now()

            if now.minute % 15 == 1 and now.second < 10:
                quarter_mark = now.replace(second=0, microsecond=0)
                if LAST_QUARTER_MARK != quarter_mark:
                    async with ENGINE_LOCK:
                        try:
                            print(f"\n{'='*50}\n[15MIN] Firing at {now.strftime('%H:%M:%S')}")
                            run_gap_once()
                        except Exception as e:
                            print("[ENGINE ERROR - 15min]:", e)
                    LAST_QUARTER_MARK = quarter_mark

            if now.minute == 1 and now.second < 10:
                hour_mark = now.replace(second=0, microsecond=0)
                if LAST_HOUR_MARK != hour_mark:
                    async with ENGINE_LOCK:
                        try:
                            print(f"\n{'='*50}\n[HOURLY] Firing at {now.strftime('%H:%M:%S')}")
                            run_gap_once()
                            send_snapshot()
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

# ================= ROUTES =================
@app.get("/")
def home():
    return {
        "status":   "PANDA ENGINE v3.0",
        "source":   "mt4_SYMBOL.txt (cBot retired)",
        "scoring":  "Python engine",
        "pairs":    len(PAIRS),
    }

@app.get("/force")
def force_run():
    try:
        run_gap_once()
        send_snapshot()
        return {"status": "Force run + snapshot sent"}
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
        res         = supabase.table("engine_logs").select("*").order("timestamp", desc=True).limit(1).execute()
        last_run    = res.data[0]["timestamp"] if res.data else "Never"
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
