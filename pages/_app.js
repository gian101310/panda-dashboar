import '../styles/globals.css';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import {
  DEFAULT_PAGE_VISIBILITY,
  getPageAccessDecision,
  ROUTE_TO_PAGE_KEY,
} from '../lib/pageVisibility.mjs';

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
      let visibility = DEFAULT_PAGE_VISIBILITY;
      let hasAdminLoginAccess = false;
      const pageKey = ROUTE_TO_PAGE_KEY[router.pathname];
      const isAdminMaintenanceEntry = router.pathname === '/admin-login';

      // 1) Check who the user is (if logged in)
      try {
        const uRes = await fetch('/api/me');
        if (uRes.ok) {
          const uData = await uRes.json();
          if (uData.role === 'admin') isAdmin = true;
          if (uData.maintenance_bypass === true) hasMaintBypass = true;
        }
      } catch {}

      // 2) Maintenance check
      try {
        const mRes = await fetch('/api/maintenance');
        if (mRes.ok) {
          const mData = await mRes.json();
          maintenanceEnabled = mData.maintenance === true;
        }
      } catch {}

      if (pageKey === 'login') {
        try {
          const accessRes = await fetch('/api/admin-maintenance-access');
          if (accessRes.ok) {
            const accessData = await accessRes.json();
            hasAdminLoginAccess = accessData.allowed === true;
          }
        } catch {}
      }

      // 3) Page visibility check (only for public-facing pages)
      if (pageKey) {
        try {
          const pvRes = await fetch('/api/page-visibility-public');
          if (pvRes.ok) {
            const pv = await pvRes.json();
            visibility = pv;
          }
        } catch {}
      }

      setAccessDecision(isAdminMaintenanceEntry ? 'allow' : getPageAccessDecision({
        isAdmin,
        hasMaintenanceBypass: hasMaintBypass,
        hasAdminLoginAccess,
        maintenanceEnabled,
        pageKey,
        visibility,
      }));
      setChecked(true);
    }

    setAccessDecision('checking');
    checkAccess();
  }, [router.pathname]);

  if (!checked || accessDecision === 'checking') return null;
  if (accessDecision === 'maintenance') return <MaintenanceScreen />;
  if (accessDecision === 'coming_soon') return <ComingSoonScreen />;

  return <Component {...pageProps} />;
}
