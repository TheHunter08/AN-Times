const webpush = require('web-push');

// ── In-memory rate limiter (per IP): max 30 requests per minute ──────────────
const _rl = new Map()
function rateLimit(ip) {
  const now = Date.now()
  const window = 60_000
  const max = 30
  const entry = _rl.get(ip) || { count: 0, reset: now + window }
  if (now > entry.reset) { entry.count = 0; entry.reset = now + window }
  entry.count++
  _rl.set(ip, entry)
  // Cleanup old entries periodically
  if (_rl.size > 2000) { for (const [k, v] of _rl) { if (now > v.reset) _rl.delete(k) } }
  return entry.count > max
}

const toB64Url = s => (s || '').replace(/\s+/g, '').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const VAPID_PUBLIC  = toB64Url(process.env.VAPID_PUBLIC)  || 'BJLsu9gt57Oa3uflEpMVUfRXgawp49vhtgdMjU6nzb9zOjWgSxIxuuFQVe6z_uiNXNPUwbCPqUHUoZk_iVmjNfQ';
const VAPID_PRIVATE = toB64Url(process.env.VAPID_PRIVATE) || 'fvQg0fFEkOoUGLdOfUkdZ4uI2k7vv6bmUPqbChZSOnE';
const SB_URL        = process.env.VITE_SB_URL  || 'https://eyyhlcvpyiorpdnvqsll.supabase.co';
const SB_ANON       = process.env.VITE_SB_ANON || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV5eWhsY3ZweWlvcnBkbnZxc2xsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5OTc5MzIsImV4cCI6MjA5NzU3MzkzMn0.UTQnmQGtTehAhfz93uw3KpXOVjR5IC97HKt1SOrg51I';
const PUSH_SECRET   = process.env.PUSH_SECRET;   // shared secret — requerido si está configurado

webpush.setVapidDetails('mailto:ismael.angeles.c@gmail.com', VAPID_PUBLIC, VAPID_PRIVATE);

async function sbGet(userId) {
  if (!SB_URL || !SB_ANON) return null;
  const url = `${SB_URL}/rest/v1/push_subs?user_id=eq.${encodeURIComponent(userId)}&select=user_id,endpoint,p256dh,auth&order=updated_at.desc&limit=1`;
  const r = await fetch(url, { headers: { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}` } });
  if (!r.ok) return null;
  const rows = await r.json();
  return rows?.[0] || null;
}

async function sbGetAll() {
  if (!SB_URL || !SB_ANON) return [];
  const url = `${SB_URL}/rest/v1/push_subs?select=user_id,endpoint,p256dh,auth`;
  const r = await fetch(url, { headers: { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}` } });
  if (!r.ok) return [];
  return await r.json();
}

async function sbDelete(userId) {
  if (!SB_URL || !SB_ANON) return;
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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Rate limiting
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown'
  if (rateLimit(ip)) return res.status(429).json({ error: 'Too many requests' });

  // Autenticación: si PUSH_SECRET está configurado, exigir el header correcto
  if (PUSH_SECRET) {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (token !== PUSH_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

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

  if (!SB_URL || !SB_ANON) return res.status(500).json({ error: 'Missing Supabase config (VITE_SB_URL / VITE_SB_ANON)' });

  const { userId, title, body, tag, url } = req.body || {};
  if (!userId || !title) return res.status(400).json({ error: 'Missing userId or title' });

  // Sanitize url: must be a relative path (no external redirects)
  const safeUrl = typeof url === 'string' && url.startsWith('/') ? url : '/';
  const payload = JSON.stringify({ title, body: body || '', tag: tag || 'times', url: safeUrl });

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
