const webpush = require('web-push');

const VAPID_PUBLIC  = process.env.VAPID_PUBLIC  || 'BHkLMm4jcnQUppuN6UNx7b3gK073ZB0l7LHABbT74GrBxt-BeYWyi0LEadsf21Vpx9gO71Mc3TVRy2yTh_MaOsw';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE;
const SB_URL        = process.env.VITE_SB_URL   || 'https://eyyhlcvpyiorpdnvqsll.supabase.co';
const SB_ANON       = process.env.VITE_SB_ANON  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV5eWhsY3ZweWlvcnBkbnZxc2xsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5OTc5MzIsImV4cCI6MjA5NzU3MzkzMn0.UTQnmQGtTehAhfz93uw3KpXOVjR5IC97HKt1SOrg51I';

if (VAPID_PRIVATE) {
  webpush.setVapidDetails('mailto:ismael.angeles.c@gmail.com', VAPID_PUBLIC, VAPID_PRIVATE);
}

async function sbGet(userId) {
  const url = `${SB_URL}/rest/v1/push_subs?user_id=eq.${encodeURIComponent(userId)}&select=user_id,endpoint,p256dh,auth&limit=1`;
  const r = await fetch(url, { headers: { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}` } });
  if (!r.ok) return null;
  const rows = await r.json();
  return rows?.[0] || null;
}

async function sbGetAll() {
  const url = `${SB_URL}/rest/v1/push_subs?select=user_id,endpoint,p256dh,auth`;
  const r = await fetch(url, { headers: { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}` } });
  if (!r.ok) return [];
  return await r.json();
}

async function sbDelete(userId) {
  const url = `${SB_URL}/rest/v1/push_subs?user_id=eq.${encodeURIComponent(userId)}`;
  await fetch(url, { method: 'DELETE', headers: { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}` } }).catch(() => {});
}

async function sendOne(sub, payload) {
  await webpush.sendNotification(
    { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
    payload
  );
}

module.exports = async function handler(req, res) {
  const allowedOrigin = process.env.PUSH_ALLOWED_ORIGIN || '';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Verificar origen: comparación exacta del origin header
  if (allowedOrigin) {
    const origin = req.headers.origin || '';
    let originHost = '';
    try { originHost = new URL(origin).origin; } catch {}
    let allowedHost = '';
    try { allowedHost = new URL(allowedOrigin).origin; } catch { allowedHost = allowedOrigin; }
    if (!origin || originHost !== allowedHost) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  if (!VAPID_PRIVATE) return res.status(500).json({ error: 'Missing VAPID_PRIVATE' });

  const { userId, title, body, tag, url } = req.body || {};
  if (!userId || !title) return res.status(400).json({ error: 'Missing userId or title' });

  const payload = JSON.stringify({ title, body: body || '', tag: tag || 'times', url: url || '/' });

  // Broadcast a todos los suscriptores
  if (userId === '__all__') {
    const subs = await sbGetAll();
    await Promise.allSettled(subs.map(async sub => {
      try {
        await sendOne(sub, payload);
      } catch (err) {
        if (err.statusCode === 410) await sbDelete(sub.user_id);
      }
    }));
    return res.status(200).json({ ok: true, sent: subs.length });
  }

  try {
    const sub = await sbGet(userId);

    if (!sub || !sub.endpoint) {
      return res.status(200).json({ skipped: true, reason: 'no subscription' });
    }

    await sendOne(sub, payload);
    return res.status(200).json({ ok: true });
  } catch (err) {
    if (err.statusCode === 410) {
      await sbDelete(userId);
      return res.status(200).json({ ok: false, reason: 'expired' });
    }
    console.error('[sendpush]', err.statusCode, err.body || err.message);
    return res.status(500).json({ error: err.message });
  }
};
