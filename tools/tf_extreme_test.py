import re, os
def derive_score_tf(line):
    if line.strip().startswith("ADV"): return ""
    matches = re.findall(r"(D1|H4|H1)\s*:\s*([+-]?\d+)(?:/([+-]?\d+))?", line)
    order={"D1":0,"H4":1,"H1":2}; out=[]
    for tf,v1s,v2s in matches:
        for vs in (v1s,v2s):
            if not vs: continue
            v=int(vs)
            if abs(v)>=4: out.append((order.get(tf,9),tf,v))
    out.sort(key=lambda x:x[0])
    return " ".join(f"{tf}{'+' if v>0 else ''}{v}" for _,tf,v in out)

tests=[
 "GBP : D1:+4 | H4:+5 | H1:+3",   # -> D1+4 H4+5
 "CAD : D1:-1 | H4:+2 | H1:-3",   # -> "" (no extreme)
 "EUR : D1:+3 | H4:+2 | H1:+6",   # -> H1+6
 "JPY : D1:-4 | H4:-5 | H1:-6",   # -> D1-4 H4-5 H1-6
 "USD : D1:+2/-1 | H4:+5 | H1:+3",# -> H4+5
 "NZD : D1:+6 | H4:-6 | H1:0",    # -> D1+6 H4-6 (conflict, but shows both)
 "ADV : EUR : D1:+6 | H4:+6 | H1:+6",
]
for t in tests:
    print(f"[{derive_score_tf(t):20}] <- {t}")

# live check
MT4=r"C:\Users\Admin\AppData\Roaming\MetaQuotes\Terminal\Common\Files"
CUR=re.compile(r"^\s*([A-Z]{3})\s*:?[ \t]*D1\s*:\s*([+\-\d/]+)\s*(?:\|\s*)?H4\s*:\s*([+\-\d/]+)\s*(?:\|\s*)?H1\s*:\s*([+\-\d/]+)")
def raw(sym):
    p=os.path.join(MT4,f"mt4_{sym.lower()}.txt"); b=q=None
    if not os.path.exists(p): return None,None
    for ln in open(p,encoding="utf-8",errors="replace"):
        ln=ln.strip()
        if not ln or ln.startswith("ADV"): continue
        if CUR.match(ln):
            if b is None: b=ln
            elif q is None: q=ln; break
    return b,q
print("\nLIVE:")
for s in ["GBPCAD","GBPJPY","EURJPY","AUDNZD","USDCAD"]:
    b,q=raw(s)
    if b: print(f"{s}: BASE[{derive_score_tf(b)}]  QUOTE[{derive_score_tf(q)}]")
    print(f"   raw base: {b}")
    print(f"   raw quote:{q}")
