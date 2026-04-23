/**
 * Debounce Middleware - Prevents rapid duplicate requests
 */

export const debounce = (delay = 1000) => {
  const pendingRequests = new Map();

  return (req, res, next) => {
    const key = `${req.method}:${req.originalUrl}:${req.ip}:${JSON.stringify(req.body)}`;
    const now = Date.now();

    if (pendingRequests.has(key)) {
      const lastRequest = pendingRequests.get(key);
      
      // If same request within delay period, return previous response or reject
      if (now - lastRequest < delay) {
        return res.status(429).json({
          error: 'Duplicate request detected',
          message: 'Please wait before making the same request again.',
          retryAfter: Math.ceil((delay - (now - lastRequest)) / 1000)
        });
      }
    }

    pendingRequests.set(key, now);

    // Clean up old entries
    setTimeout(() => {
      pendingRequests.delete(key);
    }, delay);

    next();
  };
};

// User-specific debounce (prevents same user from rapid actions)
export const userDebounce = (delay = 2000) => {
  const userRequests = new Map();

  return (req, res, next) => {
    const userId = req.user?._id || req.ip;
    const key = `${req.method}:${req.originalUrl}:${userId}:${JSON.stringify(req.body)}`;
    const now = Date.now();

    if (userRequests.has(key)) {
      const lastRequest = userRequests.get(key);
      
      if (now - lastRequest < delay) {
        return res.status(429).json({
          error: 'Action too frequent',
          message: 'Please wait before performing this action again.',
          retryAfter: Math.ceil((delay - (now - lastRequest)) / 1000)
        });
      }
    }

    userRequests.set(key, now);

    setTimeout(() => {
      userRequests.delete(key);
    }, delay);

    next();
  };
};

// Live stream specific debounce
export const liveStreamDebounce = (delay = 500) => {
  const streamActions = new Map();

  return (req, res, next) => {
    const streamId = req.params.streamId || req.body.streamId;
    const userId = req.user?._id || req.ip;
    const key = `${streamId}:${userId}:${req.originalUrl}`;
    const now = Date.now();

    if (streamActions.has(key)) {
      const lastAction = streamActions.get(key);
      
      if (now - lastAction < delay) {
        return res.status(429).json({
          error: 'Live stream action too frequent',
          message: 'Please wait before performing this action again.',
          retryAfter: Math.ceil((delay - (now - lastAction)) / 1000)
        });
      }
    }

    streamActions.set(key, now);

    setTimeout(() => {
      streamActions.delete(key);
    }, delay);

    next();
  };
};
