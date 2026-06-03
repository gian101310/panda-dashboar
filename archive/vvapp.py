"""
PANDA FOREX ENGINE v2.1 - MOMENTUM LOGIC FIXED
================================================
- CONSOLIDATING state added (normal pullback in strong trend)
- REVERSAL only fires when gap actually approaching 0
- CONSIDER CLOSING only on FADING/REVERSING (not on consolidation)
- Google Sheets removed
- Multi-timeframe: 30min / 2h / 6h
- Instant Telegram spike alert
"""

import socket
socket.setdefaulttimeout(30)

from fastapi import FastAPI
import asyncio
import os
import re
import requests
import time
import threading
from datetime import datetime
from PIL import Image, ImageDraw, ImageFont
from supabase import create_client

app = FastAPI()

# ================= CONFIG =================
PANDA_PATH       = r"C:\Users\Admin\AppData\Roaming\MetaQuotes\Terminal\Common\Files"
TELEGRAM_TOKEN   = "8556482762:AAGd6I7M6fFZ84f-8r2O8fyVktRCF3rUosA"
TELEGRAM_CHAT_ID = "-1003857801976"
SUPABASE_URL     = "https://jxkelchxitwuilpbrwxk.supabase.co"
SUPABASE_KEY     = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp4a2VsY2h4aXR3dWlscGJyd3hrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzg1MTI2NSwiZXhwIjoyMDg5NDI3MjY1fQ.OgNCKlZPy010de01wW02qH--Lb6zVYqPBxTEFpGrD5M"
MAX_FILE_AGE_SECONDS = 180

LAST_QUARTER_MARK = None
LAST_HOUR_MARK    = None
PREV_MOMENTUM     = {}
PREV_GAP          = {}  # track previous gap per symbol for close alert

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# ================= TELEGRAM CIRCUIT BREAKER =================
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
            if self.failures >= 5:
                self.locked_until = time.time() + 120
                print("[TELEGRAM COOLDOWN] 120s")
                self.failures = 0

telegram_circuit = TelegramCircuitBreaker()

# ================= UTILS =================
def safe_float(v):
    try: return float(v)
    except: return None

# ================= FILE READER =================
def read_gap(symbol):
    try:
        path = os.path.join(PANDA_PATH, f"panda_{symbol.lower()}.txt")
        if not os.path.exists(path): return None
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

# ================= GAP HISTORY FROM SUPABASE =================
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
        print(f"[HISTORY ERROR] {symbol}:", e)
        return []

# ================= MOMENTUM CLASSIFICATION v2 =================
def classify_momentum(gap, delta_short, delta_mid, delta_long):
    """
    Improved momentum classifier for trend-following.

    Key changes vs v1:
    - CONSOLIDATING: gap still strong (>=7) but short dipping — normal trend pause, NOT reversal
    - REVERSING: only fires when gap is ACTUALLY approaching 0 (<=6) with all deltas negative
    - FADING: gap shrinking toward threshold with mid+short negative — real warning
    - CONSIDER CLOSING only on FADING or REVERSING
    """
    if gap >= 5:
        direction = 'BULL'
    elif gap <= -5:
        direction = 'BEAR'
    else:
        return 'NEUTRAL', 'NEUTRAL'

    # Normalize: positive = momentum growing for that direction
    s = (delta_short or 0) if direction == 'BULL' else -(delta_short or 0)
    m = (delta_mid   or 0) if direction == 'BULL' else -(delta_mid   or 0)
    l = (delta_long  or 0) if direction == 'BULL' else -(delta_long  or 0)

    abs_gap = abs(gap)

    # ===== STRONG — all 3 aligned, gap high =====
    if s >= 3 and m >= 6 and l >= 4 and abs_gap >= 7:
        return 'STRONG', f'EXPAND_{direction}'

    # ===== BUILDING — short + mid confirming =====
    elif s >= 2 and m >= 3:
        return 'BUILDING', f'EXPAND_{direction}'

    # ===== SPARK — only short-term rising =====
    elif s >= 1.5 and m < 2:
        return 'SPARK', f'STABLE_{direction}'

    # ===== CONSOLIDATING — strong gap, short dipping but mid ok =====
    # This is NORMAL in a trend — hold, don't close
    elif abs_gap >= 7 and s < 0 and s >= -5 and m >= -2:
        return 'CONSOLIDATING', f'STABLE_{direction}'

    # ===== COOLING — valid gap, momentum slowing both short+mid =====
    elif abs_gap >= 5 and s < 0 and m < 0 and l >= 1:
        return 'COOLING', f'PULLBACK_{direction}'

    # ===== FADING — gap SHRINKING toward ±5, real warning =====
    elif abs_gap <= 7 and s < -1 and m < -1 and l < 1:
        return 'FADING', f'PULLBACK_{direction}'

    # ===== REVERSING — gap close to threshold + all deltas negative =====
    # Only fire when gap is actually about to lose valid status
    elif abs_gap <= 6 and s < -2 and m < -2 and l < 0:
        return 'REVERSING', 'NEUTRAL'

    # ===== STABLE — gap valid, nothing else matches =====
    else:
        return 'STABLE', f'STABLE_{direction}'


def should_close_alert(gap, momentum, delta_mid, prev_gap=None):
    """
    Smart close alert — only fires when trend is ACTUALLY breaking down.
    Does NOT fire on normal consolidation or cooling.
    """
    abs_gap = abs(gap)

    # Gap crossed back into no-trade zone
    if abs_gap < 5:
        return True

    # Momentum genuinely breaking down
    if momentum in ('FADING', 'REVERSING'):
        return True

    # Gap dropped 3+ points from previous reading AND mid falling hard
    if prev_gap is not None:
        drop = abs(prev_gap) - abs_gap
        if drop >= 3 and (delta_mid or 0) * (-1 if gap < 0 else 1) < -3:
            return True

    return False


def classify_structural_state(gap, delta_mid, accel):
    """Original state classifier — kept for backward compat."""
    if gap >= 5: regime = 'BULL'
    elif gap <= -5: regime = 'BEAR'
    else: return 'NEUTRAL'
    THRESHOLD = 12
    if regime == 'BULL':
        if delta_mid >= THRESHOLD: return 'EXPAND_BULL' if accel > 0 else 'PULLBACK_BULL' if accel < 0 else 'STABLE_BULL'
        elif delta_mid <= -THRESHOLD: return 'DEEP_PULLBACK_BULL'
        return 'STABLE_BULL'
    if regime == 'BEAR':
        if delta_mid <= -THRESHOLD: return 'EXPAND_BEAR' if accel < 0 else 'PULLBACK_BEAR' if accel > 0 else 'STABLE_BEAR'
        elif delta_mid >= THRESHOLD: return 'DEEP_PULLBACK_BEAR'
        return 'STABLE_BEAR'

# ================= CORE ENGINE =================
def run_gap_once():
    global PREV_MOMENTUM, PREV_GAP

    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
    print(f"\n[ENGINE] Running at {timestamp}")

    # Get known symbols
    symbols_res = supabase.table("gap_history") \
        .select("symbol") \
        .order("timestamp", desc=True) \
        .limit(500) \
        .execute()
    known_symbols = list(set([r["symbol"] for r in (symbols_res.data or [])]))

    # Read gap files
    gap_map = {}
    stale_count = 0
    for symbol in known_symbols:
        gap = read_gap(symbol)
        if gap is not None: gap_map[symbol] = gap
        else: stale_count += 1

    if not gap_map:
        print("[ENGINE] No gap files read")
        return

    print(f"[ENGINE] Read {len(gap_map)} pairs ({stale_count} stale/missing)")

    dashboard_payload  = []
    strength_payload   = []
    gap_history_payload = []
    spike_alerts       = []

    for symbol, gap in gap_map.items():
        bias = 'BUY' if gap >= 5 else 'SELL' if gap <= -5 else 'INVALID'

        # Get history for multi-TF deltas
        history = get_gap_history(symbol, n=26)

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

        # ===== NEW MOMENTUM CLASSIFICATION =====
        momentum, state = classify_momentum(gap, delta_short, delta_mid, delta_long)

        # Structural state for backward compat
        if delta_mid is not None and accel is not None:
            struct_state = classify_structural_state(gap, delta_mid, accel)
        else:
            struct_state = state

        # ===== STRENGTH SCORE =====
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

        signal = 'STRONG' if strength >= 2 else 'MODERATE' if strength >= 1 else 'NONE'

        # ===== SMART CLOSE ALERT =====
        prev_gap_val = PREV_GAP.get(symbol)
        close_alert  = should_close_alert(gap, momentum, delta_mid, prev_gap_val)

        # ===== MOMENTUM SPIKE for instant Telegram =====
        prev_mom = PREV_MOMENTUM.get(symbol, 'NEUTRAL')
        is_spike = (
            momentum in ('SPARK', 'BUILDING', 'STRONG') and
            prev_mom  not in ('SPARK', 'BUILDING', 'STRONG') and
            bias != 'INVALID'
        )
        if is_spike:
            spike_alerts.append({
                'symbol': symbol, 'gap': gap, 'bias': bias,
                'momentum': momentum, 'delta_short': delta_short,
                'delta_mid': delta_mid, 'strength': strength,
            })

        PREV_MOMENTUM[symbol] = momentum
        PREV_GAP[symbol]      = gap

        # ===== BUILD PAYLOADS =====
        dashboard_payload.append({
            'symbol':       symbol,
            'gap':          gap,
            'state':        struct_state,
            'momentum':     momentum,
            'close_alert':  close_alert,
            'delta_short':  delta_short,
            'delta_mid':    delta_mid,
            'delta_long':   delta_long,
            'strength':     strength,
            'signal':       signal,
            'updated_at':   datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        })

        gap_history_payload.append({
            'timestamp': timestamp,
            'symbol':    symbol,
            'gap':       gap,
        })

        if delta_mid is not None and accel is not None:
            strength_payload.append({
                'timestamp': timestamp,
                'symbol':    symbol,
                'strength':  strength,
            })

    # ===== WRITE TO SUPABASE =====
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
            "component": "run_gap_once", "duration": 0, "error": None,
        }).execute()
    except: pass

    if spike_alerts:
        print(f"[SPIKE] {len(spike_alerts)} new momentum spikes!")
        send_spike_alert(spike_alerts)
        # Write spike events to Supabase for dashboard banner
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
                    "fired_at":    datetime.now().isoformat(),
                    "notified":    True,
                }).execute()
            except Exception as e:
                print(f"[SPIKE EVENT ERROR]: {e}")

    print(f"[ENGINE] Done — {len(gap_map)} pairs processed")
    return gap_map

# ================= SNAPSHOT GENERATOR =================
def generate_snapshot(rows):
    headers    = ["Symbol", "Gap", "Bias", "Momentum", "Strength"]
    col_widths = [200, 100, 100, 220, 110]
    row_height = 65
    width  = sum(col_widths)
    height = row_height * (len(rows) + 1)
    img  = Image.new("RGB", (width, height), (10, 13, 25))
    draw = ImageDraw.Draw(img)
    try:
        font      = ImageFont.truetype("arial.ttf", 20)
        font_bold = ImageFont.truetype("arialbd.ttf", 20)
    except:
        font = font_bold = ImageFont.load_default()

    x = 0
    for i, h in enumerate(headers):
        draw.rectangle([x, 0, x+col_widths[i], row_height], fill=(30,35,60))
        draw.text((x+10, 20), h, fill=(180,190,220), font=font_bold)
        x += col_widths[i]

    mom_colors = {
        'STRONG':'#00ff9f','BUILDING':'#66ffcc','SPARK':'#ffd166',
        'CONSOLIDATING':'#00b4ff','STABLE':'#8892aa',
        'COOLING':'#ffaa44','FADING':'#ff7744','REVERSING':'#ff4d6d','NEUTRAL':'#445566',
    }

    for idx, row in enumerate(rows):
        y = (idx+1)*row_height
        x = 0
        bg = (14,18,32) if idx%2==0 else (18,22,38)
        draw.rectangle([0, y, width, y+row_height], fill=bg)
        for j, val in enumerate(row):
            color = (220,220,220)
            if j==2: color=(0,255,159) if str(val)=='BUY' else (255,77,109) if str(val)=='SELL' else (200,200,200)
            elif j==3:
                hex_col = mom_colors.get(str(val), '#8892aa')
                r,g,b = int(hex_col[1:3],16),int(hex_col[3:5],16),int(hex_col[5:7],16)
                color=(r,g,b)
            elif j==1:
                try:
                    gv=float(val)
                    color=(0,255,159) if gv>0 else (255,77,109) if gv<0 else (200,200,200)
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

        for r in data:
            symbol   = r.get("symbol")
            gap      = r.get("gap")
            strength = r.get("strength")
            momentum = r.get("momentum", "NEUTRAL")
            if not symbol or gap is None: continue
            if gap >= 5:   bias = "BUY"
            elif gap <= -5: bias = "SELL"
            else: continue

            label = "🔥" if (strength or 0) >= 2 else "⚡" if (strength or 0) >= 1 else "•"
            row = [f"{label} {symbol}", round(gap,1), bias, momentum, round(strength,2) if strength else 0]
            if bias == "BUY": buy_signals.append(row)
            else: sell_signals.append(row)

        buy_signals  = sorted(buy_signals,  key=lambda x: x[1], reverse=True)
        sell_signals = sorted(sell_signals, key=lambda x: abs(x[1]), reverse=True)
        clean = buy_signals + sell_signals
        if not clean: clean = [["NO SIGNALS","","","",""]]

        img = generate_snapshot(clean)
        with open(img, "rb") as f:
            response = requests.post(
                f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendPhoto",
                data={"chat_id": TELEGRAM_CHAT_ID,
                      "caption": f"🐼 PANDA DASHBOARD\n⏰ {datetime.now().strftime('%Y-%m-%d %H:%M')}\n📈 BUY: {len(buy_signals)} | 📉 SELL: {len(sell_signals)}"},
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
# Momentum action guide for Telegram messages
MOMENTUM_GUIDE = {
    'STRONG':        ('🔥', 'RIDE IT — Trend fully aligned across all timeframes'),
    'BUILDING':      ('🚀', 'ENTER NOW — Momentum confirmed, short + mid rising'),
    'SPARK':         ('⚡', 'WATCH — Early signal, wait for confirmation'),
    'CONSOLIDATING': ('🔵', 'HOLD — Normal pause in strong trend, do NOT close'),
    'COOLING':       ('🌡️', 'TIGHTEN SL — Momentum slowing, protect profits'),
    'FADING':        ('📉', 'CONSIDER CLOSING — Gap shrinking toward ±5'),
    'REVERSING':     ('⚠️', 'CLOSE POSITION — Trend breaking down'),
    'STABLE':        ('▬',  'MONITOR — Gap valid but no strong momentum'),
    'NEUTRAL':       ('○',  'WAIT — No valid signal yet'),
}

def send_spike_alert(spikes):
    if not telegram_circuit.allow(): return
    try:
        lines = ["⚡ <b>MOMENTUM SPIKE DETECTED</b>\n"]
        for s in spikes:
            bias_icon = "📈" if s['bias']=='BUY' else "📉"
            mom_icon, action = MOMENTUM_GUIDE.get(s['momentum'], ('⚡', 'MONITOR'))
            lines.append(
                f"{mom_icon} <b>{s['symbol']}</b>  {bias_icon} {s['bias']}\n"
                f"   Gap: <b>{s['gap']:+.0f}</b>  |  {s['momentum']}\n"
                f"   30min: {(s['delta_short'] or 0):+.1f}  2h: {(s['delta_mid'] or 0):+.1f}  Str: {s['strength']:.1f}\n"
                f"   👉 <b>{action}</b>\n"
            )
        lines.append(f"\n⏰ {datetime.now().strftime('%H:%M')}\n🐼 PANDA ENGINE")
        text = "\n".join(lines)[:4000]
        response = requests.post(
            f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage",
            data={"chat_id": TELEGRAM_CHAT_ID, "text": text},
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
    print("\n🐼 PANDA ENGINE v2.1 STARTING...")
    print("   Momentum: FIXED (CONSOLIDATING added, smart close alerts)")
    asyncio.create_task(master_scheduler())

# ================= ROUTES =================
@app.get("/")
def home():
    return {"status": "PANDA ENGINE v2.1", "momentum": "trend-following optimized"}

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
        res = supabase.table("engine_logs").select("*").order("timestamp", desc=True).limit(1).execute()
        last_run = res.data[0]["timestamp"] if res.data else "Never"
        dashboard = supabase.table("dashboard").select("symbol,gap,momentum,updated_at").execute()
        valid = [r for r in (dashboard.data or []) if abs(r.get("gap") or 0) >= 5]
        return {
            "status":     "ACTIVE",
            "last_run":   last_run,
            "total_pairs": len(dashboard.data or []),
            "valid_pairs": len(valid),
            "buy_pairs":   len([r for r in valid if (r.get("gap") or 0) >= 5]),
            "sell_pairs":  len([r for r in valid if (r.get("gap") or 0) <= -5]),
        }
    except Exception as e:
        return {"status": "ERROR", "message": str(e)}