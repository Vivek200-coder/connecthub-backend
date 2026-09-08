const admin = require('firebase-admin');

let initialized = false;

const initFirebase = () => {
  if (initialized) return;
  if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
    console.warn('Firebase credentials not configured — push notifications are disabled.');
    return;
  }

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });
  initialized = true;
};

/**
 * Send a push notification to one or more FCM device tokens.
 * Silently no-ops (and logs) if Firebase isn't configured, so the rest of
 * the app keeps working in dev environments without FCM credentials.
 *
 * @param {string[]} tokens
 * @param {{title:string, body:string, data?:Object}} payload
 */
const sendPushToUsers = async (tokens, { title, body, data = {} }) => {
  const uniqueTokens = [...new Set((tokens || []).filter(Boolean))];
  if (!uniqueTokens.length) return { successCount: 0, failureCount: 0 };

  initFirebase();
  if (!initialized) return { successCount: 0, failureCount: 0, skipped: true };

  // Stringify all data values - FCM requires string key/value pairs
  const stringData = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)]));

  try {
    const response = await admin.messaging().sendEachForMulticast({
      tokens: uniqueTokens,
      notification: { title, body },
      data: stringData,
      android: { priority: 'high' },
      apns: { payload: { aps: { sound: 'default' } } },
    });

    return { successCount: response.successCount, failureCount: response.failureCount };
  } catch (err) {
    console.error('FCM push send error:', err.message);
    return { successCount: 0, failureCount: uniqueTokens.length, error: err.message };
  }
};

module.exports = { sendPushToUsers };
