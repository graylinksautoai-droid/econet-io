import express from 'express';
import Report from '../models/Report.js';

const router = express.Router();

// GET /api/map/reports - GeoJSON of reports with coordinates
router.get('/reports', async (req, res) => {
  try {
    const reports = await Report.find({
      'liloClassification.isClimateRelated': true,
      postStatus: { $in: ['observe', 'critical'] },
      'location.lat': { $exists: true, $ne: null },
      'location.lon': { $exists: true, $ne: null }
    })
      .select('location category severity urgency postStatus createdAt user aiVerification.score liloClassification')
      .populate('user', 'reputation.trustScore verifiedReporter')
      .lean();

    const features = reports.map(report => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [report.location.lon, report.location.lat]
      },
      properties: {
        id: report._id,
        category: report.category,
        severity: report.severity,
        urgency: report.urgency,
        postStatus: report.postStatus,
        createdAt: report.createdAt,
        trustScore: report.user?.reputation?.trustScore || 0,
        verifiedReporter: report.user?.verifiedReporter || false,
        aiScore: report.aiVerification?.score || 50,
        pulse: report.postStatus === 'critical',
        routedToCommand: report.liloClassification?.routedToCommand || false
      }
    }));

    res.json({
      type: 'FeatureCollection',
      features
    });
  } catch (error) {
    console.error('Error fetching map reports:', error);
    res.status(500).json({ error: 'Failed to fetch map data' });
  }
});

export default router;
