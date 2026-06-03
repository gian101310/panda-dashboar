"""
PANDA ENGINE - cTrader Journal v4.0
Uses multiprocessing to run Twisted in a fresh child process every time.
Fixes the reactor-can't-restart hang on Windows.
"""
import json, os, time, webbrowser, sys
from datetime import datetime, timezone
from urllib.parse import urlparse, parse_qs
import requests
from supabase import create_client

CLIENT_ID     = "23689_eFecowPIdNGAlM5xItfPv3VDAxI5Pmkv7BER7kcsjDVKdiTxyy"
CLIENT_SECRET = "2dukGwM5H0PizXwHsNfDiPnz5iOvlKu1kF9WqxGkyxpQBMbCcK"
REDIRECT_URI  = "http://localhost"
TOKEN_FILE    = "ctrader_token.json"
TOKEN_URL     = "https://openapi.ctrader.com/apps/token"
FROM_TS       = 1735689600000  # Jan 1 2026

SUPABASE_URL = "https://jxkelchxitwuilpbrwxk.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp4a2VsY2h4aXR3dWlscGJyd3hrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzg1MTI2NSwiZXhwIjoyMDg5NDI3MjY1fQ.OgNCKlZPy010de01wW02qH--Lb6zVYqPBxTEFpGrD5M"

ACCOUNT_LABELS = {
    36456179: "Live Account",
    42138936: "Demo / Prop 1",
    42181315: "Demo / Prop 2",
    43889924: "Demo / Prop 3",
}

def load_token():
    if os.path.exists(TOKEN_FILE):
        with open(TOKEN_FILE) as f: return json.load(f)
    return None

def save_token(data):
    data["obtained_at"] = time.time()
    with open(TOKEN_FILE, "w") as f: json.dump(data, f, indent=2)

def refresh_token(token):
    r = requests.get(TOKEN_URL, params={"grant_type":"refresh_token",
        "refresh_token":token.get("refreshToken",token.get("refresh_token")),
        "client_id":CLIENT_ID,"client_secret":CLIENT_SECRET})
    r.raise_for_status(); data = r.json(); save_token(data); return data

def get_token():
    token = load_token()
    if not token:
        url = f"https://id.ctrader.com/my/settings/openapi/grantingaccess/?client_id={CLIENT_ID}&redirect_uri={REDIRECT_URI}&scope=trading"
        webbrowser.open(url)
        redirect_url = input("Paste redirect URL: ")
        code = parse_qs(urlparse(redirect_url).query).get("code",[None])[0]
        r = requests.get(TOKEN_URL, params={"grant_type":"authorization_code","code":code,
            "redirect_uri":REDIRECT_URI,"client_id":CLIENT_ID,"client_secret":CLIENT_SECRET})
        r.raise_for_status(); token = r.json(); save_token(token)
        return token
    if time.time() > token.get("obtained_at",0) + token.get("expiresIn",2592000) - 86400:
        return refresh_token(token)
    return token

def ms_to_dt(ms):
    if not ms: return None
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc)

def calc_pips(symbol, direction, entry, exit_price):
    if not entry or not exit_price: return 0
    pip = 0.01 if "JPY" in symbol else 0.0001
    raw = (exit_price - entry) if direction == "BUY" else (entry - exit_price)
    return round(raw / pip, 1)

def get_gap_at_time(db, symbol, timestamp):
    try:
        ts = timestamp.strftime("%Y-%m-%d %H:%M")
        res = db.from_("gap_history").select("gap").eq("symbol",symbol).lte("timestamp",ts).order("timestamp",desc=True).limit(1).execute()
        return res.data[0]["gap"] if res.data else None
    except: return None

def get_momentum(db, symbol):
    try:
        res = db.from_("dashboard").select("momentum").eq("symbol",symbol).limit(1).execute()
        return res.data[0]["momentum"] if res.data else None
    except: return None

# ===== TWISTED SYNC — runs in child process =====
def _run_sync_child(access_token):
    """Runs in a fresh subprocess so reactor is always clean."""
    from ctrader_open_api import Client, Protobuf, TcpProtocol, EndPoints
    from ctrader_open_api.messages.OpenApiMessages_pb2 import (
        ProtoOAApplicationAuthReq, ProtoOAApplicationAuthRes,
        ProtoOAGetAccountListByAccessTokenReq, ProtoOAGetAccountListByAccessTokenRes,
        ProtoOAAccountAuthReq, ProtoOAAccountAuthRes,
        ProtoOAReconcileReq, ProtoOAReconcileRes,
        ProtoOADealListReq, ProtoOADealListRes,
        ProtoOASymbolsListReq, ProtoOASymbolsListRes,
    )
    from twisted.internet import reactor
    from supabase import create_client

    db      = create_client(SUPABASE_URL, SUPABASE_KEY)
    sym_map = {}
    batch   = []

    def flush(force=False):
        if not batch or (len(batch) < 50 and not force): return
        unique = {r["position_id"]: r for r in batch}
        db.from_("trade_journal").upsert(list(unique.values()), on_conflict="position_id").execute()
        print(f"  [BATCH] {len(unique)} trades saved")
        batch.clear()

    client = Client(EndPoints.PROTOBUF_LIVE_HOST, EndPoints.PROTOBUF_PORT, TcpProtocol)

    def connected(c):
        print("[API] Connected")
        req = ProtoOAApplicationAuthReq()
        req.clientId = CLIENT_ID; req.clientSecret = CLIENT_SECRET
        c.send(req)

    def on_msg(c, msg):
        if msg.payloadType == ProtoOAApplicationAuthRes().payloadType:
            req = ProtoOAGetAccountListByAccessTokenReq()
            req.accessToken = access_token; c.send(req)

        elif msg.payloadType == ProtoOAGetAccountListByAccessTokenRes().payloadType:
            res = Protobuf.extract(msg)
            if res.ctidTraderAccount:
                aid = res.ctidTraderAccount[0].ctidTraderAccountId
                req = ProtoOAAccountAuthReq()
                req.ctidTraderAccountId = aid; req.accessToken = access_token; c.send(req)

        elif msg.payloadType == ProtoOAAccountAuthRes().payloadType:
            aid = Protobuf.extract(msg).ctidTraderAccountId
            req = ProtoOASymbolsListReq(); req.ctidTraderAccountId = aid; c.send(req)

        elif msg.payloadType == ProtoOASymbolsListRes().payloadType:
            res = Protobuf.extract(msg)
            sym_map.clear()
            for s in res.symbol: sym_map[s.symbolId] = s.symbolName.replace("/","").upper()
            req = ProtoOAReconcileReq(); req.ctidTraderAccountId = res.ctidTraderAccountId; c.send(req)

        elif msg.payloadType == ProtoOAReconcileRes().payloadType:
            res = Protobuf.extract(msg); aid = res.ctidTraderAccountId
            db.from_("trade_journal").delete().eq("status","OPEN").execute()
            for pos in res.position:
                try:
                    td = pos.tradeData; sym = sym_map.get(td.symbolId)
                    if not sym: continue
                    dir_ = "BUY" if td.tradeSide == 1 else "SELL"
                    ts   = ms_to_dt(td.openTimestamp)
                    db.from_("trade_journal").upsert({
                        "position_id": str(pos.positionId), "symbol": sym,
                        "direction": dir_, "volume": td.volume/100000,
                        "entry_price": pos.price or None, "status": "OPEN",
                        "source": "ctrader",
                        "entry_time": ts.isoformat() if ts else None,
                        "gap_at_entry": get_gap_at_time(db, sym, ts) if ts else None,
                        "momentum_at_entry": get_momentum(db, sym),
                        "account_id": str(aid),
                        "broker_name": ACCOUNT_LABELS.get(int(aid),"Unknown"),
                        "updated_at": datetime.now(timezone.utc).isoformat(),
                    }, on_conflict="position_id").execute()
                    print(f"  [OPEN] {sym} {dir_} @ {pos.price}")
                except Exception as e: print("Open pos err:", e)
            req = ProtoOADealListReq()
            req.ctidTraderAccountId = aid
            req.fromTimestamp = FROM_TS
            req.toTimestamp   = int(time.time()*1000)
            c.send(req)

        elif msg.payloadType == ProtoOADealListRes().payloadType:
            res = Protobuf.extract(msg); aid = res.ctidTraderAccountId
            closed = 0
            for deal in res.deal:
                try:
                    sym = sym_map.get(deal.symbolId,""); 
                    if not sym: continue
                    cpd = deal.closePositionDetail
                    if cpd.closedVolume <= 0: continue  # skip opening deals
                    dir_       = "BUY" if deal.tradeSide == 1 else "SELL"
                    exit_price = deal.executionPrice or None
                    entry_price= cpd.entryPrice or None
                    pl         = cpd.grossProfit/100 if cpd.grossProfit else 0
                    pl_pips    = calc_pips(sym, dir_, entry_price, exit_price) if entry_price and exit_price else 0
                    comm       = deal.commission/100 if deal.commission else 0
                    ets = ms_to_dt(deal.createTimestamp)
                    xts = ms_to_dt(deal.executionTimestamp)
                    batch.append({
                        "position_id": str(deal.positionId), "symbol": sym,
                        "direction": dir_, "volume": deal.filledVolume/100000,
                        "entry_price": entry_price, "exit_price": exit_price,
                        "profit_loss": pl, "profit_loss_pips": pl_pips, "commission": comm,
                        "entry_time": ets.isoformat() if ets else None,
                        "exit_time":  xts.isoformat() if xts else None,
                        "status": "CLOSED", "source": "ctrader",
                        "gap_at_entry": get_gap_at_time(db,sym,ets) if ets else None,
                        "gap_at_exit":  get_gap_at_time(db,sym,xts) if xts else None,
                        "momentum_at_entry": get_momentum(db,sym),
                        "account_id": str(aid),
                        "broker_name": ACCOUNT_LABELS.get(int(aid),"Unknown"),
                        "updated_at": datetime.now(timezone.utc).isoformat(),
                    })
                    closed += 1
                    flush()
                except Exception as e: print("Deal err:", e)
            flush(force=True)
            print(f"[SYNC] Done — {closed} closed deals, {len(res.deal)-closed} skipped (opening deals)")
            def stop():
                try: client.disconnect()
                except: pass
                reactor.stop()
            reactor.callLater(1, stop)

    client.setConnectedCallback(connected)
    client.setMessageReceivedCallback(on_msg)
    client.startService()
    reactor.run()


# ===== ENTRY POINT =====
if __name__ == "__main__":
    import multiprocessing
    multiprocessing.freeze_support()

    print("\nPANDA ENGINE cTrader Journal v4.0\n")
    token        = get_token()
    access_token = token.get("accessToken") or token.get("access_token")

    # Spawn Twisted in a fresh child process so reactor is always clean
    p = multiprocessing.Process(target=_run_sync_child, args=(access_token,))
    p.start()
    p.join()
    print("\nSync complete.")
