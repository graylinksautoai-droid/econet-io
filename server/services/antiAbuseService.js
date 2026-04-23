/**
 * Anti-Abuse & Fraud Detection Layer
 */

export class AntiAbuseService {
  constructor() {
    this.userActivityCache = new Map(); // userId -> activity data
    this.suspiciousUsers = new Set();
    this.giftPatterns = new Map(); // userId -> gift history
    this.actionTimestamps = new Map(); // userId -> timestamps of recent actions
  }

  /**
   * Detect tap spamming
   */
  detectTapSpam(userId, timestamp = Date.now()) {
    const userActivity = this.getUserActivity(userId);
    
    // Track taps in the last second
    const recentTaps = userActivity.taps.filter(tap => timestamp - tap < 1000);
    userActivity.taps = recentTaps;
    userActivity.taps.push(timestamp);
    
    // Flag if > 50 taps per second
    if (userActivity.taps.length > 50) {
      this.flagUser(userId, 'TAP_SPAMMING', {
        tapsPerSecond: userActivity.taps.length,
        timestamp
      });
      return true;
    }
    
    return false;
  }

  /**
   * Detect fake engagement (repeated gifting between same users)
   */
  detectFakeEngagement(fromUserId, toUserId, amount, timestamp = Date.now()) {
    const patternKey = `${fromUserId}->${toUserId}`;
    const pattern = this.giftPatterns.get(patternKey) || {
      count: 0,
      totalAmount: 0,
      timestamps: []
    };
    
    pattern.count++;
    pattern.totalAmount += amount;
    pattern.timestamps.push(timestamp);
    
    // Keep only last 24 hours of data
    const dayAgo = timestamp - (24 * 60 * 60 * 1000);
    pattern.timestamps = pattern.timestamps.filter(t => t > dayAgo);
    
    this.giftPatterns.set(patternKey, pattern);
    
    // Flag suspicious patterns
    if (pattern.count > 10 && pattern.timestamps.length > 5) {
      // More than 10 gifts in 24 hours
      this.flagUser(fromUserId, 'FAKE_ENGAGEMENT', {
        target: toUserId,
        giftCount: pattern.count,
        totalAmount: pattern.totalAmount,
        pattern: 'repeated_gifting'
      });
      return true;
    }
    
    // Detect circular gifting (A->B, B->A repeatedly)
    const reversePatternKey = `${toUserId}->${fromUserId}`;
    const reversePattern = this.giftPatterns.get(reversePatternKey);
    
    if (reversePattern && reversePattern.count > 5) {
      this.flagUser(fromUserId, 'FAKE_ENGAGEMENT', {
        target: toUserId,
        pattern: 'circular_gifting',
        forwardCount: pattern.count,
        reverseCount: reversePattern.count
      });
      this.flagUser(toUserId, 'FAKE_ENGAGEMENT', {
        target: fromUserId,
        pattern: 'circular_gifting',
        forwardCount: reversePattern.count,
        reverseCount: pattern.count
      });
      return true;
    }
    
    return false;
  }

  /**
   * Detect bot behavior (actions too fast)
   */
  detectBotBehavior(userId, actionType, timestamp = Date.now()) {
    const userTimestamps = this.actionTimestamps.get(userId) || [];
    
    // Add current action timestamp
    userTimestamps.push(timestamp);
    
    // Keep only last 10 seconds of data
    const tenSecondsAgo = timestamp - 10000;
    const recentTimestamps = userTimestamps.filter(t => t > tenSecondsAgo);
    this.actionTimestamps.set(userId, recentTimestamps);
    
    // Calculate action frequency
    if (recentTimestamps.length > 1) {
      const intervals = [];
      for (let i = 1; i < recentTimestamps.length; i++) {
        intervals.push(recentTimestamps[i] - recentTimestamps[i - 1]);
      }
      
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      
      // Flag if average interval < 100ms (too fast for human)
      if (avgInterval < 100) {
        this.flagUser(userId, 'BOT_BEHAVIOR', {
          actionType,
          avgInterval,
          actionsPerSecond: recentTimestamps.length / 10,
          timestamp
        });
        return true;
      }
    }
    
    return false;
  }

  /**
   * Detect unusual activity patterns
   */
  detectUnusualPatterns(userId, activity) {
    const userActivity = this.getUserActivity(userId);
    
    // Check for rapid account creation and immediate high activity
    const accountAge = Date.now() - (userActivity.accountCreated || Date.now());
    const actionsPerHour = userActivity.totalActions / (accountAge / (1000 * 60 * 60));
    
    if (accountAge < (24 * 60 * 60 * 1000) && actionsPerHour > 100) {
      // New account with extremely high activity
      this.flagUser(userId, 'UNUSUAL_PATTERN', {
        pattern: 'new_account_high_activity',
        accountAgeHours: accountAge / (1000 * 60 * 60),
        actionsPerHour
      });
      return true;
    }
    
    return false;
  }

  /**
   * Get or create user activity tracking
   */
  getUserActivity(userId) {
    if (!this.userActivityCache.has(userId)) {
      this.userActivityCache.set(userId, {
        taps: [],
        gifts: [],
        actions: [],
        totalActions: 0,
        accountCreated: Date.now(),
        lastFlagged: null
      });
    }
    return this.userActivityCache.get(userId);
  }

  /**
   * Flag a user for suspicious activity
   */
  flagUser(userId, reason, details) {
    const userActivity = this.getUserActivity(userId);
    userActivity.lastFlagged = Date.now();
    
    this.suspiciousUsers.add(userId);
    
    // Log the flag (in production, this would go to a monitoring system)
    console.warn(`[ANTI-ABUSE] User ${userId} flagged: ${reason}`, details);
    
    // Apply penalties
    this.applyPenalty(userId, reason);
  }

  /**
   * Apply penalties based on violation type
   */
  applyPenalty(userId, violation) {
    const penalties = {
      'TAP_SPAMMING': {
        rewardReduction: 0.1, // 90% reduction
        duration: 300000 // 5 minutes
      },
      'FAKE_ENGAGEMENT': {
        rewardReduction: 0.5, // 50% reduction
        duration: 3600000 // 1 hour
      },
      'BOT_BEHAVIOR': {
        rewardReduction: 0.0, // No rewards
        duration: 7200000 // 2 hours
      },
      'UNUSUAL_PATTERN': {
        rewardReduction: 0.3, // 70% reduction
        duration: 1800000 // 30 minutes
      }
    };
    
    const penalty = penalties[violation] || { rewardReduction: 0.5, duration: 1800000 };
    
    const userActivity = this.getUserActivity(userId);
    userActivity.penalty = {
      type: violation,
      reduction: penalty.rewardReduction,
      until: Date.now() + penalty.duration
    };
  }

  /**
   * Check if user has active penalty
   */
  hasActivePenalty(userId) {
    const userActivity = this.getUserActivity(userId);
    const penalty = userActivity.penalty;
    
    if (!penalty || Date.now() > penalty.until) {
      return null;
    }
    
    return penalty;
  }

  /**
   * Calculate reward multiplier based on user's trust status
   */
  getRewardMultiplier(userId) {
    const penalty = this.hasActivePenalty(userId);
    
    if (penalty) {
      return penalty.reduction;
    }
    
    // Check if user is flagged as suspicious
    if (this.suspiciousUsers.has(userId)) {
      return 0.5; // 50% reduction for flagged users
    }
    
    return 1.0; // Full rewards for trusted users
  }

  /**
   * Clean up old data to prevent memory leaks
   */
  cleanup() {
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);
    
    // Clean old activity data
    for (const [userId, activity] of this.userActivityCache) {
      // Remove taps older than 1 hour
      activity.taps = activity.taps.filter(t => t > oneHourAgo);
      
      // Remove old action timestamps
      const timestamps = this.actionTimestamps.get(userId);
      if (timestamps) {
        this.actionTimestamps.set(userId, timestamps.filter(t => t > oneHourAgo));
      }
      
      // Remove penalty if expired
      if (activity.penalty && now > activity.penalty.until) {
        delete activity.penalty;
      }
    }
    
    // Clean old gift patterns (older than 7 days)
    const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);
    for (const [patternKey, pattern] of this.giftPatterns) {
      pattern.timestamps = pattern.timestamps.filter(t => t > sevenDaysAgo);
      if (pattern.timestamps.length === 0) {
        this.giftPatterns.delete(patternKey);
      }
    }
  }

  /**
   * Get abuse statistics (for monitoring)
   */
  getAbuseStats() {
    return {
      suspiciousUsers: this.suspiciousUsers.size,
      activePenalties: Array.from(this.userActivityCache.values())
        .filter(activity => this.hasActivePenalty(activity.userId))
        .length,
      giftPatterns: this.giftPatterns.size,
      cachedUsers: this.userActivityCache.size
    };
  }

  /**
   * Clear user from suspicious list (admin function)
   */
  clearSuspicion(userId) {
    this.suspiciousUsers.delete(userId);
    const userActivity = this.getUserActivity(userId);
    delete userActivity.penalty;
    userActivity.lastFlagged = null;
  }
}

// Singleton instance
export default new AntiAbuseService();
