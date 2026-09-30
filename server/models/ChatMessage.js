/**
 * ChatMessage — persisted direct message between two EcoNet users.
 *
 * A "conversation" is identified by a canonical sorted pair of participant IDs.
 * Sorting ensures (A,B) and (B,A) resolve to the same conversation ID.
 *
 * Fields:
 *   conversationId — "{smallerId}_{largerId}" deterministic key
 *   participants   — array of two user ID strings
 *   sender         — the user ID who sent this message
 *   text           — message body (max 2000 chars)
 *   readBy         — sender has always read their own message
 *   createdAt      — immutable, indexed for pagination
 */
import mongoose from 'mongoose';

const chatMessageSchema = new mongoose.Schema({
  conversationId: { type: String, required: true, index: true },
  participants:   { type: [String], required: true },   // [userId, userId]
  sender:         { type: String, required: true },
  text:           { type: String, required: true, maxlength: 2000, trim: true },
  readBy:         { type: [String], default: [] },
  createdAt:      { type: Date, default: Date.now, immutable: true, index: true }
}, {
  collection: 'chat_messages',
  versionKey: false,
  timestamps: false
});

// Compound index for conversation thread queries
chatMessageSchema.index({ conversationId: 1, createdAt: 1 });

export default mongoose.model('ChatMessage', chatMessageSchema);
