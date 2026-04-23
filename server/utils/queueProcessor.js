/**
 * Queue Processor - Handles async processing of high-volume operations
 */

export class QueueProcessor {
  constructor() {
    this.queues = new Map();
    this.processing = new Map();
    this.workers = new Map();
    this.maxConcurrency = 5;
  }

  /**
   * Create a new queue
   */
  createQueue(name, processor, options = {}) {
    const queue = {
      name,
      processor,
      tasks: [],
      processing: false,
      concurrency: options.concurrency || 3,
      retryAttempts: options.retryAttempts || 3,
      retryDelay: options.retryDelay || 1000,
      maxQueueSize: options.maxQueueSize || 1000
    };

    this.queues.set(name, queue);
    this.workers.set(name, []);
    
    console.log(`Queue '${name}' created with concurrency ${queue.concurrency}`);
    return queue;
  }

  /**
   * Add task to queue
   */
  async addTask(queueName, task, priority = 0) {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue '${queueName}' not found`);
    }

    // Check queue size limit
    if (queue.tasks.length >= queue.maxQueueSize) {
      throw new Error(`Queue '${queueName}' is full`);
    }

    const taskWrapper = {
      id: Date.now() + Math.random(),
      task,
      priority,
      addedAt: Date.now(),
      attempts: 0,
      status: 'pending'
    };

    // Insert by priority (higher priority first)
    const insertIndex = queue.tasks.findIndex(t => t.priority < priority);
    if (insertIndex === -1) {
      queue.tasks.push(taskWrapper);
    } else {
      queue.tasks.splice(insertIndex, 0, taskWrapper);
    }

    // Start processing if not already running
    this.startProcessing(queueName);

    return taskWrapper.id;
  }

  /**
   * Start processing queue
   */
  async startProcessing(queueName) {
    const queue = this.queues.get(queueName);
    if (!queue || queue.processing) return;

    queue.processing = true;
    console.log(`Starting queue processing for '${queueName}'`);

    // Start workers
    for (let i = 0; i < queue.concurrency; i++) {
      this.processNextTask(queueName);
    }
  }

  /**
   * Process next task in queue
   */
  async processNextTask(queueName) {
    const queue = this.queues.get(queueName);
    if (!queue || queue.tasks.length === 0) {
      queue.processing = false;
      return;
    }

    const taskWrapper = queue.tasks.shift();
    taskWrapper.status = 'processing';
    taskWrapper.startedAt = Date.now();

    try {
      console.log(`Processing task ${taskWrapper.id} in queue '${queueName}'`);
      
      const result = await queue.processor(taskWrapper.task);
      
      taskWrapper.status = 'completed';
      taskWrapper.completedAt = Date.now();
      taskWrapper.result = result;

      console.log(`Task ${taskWrapper.id} completed successfully`);
    } catch (error) {
      console.error(`Task ${taskWrapper.id} failed:`, error);
      
      taskWrapper.attempts++;
      taskWrapper.lastError = error;
      
      // Retry logic
      if (taskWrapper.attempts < queue.retryAttempts) {
        taskWrapper.status = 'retrying';
        
        // Add back to queue with delay
        setTimeout(() => {
          taskWrapper.status = 'pending';
          queue.tasks.push(taskWrapper);
          this.processNextTask(queueName);
        }, queue.retryDelay * taskWrapper.attempts);
        
        return;
      } else {
        taskWrapper.status = 'failed';
        taskWrapper.failedAt = Date.now();
      }
    }

    // Process next task
    this.processNextTask(queueName);
  }

  /**
   * Get queue statistics
   */
  getQueueStats(queueName) {
    const queue = this.queues.get(queueName);
    if (!queue) return null;

    const stats = {
      name: queueName,
      processing: queue.processing,
      pending: queue.tasks.filter(t => t.status === 'pending').length,
      processing: queue.tasks.filter(t => t.status === 'processing').length,
      completed: queue.tasks.filter(t => t.status === 'completed').length,
      failed: queue.tasks.filter(t => t.status === 'failed').length,
      retrying: queue.tasks.filter(t => t.status === 'retrying').length,
      totalTasks: queue.tasks.length,
      concurrency: queue.concurrency
    };

    return stats;
  }

  /**
   * Get all queue statistics
   */
  getAllStats() {
    const stats = {};
    
    for (const [name] of this.queues) {
      stats[name] = this.getQueueStats(name);
    }

    return stats;
  }

  /**
   * Clear completed/failed tasks from queue
   */
  cleanupQueue(queueName, maxAge = 300000) { // 5 minutes default
    const queue = this.queues.get(queueName);
    if (!queue) return;

    const cutoffTime = Date.now() - maxAge;
    const originalLength = queue.tasks.length;

    queue.tasks = queue.tasks.filter(task => {
      const isOldCompleted = task.status === 'completed' && task.completedAt && task.completedAt < cutoffTime;
      const isOldFailed = task.status === 'failed' && task.failedAt && task.failedAt < cutoffTime;
      
      return !isOldCompleted && !isOldFailed;
    });

    const cleanedCount = originalLength - queue.tasks.length;
    if (cleanedCount > 0) {
      console.log(`Cleaned up ${cleanedCount} old tasks from queue '${queueName}'`);
    }

    return cleanedCount;
  }

  /**
   * Pause queue processing
   */
  pauseQueue(queueName) {
    const queue = this.queues.get(queueName);
    if (queue) {
      queue.processing = false;
      console.log(`Queue '${queueName}' paused`);
    }
  }

  /**
   * Resume queue processing
   */
  resumeQueue(queueName) {
    const queue = this.queues.get(queueName);
    if (queue && !queue.processing) {
      this.startProcessing(queueName);
    }
  }

  /**
   * Clear queue
   */
  clearQueue(queueName) {
    const queue = this.queues.get(queueName);
    if (queue) {
      const clearedCount = queue.tasks.length;
      queue.tasks = [];
      console.log(`Cleared ${clearedCount} tasks from queue '${queueName}'`);
      return clearedCount;
    }
    return 0;
  }

  /**
   * Shutdown all queues
   */
  async shutdown() {
    console.log('Shutting down all queues...');
    
    for (const [name, queue] of this.queues) {
      this.pauseQueue(name);
      
      // Wait for current tasks to complete (with timeout)
      const timeout = setTimeout(() => {
        console.log(`Queue '${name}' shutdown timeout`);
      }, 10000);
      
      // Wait for processing to finish
      while (queue.tasks.some(t => t.status === 'processing')) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      clearTimeout(timeout);
    }
    
    console.log('All queues shut down');
  }
}

// Singleton instance
export default new QueueProcessor();
