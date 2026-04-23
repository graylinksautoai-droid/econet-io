import { getApiBaseUrl } from './runtimeConfig.js';

const API_BASE_URL = getApiBaseUrl();
const ANALYZE_BASE_URL = API_BASE_URL.endsWith('/api')
  ? API_BASE_URL.slice(0, -4)
  : API_BASE_URL.replace(/\/\.netlify\/functions\/api$/, '/.netlify/functions/api');

// API endpoints
export const API_ENDPOINTS = {
  // Authentication
  AUTH: {
    LOGIN: `${API_BASE_URL}/auth/login`,
    REGISTER: `${API_BASE_URL}/auth/register`,
    PROFILE: `${API_BASE_URL}/auth/profile`
  },
  
  // Marketplace
  MARKETPLACE: {
    PRODUCTS: `${API_BASE_URL}/marketplace/products`,
    CART: `${API_BASE_URL}/marketplace/cart`,
    CHECKOUT: `${API_BASE_URL}/marketplace/checkout`,
    ORDERS: `${API_BASE_URL}/marketplace/orders`
  },
  
  // Profile
  PROFILE: {
    GET: `${API_BASE_URL}/profile`,
    UPDATE: `${API_BASE_URL}/profile`,
    SETTINGS: `${API_BASE_URL}/profile/settings`,
    AVATAR: `${API_BASE_URL}/profile/avatar`
  },

  USERS: {
    LEADERBOARD: `${API_BASE_URL}/users/leaderboard`
  },
  
  // Upload
  UPLOAD: {
    IMAGE: `${API_BASE_URL}/upload/image`,
    IMAGES: `${API_BASE_URL}/upload/images`
  },
  
  // Reports
  REPORTS: {
    FEED: `${API_BASE_URL}/reports/feed`,
    CREATE: `${API_BASE_URL}/reports`,
    ANALYZE: `${ANALYZE_BASE_URL}/analyze-report`
  },

  MAP: {
    REPORTS: `${API_BASE_URL}/map/reports`,
    PULSE: `${API_BASE_URL}/map/pulse`
  },

  NOTIFICATIONS: {
    SUBSCRIBE: `${API_BASE_URL}/notifications/subscribe`,
    UNSUBSCRIBE: `${API_BASE_URL}/notifications/unsubscribe`
  }
};

// Helper function to get auth token
export const getAuthToken = () => {
  return localStorage.getItem('token') || sessionStorage.getItem('token');
};

// Helper function to get auth headers
export const getAuthHeaders = () => {
  const token = getAuthToken();
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };
};

// Generic API request function
export const apiRequest = async (endpoint, options = {}) => {
  try {
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    };

    // Add auth header if token exists
    const token = getAuthToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(endpoint, config);

    const payload = await response.json().catch(() => ({}));
    
    if (!response.ok) {
      const message = payload?.error || payload?.message || `API Error: ${response.status} ${response.statusText}`;
      throw new Error(message);
    }
    
    return payload;
  } catch (error) {
    console.error('API Request Error:', error);
    throw error;
  }
};
