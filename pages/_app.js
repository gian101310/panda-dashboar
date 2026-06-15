import '../styles/globals.css';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { ROUTE_TO_PAGE_KEY } from '../lib/pageVisibility.mjs';

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
  const [maintenance, setMaintenance] = useState(false);
  const [canBypass, setCanBypass] = useState(false);
  const [pageBlocked, setPageBlocked] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    // Skip checks for API routes (they handle their own auth)
    if (router.pathname.startsWith('/api')) {
      setChecked(true);
      return;
    }

    async function checkAccess() {
      let isAdmin = false;
      let hasMaintBypass = false;

      // 1) Check who the user is (if logged in)
      try {
        const uRes = await fetch('/api/me');
        if (uRes.ok) {
          const uData = await uRes.json();
          if (uData.role === 'admin') isAdmin = true;
          if (uData.maintenance_bypass === true) hasMaintBypass = true;
        }
      } catch {}

      // Admins skip ALL gates
      if (isAdmin) {
        setChecked(true);
        return;
      }

      // 2) Maintenance check
      try {
        const mRes = await fetch('/api/maintenance');
        const mData = await mRes.json();
        if (mData.maintenance) {
          setMaintenance(true);
          if (hasMaintBypass) setCanBypass(true);
          // If maintenance is on and user can't bypass, stop here
          if (!hasMaintBypass) {
            setChecked(true);
            return;
          }
        }
      } catch {}

      // 3) Page visibility check (only for public-facing pages)
      const pageKey = ROUTE_TO_PAGE_KEY[router.pathname];
      if (pageKey) {
        try {
          const pvRes = await fetch('/api/page-visibility-public');
          if (pvRes.ok) {
            const pv = await pvRes.json();
            // If bypass is ON, all pages are open
            if (!pv.bypass_enabled) {
              // Bypass OFF — check individual page toggle
              if (pv[pageKey] === false) {
                setPageBlocked(true);
              }
            }
          }
        } catch {}
      }

      setChecked(true);
    }

    checkAccess();
  }, [router.pathname]);

  // Still checking — show nothing (prevents flash)
  if (!checked) return null;

  // Maintenance is on, user can NOT bypass, and NOT on login page
  if (maintenance && !canBypass && router.pathname !== '/login') {
    return <MaintenanceScreen />;
  }

  // Page is toggled OFF for visitors
  if (pageBlocked && router.pathname !== '/login') {
    return <ComingSoonScreen />;
  }

  return <Component {...pageProps} />;
}
