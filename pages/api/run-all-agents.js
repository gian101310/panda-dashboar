// Run All Agents — orchestrates Signal, Journal, and Pattern agents in parallel

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.NEXTAUTH_URL || `http://localhost:${process.env.PORT || 3000}`;

  const agents = [
    { name: 'Signal Agent', endpoint: '/api/signal-agent' },
    { name: 'Journal Agent', endpoint: '/api/journal-agent' },
    { name: 'Pattern Agent', endpoint: '/api/pattern-agent' },
  ];

  const totalStart = Date.now();

  const results = await Promise.allSettled(
    agents.map(async (agent) => {
      const start = Date.now();
      try {
        const r = await fetch(`${baseUrl}${agent.endpoint}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(req.headers.cookie ? { cookie: req.headers.cookie } : {}),
          },
        });
        const data = await r.json();
        const duration_ms = Date.now() - start;
        if (!r.ok) {
          return { agent: agent.name, status: 'error', error: data.error || `HTTP ${r.status}`, duration_ms };
        }
        return { agent: agent.name, status: 'success', duration_ms, ...data };
      } catch (err) {
        return { agent: agent.name, status: 'error', error: err.message, duration_ms: Date.now() - start };
      }
    })
  );

  const agentResults = results.map((r) =>
    r.status === 'fulfilled' ? r.value : { agent: 'Unknown', status: 'error', error: r.reason?.message || 'Promise rejected', duration_ms: 0 }
  );

  return res.status(200).json({
    agents: agentResults,
    total_duration_ms: Date.now() - totalStart,
    ran_at: new Date().toISOString(),
  });
}
