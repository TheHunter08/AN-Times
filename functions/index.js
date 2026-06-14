const { onValueCreated } = require('firebase-functions/v2/database');
const { initializeApp } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
const webpush = require('web-push');

initializeApp();

// VAPID keys — must match the public key in index.html
const VAPID_PUBLIC  = 'BJLsu9gt57Oa3uflEpMVUfRXgawp49vhtgdMjU6nzb9zOjWgSxIxuuFQVe6z_uiNXNPUwbCPqUHUoZk_iVmjNfQ';
const VAPID_PRIVATE = 'fvQg0fFEkOoUGLdOfUkdZ4uI2k7vv6bmUPqbChZSOnE';

webpush.setVapidDetails('mailto:ismael.angeles.c@gmail.com', VAPID_PUBLIC, VAPID_PRIVATE);

exports.sendPush = onValueCreated(
  { ref: '/pushQueue/{pushId}', region: 'europe-west1', instance: 'times-inc-default-rtdb' },
  async (event) => {
    const data = event.data.val();
    if (!data || !data.userId) return null;

    const db = getDatabase();
    const subSnap = await db.ref('pushSubs/' + data.userId).get();
    const sub = subSnap.val();

    if (!sub || !sub.endpoint) {
      // No subscription stored — delete task and exit
      await event.data.ref.remove();
      return null;
    }

    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: sub.keys },
        JSON.stringify({ title: data.title || 'TIMES INC', body: data.body || '', tag: data.tag || 'times' })
      );
    } catch (err) {
      // 410 Gone = subscription expired, remove it
      if (err.statusCode === 410) {
        await db.ref('pushSubs/' + data.userId).remove();
      }
      console.error('[PUSH] sendNotification failed:', err.statusCode, err.body);
    }

    await event.data.ref.remove();
    return null;
  }
);
