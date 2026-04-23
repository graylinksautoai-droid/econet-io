import express from 'express';
import liloRegionalService from '../services/liloRegionalService.js';

const router = express.Router();

/**
 * GET /api/region/config?country=XXX
 * Get regional configuration for a specific country
 */
router.get('/config', async (req, res) => {
  try {
    const { country } = req.query;
    
    if (!country) {
      return res.status(400).json({
        success: false,
        error: 'Country parameter is required'
      });
    }

    console.log(`Regional API: Fetching config for ${country}`);
    
    // Initialize region (will use master config or auto-discover)
    const config = await liloRegionalService.initializeRegion(country);
    
    res.json({
      success: true,
      data: config,
      country: country,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Regional API: Error fetching config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch regional configuration',
      data: liloRegionalService.getDefaultConfig()
    });
  }
});

/**
 * POST /api/region/notify
 * Notify authorities about a new report
 */
router.post('/notify', async (req, res) => {
  try {
    const { report, country } = req.body;
    
    if (!report || !country) {
      return res.status(400).json({
        success: false,
        error: 'Report and country are required'
      });
    }

    console.log(`Regional API: Notifying authorities for ${country} - ${report.category}`);
    
    // Get regional config
    const config = await liloRegionalService.initializeRegion(country);
    
    // Notify authorities
    const notifications = await liloRegionalService.notifyAuthorities(report, config);
    
    res.json({
      success: true,
      data: {
        notifications: notifications,
        totalNotified: notifications.filter(n => n.status === 'sent' || n.status === 'mocked').length
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Regional API: Error notifying authorities:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to notify authorities'
    });
  }
});

/**
 * GET /api/region/cache
 * Get cached regions (for debugging)
 */
router.get('/cache', (req, res) => {
  try {
    // Return cache status (without sensitive data)
    const cacheInfo = {
      size: liloRegionalService.regionCache.size,
      countries: Array.from(liloRegionalService.regionCache.keys()),
      timestamp: new Date().toISOString()
    };
    
    res.json({
      success: true,
      data: cacheInfo
    });
    
  } catch (error) {
    console.error('Regional API: Error getting cache info:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get cache info'
    });
  }
});

/**
 * DELETE /api/region/cache
 * Clear regional cache
 */
router.delete('/cache', (req, res) => {
  try {
    liloRegionalService.clearCache();
    
    res.json({
      success: true,
      message: 'Regional cache cleared',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Regional API: Error clearing cache:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear cache'
    });
  }
});

export default router;
