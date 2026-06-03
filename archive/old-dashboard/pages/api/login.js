import { serialize } from 'cookie';

const USERS = {
  admin: '1234',
  user1: 'pass1',
};

export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Missing credentials' });
  }

  if (USERS[username] && USERS[username] === password) {
    const token = Buffer.from(`${username}:${Date.now()}`).toString('base64');

    res.setHeader(
      'Set-Cookie',
      serialize('panda_session', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 8, // 8 hours
        path: '/',
      })
    );

    return res.status(200).json({ ok: true });
  }

  return res.status(401).json({ error: 'Invalid credentials' });
}
