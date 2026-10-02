/**
 * runtimeConfig.js — canonical API URL resolver for EcoNet frontend.
 *
 * Resolution order:
 *  1. VITE_API_URL env var (set in Netlify dashboard for production,
 *     or locally in .env for development)
 *  2. localhost fallback for local dev
 *  3. /.netlify/functions/api fallback for Netlify deployments without
 *     a Render backend configured
 *
 * For production Netlify deploys: set VITE_API_URL in the Netlify dashboard
 * to your Render backend URL, e.g. https://econet-api.onrender.com
 * Do NOT hardcode it in .env (that file is committed to the repo).
 */

export function getApiBaseUrl() {
  const envUrl = import.meta.env.VITE_API_URL?.trim().replace(/\/$/, '');
  if (envUrl) {
    // Already ends with /api — use as-is
    if (envUrl.endsWith('/api') || envUrl.includes('/.netlify/functions/api')) {
      return envUrl;
    }
    // Bare origin (e.g. https://econet-api.onrender.com) — append /api
    return `${envUrl}/api`;
  }

  // Local development fallback
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      return 'http://localhost:5000/api';
    }
  }

  // Netlify deployment without VITE_API_URL configured — use serverless function.
  // NOTE: v2 routes (missions, communities) are NOT available here.
  // Set VITE_API_URL in the Netlify dashboard to enable full functionality.
  return '/.netlify/functions/api';
}

export function getApiOrigin() {
  const base = getApiBaseUrl();
  if (base.includes('/.netlify/functions/api')) {
    return typeof window !== 'undefined' ? window.location.origin : '';
  }
  return base.replace(/\/api$/, '');
}

export function resolveMediaUrl(src) {
  if (!src) return '';
  if (/^(https?:|data:|blob:)/i.test(src)) return src;
  const origin = getApiOrigin();
  if (!src.startsWith('/')) return `${origin}/${src}`;
  return `${origin}${src}`;
}

/**
 * Returns the base URL for canonical v2 API endpoints (/api/v2/*).
 *
 * v2 routes are served ONLY by the Express backend (Render).
 * They are NOT available through Netlify functions.
 *
 * Returns:
 *  - string  — the v2 origin (e.g. "https://econet-api.onrender.com") when
 *              VITE_API_URL points to the Express backend.
 *  - null    — when VITE_API_URL is unset and the fallback is Netlify functions.
 *              Callers must handle null gracefully and show an informative state.
 */
export function getV2ApiOrigin() {
  const base = getApiBaseUrl();

  // Netlify Functions path — v2 routes not available.
  if (base.includes('/.netlify/functions/api')) {
    return null;
  }

  // Express backend — strip /api suffix to get the origin.
  return base.replace(/\/api$/, '');
}
