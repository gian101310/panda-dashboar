import '../styles/globals.css';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';

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

export default function App({ Component, pageProps }) {
  const router = useRouter();
  const [maintenance, setMaintenance] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    // Skip maintenance check for API routes (they handle their own auth)
    if (router.pathname.startsWith('/api')) {
      setChecked(true);
      return;
    }

    async function checkMaintenance() {
      try {
        const mRes = await fetch('/api/maintenance');
        const mData = await mRes.json();

        if (mData.maintenance) {
          setMaintenance(true);
          // Check if user is admin
          try {
            const uRes = await fetch('/api/me');
            if (uRes.ok) {
              const uData = await uRes.json();
              if (uData.role === 'admin') setIsAdmin(true);
            }
          } catch {}
        }
      } catch {}
      setChecked(true);
    }

    checkMaintenance();
  }, [router.pathname]);

  // Still checking — show nothing (prevents flash)
  if (!checked) return null;

  // Maintenance is on, user is NOT admin, and NOT on login page
  if (maintenance && !isAdmin && router.pathname !== '/login') {
    return <MaintenanceScreen />;
  }

  return <Component {...pageProps} />;
}
