/**
 * Rate Limiting Middleware - Prevents API abuse and ensures system stability
 */

import rateLimit from 'express-rate-limit';

// General API rate limiter
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limit each IP to 1000 requests per window
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Strict rate limiter for sensitive operations
export const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
  message: {
    error: 'Rate limit exceeded for this operation.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// EcoCoin operations rate limiter
export const ecoCoinLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 50, // Limit each IP to 50 EcoCoin operations per minute
  message: {
    error: 'Too many EcoCoin operations, please wait before trying again.',
    retryAfter: '1 minute'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Live stream operations rate limiter
export const liveStreamLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 200, // Limit each IP to 200 live stream operations per minute
  message: {
    error: 'Live stream rate limit exceeded.',
    retryAfter: '1 minute'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Tap operations rate limiter (very strict)
export const tapLimiter = rateLimit({
  windowMs: 10 * 1000, // 10 seconds
  max: 100, // Limit each IP to 100 taps per 10 seconds
  message: {
    error: 'Tap rate limit exceeded. Please wait before tapping again.',
    retryAfter: '10 seconds'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Gift operations rate limiter
export const giftLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // Limit each IP to 30 gifts per minute
  message: {
    error: 'Gift rate limit exceeded. Please wait before sending another gift.',
    retryAfter: '1 minute'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Post creation rate limiter
export const postLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 10, // Limit each IP to 10 posts per 5 minutes
  message: {
    error: 'Post creation rate limit exceeded. Please wait before creating another post.',
    retryAfter: '5 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Authentication rate limiter
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Limit each IP to 20 auth attempts per 15 minutes
  message: {
    error: 'Too many authentication attempts, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful auth attempts
});
