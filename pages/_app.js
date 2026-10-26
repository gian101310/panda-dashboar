import '../styles/globals.css';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import {
  DEFAULT_PAGE_VISIBILITY,
  getPageAccessDecision,
  ROUTE_TO_PAGE_KEY,
} from '../lib/pageVisibility.mjs';

async function fetchAccess(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    return await fetch(url, { signal: controller.signal, cache: 'no-store' });
  } finally {
    clearTimeout(timer);
  }
}

function CheckingAccessScreen() {
  return <div style={{minHeight:'100vh',background:'#0a0a14',display:'flex',alignItems:'center',justifyContent:'center',color:'#8892b0',fontFamily:"'Share Tech Mono',monospace",fontSize:12,letterSpacing:2}}>CHECKING ACCESS...</div>;
}

function MaintenanceScreen() {
  return (
    <>
      <Head><title>PANDA ENGINE — Maintenance</title></Head>
      <div style={{minHeight:'100vh',background:'#0a0a14',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:"'Share Tech Mono',monospace"}}>
        <div style={{textAlign:'center',maxWidth:440,padding:40}}>
          <div style={{fontSize:48,marginBottom:16}}>🐼</div>
          <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:20,fontWeight:900,color:'#ffaa44',letterSpacing:6,marginBottom:12}}>MAINTENANCE MODE</div>
          <div style={{fontSize:12,color:'#8892b0',lineHeight:1.8,marginBottom:24}}>
            Panda Engine is temporarily offline for maintenance.<br/>
            We&apos;ll be back shortly. Thanks for your patience.
          </div>
          <div style={{width:60,height:2,background:'linear-gradient(90deg,transparent,#ffaa44,transparent)',margin:'0 auto 24px',borderRadius:2}}/>
          <div style={{fontSize:9,color:'#4a5568',letterSpacing:3}}>SYSTEM OFFLINE</div>
          <button type="button" onClick={() => window.location.reload()} style={{display:'inline-block',marginTop:22,padding:'10px 16px',border:'1px solid #8892b066',borderRadius:6,background:'transparent',color:'#8892b0',fontSize:11,letterSpacing:2,cursor:'pointer'}}>RETRY</button>
          <a href="/admin-login" style={{display:'inline-block',marginTop:22,padding:'10px 16px',border:'1px solid #ffaa4466',borderRadius:6,color:'#ffaa44',fontSize:11,letterSpacing:2,textDecoration:'none'}}>ADMIN ACCESS</a>
        </div>
      </div>
    </>
  );
}

function ComingSoonScreen() {
  return (
    <>
      <Head><title>PANDA ENGINE — Coming Soon</title></Head>
      <div style={{minHeight:'100vh',background:'#0a0a14',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:"'Share Tech Mono',monospace"}}>
        <div style={{textAlign:'center',maxWidth:440,padding:40}}>
          <div style={{fontSize:48,marginBottom:16}}>🐼</div>
          <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:20,fontWeight:900,color:'#7C3AED',letterSpacing:6,marginBottom:12}}>COMING SOON</div>
          <div style={{fontSize:12,color:'#8892b0',lineHeight:1.8,marginBottom:24}}>
            This page is not yet available.<br/>
            Check back soon for updates.
          </div>
          <div style={{width:60,height:2,background:'linear-gradient(90deg,transparent,#7C3AED,transparent)',margin:'0 auto 24px',borderRadius:2}}/>
          <div style={{fontSize:9,color:'#4a5568',letterSpacing:3}}>PAGE DISABLED</div>
        </div>
      </div>
    </>
  );
}

export default function App({ Component, pageProps }) {
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [accessDecision, setAccessDecision] = useState('checking');

  useEffect(() => {
    let cancelled = false;
    // Skip checks for API routes (they handle their own auth)
    if (router.pathname.startsWith('/api')) {
      setChecked(true);
      setAccessDecision('allow');
      return;
    }

    async function checkAccess() {
      let isAdmin = false;
      let hasMaintBypass = false;
      let maintenanceEnabled = false;
      let maintenanceKnown = false;
      let visibility = DEFAULT_PAGE_VISIBILITY;
      let hasAdminLoginAccess = false;
      const pageKey = ROUTE_TO_PAGE_KEY[router.pathname];
      const isAdminMaintenanceEntry = router.pathname === '/admin-login';
      if (isAdminMaintenanceEntry) {
        if (!cancelled) {
          setAccessDecision('allow');
          setChecked(true);
        }
        return;
      }

      // 1) Check who the user is (if logged in)
      try {
        const uRes = await fetchAccess('/api/me');
        if (uRes.ok) {
          const uData = await uRes.json();
          if (uData.role === 'admin') isAdmin = true;
          if (uData.maintenance_bypass === true) hasMaintBypass = true;
        }
      } catch {}

      // 2) Maintenance check
      try {
        const mRes = await fetchAccess('/api/maintenance');
        if (mRes.ok) {
          const mData = await mRes.json();
          maintenanceEnabled = mData.maintenance === true;
          maintenanceKnown = true;
        }
      } catch {}

      if (pageKey === 'login') {
        try {
          const accessRes = await fetchAccess('/api/admin-maintenance-access');
          if (accessRes.ok) {
            const accessData = await accessRes.json();
            hasAdminLoginAccess = accessData.allowed === true;
          }
        } catch {}
      }

      // 3) Page visibility check (only for public-facing pages)
      if (pageKey && maintenanceKnown && !maintenanceEnabled) {
        try {
          const pvRes = await fetchAccess('/api/page-visibility-public');
          if (pvRes.ok) {
            const pv = await pvRes.json();
            visibility = pv;
          }
        } catch {}
      }

      if (cancelled) return;
      setAccessDecision(getPageAccessDecision({
        isAdmin,
        hasMaintenanceBypass: hasMaintBypass,
        hasAdminLoginAccess,
        maintenanceEnabled: maintenanceEnabled || !maintenanceKnown,
        pageKey,
        visibility,
      }));
      setChecked(true);
    }

    setAccessDecision('checking');
    checkAccess();
    return () => { cancelled = true; };
  }, [router.pathname]);

  if (!checked || accessDecision === 'checking') return <CheckingAccessScreen />;
  if (accessDecision === 'maintenance') return <MaintenanceScreen />;
  if (accessDecision === 'coming_soon') return <ComingSoonScreen />;

  return <Component {...pageProps} />;
}
