import webpush from 'web-push';
import PushSubscription from '../models/PushSubscription.js';

export async function sendPushNotification(userId, payload) {
  try {
    const subDoc = await PushSubscription.findOne({ user: userId });
    if (!subDoc) return;

    const { subscription } = subDoc;
    await webpush.sendNotification(subscription, JSON.stringify(payload));
    console.log(`📨 Push sent to user ${userId}`);
  } catch (error) {
    console.error('Push send error:', error);
    if (error.statusCode === 410) {
      await PushSubscription.findOneAndDelete({ user: userId });
    }
  }
}