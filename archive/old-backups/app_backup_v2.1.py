"""
PANDA FOREX ENGINE v2.1 - MOMENTUM LOGIC FIXED
================================================
- HARD_INVALID detection from panda files (BIAS: HARD_INVALID / CURRENCY_CONFLICT)
- CONSOLIDATING state added (normal pullback in strong trend)
- REVERSAL only fires when gap actually approaching 0
- CONSIDER CLOSING only on FADING/REVERSING (not on consolidation)
- Google Sheets removed
- Multi-timeframe: 30min / 2h / 6h
- Instant Telegram spike alert
- LOGIN ALERT: Telegram notification on every dashboard login
"""

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
PANDA_PATH       = r"C:\Users\Admin\AppData\Roaming\MetaQuotes\Terminal\Common\Files"
TELEGRAM_TOKEN   = "REDACTED"
TELEGRAM_CHAT_ID = "-1003857801976"
SUPABASE_URL     = "https://jxkelchxitwuilpbrwxk.supabase.co"
SUPABASE_KEY     = "REDACTED"
MAX_FILE_AGE_SECONDS = 180

LAST_QUARTER_MARK = None
LAST_HOUR_MARK    = None
PREV_MOMENTUM     = {}
PREV_GAP          = {}

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

# ================= FILE READER (FIXED - reads HARD_INVALID) =================
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

        # Read gap score
        m = re.search(r"GAP SCORE\s*:\s*(-?\d+)", text)
        gap = float(m.group(1)) if m else None

        # Read bias — detect HARD_INVALID
        bias_match = re.search(r"BIAS\s*:\s*(\w+)", text)
        bias = bias_match.group(1) if bias_match else ""

        # Check for currency conflict flag
        conflict = "CURRENCY_CONFLICT : YES" in text

        hard_invalid = bias == "HARD_INVALID" or conflict

        return {
            "gap":          gap,
            "hard_invalid": hard_invalid,
            "conflict":     conflict,
            "bias":         bias,
        }
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
    if gap >= 5:
        direction = 'BULL'
    elif gap <= -5:
        direction = 'BEAR'
    else:
        return 'NEUTRAL', 'NEUTRAL'

    s = (delta_short or 0) if direction == 'BULL' else -(delta_short or 0)
    m = (delta_mid   or 0) if direction == 'BULL' else -(delta_mid   or 0)
    l = (delta_long  or 0) if direction == 'BULL' else -(delta_long  or 0)

    abs_gap = abs(gap)

    if s >= 3 and m >= 6 and l >= 4 and abs_gap >= 7:
        return 'STRONG', f'EXPAND_{direction}'
    elif s >= 2 and m >= 3:
        return 'BUILDING', f'EXPAND_{direction}'
    elif s >= 1.5 and m < 2:
        return 'SPARK', f'STABLE_{direction}'
    elif abs_gap >= 7 and s < 0 and s >= -5 and m >= -2:
        return 'CONSOLIDATING', f'STABLE_{direction}'
    elif abs_gap >= 5 and s < 0 and m < 0 and l >= 1:
        return 'COOLING', f'PULLBACK_{direction}'
    elif abs_gap <= 7 and s < -1 and m < -1 and l < 1:
        return 'FADING', f'PULLBACK_{direction}'
    elif abs_gap <= 6 and s < -2 and m < -2 and l < 0:
        return 'REVERSING', 'NEUTRAL'
    else:
        return 'STABLE', f'STABLE_{direction}'


def should_close_alert(gap, momentum, delta_mid, prev_gap=None):
    abs_gap = abs(gap)
    if abs_gap < 5:
        return True
    if momentum in ('FADING', 'REVERSING'):
        return True
    if prev_gap is not None:
        drop = abs(prev_gap) - abs_gap
        if drop >= 3 and (delta_mid or 0) * (-1 if gap < 0 else 1) < -3:
            return True
    return False


def classify_structural_state(gap, delta_mid, accel):
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

    # ===== READ GAP FILES (FIXED) =====
    gap_map          = {}   # symbol -> gap value (0 if hard invalid)
    hard_invalid_set = set() # symbols that are HARD_INVALID or CURRENCY_CONFLICT
    stale_count      = 0

    for symbol in known_symbols:
        result = read_gap(symbol)
        if result is None:
            stale_count += 1
            continue

        gap_val = result["gap"]
        if gap_val is None:
            stale_count += 1
            continue

        if result["hard_invalid"]:
            # Force gap to 0 so it shows as INVALID on dashboard
            gap_map[symbol] = 0.0
            hard_invalid_set.add(symbol)
            print(f"[HARD_INVALID] {symbol} — bias={result['bias']} conflict={result['conflict']}")
        else:
            gap_map[symbol] = gap_val

    if not gap_map:
        print("[ENGINE] No gap files read")
        return

    print(f"[ENGINE] Read {len(gap_map)} pairs ({stale_count} stale/missing, {len(hard_invalid_set)} hard invalid)")

    dashboard_payload   = []
    strength_payload    = []
    gap_history_payload = []
    spike_alerts        = []

    for symbol, gap in gap_map.items():
        is_hard_invalid = symbol in hard_invalid_set

        # Hard invalid pairs: skip momentum, just mark them
        if is_hard_invalid:
            dashboard_payload.append({
                'symbol':       symbol,
                'gap':          0,
                'state':        'HARD_INVALID',
                'momentum':     'NEUTRAL',
                'close_alert':  False,
                'delta_short':  None,
                'delta_mid':    None,
                'delta_long':   None,
                'strength':     0,
                'signal':       'NONE',
                'hard_invalid': True,
                'updated_at':   datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            })
            gap_history_payload.append({
                'timestamp': timestamp,
                'symbol':    symbol,
                'gap':       0,
            })
            PREV_MOMENTUM[symbol] = 'NEUTRAL'
            PREV_GAP[symbol]      = 0
            continue

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

        momentum, state = classify_momentum(gap, delta_short, delta_mid, delta_long)

        if delta_mid is not None and accel is not None:
            struct_state = classify_structural_state(gap, delta_mid, accel)
        else:
            struct_state = state

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

        prev_gap_val = PREV_GAP.get(symbol)
        close_alert  = should_close_alert(gap, momentum, delta_mid, prev_gap_val)

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
            'hard_invalid': False,
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
            print(f"[SUPABASE] Dashboard: {len(dashboard_payload)} pairs ({len(hard_invalid_set)} hard invalid)")
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
            if j==2: color=(0,255,159) if str(val)=='BUY' else (255,77,109) if str(val)=='SELL' else (255,120,50) if str(val)=='HARD_INVALID' else (200,200,200)
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
        buy_signals  = []
        sell_signals = []
        invalid_count = 0

        for r in data:
            symbol       = r.get("symbol")
            gap          = r.get("gap")
            strength     = r.get("strength")
            momentum     = r.get("momentum", "NEUTRAL")
            hard_invalid = r.get("hard_invalid", False)

            if not symbol or gap is None: continue

            # Skip hard invalid from snapshot signals
            if hard_invalid:
                invalid_count += 1
                continue

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
                      "caption": f"🐼 PANDA DASHBOARD\n⏰ {datetime.now().strftime('%Y-%m-%d %H:%M')}\n📈 BUY: {len(buy_signals)} | 📉 SELL: {len(sell_signals)} | ⚠️ INVALID: {invalid_count}"},
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

# ================= LOGIN ALERT =================
LOGIN_ALERT_BOT_TOKEN = "REDACTED"
LOGIN_ALERT_CHAT_ID   = "REDACTED"

@app.post("/api/login-alert")
async def login_alert(data: dict):
    username = data.get("username", "Unknown")
    dubai_tz = timezone(timedelta(hours=4))
    now = datetime.now(dubai_tz)
    timestamp = now.strftime("%Y-%m-%d %H:%M:%S")
    day_name = now.strftime("%A")
    message = (
        f"🐼 <b>PANDA ENGINE — Login Alert</b>\n"
        f"━━━━━━━━━━━━━━━━━━━━━━\n"
        f"👤 <b>User:</b> {username}\n"
        f"🕐 <b>Time:</b> {timestamp} (Dubai)\n"
        f"📅 <b>Day:</b> {day_name}\n"
        f"━━━━━━━━━━━━━━━━━━━━━━\n"
        f"🌐 <a href='https://panda-dashboar.vercel.app/dashboard'>Open Dashboard</a>"
    )
    try:
        response = requests.post(
            f"https://api.telegram.org/bot{LOGIN_ALERT_BOT_TOKEN}/sendMessage",
            json={
                "chat_id": LOGIN_ALERT_CHAT_ID,
                "text": message,
                "parse_mode": "HTML",
                "disable_web_page_preview": True,
            },
            timeout=10,
        )
        if response.status_code == 200:
            print(f"[LOGIN ALERT] Sent for user: {username}")
        else:
            print(f"[LOGIN ALERT ERROR] {response.text}")
        return {"status": "sent"}
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
    print("\n🐼 PANDA ENGINE v2.1 STARTING...")
    print("   HARD_INVALID detection: ENABLED")
    print("   Momentum: FIXED (CONSOLIDATING added, smart close alerts)")
    print("   Login Alert: ENABLED")
    asyncio.create_task(master_scheduler())

# ================= ROUTES =================
@app.get("/")
def home():
    return {
        "status": "PANDA ENGINE v2.1",
        "hard_invalid_detection": "enabled",
        "momentum": "trend-following optimized",
        "login_alert": "enabled"
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
        res = supabase.table("engine_logs").select("*").order("timestamp", desc=True).limit(1).execute()
        last_run = res.data[0]["timestamp"] if res.data else "Never"
        dashboard = supabase.table("dashboard").select("symbol,gap,momentum,hard_invalid,updated_at").execute()
        all_pairs    = dashboard.data or []
        valid        = [r for r in all_pairs if abs(r.get("gap") or 0) >= 5 and not r.get("hard_invalid")]
        hard_invalid = [r for r in all_pairs if r.get("hard_invalid")]
        return {
            "status":        "ACTIVE",
            "last_run":      last_run,
            "total_pairs":   len(all_pairs),
            "valid_pairs":   len(valid),
            "hard_invalid":  len(hard_invalid),
            "buy_pairs":     len([r for r in valid if (r.get("gap") or 0) >= 5]),
            "sell_pairs":    len([r for r in valid if (r.get("gap") or 0) <= -5]),
        }
    except Exception as e:
        return {"status": "ERROR", "message": str(e)}