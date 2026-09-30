import express from 'express';
import mongoose from 'mongoose';
import Comment from '../models/Comment.js';
import Report from '../models/Report.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

function isMongoReady() { return mongoose.connection.readyState === 1; }
function dbUnavailable(res) {
  return res.status(503).json({ error: 'Service temporarily unavailable — database not connected.', code: 'DATABASE_UNAVAILABLE' });
}

// Get comments for a report (public)
router.get('/:reportId', async (req, res) => {
  if (!isMongoReady()) return dbUnavailable(res);
  try {
    const comments = await Comment.find({ report: req.params.reportId })
      .sort({ createdAt: -1 })
      .populate('user', 'name email avatar');
    res.json(comments);
  } catch (error) {
    console.error('Error fetching comments:', error);
    res.status(500).json({ error: 'Failed to fetch comments' });
  }
});

// Add a comment (protected)
router.post('/:reportId', protect, async (req, res) => {
  if (!isMongoReady()) return dbUnavailable(res);
  try {
    const { text } = req.body;
    if (!text || text.trim() === '') {
      return res.status(400).json({ error: 'Comment text is required' });
    }

    const report = await Report.findById(req.params.reportId);
    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const comment = new Comment({
      report: req.params.reportId,
      user: req.user._id,
      text: text.trim()
    });

    await comment.save();

    // Populate user info for the response
    await comment.populate('user', 'name email avatar');

    const reportAuthor = await Report.findById(req.params.reportId).select('user');
    if (reportAuthor?.user) {
      const author = await mongoose.model('User').findById(reportAuthor.user);
      if (author) {
        await author.updateTrustScore();
      }
    }

    res.status(201).json(comment);
  } catch (error) {
    console.error('Error adding comment:', error);
    res.status(500).json({ error: 'Failed to add comment' });
  }
});

// Delete a comment
router.delete('/:commentId', protect, async (req, res) => {
  if (!isMongoReady()) return dbUnavailable(res);
  try {
    const comment = await Comment.findById(req.params.commentId);
    if (!comment) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    // Check if user is comment owner or admin
    if (comment.user.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    await comment.deleteOne();
    res.json({ message: 'Comment deleted' });
  } catch (error) {
    console.error('Error deleting comment:', error);
    res.status(500).json({ error: 'Failed to delete comment' });
  }
});

export default router;
