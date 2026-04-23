/**
 * LILO Multi-Agent System Coordinator
 */

import scoutAgent from './scoutAgent.js';
import analystAgent from './analystAgent.js';
import guardianAgent from './guardianAgent.js';
import guideAgent from './guideAgent.js';

export class LiloAgentSystem {
  constructor() {
    this.agents = {
      scout: scoutAgent,
      analyst: analystAgent,
      guardian: guardianAgent,
      guide: guideAgent
    };
    
    this.agentCapabilities = {
      scout: ['disaster_detection', 'early_warning', 'location_analysis'],
      analyst: ['credibility_evaluation', 'ai_scoring', 'risk_assessment'],
      guardian: ['suspicious_activity_detection', 'user_flagging', 'abuse_prevention'],
      guide: ['user_communication', 'chat_interface', 'educational_content']
    };
  }

  /**
   * Process post through relevant agents
   */
  async processPost(post, relatedPosts = []) {
    const results = {
      postId: post._id,
      agentAnalyses: {},
      summary: {
        riskLevel: 'normal',
        credibility: 'medium',
        requiresAction: false,
        actions: []
      }
    };

    try {
      // Scout Agent: Disaster Detection
      const scoutAnalysis = await this.agents.scout.analyzePost(post);
      results.agentAnalyses.scout = scoutAnalysis;

      // Analyst Agent: Credibility Evaluation
      const analystEvaluation = await this.agents.analyst.evaluatePost(post, relatedPosts);
      results.agentAnalyses.analyst = analystEvaluation;

      // Guardian Agent: Suspicious Activity Detection
      const guardianAnalysis = await this.agents.guardian.analyzeUser(
        post.user?._id,
        [post],
        {}
      );
      results.agentAnalyses.guardian = guardianAnalysis;

      // Generate summary
      results.summary = this.generateAgentSummary(results.agentAnalyses);

      return results;
    } catch (error) {
      console.error('LILO Agent System Error:', error);
      throw error;
    }
  }

  /**
   * Process user message through Guide Agent
   */
  async processUserMessage(message, context = {}) {
    try {
      const response = await this.agents.guide.generateResponse(message, context);
      
      return {
        success: true,
        response: response.message,
        category: response.category,
        confidence: response.confidence,
        action: response.action,
        metadata: response.metadata
      };
    } catch (error) {
      console.error('Guide Agent Error:', error);
      return {
        success: false,
        response: "I'm having trouble processing that right now. Please try again.",
        category: 'error',
        confidence: 0
      };
    }
  }

  /**
   * Batch process multiple posts
   */
  async batchProcessPosts(posts) {
    const results = [];
    
    // Process in parallel for efficiency
    const promises = posts.map(async (post) => {
      const relatedPosts = posts.filter(p => 
        p._id !== post._id &&
        (p.category === post.category || this.locationsMatch(p.location, post.location))
      );
      
      return await this.processPost(post, relatedPosts);
    });

    const batchResults = await Promise.all(promises);
    results.push(...batchResults);

    // Generate batch summary
    const batchSummary = this.generateBatchSummary(results);
    
    return {
      results,
      summary: batchSummary,
      processedCount: results.length
    };
  }

  /**
   * Scan for emerging disasters
   */
  async scanForDisasters(posts) {
    try {
      const disasterScan = await this.agents.scout.scanPosts(posts);
      
      // Generate alerts for detected disasters
      const alerts = [];
      
      disasterScan.detectedDisasters.forEach(disaster => {
        const alert = this.agents.scout.generateAlert(disaster);
        alerts.push(alert);
      });

      disasterScan.clusters.forEach(cluster => {
        const clusterAlert = this.agents.scout.generateAlert(
          cluster.posts[0], // Use first post as representative
          cluster
        );
        alerts.push(clusterAlert);
      });

      return {
        scan: disasterScan,
        alerts,
        timestamp: new Date()
      };
    } catch (error) {
      console.error('Disaster Scan Error:', error);
      throw error;
    }
  }

  /**
   * Evaluate user credibility and risk
   */
  async evaluateUser(userId, userPosts, userActivity) {
    try {
      // Guardian analysis for suspicious activity
      const guardianAnalysis = await this.agents.guardian.analyzeUser(
        userId,
        userPosts,
        userActivity
      );

      // Analyst evaluation of user's posts
      const postEvaluations = await this.agents.analyst.batchEvaluate(userPosts);
      
      // Calculate overall user score
      const userScore = this.calculateUserScore(guardianAnalysis, postEvaluations);

      return {
        userId,
        guardianAnalysis,
        postEvaluations,
        overallScore: userScore,
        recommendations: this.generateUserRecommendations(guardianAnalysis, postEvaluations)
      };
    } catch (error) {
      console.error('User Evaluation Error:', error);
      throw error;
    }
  }

  /**
   * Generate proactive alerts
   */
  async generateProactiveAlerts(context) {
    const alerts = [];

    try {
      // Weather alerts
      if (context.weatherData?.alerts) {
        const weatherAlert = await this.agents.guide.generateProactiveAlert({
          type: 'weather_warning',
          data: context.weatherData
        });
        alerts.push(weatherAlert);
      }

      // Air quality alerts
      if (context.airQuality?.aqi > 100) {
        const airQualityAlert = await this.agents.guide.generateProactiveAlert({
          type: 'air_quality',
          data: context.airQuality
        });
        alerts.push(airQualityAlert);
      }

      return alerts;
    } catch (error) {
      console.error('Proactive Alert Error:', error);
      return [];
    }
  }

  /**
   * Generate summary from agent analyses
   */
  generateAgentSummary(analyses) {
    const summary = {
      riskLevel: 'normal',
      credibility: 'medium',
      requiresAction: false,
      actions: []
    };

    // Scout analysis impact
    if (analyses.scout?.disasterDetected) {
      summary.riskLevel = analyses.scout.severity === 'high' ? 'critical' : 'elevated';
      summary.requiresAction = true;
      summary.actions.push('disaster_monitoring');
    }

    // Analyst analysis impact
    if (analyses.analyst) {
      summary.credibility = analyses.analyst.credibility;
      
      if (analyses.analyst.aiScore < 30) {
        summary.riskLevel = 'elevated';
        summary.actions.push('verification_needed');
      }
    }

    // Guardian analysis impact
    if (analyses.guardian?.riskScore > 0.6) {
      summary.riskLevel = 'elevated';
      summary.requiresAction = true;
      summary.actions.push('user_review');
    }

    // Combine risk levels
    if (summary.riskLevel === 'critical' || summary.riskLevel === 'elevated') {
      summary.requiresAction = true;
    }

    return summary;
  }

  /**
   * Generate batch processing summary
   */
  generateBatchSummary(results) {
    const summary = {
      totalPosts: results.length,
      disastersDetected: 0,
      highRiskPosts: 0,
      lowCredibilityPosts: 0,
      suspiciousUsers: new Set(),
      overallRisk: 'normal'
    };

    results.forEach(result => {
      // Count disasters
      if (result.agentAnalyses.scout?.disasterDetected) {
        summary.disastersDetected++;
      }

      // Count high risk posts
      if (result.summary.riskLevel === 'critical' || result.summary.riskLevel === 'elevated') {
        summary.highRiskPosts++;
      }

      // Count low credibility posts
      if (result.agentAnalyses.analyst?.credibility === 'low' || 
          result.agentAnalyses.analyst?.credibility === 'very_low') {
        summary.lowCredibilityPosts++;
      }

      // Track suspicious users
      if (result.agentAnalyses.guardian?.riskScore > 0.6) {
        summary.suspiciousUsers.add(result.agentAnalyses.guardian.userId);
      }
    });

    // Determine overall risk
    const riskRatio = summary.highRiskPosts / summary.totalPosts;
    if (riskRatio > 0.3) summary.overallRisk = 'high';
    else if (riskRatio > 0.1) summary.overallRisk = 'elevated';

    summary.suspiciousUsers = Array.from(summary.suspiciousUsers);

    return summary;
  }

  /**
   * Calculate overall user score
   */
  calculateUserScore(guardianAnalysis, postEvaluations) {
    let score = 0.5; // Base score

    // Guardian impact (negative)
    if (guardianAnalysis.riskScore > 0.6) {
      score -= guardianAnalysis.riskScore * 0.3;
    }

    // Post evaluations impact
    if (postEvaluations.length > 0) {
      const avgAiScore = postEvaluations.reduce((sum, eval) => sum + eval.aiScore, 0) / postEvaluations.length;
      score += (avgAiScore - 50) / 100; // Normalize around 50
    }

    return Math.max(0, Math.min(1, score)); // Clamp between 0 and 1
  }

  /**
   * Generate user recommendations
   */
  generateUserRecommendations(guardianAnalysis, postEvaluations) {
    const recommendations = [];

    // Guardian recommendations
    recommendations.push(...guardianAnalysis.recommendations);

    // Analyst recommendations
    postEvaluations.forEach(evaluation => {
      recommendations.push(...evaluation.recommendations);
    });

    // Remove duplicates
    return [...new Set(recommendations)];
  }

  /**
   * Check if locations match
   */
  locationsMatch(loc1, loc2) {
    if (!loc1 || !loc2) return false;

    if (loc1.lat && loc2.lat && loc1.lon && loc2.lon) {
      const distance = Math.sqrt(
        Math.pow(loc1.lat - loc2.lat, 2) + Math.pow(loc1.lon - loc2.lon, 2)
      );
      return distance < 0.01;
    }

    if (loc1.text && loc2.text) {
      return loc1.text.toLowerCase() === loc2.text.toLowerCase();
    }

    return false;
  }

  /**
   * Get system status and statistics
   */
  getSystemStatus() {
    return {
      agents: Object.keys(this.agents),
      capabilities: this.agentCapabilities,
      status: 'operational',
      lastUpdate: new Date()
    };
  }

  /**
   * Health check for all agents
   */
  async healthCheck() {
    const health = {
      overall: 'healthy',
      agents: {}
    };

    for (const [name, agent] of Object.entries(this.agents)) {
      try {
        // Simple health check - each agent should have a method or property
        const agentHealth = agent.getGuardStats?.() || agent.getGuideStats?.() || { status: 'healthy' };
        health.agents[name] = { status: 'healthy', ...agentHealth };
      } catch (error) {
        health.agents[name] = { status: 'unhealthy', error: error.message };
        health.overall = 'degraded';
      }
    }

    return health;
  }
}

export default new LiloAgentSystem();
