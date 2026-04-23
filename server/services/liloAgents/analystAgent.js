/**
 * LILO Analyst Agent - Credibility Evaluation and AI Scoring
 */

export class AnalystAgent {
  constructor() {
    this.credibilityFactors = {
      userReputation: 0.3,
      contentQuality: 0.25,
      sourceVerification: 0.2,
      temporalConsistency: 0.15,
      crossReference: 0.1
    };
    
    this.verifiedSources = ['GOVERNMENT', 'AGENCY', 'NGO'];
  }

  /**
   * Evaluate post credibility and calculate AI score
   */
  async evaluatePost(post, relatedPosts = []) {
    const evaluation = {
      aiScore: 50, // Default score
      credibility: 'medium',
      confidence: 0.5,
      factors: {},
      recommendations: [],
      riskLevel: 'normal'
    };

    // Calculate individual factors
    const userReputationScore = this.evaluateUserReputation(post.user);
    const contentQualityScore = this.evaluateContentQuality(post);
    const sourceVerificationScore = this.evaluateSourceVerification(post);
    const temporalConsistencyScore = this.evaluateTemporalConsistency(post, relatedPosts);
    const crossReferenceScore = this.evaluateCrossReference(post, relatedPosts);

    evaluation.factors = {
      userReputation: userReputationScore,
      contentQuality: contentQualityScore,
      sourceVerification: sourceVerificationScore,
      temporalConsistency: temporalConsistencyScore,
      crossReference: crossReferenceScore
    };

    // Calculate weighted AI score
    evaluation.aiScore = this.calculateWeightedScore(evaluation.factors);
    
    // Determine credibility level
    evaluation.credibility = this.determineCredibility(evaluation.aiScore);
    
    // Calculate confidence
    evaluation.confidence = this.calculateConfidence(evaluation.factors, post);
    
    // Generate recommendations
    evaluation.recommendations = this.generateRecommendations(evaluation);
    
    // Assess risk level
    evaluation.riskLevel = this.assessRiskLevel(evaluation);

    return evaluation;
  }

  /**
   * Evaluate user reputation
   */
  evaluateUserReputation(user) {
    if (!user) return 0.3; // Low score for anonymous posts

    let score = 0.5; // Base score

    // Account type bonus
    if (this.verifiedSources.includes(user.accountType)) {
      score += 0.3;
    } else if (user.accountType === 'INFLUENCER') {
      score += 0.1;
    }

    // Verified reporter bonus
    if (user.verifiedReporter) {
      score += 0.2;
    }

    // EcoCoins reputation (logarithmic scale)
    if (user.ecoCoins > 0) {
      const coinScore = Math.log10(user.ecoCoins + 1) / 4; // Max 0.25
      score += coinScore;
    }

    // Followers influence (diminishing returns)
    if (user.followers > 0) {
      const followerScore = Math.log10(user.followers + 1) / 5; // Max 0.2
      score += followerScore;
    }

    // User level bonus
    if (user.userLevel >= 3) {
      score += 0.1;
    }

    return Math.min(score, 1.0);
  }

  /**
   * Evaluate content quality
   */
  evaluateContentQuality(post) {
    let score = 0.5; // Base score

    const content = (post.description || '') + ' ' + (post.content || '');
    
    // Length analysis (substantial content)
    if (content.length > 100) {
      score += 0.1;
    }
    if (content.length > 300) {
      score += 0.1;
    }

    // Specific details boost credibility
    const specificIndicators = [
      'temperature', 'humidity', 'wind', 'pressure', 'coordinates',
      'exact', 'precise', 'measured', 'observed', 'witnessed'
    ];
    
    const specificCount = specificIndicators.filter(indicator => 
      content.toLowerCase().includes(indicator)
    ).length;
    
    score += Math.min(specificCount * 0.05, 0.2);

    // Visual evidence
    if (post.images && post.images.length > 0) {
      score += 0.2;
    }

    // Structured information
    if (post.location && (post.location.lat || post.location.text)) {
      score += 0.1;
    }

    // Time specificity
    if (post.createdAt) {
      const age = Date.now() - new Date(post.createdAt).getTime();
      if (age < 60000) { // Less than 1 minute old
        score += 0.1;
      }
    }

    return Math.min(score, 1.0);
  }

  /**
   * Evaluate source verification
   */
  evaluateSourceVerification(post) {
    let score = 0.5;

    if (!post.user) return 0.2;

    // Verified account types
    if (this.verifiedSources.includes(post.user.accountType)) {
      score += 0.4;
    }

    // Verified reporter status
    if (post.user.verifiedReporter) {
      score += 0.3;
    }

    // Account age (older accounts more credible)
    // This would require account creation date in the user model
    // For now, we'll use ecoCoins as a proxy for account activity
    if (post.user.ecoCoins > 1000) {
      score += 0.1;
    }

    return Math.min(score, 1.0);
  }

  /**
   * Evaluate temporal consistency with related posts
   */
  evaluateTemporalConsistency(post, relatedPosts) {
    if (!relatedPosts || relatedPosts.length === 0) {
      return 0.5; // Neutral score if no related posts
    }

    let score = 0.5;
    const postTime = new Date(post.createdAt);

    // Look for posts in similar timeframe
    const timeWindow = 60000 * 30; // 30 minutes
    const recentPosts = relatedPosts.filter(p => {
      const pTime = new Date(p.createdAt);
      return Math.abs(pTime - postTime) < timeWindow;
    });

    if (recentPosts.length > 0) {
      score += 0.2;
    }

    // Check for consistent reporting patterns
    if (recentPosts.length >= 3) {
      score += 0.2;
    }

    // Look for temporal progression (reports getting more specific over time)
    const sortedPosts = recentPosts.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    if (sortedPosts.length > 1) {
      const earlierPost = sortedPosts[0];
      const laterPost = sortedPosts[sortedPosts.length - 1];
      
      // Later posts should have more details
      const earlierLength = (earlierPost.description || '').length;
      const laterLength = (laterPost.description || '').length;
      
      if (laterLength > earlierLength) {
        score += 0.1;
      }
    }

    return Math.min(score, 1.0);
  }

  /**
   * Evaluate cross-reference with other reports
   */
  evaluateCrossReference(post, relatedPosts) {
    if (!relatedPosts || relatedPosts.length === 0) {
      return 0.5;
    }

    let score = 0.5;
    const postContent = (post.description || '').toLowerCase();

    // Find posts with similar content
    const similarPosts = relatedPosts.filter(p => {
      const pContent = (p.description || '').toLowerCase();
      return this.calculateContentSimilarity(postContent, pContent) > 0.3;
    });

    if (similarPosts.length > 0) {
      score += 0.2;
    }

    // Check for location consistency
    if (post.location && similarPosts.length > 0) {
      const locationMatches = similarPosts.filter(p => 
        this.locationsMatch(post.location, p.location)
      ).length;
      
      if (locationMatches > 0) {
        score += 0.2;
      }
    }

    // Check for consistent categorization
    if (post.category && similarPosts.length > 0) {
      const categoryMatches = similarPosts.filter(p => p.category === post.category).length;
      const categoryRatio = categoryMatches / similarPosts.length;
      
      if (categoryRatio > 0.7) {
        score += 0.1;
      }
    }

    return Math.min(score, 1.0);
  }

  /**
   * Calculate content similarity (simplified)
   */
  calculateContentSimilarity(content1, content2) {
    const words1 = content1.split(' ');
    const words2 = content2.split(' ');
    
    const commonWords = words1.filter(word => words2.includes(word));
    const totalWords = new Set([...words1, ...words2]).size;
    
    return commonWords.length / totalWords;
  }

  /**
   * Check if locations match
   */
  locationsMatch(loc1, loc2) {
    if (!loc1 || !loc2) return false;

    // Exact coordinate match
    if (loc1.lat && loc2.lat && loc1.lon && loc2.lon) {
      const distance = Math.sqrt(
        Math.pow(loc1.lat - loc2.lat, 2) + Math.pow(loc1.lon - loc2.lon, 2)
      );
      return distance < 0.01; // Very close coordinates
    }

    // Text location match
    if (loc1.text && loc2.text) {
      return loc1.text.toLowerCase() === loc2.text.toLowerCase();
    }

    // City match
    if (loc1.city && loc2.city) {
      return loc1.city.toLowerCase() === loc2.city.toLowerCase();
    }

    return false;
  }

  /**
   * Calculate weighted AI score
   */
  calculateWeightedScore(factors) {
    let score = 0;
    
    for (const [factor, value] of Object.entries(factors)) {
      score += value * this.credibilityFactors[factor];
    }
    
    return Math.round(score * 100);
  }

  /**
   * Determine credibility level
   */
  determineCredibility(aiScore) {
    if (aiScore >= 80) return 'high';
    if (aiScore >= 60) return 'medium';
    if (aiScore >= 40) return 'low';
    return 'very_low';
  }

  /**
   * Calculate confidence in the evaluation
   */
  calculateConfidence(factors, post) {
    let confidence = 0.5;

    // More factors contribute to higher confidence
    const factorCount = Object.values(factors).filter(f => f > 0.5).length;
    confidence += factorCount * 0.1;

    // More data points increase confidence
    if (post.images && post.images.length > 0) confidence += 0.1;
    if (post.location) confidence += 0.1;
    if (post.user && post.user.ecoCoins > 0) confidence += 0.1;

    return Math.min(confidence, 1.0);
  }

  /**
   * Generate recommendations based on evaluation
   */
  generateRecommendations(evaluation) {
    const recommendations = [];

    if (evaluation.aiScore < 40) {
      recommendations.push('Verify information with additional sources');
      recommendations.push('Request more specific details from reporter');
    }

    if (evaluation.factors.userReputation < 0.3) {
      recommendations.push('Monitor user for pattern of reporting');
    }

    if (evaluation.factors.contentQuality < 0.4) {
      recommendations.push('Request visual evidence or specific measurements');
    }

    if (evaluation.factors.crossReference < 0.3) {
      recommendations.push('Cross-reference with other reports in area');
    }

    if (evaluation.aiScore > 80) {
      recommendations.push('High credibility - prioritize response');
    }

    return recommendations;
  }

  /**
   * Assess risk level
   */
  assessRiskLevel(evaluation) {
    if (evaluation.credibility === 'very_low') return 'high';
    if (evaluation.credibility === 'low' && evaluation.aiScore < 30) return 'medium';
    if (evaluation.credibility === 'high' && evaluation.aiScore > 85) return 'low';
    return 'normal';
  }

  /**
   * Batch evaluate multiple posts
   */
  async batchEvaluate(posts) {
    const evaluations = [];
    
    for (const post of posts) {
      // Find related posts (same category, similar location, recent time)
      const relatedPosts = posts.filter(p => 
        p._id !== post._id &&
        (p.category === post.category || this.locationsMatch(p.location, post.location))
      );
      
      const evaluation = await this.evaluatePost(post, relatedPosts);
      evaluations.push({
        postId: post._id,
        ...evaluation
      });
    }
    
    return evaluations;
  }
}

export default new AnalystAgent();
