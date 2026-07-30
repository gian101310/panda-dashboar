// Run All Agents — calls Signal, Journal, Pattern, and Signal v2 agent handlers directly (no HTTP round-trip)
import signalHandler from './signal-agent';
import journalHandler from './journal-agent';
import patternHandler from './pattern-agent';
import signalV2Handler from './signal-agent-v2';
import { requireAdmin } from '../../lib/auth';

// Vercel Pro: allow up to 60s for all 3 agents
export const config = { maxDuration: 60 };

function mockReqRes(method, cookies) {
  const req = { method, headers: {}, body: {}, cookies: cookies || {} };
  let _status = 200;
  let _body = null;
  const res = {
    status(code) { _status = code; return res; },
    json(data) { _body = data; return res; },
    getResult() { return { status: _status, body: _body }; },
  };
  return { req, res };
}

async function runAgent(name, handlerFn, cookies) {
  const start = Date.now();
  try {
    const { req, res } = mockReqRes('POST', cookies);
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
  const admin = await requireAdmin(req);
  if (!admin) return res.status(403).json({ error: 'Admin only' });

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cookies = req.cookies || {};
  const totalStart = Date.now();

  const agents = await Promise.all([
    runAgent('Signal Agent', signalHandler, cookies),
    runAgent('Journal Agent', journalHandler, cookies),
    runAgent('Pattern Agent', patternHandler, cookies),
    runAgent('Signal Agent v2', signalV2Handler, cookies),
  ]);

  return res.status(200).json({
    agents,
    total_duration_ms: Date.now() - totalStart,
    ran_at: new Date().toISOString(),
  });
}
