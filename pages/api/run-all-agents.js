// Run All Agents — calls Signal, Journal, and Pattern agent handlers directly (no HTTP round-trip)
import signalHandler from './signal-agent';
import journalHandler from './journal-agent';
import patternHandler from './pattern-agent';

// Vercel Pro: allow up to 60s for all 3 agents
export const config = { maxDuration: 60 };

function mockReqRes(method) {
  const req = { method, headers: {}, body: {} };
  let _status = 200;
  let _body = null;
  const res = {
    status(code) { _status = code; return res; },
    json(data) { _body = data; return res; },
    getResult() { return { status: _status, body: _body }; },
  };
  return { req, res };
}

async function runAgent(name, handlerFn) {
  const start = Date.now();
  try {
    const { req, res } = mockReqRes('POST');
    await handlerFn(req, res);
    const { status, body } = res.getResult();
    const duration_ms = Date.now() - start;
    if (status >= 400) {
      return { agent: name, status: 'error', error: body?.error || `Status ${status}`, duration_ms };
    }
    return { agent: name, status: 'success', duration_ms, ...body };
  } catch (err) {
    return { agent: name, status: 'error', error: err.message, duration_ms: Date.now() - start };
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const totalStart = Date.now();

  const agents = await Promise.all([
    runAgent('Signal Agent', signalHandler),
    runAgent('Journal Agent', journalHandler),
    runAgent('Pattern Agent', patternHandler),
  ]);

  return res.status(200).json({
    agents,
    total_duration_ms: Date.now() - totalStart,
    ran_at: new Date().toISOString(),
  });
}
