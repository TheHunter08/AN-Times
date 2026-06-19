const webpush = require('web-push');

const VAPID_PUBLIC  = process.env.VAPID_PUBLIC || 'BI4uEES76cujGjvpJ68hIKD4jeZfBUAHTmV9DTTbpnd91jAzld1iv_aeN9PkgKJ46J9m_r7GkvoiCeyOcsmm8q4';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE;
const FB_BASE       = 'https://times-inc-default-rtdb.europe-west1.firebasedatabase.app';
const FB_AUTH       = process.env.FIREBASE_DB_AUTH_TOKEN;

if (VAPID_PRIVATE) {
  webpush.setVapidDetails('mailto:ismael.angeles.c@gmail.com', VAPID_PUBLIC, VAPID_PRIVATE);
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.PUSH_ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Push-Key');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.PUSH_API_KEY || req.headers['x-push-key'] !== process.env.PUSH_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!VAPID_PRIVATE) return res.status(500).json({ error: 'Missing VAPID_PRIVATE' });
  if (!FB_AUTH) return res.status(500).json({ error: 'Missing FIREBASE_DB_AUTH_TOKEN' });

  const { userId, title, body, tag, url } = req.body || {};
  if (!userId || !title) return res.status(400).json({ error: 'Missing userId or title' });

  try {
    const fbRes = await fetch(`${FB_BASE}/pushSubs/${encodeURIComponent(userId)}.json?auth=${encodeURIComponent(FB_AUTH)}`);
    const sub = await fbRes.json();

    if (!sub || !sub.endpoint) {
      return res.status(200).json({ skipped: true, reason: 'no subscription' });
    }

    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: sub.keys },
      JSON.stringify({ title, body: body || '', tag: tag || 'times', url: url || '/' })
    );

    return res.status(200).json({ ok: true });
  } catch (err) {
    if (err.statusCode === 410) {
      await fetch(`${FB_BASE}/pushSubs/${encodeURIComponent(userId)}.json?auth=${encodeURIComponent(FB_AUTH)}`, { method: 'DELETE' }).catch(() => {});
      return res.status(200).json({ ok: false, reason: 'expired' });
    }
    console.error('[sendpush]', err.statusCode, err.body || err.message);
    return res.status(500).json({ error: err.message });
  }
};
