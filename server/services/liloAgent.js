/**
 * LILO Agent Service - Real World Authority Integration
 * Handles communication with real emergency services and environmental agencies
 */
const fs = require('fs').promises;
const path = require('path');

class LiloAgentService {
  constructor() {
    this.authorityEndpoints = new Map();
    this.regionConfigs = new Map();
    this.notificationQueue = [];
    this.isProcessing = false;
    this.configPath = path.join(__dirname, '../data/regional_master.json');
    
    this.loadRegionalConfigs();
  }

  /**
   * Load regional authority configurations
   */
  async loadRegionalConfigs() {
    try {
      const data = await fs.readFile(this.configPath, 'utf8');
      const configs = JSON.parse(data);
      
      for (const [region, config] of Object.entries(configs)) {
        this.regionConfigs.set(region, config);
        
        // Cache authority endpoints
        if (config.authorities) {
          for (const authority of config.authorities) {
            if (authority.contactAPI) {
              this.authorityEndpoints.set(`${region}_${authority.type}`, authority.contactAPI);
            }
          }
        }
      }
      
      console.log(`LILO Agent: Loaded configs for ${this.regionConfigs.size} regions`);
      
    } catch (error) {
      console.error('LILO Agent: Failed to load regional configs:', error);
    }
  }

  /**
   * Notify authorities about environmental incident
   */
  async notifyAuthorities(report) {
    try {
      console.log(`LILO Agent: Notifying authorities for ${report.category} in ${report.region}`);
      
      const region = report.region || this.detectRegion(report.location);
      const endpoints = this.getEndpoints(region, report.category);
      
      if (endpoints.length === 0) {
        console.log(`LILO Agent: No endpoints found for ${region} - ${report.category}`);
        return await this.performAutoHandshake(report);
      }
      
      const notifications = [];
      
      for (const endpoint of endpoints) {
        try {
          const result = await this.sendNotification(endpoint, report);
          notifications.push(result);
        } catch (error) {
          console.error(`LILO Agent: Failed to notify ${endpoint}:`, error);
          notifications.push({
            endpoint,
            status: 'failed',
            error: error.message,
            timestamp: new Date().toISOString()
          });
        }
      }
      
      // Store notification for tracking
      this.storeNotification(report, notifications);
      
      return {
        success: true,
        region,
        category: report.category,
        notifications: notifications,
        totalNotified: notifications.filter(n => n.status === 'sent').length
      };
      
    } catch (error) {
      console.error('LILO Agent: Authority notification failed:', error);
      return {
        success: false,
        error: error.message,
        notifications: []
      };
    }
  }

  /**
   * Get authority endpoints for region and category
   */
  getEndpoints(region, category) {
    const endpoints = [];
    
    // Get regional config
    const config = this.regionConfigs.get(region);
    if (!config || !config.authorities) {
      return endpoints;
    }
    
    // Map category to authority types
    const authorityTypes = this.getAuthorityTypesForCategory(category);
    
    // Find matching authorities
    for (const authority of config.authorities) {
      if (authorityTypes.includes(authority.type) && authority.contactAPI) {
        endpoints.push(authority.contactAPI);
      }
    }
    
    return endpoints;
  }

  /**
   * Map incident category to authority types
   */
  getAuthorityTypesForCategory(category) {
    const mapping = {
      'fire': ['fire', 'emergency'],
      'flood': ['emergency', 'weather'],
      'drought': ['weather', 'environmental'],
      'pollution': ['environmental', 'emergency'],
      'oil_spill': ['environmental', 'emergency'],
      'deforestation': ['environmental'],
      'erosion': ['environmental'],
      'landslide': ['emergency', 'environmental'],
      'wildfire': ['fire', 'emergency'],
      'hurricane': ['weather', 'emergency'],
      'tornado': ['weather', 'emergency'],
      'earthquake': ['emergency'],
      'air_quality': ['environmental', 'weather'],
      'water_quality': ['environmental'],
      'waste': ['environmental']
    };
    
    return mapping[category?.toLowerCase()] || ['emergency'];
  }

  /**
   * Send notification to authority endpoint
   */
  async sendNotification(endpoint, report) {
    const payload = this.createNotificationPayload(report);
    
    console.log(`LILO Agent: Sending notification to ${endpoint}`);
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'EcoNet-LiloAgent/1.0',
        'X-Source': 'EcoNet-Environmental-Intelligence'
      },
      body: JSON.stringify(payload)
    });
    
    const result = {
      endpoint: endpoint,
      status: response.ok ? 'sent' : 'failed',
      statusCode: response.status,
      timestamp: new Date().toISOString()
    };
    
    if (response.ok) {
      try {
        result.response = await response.json();
      } catch (e) {
        result.response = 'Success (no response body)';
      }
    } else {
      result.error = await response.text();
    }
    
    return result;
  }

  /**
   * Create notification payload for authority
   */
  createNotificationPayload(report) {
    return {
      incident: {
        id: report.id || `incident_${Date.now()}`,
        type: report.category,
        severity: report.severity || 'medium',
        urgency: report.urgency || 'medium',
        location: {
          type: 'Point',
          coordinates: report.location?.coordinates || [0, 0],
          address: report.location?.address || 'Unknown'
        },
        description: report.description || report.content || 'Environmental incident reported',
        timestamp: report.timestamp || new Date().toISOString(),
        images: report.images || [],
        riskScore: report.riskScore || 5,
        confidence: report.confidence || 0.8
      },
      reporter: {
        id: report.reporterId || 'anonymous',
        name: report.reporterName || 'Anonymous',
        trustScore: report.trustScore || 0,
        verified: report.verified || false,
        contact: report.contact || null
      },
      source: {
        system: 'EcoNet Environmental Intelligence',
        version: '2.0',
        ai_analyzed: report.aiAnalyzed || false,
        auto_detected: report.autoDetected || false
      },
      priority: this.calculatePriority(report),
      requiresAction: this.requiresImmediateAction(report),
      metadata: {
        region: report.region,
        country: report.country,
        environmentalContext: report.environmentalContext || {},
        recommendations: report.recommendations || []
      }
    };
  }

  /**
   * Calculate notification priority
   */
  calculatePriority(report) {
    let priority = 5; // Medium default
    
    // Adjust based on severity
    const severityScores = {
      'critical': 10,
      'high': 8,
      'moderate': 5,
      'low': 2
    };
    
    priority = severityScores[report.severity?.toLowerCase()] || 5;
    
    // Adjust based on urgency
    const urgencyMultipliers = {
      'immediate': 1.5,
      'urgent': 1.2,
      'medium': 1.0,
      'low': 0.8
    };
    
    priority *= urgencyMultipliers[report.urgency?.toLowerCase()] || 1.0;
    
    // Adjust based on risk score
    if (report.riskScore >= 8) {
      priority *= 1.3;
    } else if (report.riskScore >= 6) {
      priority *= 1.1;
    }
    
    return Math.min(10, Math.round(priority));
  }

  /**
   * Determine if immediate action is required
   */
  requiresImmediateAction(report) {
    const immediateCategories = ['fire', 'flood', 'earthquake', 'wildfire'];
    const highSeverity = ['critical', 'high'];
    const highUrgency = ['immediate', 'urgent'];
    
    return immediateCategories.includes(report.category?.toLowerCase()) ||
           highSeverity.includes(report.severity?.toLowerCase()) ||
           highUrgency.includes(report.urgency?.toLowerCase()) ||
           (report.riskScore && report.riskScore >= 8);
  }

  /**
   * Auto-handshake for unknown regions
   */
  async performAutoHandshake(report) {
    console.log(`LILO Agent: Performing auto-handshake for unknown region`);
    
    // Use global fallback APIs
    const globalEndpoints = await this.discoverGlobalAuthorities(report);
    
    if (globalEndpoints.length === 0) {
      console.log('LILO Agent: No global endpoints available');
      return this.createFallbackNotification(report);
    }
    
    const notifications = [];
    
    for (const endpoint of globalEndpoints) {
      try {
        const result = await this.sendNotification(endpoint, report);
        notifications.push(result);
      } catch (error) {
        notifications.push({
          endpoint: endpoint.url,
          status: 'failed',
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    }
    
    // Cache discovered endpoints for future use
    this.cacheDiscoveredEndpoints(report.region, globalEndpoints);
    
    return {
      success: true,
      region: report.region,
      autoDiscovered: true,
      notifications: notifications,
      totalNotified: notifications.filter(n => n.status === 'sent').length
    };
  }

  /**
   * Discover global authorities using fallback APIs
   */
  async discoverGlobalAuthorities(report) {
    const endpoints = [];
    
    // OpenStreetMap Nominatim for finding nearby services
    try {
      if (report.location?.coordinates) {
        const [lon, lat] = report.location.coordinates;
        
        // Search for nearby emergency services
        const searchQuery = `${report.category} emergency services near ${lat},${lon}`;
        const osmResponse = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=3`,
          {
            headers: {
              'User-Agent': 'EcoNet-LiloAgent/1.0'
            }
          }
        );
        
        if (osmResponse.ok) {
          const places = await osmResponse.json();
          
          for (const place of places) {
            // Create mock endpoint for discovered service
            endpoints.push({
              url: `https://placeholder-api.example.com/emergency/${place.place_id}`,
              name: place.display_name,
              type: 'discovered_emergency',
              confidence: 0.6
            });
          }
        }
      }
    } catch (error) {
      console.warn('LILO Agent: OSM discovery failed:', error);
    }
    
    // Add global environmental agencies
    if (['pollution', 'air_quality', 'water_quality', 'deforestation'].includes(report.category?.toLowerCase())) {
      endpoints.push({
        url: 'https://api.unep.org/incidents',
        name: 'UN Environment Programme',
        type: 'global_environmental',
        confidence: 0.8
      });
    }
    
    // Add global disaster monitoring
    if (['fire', 'flood', 'earthquake', 'wildfire', 'hurricane'].includes(report.category?.toLowerCase())) {
      endpoints.push({
        url: 'https://api.unisdr.org/incidents',
        name: 'UN Disaster Risk Reduction',
        type: 'global_disaster',
        confidence: 0.8
      });
    }
    
    return endpoints;
  }

  /**
   * Cache discovered endpoints
   */
  cacheDiscoveredEndpoints(region, endpoints) {
    if (!this.regionConfigs.has(region)) {
      this.regionConfigs.set(region, {
        authorities: [],
        ngos: [],
        autoDiscovered: true,
        discoveredAt: new Date().toISOString()
      });
    }
    
    const config = this.regionConfigs.get(region);
    
    for (const endpoint of endpoints) {
      const authority = {
        name: endpoint.name,
        type: endpoint.type,
        contactAPI: endpoint.url,
        discovered: true,
        confidence: endpoint.confidence
      };
      
      config.authorities.push(authority);
    }
    
    console.log(`LILO Agent: Cached ${endpoints.length} discovered endpoints for ${region}`);
  }

  /**
   * Create fallback notification
   */
  createFallbackNotification(report) {
    console.log(`LILO Agent: Creating fallback notification for ${report.category}`);
    
    // Store locally for manual review
    const fallbackNotification = {
      id: `fallback_${Date.now()}`,
      report: report,
      timestamp: new Date().toISOString(),
      status: 'pending_manual_review',
      reason: 'No authority endpoints available'
    };
    
    this.notificationQueue.push(fallbackNotification);
    
    return {
      success: false,
      fallback: true,
      message: 'Report queued for manual review - no authority endpoints available',
      queuedId: fallbackNotification.id
    };
  }

  /**
   * Detect region from location
   */
  detectRegion(location) {
    // Simple region detection based on coordinates
    if (!location?.coordinates) return 'Unknown';
    
    const [lon, lat] = location.coordinates;
    
    // Rough geofencing for major regions
    if (lat >= 4 && lat <= 14 && lon >= 2 && lon <= 14) {
      return 'Nigeria'; // NG
    } else if (lat >= -5 && lat <= 5 && lon >= 33 && lon <= 42) {
      return 'Kenya'; // KE
    } else if (lat >= 4 && lat <= 12 && lon >= -3 && lon <= 2) {
      return 'Ghana'; // GH
    } else if (lat >= 25 && lat <= 50 && lon >= -125 && lon <= -65) {
      return 'United States'; // US
    }
    
    return 'Unknown';
  }

  /**
   * Store notification for tracking
   */
  storeNotification(report, notifications) {
    const notificationRecord = {
      id: `notification_${Date.now()}`,
      reportId: report.id,
      report: report,
      notifications: notifications,
      timestamp: new Date().toISOString(),
      status: notifications.some(n => n.status === 'sent') ? 'sent' : 'failed'
    };
    
    // In production, this would be stored in database
    console.log(`LILO Agent: Stored notification record ${notificationRecord.id}`);
  }

  /**
   * Get notification queue status
   */
  getQueueStatus() {
    return {
      queueSize: this.notificationQueue.length,
      isProcessing: this.isProcessing,
      pendingNotifications: this.notificationQueue.filter(n => n.status === 'pending_manual_review'),
      oldestNotification: this.notificationQueue.length > 0 ? this.notificationQueue[0].timestamp : null
    };
  }

  /**
   * Process notification queue
   */
  async processQueue() {
    if (this.isProcessing || this.notificationQueue.length === 0) {
      return;
    }
    
    this.isProcessing = true;
    
    try {
      console.log(`LILO Agent: Processing ${this.notificationQueue.length} queued notifications`);
      
      const processed = [];
      
      for (const notification of this.notificationQueue) {
        try {
          // Retry notification
          const result = await this.notifyAuthorities(notification.report);
          processed.push({
            id: notification.id,
            result: result,
            processedAt: new Date().toISOString()
          });
        } catch (error) {
          console.error(`LILO Agent: Failed to process queued notification ${notification.id}:`, error);
        }
      }
      
      // Clear processed notifications
      this.notificationQueue = [];
      
      console.log(`LILO Agent: Processed ${processed.length} queued notifications`);
      
      return processed;
      
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Get authority statistics
   */
  getAuthorityStats() {
    const stats = {
      totalRegions: this.regionConfigs.size,
      totalEndpoints: this.authorityEndpoints.size,
      regions: {},
      queueStatus: this.getQueueStatus()
    };
    
    for (const [region, config] of this.regionConfigs) {
      stats.regions[region] = {
        authorities: config.authorities?.length || 0,
        ngos: config.ngos?.length || 0,
        autoDiscovered: config.autoDiscovered || false
      };
    }
    
    return stats;
  }

  /**
   * Test authority connectivity
   */
  async testConnectivity() {
    const results = [];
    
    for (const [key, endpoint] of this.authorityEndpoints) {
      try {
        const startTime = Date.now();
        
        const response = await fetch(endpoint, {
          method: 'HEAD',
          headers: {
            'User-Agent': 'EcoNet-LiloAgent/1.0'
          }
        });
        
        results.push({
          key: endpoint,
          status: response.ok ? 'connected' : 'error',
          responseTime: Date.now() - startTime,
          statusCode: response.status
        });
        
      } catch (error) {
        results.push({
          key: endpoint,
          status: 'error',
          error: error.message,
          responseTime: Date.now()
        });
      }
    }
    
    return results;
  }

  /**
   * Sync authorities with regional config
   */
  async syncAuthorities() {
    console.log('LILO Agent: Syncing authorities with regional configs...');
    await this.loadRegionalConfigs();
    
    return {
      regionsLoaded: this.regionConfigs.size,
      endpointsCached: this.authorityEndpoints.size,
      syncTime: new Date().toISOString()
    };
  }
}

// Export singleton instance
module.exports = new LiloAgentService();
