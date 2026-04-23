/**
 * LILO Scout Agent - Disaster Detection and Early Warning
 */

export class ScoutAgent {
  constructor() {
    this.disasterKeywords = [
      'flood', 'fire', 'earthquake', 'storm', 'hurricane', 'tornado',
      'drought', 'landslide', 'avalanche', 'volcano', 'tsunami',
      'emergency', 'evacuation', 'danger', 'threat', 'hazard',
      'warning', 'alert', 'disaster', 'crisis', 'catastrophe'
    ];
    
    this.severityIndicators = {
      high: ['severe', 'critical', 'extreme', 'dangerous', 'life-threatening', 'urgent'],
      medium: ['moderate', 'significant', 'serious', 'concerning', 'elevated'],
      low: ['minor', 'slight', 'small', 'limited', 'localized']
    };
  }

  /**
   * Analyze post for disaster indicators
   */
  async analyzePost(post) {
    const analysis = {
      disasterDetected: false,
      disasterType: null,
      severity: 'low',
      confidence: 0,
      indicators: [],
      location: null,
      urgency: 'normal'
    };

    const text = (post.description || '').toLowerCase();
    const content = text + ' ' + (post.content || '').toLowerCase();

    // Check for disaster keywords
    for (const keyword of this.disasterKeywords) {
      if (content.includes(keyword)) {
        analysis.disasterDetected = true;
        analysis.disasterType = this.classifyDisasterType(keyword);
        analysis.indicators.push(`keyword_${keyword}`);
        break;
      }
    }

    if (!analysis.disasterDetected) {
      return analysis;
    }

    // Determine severity
    for (const [level, indicators] of Object.entries(this.severityIndicators)) {
      for (const indicator of indicators) {
        if (content.includes(indicator)) {
          analysis.severity = level;
          analysis.indicators.push(`severity_${indicator}`);
          break;
        }
      }
    }

    // Calculate confidence based on multiple factors
    analysis.confidence = this.calculateConfidence(post, content);

    // Extract location information
    analysis.location = this.extractLocation(post);

    // Determine urgency
    analysis.urgency = this.determineUrgency(content, analysis.severity);

    return analysis;
  }

  /**
   * Classify disaster type
   */
  classifyDisasterType(keyword) {
    const categories = {
      flood: ['flood', 'flooding', 'inundation'],
      fire: ['fire', 'wildfire', 'burning', 'blaze'],
      earthquake: ['earthquake', 'quake', 'tremor', 'seismic'],
      storm: ['storm', 'hurricane', 'tornado', 'cyclone', 'typhoon'],
      drought: ['drought', 'dry', 'arid', 'water shortage'],
      landslide: ['landslide', 'mudslide', 'rockfall'],
      other: ['emergency', 'disaster', 'crisis', 'catastrophe']
    };

    for (const [type, keywords] of Object.entries(categories)) {
      if (keywords.includes(keyword)) {
        return type;
      }
    }

    return 'other';
  }

  /**
   * Calculate confidence score
   */
  calculateConfidence(post, content) {
    let confidence = 0;

    // Base confidence from keyword presence
    const keywordCount = this.disasterKeywords.filter(kw => content.includes(kw)).length;
    confidence += Math.min(keywordCount * 0.2, 0.4);

    // Boost from verified sources
    if (post.user?.verifiedReporter) {
      confidence += 0.2;
    }

    // Boost from official account types
    if (['GOVERNMENT', 'AGENCY', 'NGO'].includes(post.user?.accountType)) {
      confidence += 0.3;
    }

    // Boost from multiple indicators
    confidence += Math.min(analysis.indicators.length * 0.1, 0.2);

    // Boost from images (visual evidence)
    if (post.images && post.images.length > 0) {
      confidence += 0.1;
    }

    // Boost from user reputation
    if (post.user?.ecoCoins > 100) {
      confidence += 0.1;
    }

    return Math.min(confidence, 1.0);
  }

  /**
   * Extract location information
   */
  extractLocation(post) {
    if (post.location?.lat && post.location?.lon) {
      return {
        type: 'coordinates',
        lat: post.location.lat,
        lon: post.location.lon,
        address: post.location.text || post.location.city || 'Unknown'
      };
    }

    if (post.location?.text) {
      return {
        type: 'text',
        address: post.location.text,
        city: post.location.city,
        country: post.location.country
      };
    }

    return null;
  }

  /**
   * Determine urgency level
   */
  determineUrgency(content, severity) {
    const urgentKeywords = ['immediate', 'urgent', 'now', 'emergency', 'evacuate', 'help'];
    const hasUrgentKeywords = urgentKeywords.some(kw => content.includes(kw));

    if (severity === 'high' && hasUrgentKeywords) {
      return 'critical';
    } else if (severity === 'high') {
      return 'high';
    } else if (severity === 'medium' && hasUrgentKeywords) {
      return 'medium';
    } else {
      return 'normal';
    }
  }

  /**
   * Scan multiple posts for disaster patterns
   */
  async scanPosts(posts) {
    const results = [];
    const disasterClusters = new Map(); // location -> posts

    for (const post of posts) {
      const analysis = await this.analyzePost(post);
      
      if (analysis.disasterDetected) {
        results.push({
          postId: post._id,
          ...analysis,
          timestamp: post.createdAt
        });

        // Cluster by location
        if (analysis.location) {
          const locationKey = this.getLocationKey(analysis.location);
          if (!disasterClusters.has(locationKey)) {
            disasterClusters.set(locationKey, []);
          }
          disasterClusters.get(locationKey).push(post);
        }
      }
    }

    // Identify clusters (multiple reports in same area)
    const clusters = [];
    for (const [location, clusterPosts] of disasterClusters) {
      if (clusterPosts.length >= 2) {
        clusters.push({
          location,
          postCount: clusterPosts.length,
          posts: clusterPosts.map(p => p._id),
          severity: this.calculateClusterSeverity(clusterPosts)
        });
      }
    }

    return {
      detectedDisasters: results,
      clusters,
      summary: {
        totalDisasters: results.length,
        highSeverity: results.filter(r => r.severity === 'high').length,
        clusters: clusters.length
      }
    };
  }

  /**
   * Get location key for clustering
   */
  getLocationKey(location) {
    if (location.type === 'coordinates') {
      // Round coordinates to 2 decimal places for clustering
      return `${location.lat.toFixed(2)},${location.lon.toFixed(2)}`;
    } else {
      return location.address;
    }
  }

  /**
   * Calculate cluster severity
   */
  calculateClusterSeverity(clusterPosts) {
    const severities = clusterPosts.map(p => p.severity || 'low');
    const highCount = severities.filter(s => s === 'high').length;
    const mediumCount = severities.filter(s => s === 'medium').length;

    if (highCount >= 2) return 'high';
    if (highCount >= 1 || mediumCount >= 2) return 'medium';
    return 'low';
  }

  /**
   * Generate early warning alert
   */
  generateAlert(disasterAnalysis, clusterInfo = null) {
    const alert = {
      type: 'DISASTER_ALERT',
      disasterType: disasterAnalysis.disasterType,
      severity: disasterAnalysis.severity,
      urgency: disasterAnalysis.urgency,
      confidence: disasterAnalysis.confidence,
      location: disasterAnalysis.location,
      timestamp: new Date(),
      message: this.generateAlertMessage(disasterAnalysis, clusterInfo)
    };

    if (clusterInfo) {
      alert.cluster = clusterInfo;
      alert.message = this.generateClusterAlertMessage(disasterAnalysis, clusterInfo);
    }

    return alert;
  }

  /**
   * Generate alert message
   */
  generateAlertMessage(analysis, cluster = null) {
    const severityWords = {
      high: 'CRITICAL',
      medium: 'MODERATE',
      low: 'MINOR'
    };

    const urgencyWords = {
      critical: 'IMMEDIATE ACTION REQUIRED',
      high: 'HIGH PRIORITY',
      medium: 'ATTENTION NEEDED',
      normal: 'MONITOR SITUATION'
    };

    let message = `${severityWords[analysis.severity]} ${analysis.disasterType} detected`;

    if (analysis.location) {
      message += ` in ${analysis.location.address}`;
    }

    message += `. ${urgencyWords[analysis.urgency]}.`;

    if (cluster) {
      message += ` Multiple reports confirmed (${cluster.postCount} reports).`;
    }

    return message;
  }

  /**
   * Generate cluster alert message
   */
  generateClusterAlertMessage(analysis, cluster) {
    return `EMERGING DISASTER CLUSTER: ${cluster.postCount} reports of ${analysis.disasterType} detected in ${cluster.location}. Severity: ${analysis.severity}. Multiple sources confirming the situation. Coordinate response immediately.`;
  }
}

export default new ScoutAgent();
