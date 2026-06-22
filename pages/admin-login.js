import { useState } from 'react';
import Head from 'next/head';

export default function AdminMaintenanceLogin() {
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/admin-maintenance-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      });
      if (!response.ok) {
        setError('Access key rejected.');
        return;
      }
      window.location.href = '/login';
    } catch {
      setError('Unable to verify the access key.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Head><title>PANDA ENGINE — Admin Access</title><meta name="robots" content="noindex,nofollow" /></Head>
      <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#050810', padding: 20 }}>
        <form onSubmit={submit} style={{ width: '100%', maxWidth: 360, padding: 28, borderRadius: 12, border: '1px solid #1a2540', background: '#0a0e1a', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontFamily: "'Orbitron',sans-serif", color: '#ffd166', fontSize: 16, letterSpacing: 3 }}>ADMIN ACCESS</div>
          <div style={{ fontFamily: "'Share Tech Mono',monospace", color: '#8892b0', fontSize: 11, lineHeight: 1.6 }}>Enter the maintenance access key to reach the administrator sign-in.</div>
          <input aria-label="Maintenance access key" type="password" required value={key} onChange={(event) => setKey(event.target.value)} style={{ background: '#050810', border: '1px solid #1a2540', borderRadius: 6, color: '#e8eaf0', padding: '12px', fontFamily: "'Share Tech Mono',monospace" }} />
          {error && <div style={{ color: '#ff4d6d', fontFamily: "'Share Tech Mono',monospace", fontSize: 11 }}>{error}</div>}
          <button type="submit" disabled={loading} style={{ border: '1px solid #ffd166', borderRadius: 6, background: 'rgba(255,209,102,0.1)', color: '#ffd166', padding: '11px', fontFamily: "'Share Tech Mono',monospace", letterSpacing: 2, cursor: loading ? 'wait' : 'pointer' }}>{loading ? 'VERIFYING...' : 'UNLOCK ADMIN LOGIN'}</button>
        </form>
      </main>
    </>
  );
}
