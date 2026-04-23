import express from 'express';
import Report from '../models/Report.js';
import User from '../models/User.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// Upvote a report
router.post('/:reportId/upvote', protect, async (req, res) => {
  try {
    const report = await Report.findById(req.params.reportId);
    if (!report) return res.status(404).json({ error: 'Report not found' });

    // Remove downvote if present
    if (report.downvotes.includes(req.user._id)) {
      report.downvotes.pull(req.user._id);
    }

    // Add upvote if not already
    if (!report.upvotes.includes(req.user._id)) {
      report.upvotes.push(req.user._id);
    }

    await report.save();

    // Recalculate trust for the report author
    const author = await User.findById(report.user);
    if (author) {
      await author.updateTrustScore();
    }

    res.json({
      upvotes: report.upvotes.length,
      downvotes: report.downvotes.length,
      validatedByViewer: report.upvotes.some((entry) => entry.toString() === req.user._id.toString()),
      downvotedByViewer: report.downvotes.some((entry) => entry.toString() === req.user._id.toString())
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Downvote a report
router.post('/:reportId/downvote', protect, async (req, res) => {
  try {
    const report = await Report.findById(req.params.reportId);
    if (!report) return res.status(404).json({ error: 'Report not found' });

    if (report.upvotes.includes(req.user._id)) {
      report.upvotes.pull(req.user._id);
    }

    if (!report.downvotes.includes(req.user._id)) {
      report.downvotes.push(req.user._id);
    }

    await report.save();

    // Recalculate trust for the report author
    const author = await User.findById(report.user);
    if (author) {
      await author.updateTrustScore();
    }

    res.json({
      upvotes: report.upvotes.length,
      downvotes: report.downvotes.length,
      validatedByViewer: report.upvotes.some((entry) => entry.toString() === req.user._id.toString()),
      downvotedByViewer: report.downvotes.some((entry) => entry.toString() === req.user._id.toString())
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Verify a report (by trusted users or admins)
router.post('/:reportId/verify', protect, async (req, res) => {
  try {
    // Only users with high reputation or admins can verify
    if (req.user.reputation.trustScore < 70 && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Insufficient reputation to verify' });
    }

    const report = await Report.findById(req.params.reportId);
    if (!report) return res.status(404).json({ error: 'Report not found' });

    report.verificationStatus = 'verified';
    report.verifiedBy = req.user._id;
    report.verifiedAt = new Date();
    await report.save();

    // Increase reporter's verified count
    const reporter = await User.findById(report.user);
    if (reporter) {
      reporter.reputation.verifiedReports += 1;
      await reporter.updateTrustScore();
    }

    res.json({ message: 'Report verified' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
