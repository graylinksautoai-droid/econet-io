import express from 'express';          // <-- MISSING IMPORT ADDED
import webpush from 'web-push';
import PushSubscription from '../models/PushSubscription.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// Initialize VAPID – call this function from index.js after dotenv.config()
export function initVapid() {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

// POST /api/notifications/subscribe
router.post('/subscribe', protect, async (req, res) => {
  try {
    const subscription = req.body;
    await PushSubscription.findOneAndUpdate(
      { user: req.user._id },
      { user: req.user._id, subscription },
      { upsert: true, new: true }
    );
    res.status(201).json({ message: 'Subscribed successfully' });
  } catch (error) {
    console.error('Subscription error:', error);
    res.status(500).json({ error: 'Failed to subscribe' });
  }
});

// POST /api/notifications/unsubscribe
router.post('/unsubscribe', protect, async (req, res) => {
  try {
    await PushSubscription.findOneAndDelete({ user: req.user._id });
    res.json({ message: 'Unsubscribed successfully' });
  } catch (error) {
    console.error('Unsubscribe error:', error);
    res.status(500).json({ error: 'Failed to unsubscribe' });
  }
});

export default router;