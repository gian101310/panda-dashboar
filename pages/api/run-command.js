import { validateSession } from '../../lib/auth';
import { exec } from 'child_process';
import { resolve } from 'path';

/**
 * Run Command API — executes npm scripts from the Guardian page.
 * Only works locally (not on Vercel) since it needs cTrader MCP.
 *
 * POST /api/run-command
 * body: { command: "account:guardian -- --write" }
 */

const ALLOWED_COMMANDS = [
  'auto:loop',
  'auto:loop -- --daemon',
  'auto:loop -- --mode=AUTO',
  'auto:loop -- --mode=MANUAL',
  'account:guardian -- --write',
  'chart:annotate -- --draw',
  'execute:engine-pb -- --approve',
  'market:order -- --approve',
  'killswitch -- --confirm',
  'breakeven -- --approve',
  'journal:sync -- --write',
  'alerts -- --apply',
  'account:report',
  'scan:symbols -- --quotes',
  'plot:engine-pb',
];

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  // Block on Vercel — exec() only works locally
  if (process.env.VERCEL) {
    return res.status(400).json({ error: 'Commands only work on localhost. Open http://localhost:3001/guardian' });
  }

  // Skip auth on localhost, require admin on production
  const host = req.headers.host || '';
  const isLocal = host.startsWith('localhost') || host.startsWith('127.0.0.1');
  if (!isLocal) {
    const token = req.cookies?.panda_session;
    const session = await validateSession(token);
    if (!session) return res.status(401).json({ error: 'Unauthorized' });
    if (session.panda_users?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  }

  const { command } = req.body || {};
  if (!command) return res.status(400).json({ error: 'command required' });

  // Security: only allow whitelisted npm run commands
  if (!ALLOWED_COMMANDS.includes(command)) {
    return res.status(403).json({ error: `Command not allowed: ${command}` });
  }

  const fullCommand = `npm run ${command}`;
  const cwd = resolve(process.cwd());

  try {
    const output = await new Promise((resolve, reject) => {
      exec(fullCommand, { cwd, timeout: 60000 }, (err, stdout, stderr) => {
        if (err && err.killed) return reject(new Error('TIMEOUT'));
        resolve({ stdout: stdout || '', stderr: stderr || '', exitCode: err?.code || 0 });
      });
    });

    return res.status(200).json({
      success: output.exitCode === 0,
      command: fullCommand,
      output: output.stdout.slice(-2000), // last 2000 chars
      error: output.stderr.slice(-500),
      exitCode: output.exitCode,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message, command: fullCommand });
  }
}
