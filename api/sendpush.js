const webpush = require('web-push');

const VAPID_PUBLIC  = 'BJLsu9gt57Oa3uflEpMVUfRXgawp49vhtgdMjU6nzb9zOjWgSxIxuuFQVe6z_uiNXNPUwbCPqUHUoZk_iVmjNfQ';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE || 'fvQg0fFEkOoUGLdOfUkdZ4uI2k7vv6bmUPqbChZSOnE';
const FB_BASE       = 'https://times-inc-default-rtdb.europe-west1.firebasedatabase.app';

webpush.setVapidDetails('mailto:ismael.angeles.c@gmail.com', VAPID_PUBLIC, VAPID_PRIVATE);

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { userId, title, body, tag } = req.body || {};
  if (!userId || !title) return res.status(400).json({ error: 'Missing userId or title' });

  try {
    const fbRes = await fetch(`${FB_BASE}/pushSubs/${encodeURIComponent(userId)}.json`);
    const sub = await fbRes.json();

    if (!sub || !sub.endpoint) {
      return res.status(200).json({ skipped: true, reason: 'no subscription' });
    }

    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: sub.keys },
      JSON.stringify({ title, body: body || '', tag: tag || 'times' })
    );

    return res.status(200).json({ ok: true });
  } catch (err) {
    if (err.statusCode === 410) {
      await fetch(`${FB_BASE}/pushSubs/${encodeURIComponent(userId)}.json`, { method: 'DELETE' }).catch(() => {});
      return res.status(200).json({ ok: false, reason: 'expired' });
    }
    console.error('[sendpush]', err.statusCode, err.body || err.message);
    return res.status(500).json({ error: err.message });
  }
};
