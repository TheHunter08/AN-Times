const { onValueCreated } = require('firebase-functions/v2/database');
const { initializeApp } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
const webpush = require('web-push');

initializeApp();

const VAPID_PUBLIC  = process.env.VAPID_PUBLIC || 'BI4uEES76cujGjvpJ68hIKD4jeZfBUAHTmV9DTTbpnd91jAzld1iv_aeN9PkgKJ46J9m_r7GkvoiCeyOcsmm8q4';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE;

if (VAPID_PRIVATE) {
  webpush.setVapidDetails('mailto:ismael.angeles.c@gmail.com', VAPID_PUBLIC, VAPID_PRIVATE);
}

async function sendToSubscription(db, userId, sub, data) {
  if (!sub || !sub.endpoint) return;
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: sub.keys },
      JSON.stringify({
        title: data.title || 'TIMES INC',
        body: data.body || '',
        tag: data.tag || 'times',
        url: data.url || '/',
      })
    );
  } catch (err) {
    if (err.statusCode === 410) {
      await db.ref('pushSubs/' + userId).remove();
    }
    console.error('[PUSH] sendNotification failed:', userId, err.statusCode, err.body);
  }
}

exports.sendPush = onValueCreated(
  { ref: '/pushQueue/{pushId}', region: 'europe-west1', instance: 'times-inc-default-rtdb' },
  async (event) => {
    const data = event.data.val();
    if (!data || !data.userId) return null;
    if (!VAPID_PRIVATE) {
      console.error('[PUSH] Missing VAPID_PRIVATE environment variable');
      await event.data.ref.remove();
      return null;
    }

    const db = getDatabase();
    if (data.userId === '__all__') {
      const allSnap = await db.ref('pushSubs').get();
      const subs = allSnap.val() || {};
      await Promise.all(
        Object.entries(subs).map(([userId, sub]) => sendToSubscription(db, userId, sub, data))
      );
      await event.data.ref.remove();
      return null;
    }

    const subSnap = await db.ref('pushSubs/' + data.userId).get();
    const sub = subSnap.val();

    if (!sub || !sub.endpoint) {
      // No subscription stored — delete task and exit
      await event.data.ref.remove();
      return null;
    }

    await sendToSubscription(db, data.userId, sub, data);

    await event.data.ref.remove();
    return null;
  }
);
