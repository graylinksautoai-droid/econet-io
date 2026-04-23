/**
 * Feed Ranking Engine - Intelligent post scoring and ranking
 */

export class FeedRankingService {
  constructor() {
    this.weights = {
      engagement: 0.4,
      recency: 0.2,
      verificationWeight: 0.2,
      userReputation: 0.2
    };
  }

  /**
   * Calculate engagement score from likes, comments, shares, and live interactions
   */
  calculateEngagement(post) {
    const likes = post.likes || 0;
    const comments = post.comments?.length || 0;
    const shares = post.shares || 0;
    const liveInteractions = post.liveInteractions || 0;
    
    return likes + (comments * 2) + (shares * 3) + (liveInteractions * 1.5);
  }

  /**
   * Calculate recency score (newer posts get higher scores)
   */
  calculateRecency(post) {
    const now = new Date();
    const postTime = new Date(post.createdAt);
    const ageInHours = (now - postTime) / (1000 * 60 * 60);
    
    // Exponential decay: newer posts get exponentially higher scores
    return Math.exp(-ageInHours / 24); // 24-hour half-life
  }

  /**
   * Calculate verification weight based on account type and verification status
   */
  calculateVerificationWeight(post) {
    const user = post.user;
    
    if (!user) return 1.0; // Standard weight if no user info
    
    // Account type weights
    const accountTypeWeights = {
      'GOVERNMENT': 1.5,
      'AGENCY': 1.5,
      'NGO': 1.5,
      'INFLUENCER': 1.2,
      'STANDARD': 1.0
    };
    
    const baseWeight = accountTypeWeights[user.accountType] || 1.0;
    
    // Additional boost for verified sentinels
    if (user.verifiedReporter) {
      return baseWeight * 1.2;
    }
    
    return baseWeight;
  }

  /**
   * Calculate user reputation based on ecoCoins and level
   */
  calculateUserReputation(post) {
    const user = post.user;
    
    if (!user) return 0.5; // Default reputation
    
    const ecoCoins = user.ecoCoins || 0;
    const userLevel = user.userLevel || 1;
    const followers = user.followers || 0;
    
    // Reputation formula: coins contribute more than followers
    const coinScore = Math.log10(ecoCoins + 1) / 5; // Log scale, max ~1
    const levelScore = userLevel / 10; // Max 0.1 at level 10
    const followerScore = Math.log10(followers + 1) / 10; // Log scale, max ~1
    
    return Math.min(coinScore + levelScore + followerScore, 1.0);
  }

  /**
   * Calculate AI score boost
   */
  calculateAIScore(post) {
    const aiScore = post.aiScore || 50; // Default 50 if not set
    return aiScore / 100; // Normalize to 0-1 scale
  }

  /**
   * Calculate overall post score
   */
  calculateScore(post, user = null) {
    const engagement = this.calculateEngagement(post);
    const recency = this.calculateRecency(post);
    const verificationWeight = this.calculateVerificationWeight(post);
    const userReputation = this.calculateUserReputation(post);
    const aiScore = this.calculateAIScore(post);
    
    // Base scoring formula
    let score = 
      (engagement * this.weights.engagement) +
      (recency * this.weights.recency) +
      (verificationWeight * this.weights.verificationWeight) +
      (userReputation * this.weights.userReputation);
    
    // AI score boost (up to 20% additional score)
    score *= (1 + (aiScore * 0.2));
    
    // Personalization boost for user preferences
    if (user) {
      score *= this.calculatePersonalizationBoost(post, user);
    }
    
    return Math.round(score * 100) / 100; // Round to 2 decimal places
  }

  /**
   * Calculate personalization boost based on user preferences
   */
  calculatePersonalizationBoost(post, user) {
    let boost = 1.0;
    
    // Boost posts from followed users
    if (user.following?.includes(post.user?._id)) {
      boost *= 1.3;
    }
    
    // Boost posts in user's preferred categories
    if (user.preferredCategories?.includes(post.category)) {
      boost *= 1.2;
    }
    
    // Boost posts from user's location
    if (user.location && post.location) {
      const distance = this.calculateDistance(user.location, post.location);
      if (distance < 50) { // Within 50km
        boost *= 1.1;
      }
    }
    
    return boost;
  }

  /**
   * Calculate distance between two coordinates (simplified)
   */
  calculateDistance(loc1, loc2) {
    if (!loc1.lat || !loc2.lat) return Infinity;
    
    const R = 6371; // Earth's radius in km
    const dLat = (loc2.lat - loc1.lat) * Math.PI / 180;
    const dLon = (loc2.lon - loc1.lon) * Math.PI / 180;
    
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(loc1.lat * Math.PI / 180) * Math.cos(loc2.lat * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  /**
   * Rank posts by score in descending order
   */
  rankFeed(posts, user = null) {
    // Calculate scores for all posts
    const postsWithScores = posts.map(post => ({
      ...post,
      score: this.calculateScore(post, user)
    }));
    
    // Sort by score (descending)
    return postsWithScores.sort((a, b) => b.score - a.score);
  }

  /**
   * Get top posts for a specific category
   */
  getTopPostsByCategory(posts, category, limit = 10, user = null) {
    const categoryPosts = posts.filter(post => post.category === category);
    const rankedPosts = this.rankFeed(categoryPosts, user);
    
    return rankedPosts.slice(0, limit);
  }

  /**
   * Get trending posts (high engagement, recent)
   */
  getTrendingPosts(posts, limit = 20, user = null) {
    const recentPosts = posts.filter(post => {
      const ageInHours = (new Date() - new Date(post.createdAt)) / (1000 * 60 * 60);
      return ageInHours < 48; // Last 48 hours
    });
    
    const rankedPosts = this.rankFeed(recentPosts, user);
    
    return rankedPosts.slice(0, limit);
  }
}

export default new FeedRankingService();
