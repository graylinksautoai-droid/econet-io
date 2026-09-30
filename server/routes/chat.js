/**
 * Chat routes — persistent direct messaging.
 *
 * All user IDs are normalised to strings so DEV_AUTH users (string IDs like
 * 'dev_grinder_1') work alongside MongoDB ObjectId users.
 *
 * GET  /api/chat/conversations          — list the caller's conversations (latest message per thread)
 * GET  /api/chat/conversations/:convId/messages — paginated messages for a thread
 * POST /api/chat/conversations/:convId/messages — send a message
 * POST /api/chat/conversations/start            — start or resume a conversation with another user
 *
 * Real-time delivery is pushed over Socket.io to room `chat:{conversationId}`.
 * The client joins the room on first message fetch; new messages arrive via
 * the 'chat:message' event without requiring a poll.
 */
import express from 'express';
import mongoose from 'mongoose';
import { protect } from '../middleware/auth.js';
import ChatMessage from '../models/ChatMessage.js';

const router = express.Router();

const isMongoReady = () => mongoose.connection.readyState === 1;

/** Canonical conversation ID — deterministic sort so (A,B) === (B,A) */
function convId(a, b) {
  const sa = String(a);
  const sb = String(b);
  return sa < sb ? `${sa}_${sb}` : `${sb}_${sa}`;
}

/** Extract Socket.io server from the Express app */
function getIo(req) {
  return req.app?.get('socketio') || req.app?.get('io') || null;
}

// ── List conversations ───────────────────────────────────────────────────────
router.get('/conversations', protect, async (req, res) => {
  if (!isMongoReady()) {
    return res.status(503).json({ success: false, message: 'Chat unavailable: database not connected' });
  }
  try {
    const me = String(req.user._id);
    // Find the most-recent message for every conversation this user participates in.
    const threads = await ChatMessage.aggregate([
      { $match: { participants: me } },
      { $sort: { createdAt: -1 } },
      { $group: {
          _id: '$conversationId',
          lastMessage: { $first: '$$ROOT' }
      }},
      { $sort: { 'lastMessage.createdAt': -1 } },
      { $limit: 50 }
    ]);

    const result = threads.map(t => {
      const other = (t.lastMessage.participants || []).find(p => p !== me) || '';
      const unread = !(t.lastMessage.readBy || []).includes(me) && t.lastMessage.sender !== me;
      return {
        conversationId: t._id,
        otherUserId: other,
        lastMessage: {
          text: t.lastMessage.text,
          sender: t.lastMessage.sender,
          createdAt: t.lastMessage.createdAt
        },
        unread
      };
    });
    res.json({ success: true, data: result });
  } catch (err) {
    console.error('[chat] list conversations:', err.message);
    res.status(500).json({ success: false, message: 'Failed to load conversations' });
  }
});

// ── Start / resume a conversation ────────────────────────────────────────────
router.post('/conversations/start', protect, async (req, res) => {
  const { otherUserId } = req.body || {};
  if (!otherUserId) return res.status(400).json({ success: false, message: 'otherUserId is required' });
  const me = String(req.user._id);
  const them = String(otherUserId);
  if (me === them) return res.status(400).json({ success: false, message: 'Cannot start a conversation with yourself' });
  const cid = convId(me, them);
  res.json({ success: true, data: { conversationId: cid } });
});

// ── Fetch messages for a conversation ────────────────────────────────────────
router.get('/conversations/:convId/messages', protect, async (req, res) => {
  if (!isMongoReady()) {
    return res.status(503).json({ success: false, message: 'Chat unavailable: database not connected' });
  }
  try {
    const me = String(req.user._id);
    const { convId: cid } = req.params;
    const limit  = Math.min(Number(req.query.limit)  || 50, 100);
    const before = req.query.before ? new Date(req.query.before) : null;

    // Verify this user is a participant — their ID must appear in the convId
    if (!cid.split('_').includes(me)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const query = { conversationId: cid };
    if (before) query.createdAt = { $lt: before };

    const messages = await ChatMessage.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    // Mark unread messages as read
    const unreadIds = messages
      .filter(m => m.sender !== me && !(m.readBy || []).includes(me))
      .map(m => m._id);
    if (unreadIds.length) {
      await ChatMessage.updateMany(
        { _id: { $in: unreadIds } },
        { $addToSet: { readBy: me } }
      );
    }

    res.json({ success: true, data: messages.reverse() });
  } catch (err) {
    console.error('[chat] fetch messages:', err.message);
    res.status(500).json({ success: false, message: 'Failed to load messages' });
  }
});

// ── Send a message ────────────────────────────────────────────────────────────
router.post('/conversations/:convId/messages', protect, async (req, res) => {
  if (!isMongoReady()) {
    return res.status(503).json({ success: false, message: 'Chat unavailable: database not connected' });
  }
  try {
    const me  = String(req.user._id);
    const cid = req.params.convId;
    const { text } = req.body || {};

    if (!text || !String(text).trim()) {
      return res.status(400).json({ success: false, message: 'Message text is required' });
    }
    if (String(text).trim().length > 2000) {
      return res.status(400).json({ success: false, message: 'Message too long (max 2000 chars)' });
    }

    // The conversation ID encodes both participants (sorted).
    const parts = cid.split('_');
    if (parts.length < 2 || !parts.includes(me)) {
      return res.status(403).json({ success: false, message: 'Not a participant in this conversation' });
    }

    const msg = await ChatMessage.create({
      conversationId: cid,
      participants: parts,
      sender: me,
      text: String(text).trim(),
      readBy: [me]   // sender has read their own message
    });

    // Push to the Socket.io room for real-time delivery
    const io = getIo(req);
    if (io) {
      io.to(`chat:${cid}`).emit('chat:message', {
        _id: msg._id,
        conversationId: cid,
        sender: me,
        text: msg.text,
        createdAt: msg.createdAt
      });
    }

    res.status(201).json({ success: true, data: msg });
  } catch (err) {
    console.error('[chat] send message:', err.message);
    res.status(500).json({ success: false, message: 'Failed to send message' });
  }
});

export default router;
