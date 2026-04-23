/**
 * Live Stream Scaling Service - Handles high-volume live interactions
 */

export class LiveStreamService {
  constructor() {
    this.viewerBatches = new Map(); // streamId -> batch data
    this.tapBatches = new Map(); // streamId -> tap data
    this.giftBatches = new Map(); // streamId -> gift data
    this.batchInterval = 5000; // 5 seconds
    this.maxBatchSize = 1000;
    
    // Start batch processing
    this.startBatchProcessing();
  }

  /**
   * Initialize stream tracking
   */
  initializeStream(streamId, hostId) {
    this.viewerBatches.set(streamId, {
      hostId,
      viewers: new Set(),
      tapCounts: new Map(), // userId -> tap count
      giftCounts: new Map(), // userId -> gift count
      totalTaps: 0,
      totalGifts: 0,
      totalValue: 0,
      lastProcessed: Date.now()
    });

    console.log(`Live stream ${streamId} initialized for host ${hostId}`);
  }

  /**
   * Add viewer to stream
   */
  addViewer(streamId, userId) {
    const batch = this.viewerBatches.get(streamId);
    if (batch) {
      batch.viewers.add(userId);
      return batch.viewers.size;
    }
    return 0;
  }

  /**
   * Remove viewer from stream
   */
  removeViewer(streamId, userId) {
    const batch = this.viewerBatches.get(streamId);
    if (batch) {
      batch.viewers.delete(userId);
      return batch.viewers.size;
    }
    return 0;
  }

  /**
   * Record tap (batched for performance)
   */
  recordTap(streamId, userId) {
    const batch = this.viewerBatches.get(streamId);
    if (!batch) return false;

    // Increment tap count for user
    const currentTaps = batch.tapCounts.get(userId) || 0;
    batch.tapCounts.set(userId, currentTaps + 1);
    batch.totalTaps++;

    return true;
  }

  /**
   * Record gift (batched for performance)
   */
  recordGift(streamId, fromUserId, giftType, value) {
    const batch = this.viewerBatches.get(streamId);
    if (!batch) return false;

    // Track gift by user
    const currentGifts = batch.giftCounts.get(fromUserId) || 0;
    batch.giftCounts.set(fromUserId, {
      count: currentGifts + 1,
      totalValue: (batch.giftCounts.get(fromUserId)?.totalValue || 0) + value
    });

    batch.totalGifts++;
    batch.totalValue += value;

    return true;
  }

  /**
   * Get current stream stats
   */
  getStreamStats(streamId) {
    const batch = this.viewerBatches.get(streamId);
    if (!batch) return null;

    return {
      streamId,
      hostId: batch.hostId,
      viewerCount: batch.viewers.size,
      totalTaps: batch.totalTaps,
      totalGifts: batch.totalGifts,
      totalValue: batch.totalValue,
      activeViewers: Array.from(batch.viewers),
      lastProcessed: batch.lastProcessed
    };
  }

  /**
   * Process tap batches and calculate rewards
   */
  async processTapBatch(streamId) {
    const batch = this.viewerBatches.get(streamId);
    if (!batch || batch.tapCounts.size === 0) return;

    const hostId = batch.hostId;
    const totalReward = await this.calculateTapReward(batch.tapCounts);

    try {
      // Send batched reward to host
      await this.sendBatchedReward(hostId, totalReward, 'TAP_BATCH', {
        streamId,
        tapCount: batch.totalTaps,
        uniqueTappers: batch.tapCounts.size
      });

      // Clear tap batch
      batch.tapCounts.clear();
      batch.totalTaps = 0;
      batch.lastProcessed = Date.now();

      console.log(`Processed tap batch for stream ${streamId}: ${totalReward} coins`);
    } catch (error) {
      console.error(`Failed to process tap batch for stream ${streamId}:`, error);
    }
  }

  /**
   * Process gift batches
   */
  async processGiftBatch(streamId) {
    const batch = this.viewerBatches.get(streamId);
    if (!batch || batch.giftCounts.size === 0) return;

    const hostId = batch.hostId;
    
    try {
      // Process each gift transaction
      for (const [userId, giftData] of batch.giftCounts) {
        await this.sendBatchedReward(hostId, giftData.totalValue, 'GIFT_BATCH', {
          streamId,
          fromUserId: userId,
          giftCount: giftData.count,
          totalValue: giftData.totalValue
        });
      }

      // Clear gift batch
      batch.giftCounts.clear();
      batch.totalGifts = 0;
      batch.totalValue = 0;

      console.log(`Processed gift batch for stream ${streamId}`);
    } catch (error) {
      console.error(`Failed to process gift batch for stream ${streamId}:`, error);
    }
  }

  /**
   * Calculate tap reward with anti-spam considerations
   */
  async calculateTapReward(tapCounts) {
    let totalReward = 0;

    for (const [userId, tapCount] of tapCounts) {
      // Apply diminishing returns for excessive tapping
      let effectiveTaps = tapCount;
      
      if (tapCount > 50) {
        // Diminishing returns after 50 taps
        effectiveTaps = 50 + Math.sqrt(tapCount - 50) * 2;
      }

      if (tapCount > 200) {
        // Hard cap at 200 taps per batch
        effectiveTaps = 200;
      }

      // Calculate reward (0.01 coin per tap, with batch efficiency bonus)
      const userReward = effectiveTaps * 0.01;
      totalReward += userReward;
    }

    // Batch efficiency bonus (more taps = better rate)
    const totalTaps = Array.from(tapCounts.values()).reduce((sum, count) => sum + count, 0);
    const efficiencyBonus = Math.min(totalTaps / 1000, 0.2); // Max 20% bonus
    
    totalReward *= (1 + efficiencyBonus);

    return Math.round(totalReward * 100) / 100; // Round to 2 decimal places
  }

  /**
   * Send batched reward to host
   */
  async sendBatchedReward(hostId, amount, source, details) {
    // This would integrate with the EcoCoin service
    // For now, we'll simulate the reward
    console.log(`Batched reward: ${amount} coins to host ${hostId} from ${source}`, details);
    
    // In production:
    // await ecoCoinService.rewardLiveHost(hostId, amount, source, details);
    
    return { success: true, amount, source };
  }

  /**
   * Start automatic batch processing
   */
  startBatchProcessing() {
    setInterval(() => {
      this.processAllBatches();
    }, this.batchInterval);

    console.log(`Live stream batch processing started (${this.batchInterval}ms intervals)`);
  }

  /**
   * Process all active batches
   */
  async processAllBatches() {
    const streamIds = Array.from(this.viewerBatches.keys());
    
    // Process in parallel for efficiency
    const promises = streamIds.map(async (streamId) => {
      await this.processTapBatch(streamId);
      await this.processGiftBatch(streamId);
    });

    try {
      await Promise.all(promises);
    } catch (error) {
      console.error('Batch processing error:', error);
    }
  }

  /**
   * End stream and cleanup
   */
  endStream(streamId) {
    const batch = this.viewerBatches.get(streamId);
    if (!batch) return false;

    // Process final batches
    this.processTapBatch(streamId);
    this.processGiftBatch(streamId);

    // Get final stats
    const finalStats = this.getStreamStats(streamId);

    // Cleanup
    this.viewerBatches.delete(streamId);

    console.log(`Stream ${streamId} ended. Final stats:`, finalStats);
    return finalStats;
  }

  /**
   * Get system-wide statistics
   */
  getSystemStats() {
    const activeStreams = this.viewerBatches.size;
    let totalViewers = 0;
    let totalTaps = 0;
    let totalGifts = 0;
    let totalValue = 0;

    for (const batch of this.viewerBatches.values()) {
      totalViewers += batch.viewers.size;
      totalTaps += batch.totalTaps;
      totalGifts += batch.totalGifts;
      totalValue += batch.totalValue;
    }

    return {
      activeStreams,
      totalViewers,
      totalTaps,
      totalGifts,
      totalValue,
      batchInterval: this.batchInterval,
      maxBatchSize: this.maxBatchSize
    };
  }

  /**
   * Cleanup inactive streams
   */
  cleanupInactiveStreams(maxAgeMinutes = 30) {
    const cutoffTime = Date.now() - (maxAgeMinutes * 60 * 1000);
    const streamsToCleanup = [];

    for (const [streamId, batch] of this.viewerBatches) {
      if (batch.lastProcessed < cutoffTime) {
        streamsToCleanup.push(streamId);
      }
    }

    streamsToCleanup.forEach(streamId => {
      this.endStream(streamId);
    });

    if (streamsToCleanup.length > 0) {
      console.log(`Cleaned up ${streamsToCleanup.length} inactive streams`);
    }

    return streamsToCleanup.length;
  }

  /**
   * Get stream performance metrics
   */
  getStreamMetrics(streamId) {
    const batch = this.viewerBatches.get(streamId);
    if (!batch) return null;

    const now = Date.now();
    const streamAge = (now - batch.lastProcessed) / 1000; // seconds

    return {
      tapsPerSecond: batch.totalTaps / Math.max(streamAge, 1),
      giftsPerSecond: batch.totalGifts / Math.max(streamAge, 1),
      valuePerSecond: batch.totalValue / Math.max(streamAge, 1),
      averageTapsPerViewer: batch.totalTaps / Math.max(batch.viewers.size, 1),
      engagementRate: (batch.totalTaps + batch.totalGifts) / Math.max(batch.viewers.size, 1)
    };
  }

  /**
   * Optimize batch processing based on load
   */
  optimizeBatchProcessing() {
    const stats = this.getSystemStats();
    
    // Adjust batch interval based on load
    if (stats.activeStreams > 100) {
      this.batchInterval = 3000; // 3 seconds for high load
    } else if (stats.activeStreams > 50) {
      this.batchInterval = 4000; // 4 seconds for medium load
    } else {
      this.batchInterval = 5000; // 5 seconds for normal load
    }

    console.log(`Optimized batch interval to ${this.batchInterval}ms for ${stats.activeStreams} streams`);
  }
}

export default new LiveStreamService();
