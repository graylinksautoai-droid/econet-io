export function getApiBaseUrl() {
  const envUrl = import.meta.env.VITE_API_URL?.replace(/\/$/, '');
  if (envUrl) {
    if (envUrl.endsWith('/api') || envUrl.includes('/.netlify/functions/api')) {
      return envUrl;
    }
    return `${envUrl}/api`;
  }

  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      return 'http://localhost:5000/api';
    }
  }

  return '/.netlify/functions/api';
}

export function getApiOrigin() {
  const base = getApiBaseUrl();

  if (base.includes('/.netlify/functions/api')) {
    return base.replace(/\/\.netlify\/functions\/api$/, '');
  }

  return base.replace(/\/api$/, '');
}

export function resolveMediaUrl(src) {
  if (!src) return '';
  if (/^(https?:|data:|blob:)/i.test(src)) return src;

  const origin = getApiOrigin();
  if (!src.startsWith('/')) {
    return `${origin}/${src}`;
  }

  return `${origin}${src}`;
}
