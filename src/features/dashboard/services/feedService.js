import { getApiBaseUrl } from '../../../services/runtimeConfig.js';

/**
 * Feed service - handles all feed-related API calls
 */
export class FeedService {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    this.apiBaseUrl = getApiBaseUrl();
  }

  createTimeoutController(timeoutMs) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    return {
      controller,
      clear: () => clearTimeout(timeoutId)
    };
  }

  /**
   * Fetch feed data
   */
  async fetchFeed(filter = 'for-you', token = null) {
    try {
      console.log('FEED SERVICE: Fetching feed with filter:', filter);
      
      const url = `${this.apiBaseUrl}/reports/feed?filter=${filter}`;
      const timeout = this.createTimeoutController(12000);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        signal: timeout.controller.signal
      });
      timeout.clear();

      console.log('FEED SERVICE: Response status:', response.status);

      if (!response.ok) {
        throw new Error(`Feed fetch failed: ${response.status}`);
      }

      const data = await response.json();
      
      // Cache the result
      this.cache.set(filter, {
        data,
        timestamp: Date.now()
      });

      console.log('FEED SERVICE: Feed fetched successfully');
      return {
        success: true,
        data: data,
        fromCache: false
      };

    } catch (error) {
      console.error('FEED SERVICE: Fetch failed:', error);
      
      // Try to return cached data if available
      const cached = this.cache.get(filter);
      if (cached && (Date.now() - cached.timestamp < this.cacheTimeout)) {
        console.log('FEED SERVICE: Returning cached data');
        return {
          success: true,
          data: cached.data,
          fromCache: true
        };
      }
      
      // Return demo data as fallback
      console.log('FEED SERVICE: Returning demo data as fallback');
      return {
        success: true,
        data: [
          {
            id: 'demo-1',
            description: 'Fire detected in industrial area - immediate response needed',
            content: 'Fire detected in industrial area - immediate response needed',
            category: 'Fire',
            severity: 'Critical',
            urgency: 'Immediate',
            postStatus: 'critical',
            signalSource: 'social',
            location: { text: 'Abuja', lat: 9.0579, lon: 7.4951 },
            createdAt: new Date().toISOString(),
            timestamp: new Date(),
            aiScore: 88,
            likes: 0,
            comments: 0,
            shares: 0,
            tags: ['#Fire', '#Emergency', '#Climate'],
            images: ['https://picsum.photos/seed/fire1/400/300.jpg'],
            liloClassification: {
              isClimateRelated: true,
              confidence: 88,
              summary: 'LILO escalated this fire signal to command mode.',
              matchedSignals: ['fire'],
              routedToCommand: true
            },
            user: {
              name: 'Abuja Fire Dept',
              avatar: 'https://picsum.photos/seed/demo1/150/150.jpg',
              verifiedReporter: true,
              trustScore: 85
            }
          },
          {
            id: 'demo-2',
            description: 'Severe flooding in Lagos Victoria Island - evacuation in progress',
            content: 'Severe flooding in Lagos Victoria Island - evacuation in progress',
            category: 'Flood',
            severity: 'Moderate',
            urgency: 'Observation',
            postStatus: 'observe',
            signalSource: 'social',
            location: { text: 'Lagos Victoria Island', lat: 6.5244, lon: 3.3792 },
            createdAt: new Date().toISOString(),
            timestamp: new Date(),
            aiScore: 82,
            likes: 0,
            comments: 0,
            shares: 0,
            tags: ['#Flood', '#Emergency', '#Climate'],
            images: ['https://picsum.photos/seed/flood1/400/300.jpg'],
            liloClassification: {
              isClimateRelated: true,
              confidence: 82,
              summary: 'LILO marked this flood post for observation.',
              matchedSignals: ['flood'],
              routedToCommand: true
            },
            user: {
              name: 'Lagos Emergency',
              avatar: 'https://picsum.photos/seed/demo2/150/150.jpg',
              verifiedReporter: true,
              trustScore: 78
            }
          },
          {
            id: 'demo-3',
            description: 'Community cleanup this weekend. Bring gloves and water.',
            content: 'Community cleanup this weekend. Bring gloves and water.',
            category: 'Other',
            severity: 'Low',
            urgency: 'Low',
            postStatus: 'regular',
            signalSource: 'social',
            location: { text: '', lat: null, lon: null },
            createdAt: new Date().toISOString(),
            timestamp: new Date(),
            aiScore: 12,
            likes: 0,
            comments: 0,
            shares: 0,
            tags: ['#Community', '#Cleanup'],
            images: [],
            liloClassification: {
              isClimateRelated: false,
              confidence: 12,
              summary: 'LILO kept this update in the social feed.',
              matchedSignals: [],
              routedToCommand: false
            },
            user: {
              name: 'Port Harcourt Monitor',
              avatar: 'https://picsum.photos/seed/demo3/150/150.jpg',
              verifiedReporter: true,
              trustScore: 92
            }
          }
        ],
        fromCache: false
      };
    }
  }

  /**
   * Create a new post
   */
  async createPost(postData, token = null) {
    try {
      console.log('FEED SERVICE: Creating post:', postData);
      const timeout = this.createTimeoutController(25000);
      
      const response = await fetch(`${this.apiBaseUrl}/reports`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(postData),
        signal: timeout.controller.signal
      });
      timeout.clear();

      console.log('FEED SERVICE: Create post response status:', response.status);

      if (!response.ok) {
        throw new Error(`Post creation failed: ${response.status}`);
      }

      const data = await response.json();
      console.log('FEED SERVICE: Post created successfully');
      return {
        success: true,
        data: data
      };

    } catch (error) {
      console.error('FEED SERVICE: Create post failed:', error);
      return {
        success: false,
        error: error.name === 'AbortError' ? 'Post request timed out before the upload completed.' : error.message
      };
    }
  }

  /**
   * Like a post
   */
  async likePost(postId, token = null) {
    try {
      const response = await fetch(`${this.apiBaseUrl}/reports/${postId}/like`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error(`Like failed: ${response.status}`);
      }

      return {
        success: true,
        data: await response.json()
      };

    } catch (error) {
      console.error('FEED SERVICE: Like post failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Comment on a post
   */
  async commentOnPost(postId, comment, token = null) {
    try {
      const response = await fetch(`${this.apiBaseUrl}/comments/${postId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ text: comment })
      });

      if (!response.ok) {
        throw new Error(`Comment failed: ${response.status}`);
      }

      return {
        success: true,
        data: await response.json()
      };

    } catch (error) {
      console.error('FEED SERVICE: Comment on post failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Share a post
   */
  async sharePost(postId, token = null) {
    try {
      const response = await fetch(`${this.apiBaseUrl}/reports/${postId}/share`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error(`Share failed: ${response.status}`);
      }

      return {
        success: true,
        data: await response.json()
      };

    } catch (error) {
      console.error('FEED SERVICE: Share post failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async fetchComments(postId, token = null) {
    try {
      const response = await fetch(`${this.apiBaseUrl}/comments/${postId}`, {
        method: 'GET',
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });

      if (!response.ok) {
        throw new Error(`Comments fetch failed: ${response.status}`);
      }

      return {
        success: true,
        data: await response.json()
      };
    } catch (error) {
      console.error('FEED SERVICE: Fetch comments failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async validatePost(postId, token = null) {
    try {
      const response = await fetch(`${this.apiBaseUrl}/votes/${postId}/upvote`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error(`Validate failed: ${response.status}`);
      }

      return {
        success: true,
        data: await response.json()
      };
    } catch (error) {
      console.error('FEED SERVICE: Validate post failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async downvotePost(postId, token = null) {
    try {
      const response = await fetch(`${this.apiBaseUrl}/votes/${postId}/downvote`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error(`Downvote failed: ${response.status}`);
      }

      return {
        success: true,
        data: await response.json()
      };
    } catch (error) {
      console.error('FEED SERVICE: Downvote post failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async verifyPost(postId, token = null) {
    try {
      const response = await fetch(`${this.apiBaseUrl}/votes/${postId}/verify`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error(`Verify failed: ${response.status}`);
      }

      return {
        success: true,
        data: await response.json()
      };
    } catch (error) {
      console.error('FEED SERVICE: Verify post failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  clearCache() {
    this.cache.clear();
  }

  toggleLike(postId, token = null) {
    return this.likePost(postId, token);
  }

  submitComment(postId, comment, token = null) {
    return this.commentOnPost(postId, comment, token);
  }
}

// Export singleton instance
export const feedService = new FeedService();
