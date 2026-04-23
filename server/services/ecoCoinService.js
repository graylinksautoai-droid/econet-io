/**
 * EcoCoin Economy Service with Integrity Protection
 */

import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import antiAbuseService from './antiAbuseService.js';

export class EcoCoinService {
  constructor() {
    this.dailyEarningLimits = {
      STANDARD: 100,
      INFLUENCER: 500,
      NGO: 1000,
      GOVERNMENT: 2000,
      AGENCY: 2000
    };
    
    this.minuteEarningLimits = {
      STANDARD: 10,
      INFLUENCER: 50,
      NGO: 100,
      GOVERNMENT: 200,
      AGENCY: 200
    };
    
    this.giftCosts = {
      'seedling': 5,
      'water': 10,
      'solar': 20,
      'tree': 50,
      'wind': 100
    };
  }

  /**
   * Validate transaction before processing
   */
  async validateTransaction(userId, action, amount = 0, details = {}) {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Check anti-abuse penalties
    const penalty = antiAbuseService.hasActivePenalty(userId);
    if (penalty && action !== 'SPEND') {
      throw new Error(`Transaction blocked due to penalty: ${penalty.type}`);
    }

    // Check daily earning limit
    if (action === 'EARN') {
      const todayEarnings = await this.getTodayEarnings(userId);
      const dailyLimit = this.dailyEarningLimits[user.accountType] || this.dailyEarningLimits.STANDARD;
      
      if (todayEarnings + amount > dailyLimit) {
        throw new Error(`Daily earning limit exceeded. Earned: ${todayEarnings}, Limit: ${dailyLimit}`);
      }
    }

    // Check minute earning limit
    if (action === 'EARN') {
      const minuteEarnings = await this.getMinuteEarnings(userId);
      const minuteLimit = this.minuteEarningLimits[user.accountType] || this.minuteEarningLimits.STANDARD;
      
      if (minuteEarnings + amount > minuteLimit) {
        throw new Error(`Minute earning limit exceeded. Please wait before earning more.`);
      }
    }

    // Check spending limit
    if (action === 'SPEND') {
      if (user.ecoCoins < amount) {
        throw new Error('Insufficient EcoCoins');
      }
    }

    // Prevent self-gifting loops
    if (details.source === 'GIFT_RECEIVED' && details.fromUserId === userId) {
      throw new Error('Self-gifting not allowed');
    }

    // Check for suspicious patterns
    if (details.source === 'GIFT_RECEIVED') {
      const isSuspicious = antiAbuseService.detectFakeEngagement(
        details.fromUserId, 
        userId, 
        amount
      );
      
      if (isSuspicious) {
        throw new Error('Gift transaction flagged as suspicious');
      }
    }

    return true;
  }

  /**
   * Reward live host for streaming
   */
  async rewardLiveHost(userId, minutes) {
    try {
      const baseReward = minutes * 2;
      const multiplier = antiAbuseService.getRewardMultiplier(userId);
      const finalReward = Math.round(baseReward * multiplier);

      await this.validateTransaction(userId, 'EARN', finalReward, {
        source: 'LIVE_HOST',
        minutes,
        baseReward,
        multiplier
      });

      await this.processTransaction(userId, 'EARN', finalReward, 'LIVE_HOST', {
        minutes,
        multiplier
      });

      return finalReward;
    } catch (error) {
      console.error(`Live host reward failed for user ${userId}:`, error.message);
      return 0;
    }
  }

  /**
   * Reward tap support (batched)
   */
  async rewardTap(userId, tapCount = 1) {
    try {
      // Check for tap spamming
      for (let i = 0; i < tapCount; i++) {
        const isSpamming = antiAbuseService.detectTapSpam(userId);
        if (isSpamming) {
          throw new Error('Tap spamming detected');
        }
      }

      const baseReward = tapCount * 0.01;
      const multiplier = antiAbuseService.getRewardMultiplier(userId);
      const finalReward = Math.round(baseReward * multiplier * 100) / 100; // Round to 2 decimal places

      await this.validateTransaction(userId, 'EARN', finalReward, {
        source: 'TAP_SUPPORT',
        tapCount
      });

      await this.processTransaction(userId, 'EARN', finalReward, 'TAP_SUPPORT', {
        tapCount
      });

      return finalReward;
    } catch (error) {
      console.error(`Tap reward failed for user ${userId}:`, error.message);
      return 0;
    }
  }

  /**
   * Process gift transaction
   */
  async rewardGift(fromUserId, toUserId, giftType) {
    try {
      const giftCost = this.giftCosts[giftType.toLowerCase()];
      if (!giftCost) {
        throw new Error('Invalid gift type');
      }

      // Check for bot behavior
      const isBot = antiAbuseService.detectBotBehavior(fromUserId, 'GIFT_SEND');
      if (isBot) {
        throw new Error('Bot behavior detected');
      }

      // Deduct from sender
      await this.spendCoins(fromUserId, giftCost, 'GIFT_SENT', {
        toUserId,
        giftType
      });

      // Add to receiver
      await this.processTransaction(toUserId, 'EARN', giftCost, 'GIFT_RECEIVED', {
        fromUserId,
        giftType
      });

      return giftCost;
    } catch (error) {
      console.error(`Gift transaction failed:`, error.message);
      throw error;
    }
  }

  /**
   * Spend coins (general purpose)
   */
  async spendCoins(userId, amount, source = 'SPEND', details = {}) {
    try {
      await this.validateTransaction(userId, 'SPEND', amount, { source, ...details });

      await this.processTransaction(userId, 'SPEND', amount, source, details);

      return amount;
    } catch (error) {
      console.error(`Coin spending failed for user ${userId}:`, error.message);
      throw error;
    }
  }

  /**
   * Core transaction processing
   */
  async processTransaction(userId, type, amount, source, details = {}) {
    const session = await User.startSession();
    session.startTransaction();

    try {
      // Update user balance
      const updateOperation = type === 'EARN' 
        ? { $inc: { ecoCoins: amount } }
        : { $inc: { ecoCoins: -amount } };

      const user = await User.findByIdAndUpdate(
        userId,
        updateOperation,
        { session, new: true }
      );

      if (!user) {
        throw new Error('User not found');
      }

      // Create transaction record
      const transaction = new Transaction({
        userId,
        type,
        amount,
        source,
        details,
        createdAt: new Date()
      });

      await transaction.save({ session });

      // Update user level based on new balance
      await this.updateUserLevel(userId, user.ecoCoins, session);

      await session.commitTransaction();

      return {
        success: true,
        newBalance: user.ecoCoins,
        transactionId: transaction._id
      };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  /**
   * Update user level based on ecoCoins
   */
  async updateUserLevel(userId, ecoCoins, session = null) {
    let newLevel = 1;

    if (ecoCoins >= 5000) newLevel = 4;
    else if (ecoCoins >= 2000) newLevel = 3;
    else if (ecoCoins >= 500) newLevel = 2;

    await User.findByIdAndUpdate(
      userId,
      { userLevel: newLevel },
      { session }
    );
  }

  /**
   * Get today's earnings for a user
   */
  async getTodayEarnings(userId) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const transactions = await Transaction.find({
      userId,
      type: 'EARN',
      createdAt: { $gte: today }
    });

    return transactions.reduce((total, tx) => total + tx.amount, 0);
  }

  /**
   * Get earnings in the last minute for a user
   */
  async getMinuteEarnings(userId) {
    const oneMinuteAgo = new Date(Date.now() - 60000);

    const transactions = await Transaction.find({
      userId,
      type: 'EARN',
      createdAt: { $gte: oneMinuteAgo }
    });

    return transactions.reduce((total, tx) => total + tx.amount, 0);
  }

  /**
   * Get user balance with transaction history
   */
  async getUserBalance(userId, limit = 10) {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const transactions = await Transaction.find({ userId })
      .sort({ createdAt: -1 })
      .limit(limit);

    return {
      balance: user.ecoCoins,
      level: user.userLevel,
      accountType: user.accountType,
      transactions: transactions.map(tx => ({
        id: tx._id,
        type: tx.type,
        amount: tx.amount,
        source: tx.source,
        createdAt: tx.createdAt
      }))
    };
  }

  /**
   * Get gift catalog
   */
  getGiftCatalog() {
    return Object.entries(this.giftCosts).map(([type, cost]) => ({
      type,
      cost,
      icon: this.getGiftIcon(type)
    }));
  }

  /**
   * Get gift icon emoji
   */
  getGiftIcon(type) {
    const icons = {
      seedling: '??',
      water: '??',
      solar: '??',
      tree: '??',
      wind: '??'
    };
    return icons[type] || '??';
  }

  /**
   * Get economy statistics
   */
  async getEconomyStats() {
    const totalCoins = await User.aggregate([
      { $group: { _id: null, total: { $sum: '$ecoCoins' } } }
    ]);

    const totalTransactions = await Transaction.countDocuments();
    const todayTransactions = await Transaction.countDocuments({
      createdAt: { $gte: new Date().setHours(0, 0, 0, 0) }
    });

    return {
      totalCoinsInCirculation: totalCoins[0]?.total || 0,
      totalTransactions,
      todayTransactions,
      activeUsers: await User.countDocuments({ ecoCoins: { $gt: 0 } }),
      abuseStats: antiAbuseService.getAbuseStats()
    };
  }

  /**
   * Cleanup old transactions (maintenance)
   */
  async cleanupOldTransactions(daysToKeep = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const result = await Transaction.deleteMany({
      createdAt: { $lt: cutoffDate }
    });

    console.log(`Cleaned up ${result.deletedCount} old transactions`);
    return result.deletedCount;
  }
}

export default new EcoCoinService();
