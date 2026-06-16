import { supabase } from '../../lib/supabase';
import crypto from 'crypto';

const PF_BOT_TOKEN = process.env.PF_BOT_TOKEN || '';
const ADMIN_CHAT_ID = process.env.PF_ADMIN_CHAT || '';
const FREE_TABS = ['overview','signals','calendar','calculator','cot'];

// Payment links — update once pricing is finalized
// const PAYMENT_LINKS = { pro: '...', elite: '...' };

// Set TG_WEBHOOK_SECRET in Vercel env vars, then re-register webhook with:
// https://api.telegram.org/bot<TOKEN>/setWebhook?url=<URL>&secret_token=<SECRET>
const TG_WEBHOOK_SECRET = process.env.TG_WEBHOOK_SECRET || '';

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

  // Validate Telegram webhook secret — blocks non-Telegram POST requests
  if (TG_WEBHOOK_SECRET) {
    const incoming = req.headers['x-telegram-bot-api-secret-token'] || '';
    if (incoming !== TG_WEBHOOK_SECRET) return res.status(403).json({ ok: false });
  }

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
        .select('pending_password, username, notes, status, tier')
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
      } else if (row && row.status === 'PENDING') {
        // Store chat_id so admin can DM after approval
        await supabase.from('pf_signup_requests')
          .update({ telegram_chat_id: chatId })
          .eq('token', token);

        const tier = row.tier || 'pro';
        const dm = [
          '<b>PANDA ENGINE — REQUEST RECEIVED</b>',
          '━━━━━━━━━━━━━━━━━━━━━━',
          `<b>Plan:</b> ${tier.toUpperCase()}`,
          `<b>Username:</b> ${row.username}`,
          '',
          'Your signup is in the queue!',
          'To get approval and payment links, message @panda_engine_alerts_bot',
          '━━━━━━━━━━━━━━━━━━━━━━',
        ].join('\n');
        await pfBotSend(chatId, dm);

        // Notify admin user is on Telegram and ready
        await pfBotSend(ADMIN_CHAT_ID, `📬 <b>USER ON TELEGRAM</b>\n<b>User:</b> ${row.username}\n<b>Tier:</b> ${tier.toUpperCase()}\n<b>Chat ID:</b> ${chatId}\n<i>Ready to receive payment link.</i>`);
      } else if (row) {
        await pfBotSend(chatId, '🐼 Your request is being processed. You\'ll receive your credentials here soon.');
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
        pf_tier: 'starter',
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
        '• Overview • Signals • Calendar • Calculator • COT',
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
