import express from 'express';
import axios from 'axios';
import Report from '../models/Report.js';
import User from '../models/User.js';
import Comment from '../models/Comment.js';
import { protect } from '../middleware/auth.js';
import { classifyPostSignal } from '../services/postIntelligence.js';

const router = express.Router();

async function geocodeLocation(locationText) {
  try {
    const response = await axios.get('https://api.openweathermap.org/geo/1.0/direct', {
      params: {
        q: locationText,
        limit: 1,
        appid: process.env.OPENWEATHER_API_KEY
      }
    });

    if (response.data.length > 0) {
      const { lat, lon } = response.data[0];
      return { lat, lon };
    }
  } catch (error) {
    console.error('Geocoding failed:', error);
  }

  return null;
}

async function serializeReport(report, viewerId = null) {
  const commentCount = await Comment.countDocuments({ report: report._id });
  return {
    id: report._id,
    description: report.description,
    content: report.description,
    category: report.category,
    severity: report.severity,
    urgency: report.urgency,
    postStatus: report.postStatus || 'regular',
    signalSource: report.signalSource || 'social',
    summary: report.summary,
    createdAt: report.createdAt,
    timestamp: report.createdAt,
    images: report.images || [],
    media: report.media || [],
    location: report.location,
    aiScore: report.aiScore ?? report.aiVerification?.score ?? 0,
    liloClassification: report.liloClassification || {
      isClimateRelated: false,
      confidence: 0,
      summary: '',
      matchedSignals: [],
      routedToCommand: false
    },
    verificationStatus: report.verificationStatus,
    likes: report.likes?.length || 0,
    likedByViewer: viewerId ? report.likes?.some((entry) => entry.toString() === viewerId.toString()) : false,
    upvotes: report.upvotes?.length || 0,
    downvotes: report.downvotes?.length || 0,
    validatedByViewer: viewerId ? report.upvotes?.some((entry) => entry.toString() === viewerId.toString()) : false,
    downvotedByViewer: viewerId ? report.downvotes?.some((entry) => entry.toString() === viewerId.toString()) : false,
    comments: commentCount,
    shares: report.sharesCount || 0,
    isLive: Boolean(report.isLive),
    proofOfPresence: Boolean(report.proofOfPresence),
    user: report.user
      ? {
          id: report.user._id,
          name: report.user.name,
          avatar: report.user.avatar,
          verifiedReporter: report.user.verifiedReporter,
          trustScore: report.user.reputation?.trustScore || 0
        }
      : null
  };
}

router.post('/', protect, async (req, res) => {
  try {
    const { description, category, severity, urgency, confidence, summary, location, images, media, signalSource, isLive, proofOfPresence, liveSessionId } = req.body;

    if (!description) {
      return res.status(400).json({ error: 'Description is required' });
    }

    const classification = classifyPostSignal({
      description,
      category: category || 'Other',
      severity: severity || 'Low',
      urgency: urgency || 'Low',
      confidence,
      summary
    });

    const coordinates = location?.text ? await geocodeLocation(location.text) : null;

    const normalizedMedia = Array.isArray(media)
      ? media
          .filter((entry) => entry?.url && ['image', 'video', 'audio'].includes(entry?.type))
          .map((entry) => ({
            type: entry.type,
            url: entry.url,
            name: entry.name || '',
            mimeType: entry.mimeType || '',
            duration: entry.duration || null
          }))
      : [];

    const fallbackImages = Array.isArray(images) ? images : [];
    const derivedImages = normalizedMedia.filter((entry) => entry.type === 'image').map((entry) => entry.url);

    const report = new Report({
      user: req.user._id,
      description,
      category: classification.category,
      severity: classification.severity,
      urgency: classification.urgency,
      postStatus: classification.postStatus,
      signalSource: signalSource || 'social',
      confidence: classification.liloClassification.confidence,
      summary: summary || classification.liloClassification.summary,
      location: {
        text: location?.text || '',
        city: location?.city || '',
        state: location?.state || '',
        country: location?.country || 'Nigeria',
        lat: coordinates?.lat ?? null,
        lon: coordinates?.lon ?? null
      },
      images: [...new Set([...fallbackImages, ...derivedImages])],
      media: normalizedMedia,
      liloClassification: classification.liloClassification,
      aiVerification: {
        score: classification.liloClassification.confidence || 50,
        reasoning: summary || classification.liloClassification.summary,
        flags: classification.liloClassification.matchedSignals || []
      },
      aiScore: classification.liloClassification.confidence || 50,
      isLive: Boolean(isLive),
      proofOfPresence: Boolean(proofOfPresence),
      liveSessionId: liveSessionId || ''
    });

    await report.save();
    await report.populate('user', 'name email reputation verifiedReporter avatar');

    req.user.reputation.totalReports += 1;
    await req.user.save();
    await req.user.updateTrustScore();

    res.status(201).json({
      message: 'Report saved successfully',
      report: await serializeReport(report, req.user._id)
    });
  } catch (error) {
    console.error('Error saving report:', error);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((entry) => entry.message);
      return res.status(400).json({ error: messages.join(', ') });
    }

    res.status(500).json({ error: error.message || 'Failed to save report' });
  }
});

router.get('/feed', async (req, res) => {
  try {
    const viewer = req.headers.authorization ? req.headers.authorization.replace('Bearer ', '') : null;
    const reports = await Report.find()
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('user', 'name email reputation verifiedReporter avatar');

    const viewerId = req.user?._id || null;
    res.json(await Promise.all(reports.map((report) => serializeReport(report, viewerId))));
  } catch (error) {
    console.error('Error fetching feed:', error);
    res.status(500).json({ error: 'Failed to fetch feed' });
  }
});

router.get('/feed/following', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate('following', '_id');
    const followingIds = user.following.map((entry) => entry._id);

    const reports = await Report.find({ user: { $in: followingIds } })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('user', 'name email reputation verifiedReporter avatar');

    res.json(await Promise.all(reports.map((report) => serializeReport(report, req.user._id))));
  } catch (error) {
    console.error('Error fetching following feed:', error);
    res.status(500).json({ error: 'Failed to fetch following feed' });
  }
});

router.get('/my-reports', protect, async (req, res) => {
  try {
    const reports = await Report.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .populate('user', 'name email reputation verifiedReporter avatar');

    res.json(await Promise.all(reports.map((report) => serializeReport(report, req.user._id))));
  } catch (error) {
    console.error('Error fetching reports:', error);
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
});

router.get('/:id', protect, async (req, res) => {
  try {
    const report = await Report.findOne({
      _id: req.params.id,
      user: req.user._id
    }).populate('user', 'name email reputation verifiedReporter avatar');

    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    res.json(await serializeReport(report, req.user._id));
  } catch (error) {
    console.error('Error fetching report:', error);
    res.status(500).json({ error: 'Failed to fetch report' });
  }
});

router.patch('/:id/status', protect, async (req, res) => {
  try {
    const { status } = req.body;

    const report = await Report.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { status },
      { new: true }
    ).populate('user', 'name email reputation verifiedReporter avatar');

    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    res.json({ message: 'Report status updated', report: await serializeReport(report, req.user._id) });
  } catch (error) {
    console.error('Error updating report:', error);
    res.status(500).json({ error: 'Failed to update report' });
  }
});

router.post('/:id/like', protect, async (req, res) => {
  try {
    const report = await Report.findById(req.params.id).populate('user', 'name email reputation verifiedReporter avatar');
    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const liked = report.likes.some((entry) => entry.toString() === req.user._id.toString());
    if (liked) {
      report.likes.pull(req.user._id);
    } else {
      report.likes.push(req.user._id);
    }

    await report.save();
    await User.findById(report.user?._id || report.user)?.then((author) => author?.updateTrustScore());

    res.json({
      liked: !liked,
      likes: report.likes.length,
      report: await serializeReport(report, req.user._id)
    });
  } catch (error) {
    console.error('Error liking report:', error);
    res.status(500).json({ error: 'Failed to update like' });
  }
});

router.post('/:id/share', protect, async (req, res) => {
  try {
    const report = await Report.findById(req.params.id).populate('user', 'name email reputation verifiedReporter avatar');
    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    report.sharesCount = (report.sharesCount || 0) + 1;
    await report.save();
    await User.findById(report.user?._id || report.user)?.then((author) => author?.updateTrustScore());

    res.json({
      shares: report.sharesCount,
      report: await serializeReport(report, req.user._id)
    });
  } catch (error) {
    console.error('Error sharing report:', error);
    res.status(500).json({ error: 'Failed to share report' });
  }
});

export default router;
