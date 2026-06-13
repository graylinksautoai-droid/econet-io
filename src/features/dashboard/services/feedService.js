import { createClient } from '@supabase/supabase-js';
import { getApiBaseUrl } from '../../../services/runtimeConfig.js';

const OFFLINE_POSTS_KEY = 'econet_offline_posts';
const POSTS_TABLE = 'posts';
const SUPABASE_REQUEST_TIMEOUT_MS = 15000;

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      },
      global: {
        headers: {
          'X-Client-Info': 'econet-io-feed-service'
        }
      }
    })
  : null;

const isBrowser = () => typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

const createLocalPostId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `local-${crypto.randomUUID()}`;
  }

  return `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const normalizeSupabaseError = (error) => {
  if (!error) return 'Unknown Supabase error';
  return error.message || error.details || String(error);
};

/**
 * Feed service - handles all feed-related data access.
 *
 * Netlify builds talk directly to the Supabase `posts` table for global post
 * sync while retaining the existing server endpoints for engagement actions.
 */
export class FeedService {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    this.apiBaseUrl = getApiBaseUrl();
    this.supabase = supabase;

    if (isBrowser()) {
      window.addEventListener('online', () => {
        this.syncOfflinePosts().catch((error) => {
          console.error('FEED SERVICE: Online sync failed:', error);
        });
      });
    }
  }

  createTimeoutController(timeoutMs) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    return {
      controller,
      clear: () => clearTimeout(timeoutId)
    };
  }

  assertSupabaseReady() {
    if (!this.supabase) {
      throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
    }
  }

  getOfflinePosts() {
    if (!isBrowser()) return [];

    try {
      const storedPosts = window.localStorage.getItem(OFFLINE_POSTS_KEY);
      return storedPosts ? JSON.parse(storedPosts) : [];
    } catch (error) {
      console.error('FEED SERVICE: Failed to read offline posts:', error);
      return [];
    }
  }

  setOfflinePosts(posts) {
    if (!isBrowser()) return;
    window.localStorage.setItem(OFFLINE_POSTS_KEY, JSON.stringify(posts));
  }

  cacheOfflinePost(postData, error = null) {
    const offlinePost = {
      ...postData,
      id: postData.id || createLocalPostId(),
      localId: postData.localId || createLocalPostId(),
      synced: false,
      syncError: error ? normalizeSupabaseError(error) : null,
      createdAt: postData.createdAt || postData.created_at || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const posts = this.getOfflinePosts();
    const nextPosts = [offlinePost, ...posts.filter((post) => post.localId !== offlinePost.localId && post.id !== offlinePost.id)];
    this.setOfflinePosts(nextPosts);
    return offlinePost;
  }

  toSupabasePost(postData) {
    const now = new Date().toISOString();
    const cleanPostData = { ...postData };
    delete cleanPostData.localId;
    delete cleanPostData.syncError;
    delete cleanPostData.synced;

    return {
      ...cleanPostData,
      content: cleanPostData.content || cleanPostData.description || '',
      description: cleanPostData.description || cleanPostData.content || '',
      synced: true,
      created_at: cleanPostData.created_at || cleanPostData.createdAt || now,
      updated_at: now
    };
  }

  normalizeRemotePost(post) {
    return {
      ...post,
      id: post.id,
      content: post.content || post.description || '',
      description: post.description || post.content || '',
      createdAt: post.createdAt || post.created_at,
      updatedAt: post.updatedAt || post.updated_at,
      timestamp: post.timestamp || post.createdAt || post.created_at,
      synced: post.synced !== false
    };
  }

  async insertSupabasePost(postData) {
    this.assertSupabaseReady();

    if (isBrowser() && navigator.onLine === false) {
      throw new Error('Device is offline. Post queued for sync.');
    }

    const timeout = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Supabase post request timed out.')), SUPABASE_REQUEST_TIMEOUT_MS);
    });

    const insert = this.supabase
      .from(POSTS_TABLE)
      .insert(this.toSupabasePost(postData))
      .select()
      .single();

    const { data, error } = await Promise.race([insert, timeout]);

    if (error) {
      throw error;
    }

    return this.normalizeRemotePost(data);
  }

  /**
   * Fetch feed data from Supabase, merging queued offline posts for the current device.
   */
  async fetchFeed(filter = 'for-you') {
    try {
      console.log('FEED SERVICE: Fetching feed with filter:', filter);
      this.assertSupabaseReady();

      const { data, error } = await this.supabase
        .from(POSTS_TABLE)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) {
        throw error;
      }

      const remotePosts = (data || []).map((post) => this.normalizeRemotePost(post));
      const offlinePosts = this.getOfflinePosts().filter((post) => post.synced === false);
      const feedData = [...offlinePosts, ...remotePosts];

      this.cache.set(filter, {
        data: feedData,
        timestamp: Date.now()
      });

      console.log('FEED SERVICE: Feed fetched successfully');
      return {
        success: true,
        data: feedData,
        fromCache: false
      };
    } catch (error) {
      console.error('FEED SERVICE: Fetch failed:', error);

      const cached = this.cache.get(filter);
      if (cached && (Date.now() - cached.timestamp < this.cacheTimeout)) {
        return {
          success: true,
          data: cached.data,
          fromCache: true
        };
      }

      return {
        success: true,
        data: this.getOfflinePosts(),
        fromCache: false,
        offline: true,
        error: normalizeSupabaseError(error)
      };
    }
  }

  /**
   * Create a new post through Supabase. Failed network/offline writes are queued locally.
   */
  async createPost(postData) {
    try {
      console.log('FEED SERVICE: Creating post:', postData);
      const post = await this.insertSupabasePost(postData);
      await this.syncOfflinePosts();

      this.clearCache();
      console.log('FEED SERVICE: Post created successfully');
      return {
        success: true,
        data: {
          report: post,
          post
        }
      };
    } catch (error) {
      console.error('FEED SERVICE: Create post failed; caching locally:', error);
      const offlinePost = this.cacheOfflinePost(postData, error);
      this.clearCache();

      return {
        success: false,
        offline: true,
        error: normalizeSupabaseError(error),
        data: {
          report: offlinePost,
          post: offlinePost
        }
      };
    }
  }

  /**
   * Push locally cached posts to Supabase when connectivity returns.
   */
  async syncOfflinePosts() {
    const offlinePosts = this.getOfflinePosts().filter((post) => post.synced === false);

    if (!offlinePosts.length) {
      return {
        success: true,
        synced: 0,
        failed: 0,
        remaining: 0
      };
    }

    try {
      this.assertSupabaseReady();

      if (isBrowser() && navigator.onLine === false) {
        throw new Error('Device is offline.');
      }

      const syncedPosts = [];
      const failedPosts = [];

      for (const post of offlinePosts) {
        try {
          const syncedPost = await this.insertSupabasePost(post);
          syncedPosts.push(syncedPost);
        } catch (error) {
          failedPosts.push({
            ...post,
            syncError: normalizeSupabaseError(error),
            updatedAt: new Date().toISOString()
          });
        }
      }

      this.setOfflinePosts(failedPosts);
      this.clearCache();

      return {
        success: failedPosts.length === 0,
        synced: syncedPosts.length,
        failed: failedPosts.length,
        remaining: failedPosts.length,
        data: syncedPosts
      };
    } catch (error) {
      console.error('FEED SERVICE: Offline sync failed:', error);
      return {
        success: false,
        synced: 0,
        failed: offlinePosts.length,
        remaining: offlinePosts.length,
        error: normalizeSupabaseError(error)
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
          Authorization: `Bearer ${token}`
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
          Authorization: `Bearer ${token}`
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
          Authorization: `Bearer ${token}`
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
