import { supabase } from '../../lib/supabase';
import crypto from 'crypto';

const PF_BOT_TOKEN = '8605294552:AAG2o7bF30qkZx0Zv_FgmwA0RgS7g56OH7Y';
const ADMIN_CHAT_ID = '5379148910';
const FREE_TABS = ['signals','gap_chart','calendar','calculator'];

function hashPassword(password) {
  return crypto.createHash('sha256').update(password + 'panda_salt_2026').digest('hex');
}

function generatePassword() {
  return 'panda_' + crypto.randomBytes(3).toString('hex');
}

async function pfBotSend(chatId, text) {
  await fetch(`https://api.telegram.org/bot${PF_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true })
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).json({ ok: true });

  try {
    const message = req.body?.message;
    if (!message) return res.status(200).json({ ok: true });

    const chatId = String(message.chat?.id || '');
    const text   = (message.text || '').trim();

    if (!text.startsWith('/start') || !chatId) {
      return res.status(200).json({ ok: true });
    }

    const token = text.replace('/start', '').trim();

    if (token) {
      // ===== DEEP LINK — existing Pro/Elite signup flow =====
      const { data: row } = await supabase.from('pf_signup_requests')
        .select('pending_password, username, notes, status')
        .eq('token', token)
        .maybeSingle();

      if (row?.pending_password) {
        const tier = row.status === 'AUTO' ? 'STARTER' : 'APPROVED';
        const dm = [
          '✅ <b>PANDA ENGINE — ACCESS APPROVED</b>',
          '━━━━━━━━━━━━━━━━━━━━━━',
          `<b>Username:</b> ${row.username}`,
          `<b>Password:</b> ${row.pending_password}`,
          `<b>Tier:</b> ${tier}`,
          '━━━━━━━━━━━━━━━━━━━━━━',
          '🔗 <a href="https://pandaengine.app/login">Login Now</a>',
        ].join('\n');
        await pfBotSend(chatId, dm);
        await supabase.from('pf_signup_requests')
          .update({ pending_password: null })
          .eq('token', token);
      } else if (row) {
        await pfBotSend(chatId, '🐼 Your account is pending approval. Credentials will be sent here once approved.');
      } else {
        await pfBotSend(chatId, '🐼 Invalid link. Visit pandaengine.app/pricing to sign up.');
      }

    } else {
      // ===== PLAIN /start — Auto Free Trial Signup =====

      // 1. Check if already has account
      const { data: existing } = await supabase.from('panda_users')
        .select('username, plain_password, expires_at')
        .eq('telegram_chat_id', chatId)
        .maybeSingle();

      if (existing) {
        const expStr = existing.expires_at ? new Date(existing.expires_at).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }) : 'N/A';
        const dm = [
          '🐼 <b>You already have an account!</b>',
          '━━━━━━━━━━━━━━━━━━━━━━',
          `👤 <b>Username:</b> ${existing.username}`,
          `🔑 <b>Password:</b> ${existing.plain_password || '(hidden)'}`,
          `⏰ <b>Trial expires:</b> ${expStr}`,
          '━━━━━━━━━━━━━━━━━━━━━━',
          '🔗 <a href="https://pandaengine.app/login">Login Now</a>',
        ].join('\n');
        await pfBotSend(chatId, dm);
        return res.status(200).json({ ok: true });
      }

      // 2. Generate username from Telegram name
      const firstName = (message.from?.first_name || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      const tgHandle = (message.from?.username || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      let baseUser = firstName || tgHandle || 'user';
      const suffix = crypto.randomBytes(2).toString('hex').slice(0, 3);
      const username = `${baseUser}_${suffix}`;

      // 3. Generate password + hash
      const plainPw = generatePassword();
      const pwHash = hashPassword(plainPw);

      // 4. Set 7-day trial expiry
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const expDisplay = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });

      // 5. Insert user
      const { error: insertErr } = await supabase.from('panda_users').insert({
        username,
        password_hash: pwHash,
        plain_password: plainPw,
        role: 'user',
        pf_tier: 'free',
        pf_approved: true,
        is_active: true,
        feature_access: FREE_TABS,
        telegram_chat_id: chatId,
        expires_at: expiresAt,
        notes: 'Telegram auto-signup',
        max_devices: 1,
      });

      if (insertErr) {
        if (insertErr.code === '23505') {
          await pfBotSend(chatId, '🐼 Account already exists. Contact admin if you need help.');
        } else {
          console.error('[TG SIGNUP ERROR]', insertErr);
          await pfBotSend(chatId, '🐼 Something went wrong. Try again or contact admin.');
        }
        return res.status(200).json({ ok: true });
      }

      // 6. Send credentials to user
      const dm = [
        '🐼 <b>Welcome to Panda Engine!</b>',
        '',
        'Your <b>FREE 7-day trial</b> account is ready.',
        '━━━━━━━━━━━━━━━━━━━━━━',
        `👤 <b>Username:</b> ${username}`,
        `🔑 <b>Password:</b> ${plainPw}`,
        `⏰ <b>Trial expires:</b> ${expDisplay}`,
        '━━━━━━━━━━━━━━━━━━━━━━',
        '📊 <b>You have access to:</b>',
        '• Signals • Gap Chart • Research • Calculator',
        '',
        '🔗 <a href="https://pandaengine.app/login">Login Now</a>',
        '',
        '⚠️ Save this message — your password won\'t be shown again.',
        'Upgrade anytime at pandaengine.app/pricing',
      ].join('\n');
      await pfBotSend(chatId, dm);

      // 7. Admin notification
      const adminMsg = [
        '🆕 <b>New Free Signup</b>',
        `👤 ${username}`,
        `📱 Telegram: @${message.from?.username || 'unknown'}`,
        `⏰ Trial ends: ${expDisplay}`,
      ].join('\n');
      await pfBotSend(ADMIN_CHAT_ID, adminMsg);
    }
  } catch (e) {
    console.error('[TG WEBHOOK]', e);
  }
  return res.status(200).json({ ok: true });
}
