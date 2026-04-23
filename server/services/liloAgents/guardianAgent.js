/**
 * LILO Guardian Agent - Suspicious Activity Detection and User Flagging
 */

import antiAbuseService from '../antiAbuseService.js';

export class GuardianAgent {
  constructor() {
    this.suspiciousPatterns = [
      'repetitive_content',
      'coordinated_activity',
      'unusual_timing',
      'account_anomalies',
      'content_manipulation'
    ];
    
    this.riskThresholds = {
      low: 0.3,
      medium: 0.6,
      high: 0.8
    };
  }

  /**
   * Analyze user for suspicious activity
   */
  async analyzeUser(userId, userPosts = [], userActivity = {}) {
    const analysis = {
      userId,
      riskScore: 0,
      riskLevel: 'low',
      flags: [],
      patterns: [],
      recommendations: [],
      requiresReview: false
    };

    // Analyze posting patterns
    const postingAnalysis = this.analyzePostingPatterns(userId, userPosts);
    analysis.patterns.push(postingAnalysis);

    // Analyze activity patterns
    const activityAnalysis = this.analyzeActivityPatterns(userId, userActivity);
    analysis.patterns.push(activityAnalysis);

    // Analyze content patterns
    const contentAnalysis = this.analyzeContentPatterns(userPosts);
    analysis.patterns.push(contentAnalysis);

    // Calculate overall risk score
    analysis.riskScore = this.calculateRiskScore(analysis.patterns);
    analysis.riskLevel = this.determineRiskLevel(analysis.riskScore);

    // Generate flags
    analysis.flags = this.generateFlags(analysis.patterns, analysis.riskScore);

    // Generate recommendations
    analysis.recommendations = this.generateRecommendations(analysis);

    // Determine if review is needed
    analysis.requiresReview = analysis.riskScore >= this.riskThresholds.medium;

    return analysis;
  }

  /**
   * Analyze posting patterns
   */
  analyzePostingPatterns(userId, posts) {
    const pattern = {
      type: 'posting_patterns',
      score: 0,
      indicators: [],
      details: {}
    };

    if (!posts || posts.length === 0) {
      return pattern;
    }

    // Post frequency analysis
    const postTimes = posts.map(p => new Date(p.createdAt));
    const now = Date.now();
    const dayAgo = now - (24 * 60 * 60 * 1000);
    const hourAgo = now - (60 * 60 * 1000);

    const postsLastDay = posts.filter(p => postTimes.includes(new Date(p.createdAt)) && 
      new Date(p.createdAt) > new Date(dayAgo));
    const postsLastHour = posts.filter(p => new Date(p.createdAt) > new Date(hourAgo));

    pattern.details.postsPerDay = postsLastDay.length;
    pattern.details.postsPerHour = postsLastHour.length;

    // Flag excessive posting
    if (postsLastHour.length > 10) {
      pattern.score += 0.3;
      pattern.indicators.push('excessive_hourly_posting');
    }

    if (postsLastDay.length > 100) {
      pattern.score += 0.4;
      pattern.indicators.push('excessive_daily_posting');
    }

    // Timing analysis (bot-like patterns)
    if (posts.length > 2) {
      const intervals = [];
      for (let i = 1; i < postTimes.length; i++) {
        intervals.push(postTimes[i] - postTimes[i - 1]);
      }

      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const minInterval = Math.min(...intervals);

      pattern.details.avgInterval = avgInterval;
      pattern.details.minInterval = minInterval;

      // Very consistent intervals suggest automation
      const variance = intervals.reduce((sum, interval) => {
        return sum + Math.pow(interval - avgInterval, 2);
      }, 0) / intervals.length;

      if (variance < 1000 && avgInterval < 60000) { // Low variance + frequent posting
        pattern.score += 0.4;
        pattern.indicators.push('automated_posting_pattern');
      }
    }

    // Content similarity analysis
    const contents = posts.map(p => (p.description || '').toLowerCase());
    const similarityScore = this.calculateContentSimilarity(contents);
    
    pattern.details.contentSimilarity = similarityScore;
    
    if (similarityScore > 0.8) {
      pattern.score += 0.3;
      pattern.indicators.push('repetitive_content');
    }

    return pattern;
  }

  /**
   * Analyze activity patterns
   */
  analyzeActivityPatterns(userId, activity) {
    const pattern = {
      type: 'activity_patterns',
      score: 0,
      indicators: [],
      details: {}
    };

    // Check anti-abuse service data
    const penalty = antiAbuseService.hasActivePenalty(userId);
    if (penalty) {
      pattern.score += 0.5;
      pattern.indicators.push(`active_penalty_${penalty.type}`);
      pattern.details.penalty = penalty;
    }

    // Analyze gift patterns
    const giftPatterns = antiAbuseService.giftPatterns;
    const userGiftPatterns = [];

    for (const [patternKey, patternData] of giftPatterns) {
      if (patternKey.startsWith(userId) || patternKey.endsWith(userId)) {
        userGiftPatterns.push({ patternKey, ...patternData });
      }
    }

    pattern.details.giftPatterns = userGiftPatterns;

    // Flag suspicious gift patterns
    userGiftPatterns.forEach(gift => {
      if (gift.count > 20) {
        pattern.score += 0.3;
        pattern.indicators.push('excessive_gifting');
      }
    });

    // Check for rapid account creation and activity
    if (activity.accountCreated) {
      const accountAge = Date.now() - activity.accountCreated;
      const actionsPerHour = activity.totalActions / (accountAge / (1000 * 60 * 60));

      pattern.details.accountAgeHours = accountAge / (1000 * 60 * 60);
      pattern.details.actionsPerHour = actionsPerHour;

      if (accountAge < (24 * 60 * 60 * 1000) && actionsPerHour > 50) {
        pattern.score += 0.4;
        pattern.indicators.push('new_account_high_activity');
      }
    }

    return pattern;
  }

  /**
   * Analyze content patterns
   */
  analyzeContentPatterns(posts) {
    const pattern = {
      type: 'content_patterns',
      score: 0,
      indicators: [],
      details: {}
    };

    if (!posts || posts.length === 0) {
      return pattern;
    }

    // Analyze sentiment and keywords
    const contents = posts.map(p => p.description || '');
    
    // Check for spam-like content
    const spamIndicators = ['click here', 'buy now', 'free', 'win', 'prize', 'limited time'];
    let spamCount = 0;

    contents.forEach(content => {
      const lowerContent = content.toLowerCase();
      spamIndicators.forEach(indicator => {
        if (lowerContent.includes(indicator)) {
          spamCount++;
        }
      });
    });

    pattern.details.spamIndicators = spamCount;
    pattern.details.spamRatio = spamCount / contents.length;

    if (pattern.details.spamRatio > 0.3) {
      pattern.score += 0.3;
      pattern.indicators.push('spam_like_content');
    }

    // Check for unusual character patterns
    let unusualCharCount = 0;
    contents.forEach(content => {
      // Excessive special characters
      const specialCharRatio = (content.match(/[^a-zA-Z0-9\s]/g) || []).length / content.length;
      if (specialCharRatio > 0.2) {
        unusualCharCount++;
      }

      // All caps
      if (content === content.toUpperCase() && content.length > 10) {
        unusualCharCount++;
      }
    });

    pattern.details.unusualCharPatterns = unusualCharCount;

    if (unusualCharCount / contents.length > 0.4) {
      pattern.score += 0.2;
      pattern.indicators.push('unusual_character_patterns');
    }

    // Check for coordinated activity (multiple similar posts)
    const similarPosts = this.findSimilarPosts(contents);
    pattern.details.similarPostGroups = similarPosts;

    if (similarPosts.length > 3) {
      pattern.score += 0.3;
      pattern.indicators.push('coordinated_posting');
    }

    return pattern;
  }

  /**
   * Calculate content similarity between multiple posts
   */
  calculateContentSimilarity(contents) {
    if (contents.length < 2) return 0;

    let totalSimilarity = 0;
    let comparisons = 0;

    for (let i = 0; i < contents.length; i++) {
      for (let j = i + 1; j < contents.length; j++) {
        const similarity = this.calculateTwoContentSimilarity(contents[i], contents[j]);
        totalSimilarity += similarity;
        comparisons++;
      }
    }

    return comparisons > 0 ? totalSimilarity / comparisons : 0;
  }

  /**
   * Calculate similarity between two content pieces
   */
  calculateTwoContentSimilarity(content1, content2) {
    const words1 = content1.split(' ');
    const words2 = content2.split(' ');
    
    const commonWords = words1.filter(word => words2.includes(word));
    const totalWords = new Set([...words1, ...words2]).size;
    
    return commonWords.length / totalWords;
  }

  /**
   * Find groups of similar posts
   */
  findSimilarPosts(contents) {
    const groups = [];
    const processed = new Set();

    for (let i = 0; i < contents.length; i++) {
      if (processed.has(i)) continue;

      const group = [i];
      processed.add(i);

      for (let j = i + 1; j < contents.length; j++) {
        if (processed.has(j)) continue;

        const similarity = this.calculateTwoContentSimilarity(contents[i], contents[j]);
        if (similarity > 0.7) {
          group.push(j);
          processed.add(j);
        }
      }

      if (group.length > 1) {
        groups.push(group);
      }
    }

    return groups;
  }

  /**
   * Calculate overall risk score
   */
  calculateRiskScore(patterns) {
    let totalScore = 0;
    let weightSum = 0;

    const weights = {
      posting_patterns: 0.4,
      activity_patterns: 0.4,
      content_patterns: 0.2
    };

    for (const pattern of patterns) {
      totalScore += pattern.score * (weights[pattern.type] || 0.33);
      weightSum += weights[pattern.type] || 0.33;
    }

    return weightSum > 0 ? totalScore / weightSum : 0;
  }

  /**
   * Determine risk level
   */
  determineRiskLevel(riskScore) {
    if (riskScore >= this.riskThresholds.high) return 'high';
    if (riskScore >= this.riskThresholds.medium) return 'medium';
    return 'low';
  }

  /**
   * Generate flags based on patterns and risk score
   */
  generateFlags(patterns, riskScore) {
    const flags = [];

    patterns.forEach(pattern => {
      pattern.indicators.forEach(indicator => {
        flags.push({
          type: pattern.type,
          indicator,
          severity: this.getFlagSeverity(indicator, riskScore)
        });
      });
    });

    return flags;
  }

  /**
   * Get flag severity
   */
  getFlagSeverity(indicator, riskScore) {
    const highSeverityIndicators = [
      'automated_posting_pattern',
      'excessive_daily_posting',
      'active_penalty_BOT_BEHAVIOR',
      'new_account_high_activity'
    ];

    if (highSeverityIndicators.includes(indicator) || riskScore >= this.riskThresholds.high) {
      return 'high';
    }

    const mediumSeverityIndicators = [
      'excessive_hourly_posting',
      'repetitive_content',
      'spam_like_content',
      'coordinated_posting'
    ];

    if (mediumSeverityIndicators.includes(indicator) || riskScore >= this.riskThresholds.medium) {
      return 'medium';
    }

    return 'low';
  }

  /**
   * Generate recommendations
   */
  generateRecommendations(analysis) {
    const recommendations = [];

    if (analysis.riskLevel === 'high') {
      recommendations.push('IMMEDIATE_REVIEW_REQUIRED');
      recommendations.push('Consider temporary account restriction');
    }

    if (analysis.riskLevel === 'medium') {
      recommendations.push('Schedule human review');
      recommendations.push('Monitor account closely');
    }

    // Specific recommendations based on flags
    analysis.flags.forEach(flag => {
      if (flag.indicator === 'automated_posting_pattern') {
        recommendations.push('Implement CAPTCHA verification');
      }
      if (flag.indicator === 'spam_like_content') {
        recommendations.push('Review content for policy violations');
      }
      if (flag.indicator === 'coordinated_posting') {
        recommendations.push('Investigate potential coordinated campaign');
      }
    });

    return recommendations;
  }

  /**
   * Batch analyze multiple users
   */
  async batchAnalyzeUsers(userData) {
    const analyses = [];

    for (const { userId, posts, activity } of userData) {
      const analysis = await this.analyzeUser(userId, posts, activity);
      analyses.push(analysis);
    }

    return analyses;
  }

  /**
   * Get guardian statistics
   */
  getGuardianStats() {
    return {
      suspiciousPatterns: this.suspiciousPatterns.length,
      riskThresholds: this.riskThresholds,
      antiAbuseIntegration: 'active'
    };
  }
}

export default new GuardianAgent();
