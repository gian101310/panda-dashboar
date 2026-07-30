"""One-off TEST: preview base_score_tf/quote_score_tf as they will appear in the
signal_snapshots rows, computed from LIVE mt4 files. Sends a sample to Telegram
(ops/health chat). Read-only on MT4. No engine changes, no DB writes."""
import os, re, requests
from dotenv import load_dotenv

load_dotenv(r"C:\Users\Admin\Documents\Claude\Projects\Panda Engine\.env")

MT4_PATH = os.environ.get("MT4_PATH", r"C:\Users\Admin\AppData\Roaming\MetaQuotes\Terminal\Common\Files")
TOKEN    = os.environ.get("LOGIN_ALERT_BOT_TOKEN", "")
CHAT     = os.environ.get("LOGIN_ALERT_CHAT_ID", "")

PAIRS = ["AUDJPY","AUDCAD","AUDNZD","AUDUSD","CADJPY","EURAUD","EURCAD","EURGBP",
         "EURJPY","EURNZD","EURUSD","GBPAUD","GBPCAD","GBPJPY","GBPNZD","GBPUSD",
         "NZDCAD","NZDJPY","NZDUSD","USDCAD","USDJPY"]

CUR_RE = re.compile(r"^\s*([A-Z]{3})\s*:?[ \t]*D1\s*:\s*([+\-\d/]+)\s*(?:\|\s*)?H4\s*:\s*([+\-\d/]+)\s*(?:\|\s*)?H1\s*:\s*([+\-\d/]+)")

def extract(line):
    if line.strip().startswith("ADV"): return 0, False
    m = re.findall(r"(D1|H4|H1)\s*:\s*([+-]?\d+)(?:/([+-]?\d+))?", line)
    av=[];ps=[];ns=[]
    for tf,v1s,v2s in m:
        v1=int(v1s);av.append(v1)
        if v1>=4:ps.append(1)
        if v1<=-4:ns.append(1)
        if v2s:
            v2=int(v2s);av.append(v2)
            if v2>=4:ps.append(1)
            if v2<=-4:ns.append(1)
    if ps and ns:return 0,True
    if not av:return 0,False
    sp=max((v for v in av if v>0),default=0);sn=min((v for v in av if v<0),default=0)
    ap,an=abs(sp),abs(sn)
    if ap==an and ap!=0:return 0,False
    if an>ap:return sn,False
    return sp,False

def derive_score_tf(line):
    if line.strip().startswith("ADV"): return ""
    m = re.findall(r"(D1|H4|H1)\s*:\s*([+-]?\d+)(?:/([+-]?\d+))?", line)
    av=[]; pos=neg=False
    for tf,v1s,v2s in m:
        v1=int(v1s); av.append((tf,v1))
        if v1>=4:pos=True
        if v1<=-4:neg=True
        if v2s:
            v2=int(v2s); av.append((tf,v2))
            if v2>=4:pos=True
            if v2<=-4:neg=True
    if pos and neg: return ""
    if not av: return ""
    vals=[v for _,v in av]
    sp=max((v for v in vals if v>0),default=0); sn=min((v for v in vals if v<0),default=0)
    ap,an=abs(sp),abs(sn)
    if ap==an and ap!=0: return ""
    winner = sn if an>ap else sp
    if winner==0: return ""
    order={"D1":0,"H4":1,"H1":2}
    wtf=sorted({tf for tf,v in av if v==winner},key=lambda t:order.get(t,9))
    sign=1 if winner>0 else -1
    if all(any((v*sign)>=4 for tf,v in av if tf==t) for t in ("D1","H4","H1")): return "ALL"
    return "+".join(wtf)

def raw_lines(sym):
    p=os.path.join(MT4_PATH, f"mt4_{sym.lower()}.txt")
    if not os.path.exists(p): return None,None
    base=quote=None
    with open(p,"r",encoding="utf-8",errors="replace") as f:
        for ln in f:
            ln=ln.strip()
            if not ln or ln.startswith("ADV"): continue
            if CUR_RE.match(ln):
                if base is None: base=ln
                elif quote is None: quote=ln; break
    return base,quote

rows=[]
for sym in PAIRS:
    b,q = raw_lines(sym)
    if not b or not q: continue
    bs,bi = extract(b); qs,qi = extract(q)
    btf = derive_score_tf(b); qtf = derive_score_tf(q)
    gap = bs-qs
    if bi or qi: bias="HARD_INVALID"
    elif gap>=5: bias="BUY"
    elif gap<=-5: bias="SELL"
    else: bias="INVALID"
    rows.append((sym,bs,qs,gap,bias,btf,qtf))

rows.sort(key=lambda r:-abs(r[3]))
tbl=["PAIR    GAP  BIAS   BASE_TF  QUOTE_TF"]
for sym,bs,qs,gap,bias,btf,qtf in rows:
    tbl.append(f"{sym:6} {gap:+4}  {bias[:5]:5}  {btf or '-':8} {qtf or '-':8}")
table="\n".join(tbl)
msg=("<b>PANDA — SNAPSHOT TF TEST</b> (source-timeframe preview)\n"
     f"<pre>{table}</pre>\n"
     "ALL = every TF extreme (|v|&gt;=4). Blank = invalid/neutral.\n"
     "New snapshot columns: base_score_tf, quote_score_tf (live in dashboard + signal_snapshots).")

print("TOKEN set:", bool(TOKEN), "CHAT:", CHAT)
print(table)
if TOKEN and CHAT:
    r=requests.post(f"https://api.telegram.org/bot{TOKEN}/sendMessage",
        data={"chat_id":CHAT,"text":msg,"parse_mode":"HTML"},timeout=20)
    print("Telegram:",r.status_code,r.text[:200])
else:
    print("MISSING TOKEN/CHAT — not sent")
