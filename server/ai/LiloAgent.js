/**
 * Autonomous Server-Side LILO Agent
 * Runs in background as cron job for global environmental monitoring
 */
const cron = require('node-cron');
const satelliteService = require('../services/satelliteService');
const liloAgentService = require('../services/liloAgent');

class AutonomousLiloAgent {
  constructor() {
    this.isRunning = false;
    this.scanInterval = '*/5 * * * *'; // Every 5 minutes
    this.activeRegions = new Map();
    this.globalAlerts = [];
    this.scanStats = {
      totalScans: 0,
      alertsGenerated: 0,
      authoritiesNotified: 0,
      lastScan: null,
      errors: 0
    };
    this.predictionEngine = null;
    
    // Initialize prediction engine
    this.initializePredictionEngine();
  }

  /**
   * Initialize prediction engine
   */
  async initializePredictionEngine() {
    try {
      // Dynamic import for prediction engine
      const { PredictionEngine } = await import('../../src/ai/prediction/PredictionEngine.js');
      this.predictionEngine = new PredictionEngine();
      await this.predictionEngine.initialize({});
      console.log('AutonomousLiloAgent: Prediction engine initialized');
    } catch (error) {
      console.error('AutonomousLiloAgent: Failed to initialize prediction engine:', error);
    }
  }

  /**
   * Start autonomous monitoring
   */
  async start() {
    if (this.isRunning) {
      console.log('AutonomousLiloAgent: Already running');
      return;
    }

    console.log('AutonomousLiloAgent: Starting global environmental monitoring...');
    
    // Load active regions
    await this.loadActiveRegions();
    
    // Schedule autonomous scans
    cron.schedule(this.scanInterval, async () => {
      await this.runAutonomousScan();
    });
    
    this.isRunning = true;
    
    // Run initial scan
    setTimeout(() => this.runAutonomousScan(), 5000);
    
    console.log(`AutonomousLiloAgent: Started - Scanning every 5 minutes`);
    console.log(`AutonomousLiloAgent: Monitoring ${this.activeRegions.size} regions`);
  }

  /**
   * Load active regions from database
   */
  async loadActiveRegions() {
    try {
      // In production, load from database
      // For now, use hardcoded regions
      const regions = [
        { id: 'nigeria-central', name: 'Central Nigeria', lat: 9.0765, lon: 8.6753, country: 'NG' },
        { id: 'nigeria-south', name: 'Southern Nigeria', lat: 6.5244, lon: 3.3792, country: 'NG' },
        { id: 'nigeria-north', name: 'Northern Nigeria', lat: 11.9804, lon: 8.5216, country: 'NG' },
        { id: 'kenya-central', name: 'Central Kenya', lat: -0.0236, lon: 37.9062, country: 'KE' },
        { id: 'ghana-south', name: 'Southern Ghana', lat: 5.6037, lon: -0.1870, country: 'GH' }
      ];
      
      for (const region of regions) {
        this.activeRegions.set(region.id, {
          ...region,
          lastScan: null,
          alerts: [],
          riskLevel: 'low'
        });
      }
      
      console.log(`AutonomousLiloAgent: Loaded ${regions.length} active regions`);
      
    } catch (error) {
      console.error('AutonomousLiloAgent: Failed to load regions:', error);
    }
  }

  /**
   * Run autonomous scan
   */
  async runAutonomousScan() {
    try {
      console.log('AutonomousLiloAgent: Starting global scan...');
      const scanStartTime = Date.now();
      
      this.scanStats.totalScans++;
      
      // Scan all active regions
      for (const [regionId, region] of this.activeRegions) {
        try {
          await this.scanRegion(region);
        } catch (error) {
          console.error(`AutonomousLiloAgent: Scan failed for ${regionId}:`, error);
          this.scanStats.errors++;
        }
      }
      
      // Update scan stats
      this.scanStats.lastScan = new Date().toISOString();
      const scanDuration = Date.now() - scanStartTime;
      
      console.log(`AutonomousLiloAgent: Scan completed in ${scanDuration}ms`);
      
      // Cleanup old alerts
      this.cleanupOldAlerts();
      
    } catch (error) {
      console.error('AutonomousLiloAgent: Autonomous scan failed:', error);
      this.scanStats.errors++;
    }
  }

  /**
   * Scan individual region
   */
  async scanRegion(region) {
    console.log(`AutonomousLiloAgent: Scanning ${region.name}...`);
    
    // Fetch satellite data
    const satData = await satelliteService.getEnvironmentalData(region.lat, region.lon);
    
    // Run prediction engine
    let prediction = null;
    if (this.predictionEngine) {
      const result = await this.predictionEngine.predictDisaster(satData);
      prediction = result.payload;
    }
    
    // Check for high-risk predictions
    if (prediction && prediction.overallRisk > 70) {
      await this.handleHighRiskPrediction(region, prediction, satData);
    }
    
    // Update region data
    region.lastScan = new Date().toISOString();
    region.riskLevel = this.getRiskLevel(prediction?.overallRisk || 0);
    
    console.log(`AutonomousLiloAgent: ${region.name} - Risk: ${region.riskLevel}`);
  }

  /**
   * Handle high-risk prediction
   */
  async handleHighRiskPrediction(region, prediction, satData) {
    console.log(`AutonomousLiloAgent: HIGH RISK detected in ${region.name} - Risk: ${prediction.overallRisk}`);
    
    // Get highest probability prediction
    const highestRisk = prediction.predictions[0];
    
    if (highestRisk && highestRisk.probability > 70) {
      // Create system alert
      const alert = await this.createSystemAlert(region, highestRisk, prediction, satData);
      
      // Notify authorities
      await this.notifyAuthorities(region, highestRisk, alert);
      
      // Store global alert
      this.globalAlerts.push(alert);
      this.scanStats.alertsGenerated++;
      this.scanStats.authoritiesNotified++;
      
      console.log(`AutonomousLiloAgent: Alert created and authorities notified for ${highestRisk.type}`);
    }
  }

  /**
   * Create system alert
   */
  async createSystemAlert(region, prediction, fullPrediction, satData) {
    const alert = {
      id: `alert_${Date.now()}_${region.id}`,
      region: region.id,
      regionName: region.name,
      coordinates: { lat: region.lat, lon: region.lon },
      country: region.country,
      disasterType: prediction.type,
      probability: prediction.probability,
      severity: prediction.severity,
      timeframe: prediction.timeframe,
      factors: prediction.factors,
      overallRisk: fullPrediction.overallRisk,
      confidence: fullPrediction.confidence,
      satelliteData: {
        temperature: satData.temperature,
        humidity: satData.humidity,
        precipitation: satData.precipitation,
        fireRisk: satData.fireRisk,
        vegetationIndex: satData.vegetationIndex,
        airQuality: satData.airQuality
      },
      timestamp: new Date().toISOString(),
      status: 'active',
      autoGenerated: true,
      source: 'AutonomousLiloAgent'
    };
    
    // Store in region
    region.alerts.push(alert);
    
    // Keep only recent alerts per region
    if (region.alerts.length > 10) {
      region.alerts = region.alerts.slice(-5);
    }
    
    return alert;
  }

  /**
   * Notify authorities
   */
  async notifyAuthorities(region, prediction, alert) {
    try {
      const report = {
        id: alert.id,
        category: prediction.type.toLowerCase(),
        severity: alert.severity,
        urgency: alert.probability > 80 ? 'Immediate' : 'Urgent',
        location: {
          type: 'Point',
          coordinates: [alert.coordinates.lon, alert.coordinates.lat],
          address: `${region.name}, ${region.country}`
        },
        description: this.generateAlertDescription(alert),
        timestamp: alert.timestamp,
        riskScore: Math.round(alert.probability),
        confidence: alert.confidence,
        autoDetected: true,
        aiAnalyzed: true,
        source: 'AutonomousLiloAgent',
        region: region.country,
        environmentalContext: {
          temperature: alert.satelliteData.temperature,
          humidity: alert.satelliteData.humidity,
          fireRisk: alert.satelliteData.fireRisk,
          airQuality: alert.satelliteData.airQuality
        },
        recommendations: [
          `Monitor ${prediction.type.toLowerCase()} conditions`,
          `Prepare emergency response within ${alert.timeframe}`,
          `Alert local population if probability > 80%`
        ]
      };
      
      const result = await liloAgentService.notifyAuthorities(report);
      
      console.log(`AutonomousLiloAgent: Authorities notified for ${region.name} - ${result.totalNotified} notified`);
      
      return result;
      
    } catch (error) {
      console.error(`AutonomousLiloAgent: Failed to notify authorities for ${region.name}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Generate alert description
   */
  generateAlertDescription(alert) {
    let description = `Autonomous AI Alert: ${alert.disasterType} risk detected in ${alert.regionName}. `;
    
    description += `Probability: ${alert.probability}%, Severity: ${alert.severity}. `;
    
    if (alert.factors && alert.factors.length > 0) {
      description += `Risk factors: ${alert.factors.join(', ')}. `;
    }
    
    description += `Expected timeframe: ${alert.timeframe}. `;
    
    description += `Environmental conditions: Temperature ${alert.satelliteData.temperature}°C, `;
    description += `Humidity ${alert.satelliteData.humidity}%, `;
    description += `Air Quality Index ${alert.satelliteData.airQuality}.`;
    
    return description;
  }

  /**
   * Get risk level from score
   */
  getRiskLevel(riskScore) {
    if (riskScore >= 80) return 'critical';
    if (riskScore >= 60) return 'high';
    if (riskScore >= 40) return 'medium';
    if (riskScore >= 20) return 'low';
    return 'minimal';
  }

  /**
   * Cleanup old alerts
   */
  cleanupOldAlerts() {
    const cutoff = Date.now() - (24 * 60 * 60 * 1000); // 24 hours ago
    
    // Cleanup global alerts
    const beforeCount = this.globalAlerts.length;
    this.globalAlerts = this.globalAlerts.filter(alert => 
      new Date(alert.timestamp).getTime() > cutoff
    );
    const cleaned = beforeCount - this.globalAlerts.length;
    
    // Cleanup region alerts
    for (const region of this.activeRegions.values()) {
      region.alerts = region.alerts.filter(alert => 
        new Date(alert.timestamp).getTime() > cutoff
      );
    }
    
    if (cleaned > 0) {
      console.log(`AutonomousLiloAgent: Cleaned up ${cleaned} old alerts`);
    }
  }

  /**
   * Get current status
   */
  getStatus() {
    const regionStatus = [];
    
    for (const [id, region] of this.activeRegions) {
      regionStatus.push({
        id,
        name: region.name,
        country: region.country,
        riskLevel: region.riskLevel,
        lastScan: region.lastScan,
        activeAlerts: region.alerts.length
      });
    }
    
    return {
      isRunning: this.isRunning,
      scanInterval: this.scanInterval,
      regionsMonitored: this.activeRegions.size,
      activeAlerts: this.globalAlerts.length,
      scanStats: this.scanStats,
      regionStatus: regionStatus.sort((a, b) => b.riskLevel.localeCompare(a.riskLevel)),
      predictionEngineStats: this.predictionEngine ? this.predictionEngine.getStats() : null
    };
  }

  /**
   * Get recent alerts
   */
  getRecentAlerts(limit = 50, hours = 24) {
    const cutoff = Date.now() - (hours * 60 * 60 * 1000);
    
    return this.globalAlerts
      .filter(alert => new Date(alert.timestamp).getTime() > cutoff)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit);
  }

  /**
   * Get alerts by region
   */
  getAlertsByRegion(regionId) {
    const region = this.activeRegions.get(regionId);
    return region ? region.alerts : [];
  }

  /**
   * Get high-risk regions
   */
  getHighRiskRegions() {
    const highRisk = [];
    
    for (const [id, region] of this.activeRegions) {
      if (region.riskLevel === 'critical' || region.riskLevel === 'high') {
        highRisk.push({
          id,
          name: region.name,
          country: region.country,
          riskLevel: region.riskLevel,
          lastScan: region.lastScan,
          alerts: region.alerts
        });
      }
    }
    
    return highRisk.sort((a, b) => b.alerts.length - a.alerts.length);
  }

  /**
   * Force scan specific region
   */
  async forceScanRegion(regionId) {
    const region = this.activeRegions.get(regionId);
    if (!region) {
      throw new Error(`Region ${regionId} not found`);
    }
    
    console.log(`AutonomousLiloAgent: Force scanning ${region.name}...`);
    await this.scanRegion(region);
    
    return {
      regionId,
      regionName: region.name,
      riskLevel: region.riskLevel,
      lastScan: region.lastScan,
      alerts: region.alerts
    };
  }

  /**
   * Add new region to monitor
   */
  addRegion(regionData) {
    const region = {
      id: regionData.id || `region_${Date.now()}`,
      name: regionData.name,
      lat: regionData.lat,
      lon: regionData.lon,
      country: regionData.country || 'Unknown',
      lastScan: null,
      alerts: [],
      riskLevel: 'low'
    };
    
    this.activeRegions.set(region.id, region);
    console.log(`AutonomousLiloAgent: Added region ${region.name} for monitoring`);
    
    return region;
  }

  /**
   * Remove region from monitoring
   */
  removeRegion(regionId) {
    const removed = this.activeRegions.delete(regionId);
    
    if (removed) {
      // Remove alerts for this region
      this.globalAlerts = this.globalAlerts.filter(alert => alert.region !== regionId);
      console.log(`AutonomousLiloAgent: Removed region ${regionId} from monitoring`);
    }
    
    return removed;
  }

  /**
   * Stop autonomous monitoring
   */
  async stop() {
    if (!this.isRunning) {
      console.log('AutonomousLiloAgent: Not running');
      return;
    }
    
    console.log('AutonomousLiloAgent: Stopping global environmental monitoring...');
    
    // Stop cron jobs
    cron.getTasks().forEach(task => task.stop());
    
    this.isRunning = false;
    
    console.log('AutonomousLiloAgent: Stopped');
  }

  /**
   * Get performance metrics
   */
  getMetrics() {
    const now = Date.now();
    const uptime = this.isRunning ? now - (this.scanStats.lastScan ? new Date(this.scanStats.lastScan).getTime() : now) : 0;
    
    return {
      uptime: uptime,
      scansPerHour: this.scanStats.totalScans > 0 ? 
        Math.round((this.scanStats.totalScans / (uptime / (1000 * 60 * 60))) * 10) / 10 : 0,
      alertsPerScan: this.scanStats.totalScans > 0 ? 
        Math.round((this.scanStats.alertsGenerated / this.scanStats.totalScans) * 10) / 10 : 0,
      errorRate: this.scanStats.totalScans > 0 ? 
        Math.round((this.scanStats.errors / this.scanStats.totalScans) * 100) : 0,
      averageResponseTime: this.scanStats.totalScans > 0 ? 
        Math.round(uptime / this.scanStats.totalScans) : 0
    };
  }
}

// Export singleton instance
module.exports = new AutonomousLiloAgent();
