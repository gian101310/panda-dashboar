import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { PROTECTED_OVERLAY_CODES } from '../../lib/indicatorStore.mjs';

const mono = "'Share Tech Mono',monospace";
const orb = "'Orbitron',sans-serif";
const raj = "'Rajdhani',sans-serif";

const inp = { background: '#05080f', border: '1px solid #1a2540', borderRadius: 6, padding: '8px 10px', color: '#e8eaf0', fontFamily: mono, fontSize: 12, outline: 'none', width: '100%' };
const lbl = { fontFamily: mono, fontSize: 8, color: '#445566', letterSpacing: 1, display: 'block', marginBottom: 3 };
const btn = (c) => ({ background: c + '14', border: `1px solid ${c}`, borderRadius: 6, color: c, fontFamily: mono, fontSize: 9, letterSpacing: 2, padding: '8px 16px', cursor: 'pointer' });

export default function AdminPricing() {
  const router = useRouter();
  const [tiers, setTiers] = useState([]);
  const [products, setProducts] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [newProd, setNewProd] = useState({ name: '', price: '', currency: 'USD', pay_link: '', description: '', category: 'indicator' });

  const load = async () => {
    try {
      const r = await fetch('/api/admin/pricing');
      if (r.status === 401 || r.status === 403) { router.push('/admin-login'); return; }
      const j = await r.json();
      setTiers((j.tiers || []).map(t => ({ ...t, features_text: (t.features || []).join('\n') })));
      setProducts(j.products || []);
    } catch { setMsg('Load failed'); }
  };
  useEffect(() => { load(); }, []);

  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(''), 2500); };

  const post = async (body) => {
    setBusy(true);
    try {
      const r = await fetch('/api/admin/pricing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) { flash('⚠ ' + (j.error || 'Failed')); setBusy(false); return false; }
      setBusy(false); return true;
    } catch { flash('⚠ Network error'); setBusy(false); return false; }
  };

  const saveTier = async (t) => {
    const features = t.features_text.split('\n').map(s => s.trim()).filter(Boolean);
    const ok = await post({
      action: 'update_tier', id: t.id, name: t.name, currency: t.currency,
      price_monthly: Number(t.price_monthly) || 0,
      was_monthly: t.was_monthly === '' || t.was_monthly === null ? null : Number(t.was_monthly),
      price_lifetime: t.price_lifetime === '' || t.price_lifetime === null ? null : Number(t.price_lifetime),
      sub_text: t.sub_text, tag: t.tag || null, cta: t.cta, features,
      pay_link_monthly: t.pay_link_monthly || null, pay_link_lifetime: t.pay_link_lifetime || null,
      active: t.active,
    });
    if (ok) { flash('✓ ' + t.name + ' saved — live in ~1 min'); load(); }
  };

  const saveProduct = async (p) => {
    const ok = await post({ action: 'update_product', id: p.id, name: p.name, description: p.description, currency: p.currency, price: Number(p.price) || 0, pay_link: p.pay_link || null, active: p.active, sort: Number(p.sort) || 0 });
    if (ok) { flash('✓ ' + p.name + ' saved'); load(); }
  };

  const addProduct = async () => {
    if (!newProd.name || !newProd.price) { flash('⚠ Name and price required'); return; }
    const ok = await post({ action: 'create_product', ...newProd, price: Number(newProd.price) });
    if (ok) { setNewProd({ name: '', price: '', currency: 'USD', pay_link: '', description: '', category: 'indicator' }); flash('✓ Product added'); load(); }
  };

  const delProduct = async (p) => {
    if (!confirm(`Delete "${p.name}"?`)) return;
    const ok = await post({ action: 'delete_product', id: p.id });
    if (ok) { flash('✓ Deleted'); load(); }
  };

  const setT = (i, k, v) => setTiers(ts => ts.map((t, j) => j === i ? { ...t, [k]: v } : t));
  const setP = (i, k, v) => setProducts(ps => ps.map((p, j) => j === i ? { ...p, [k]: v } : p));

  return (
    <>
      <Head>
        <title>ADMIN — Pricing & Store</title>
        <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Share+Tech+Mono&family=Rajdhani:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </Head>
      <div style={{ background: '#050810', color: '#e8eaf0', minHeight: '100vh', padding: '20px 16px 60px', fontFamily: raj }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, flexWrap: 'wrap', gap: 10 }}>
            <div style={{ fontFamily: orb, fontSize: 16, fontWeight: 900, letterSpacing: 3, color: '#ffd166' }}>💰 PRICING & STORE</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => router.push('/admin')} style={btn('#8899aa')}>← ADMIN</button>
              <button onClick={() => router.push('/admin/pf-approvals')} style={btn('#8899aa')}>APPROVALS</button>
              <button onClick={() => router.push('/admin/license')} style={btn('#8899aa')}>LICENSES</button>
            </div>
          </div>
          <div style={{ fontFamily: mono, fontSize: 10, color: '#445566', letterSpacing: 1, marginBottom: 18 }}>
            Edit prices here — pricing page, landing page, and Telegram bots all update automatically (~1 min cache).
          </div>
          {msg && <div style={{ fontFamily: mono, fontSize: 11, color: msg.startsWith('⚠') ? '#ff4d6d' : '#00ff9f', marginBottom: 14 }}>{msg}</div>}

          {/* TIERS */}
          <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: 4, color: '#00b4ff', margin: '10px 0' }}>SUBSCRIPTION TIERS</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 14, marginBottom: 34 }}>
            {tiers.map((t, i) => (
              <div key={t.id} style={{ background: '#0a0e1a', border: `1px solid ${t.color || '#1a2540'}44`, borderRadius: 10, padding: 16 }}>
                <div style={{ fontFamily: orb, fontSize: 12, fontWeight: 700, letterSpacing: 2, color: t.color || '#e8eaf0', marginBottom: 12 }}>{t.tier_key.toUpperCase()}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
                  <div><label style={lbl}>CURRENCY</label>
                    <select value={t.currency} onChange={e => setT(i, 'currency', e.target.value)} style={inp}>
                      <option value="USD">USD</option><option value="AED">AED</option><option value="EUR">EUR</option>
                    </select>
                  </div>
                  <div><label style={lbl}>MONTHLY</label><input style={inp} type="number" value={t.price_monthly ?? ''} onChange={e => setT(i, 'price_monthly', e.target.value)} /></div>
                  <div><label style={lbl}>WAS (STRIKE)</label><input style={inp} type="number" value={t.was_monthly ?? ''} onChange={e => setT(i, 'was_monthly', e.target.value)} placeholder="—" /></div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                  <div><label style={lbl}>LIFETIME</label><input style={inp} type="number" value={t.price_lifetime ?? ''} onChange={e => setT(i, 'price_lifetime', e.target.value)} placeholder="—" /></div>
                  <div><label style={lbl}>BADGE TAG</label><input style={inp} value={t.tag ?? ''} onChange={e => setT(i, 'tag', e.target.value)} placeholder="MOST POPULAR" /></div>
                </div>
                <div style={{ marginBottom: 8 }}><label style={lbl}>SUB TEXT (under price)</label><input style={inp} value={t.sub_text ?? ''} onChange={e => setT(i, 'sub_text', e.target.value)} /></div>
                <div style={{ marginBottom: 8 }}><label style={lbl}>PAYMENT LINK — MONTHLY</label><input style={inp} value={t.pay_link_monthly ?? ''} onChange={e => setT(i, 'pay_link_monthly', e.target.value)} placeholder="https://pay.ziina.com/..." /></div>
                <div style={{ marginBottom: 8 }}><label style={lbl}>PAYMENT LINK — LIFETIME</label><input style={inp} value={t.pay_link_lifetime ?? ''} onChange={e => setT(i, 'pay_link_lifetime', e.target.value)} placeholder="https://pay.ziina.com/..." /></div>
                <div style={{ marginBottom: 10 }}><label style={lbl}>FEATURES (one per line)</label>
                  <textarea style={{ ...inp, minHeight: 110, resize: 'vertical', fontFamily: raj, fontSize: 13 }} value={t.features_text} onChange={e => setT(i, 'features_text', e.target.value)} />
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button disabled={busy} onClick={() => saveTier(t)} style={{ ...btn('#00ff9f'), flex: 1, opacity: busy ? 0.5 : 1 }}>SAVE {t.tier_key.toUpperCase()}</button>
                  <label style={{ fontFamily: mono, fontSize: 9, color: t.active ? '#00ff9f' : '#ff4d6d', display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
                    <input type="checkbox" checked={!!t.active} onChange={e => setT(i, 'active', e.target.checked)} /> LIVE
                  </label>
                </div>
              </div>
            ))}
          </div>

          {/* PRODUCTS */}
          <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: 4, color: '#ffd166', margin: '10px 0' }}>STORE PRODUCTS (INDICATORS)</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
            {products.map((p, i) => (
              <div key={p.id} style={{ background: '#0a0e1a', border: `1px solid ${PROTECTED_OVERLAY_CODES.has(p.code) ? '#00b4ff44' : '#1a2540'}`, borderRadius: 10, padding: 14 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 3fr 0.7fr auto auto', gap: 8, alignItems: 'end' }} className="prod-row">
                <div><label style={lbl}>NAME {PROTECTED_OVERLAY_CODES.has(p.code) && <span style={{ color: '#00b4ff' }}>· SYSTEM INDICATOR</span>}</label><input style={inp} value={p.name} onChange={e => setP(i, 'name', e.target.value)} /></div>
                <div><label style={lbl}>PRICE</label><input style={inp} type="number" value={p.price ?? ''} onChange={e => setP(i, 'price', e.target.value)} /></div>
                <div><label style={lbl}>CUR</label>
                  <select value={p.currency} onChange={e => setP(i, 'currency', e.target.value)} style={inp}>
                    <option value="USD">USD</option><option value="AED">AED</option><option value="EUR">EUR</option>
                  </select>
                </div>
                <div><label style={lbl}>PAYMENT LINK (HTTPS)</label><input style={inp} value={p.pay_link ?? ''} onChange={e => setP(i, 'pay_link', e.target.value)} placeholder="https://..." /></div>
                <div><label style={lbl}>SORT</label><input style={inp} type="number" value={p.sort ?? 0} onChange={e => setP(i, 'sort', e.target.value)} /></div>
                <button disabled={busy} onClick={() => saveProduct(p)} style={btn('#00ff9f')}>SAVE</button>
                {PROTECTED_OVERLAY_CODES.has(p.code) ? (
                  <label style={{ fontFamily: mono, fontSize: 9, color: p.active ? '#00ff9f' : '#ff4d6d', display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', minHeight: 34 }}><input type="checkbox" checked={!!p.active} onChange={e => setP(i, 'active', e.target.checked)} /> LIVE</label>
                ) : <button disabled={busy} onClick={() => delProduct(p)} style={btn('#ff4d6d')}>DEL</button>}
                </div>
                <div style={{ marginTop: 8 }}><label style={lbl}>DESCRIPTION · CODE: {p.code}</label><input style={inp} value={p.description ?? ''} onChange={e => setP(i, 'description', e.target.value)} /></div>
              </div>
            ))}
          </div>

          {/* ADD PRODUCT */}
          <div style={{ background: '#0a0e1a', border: '1px dashed #1a2540', borderRadius: 10, padding: 14 }}>
            <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: 3, color: '#445566', marginBottom: 10 }}>+ ADD PRODUCT</div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 3fr auto', gap: 8, alignItems: 'end' }} className="prod-row">
              <div><label style={lbl}>NAME</label><input style={inp} value={newProd.name} onChange={e => setNewProd({ ...newProd, name: e.target.value })} placeholder="Panda Scalper v1" /></div>
              <div><label style={lbl}>PRICE</label><input style={inp} type="number" value={newProd.price} onChange={e => setNewProd({ ...newProd, price: e.target.value })} placeholder="300" /></div>
              <div><label style={lbl}>CUR</label>
                <select value={newProd.currency} onChange={e => setNewProd({ ...newProd, currency: e.target.value })} style={inp}>
                  <option value="USD">USD</option><option value="AED">AED</option><option value="EUR">EUR</option>
                </select>
              </div>
              <div><label style={lbl}>PAYMENT LINK</label><input style={inp} value={newProd.pay_link} onChange={e => setNewProd({ ...newProd, pay_link: e.target.value })} placeholder="https://pay.ziina.com/..." /></div>
              <button disabled={busy} onClick={addProduct} style={btn('#00b4ff')}>ADD</button>
            </div>
            <div style={{ marginTop: 8 }}><label style={lbl}>DESCRIPTION</label><input style={inp} value={newProd.description} onChange={e => setNewProd({ ...newProd, description: e.target.value })} placeholder="Short description shown on the pricing page" /></div>
          </div>
        </div>
      </div>
      <style>{`
        * { box-sizing: border-box; }
        body { background: #050810; margin: 0; }
        @media(max-width: 760px) { .prod-row { grid-template-columns: 1fr 1fr !important; } }
      `}</style>
    </>
  );
}
