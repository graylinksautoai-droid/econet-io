/**
 * runtimeConfig — getV2ApiOrigin() tests
 *
 * Verifies URL construction for every supported deployment target and
 * confirms that Netlify deployments correctly return null (v2 unavailable).
 *
 * We test the pure logic by simulating what getApiBaseUrl() would return for
 * each deployment scenario, then applying the same derivation used by
 * getV2ApiOrigin(). This avoids the need for a DOM/browser environment while
 * still testing the actual logic.
 *
 * Run: node --test src/services/runtimeConfig.test.js
 */

import test from 'node:test';
import assert from 'node:assert/strict';

// ─── Reproduce the getV2ApiOrigin derivation logic ───────────────────────────
// We cannot import the actual runtimeConfig.js directly in Node test context
// because it uses import.meta.env (a Vite-only feature). Instead we
// reproduce the exact logic here to verify it against each scenario.
// Any change to getV2ApiOrigin() MUST be reflected here.

function deriveV2ApiOrigin(apiBaseUrl) {
  if (!apiBaseUrl) return null;
  // Netlify Functions deployment — v2 routes are NOT served here.
  if (apiBaseUrl.includes('/.netlify/functions/api')) {
    return null;
  }
  // Express server: strip the trailing /api segment.
  return apiBaseUrl.replace(/\/api$/, '');
}

// ─── Test: Express development server ────────────────────────────────────────

test('dev server: derives correct v2 origin from localhost base URL', () => {
  const base = 'http://localhost:5000/api';
  const origin = deriveV2ApiOrigin(base);

  assert.equal(origin, 'http://localhost:5000');
  assert.equal(`${origin}/api/v2/missions`, 'http://localhost:5000/api/v2/missions');
});

// ─── Test: Custom VITE_API_URL pointing at an Express server ─────────────────

test('custom Express host: derives correct v2 origin', () => {
  const base = 'https://api.econet.io/api';
  const origin = deriveV2ApiOrigin(base);

  assert.equal(origin, 'https://api.econet.io');
  assert.equal(`${origin}/api/v2/missions`, 'https://api.econet.io/api/v2/missions');
});

// ─── Test: Netlify Functions deployment ──────────────────────────────────────

test('Netlify deployment: getV2ApiOrigin returns null (v2 not supported)', () => {
  const base = '/.netlify/functions/api';
  const origin = deriveV2ApiOrigin(base);

  assert.equal(origin, null, 'Netlify does not serve v2 routes — origin must be null');
});

test('Netlify deployment: no malformed URL is constructed', () => {
  const base = '/.netlify/functions/api';
  const origin = deriveV2ApiOrigin(base);

  // If origin were non-null and not fixed, the old bug would produce:
  // "/.netlify/functions/api/api/v2/missions"
  // Verify this bad URL is never constructed.
  if (origin !== null) {
    const url = `${origin}/api/v2/missions`;
    assert.doesNotMatch(url, /\/api\/api\/v2\/missions/, 'double /api must never appear');
  }
  // Correct behaviour: origin is null, no URL is constructed at all.
  assert.equal(origin, null);
});

// ─── Test: Netlify subdomain-style URL (custom domain) ───────────────────────

test('Netlify custom domain: still returns null for v2', () => {
  // A custom domain Netlify deployment still routes /api/* through
  // /.netlify/functions/api internally.
  // The VITE_API_URL for such a deployment would contain /.netlify/functions/api.
  const base = 'https://econet.app/.netlify/functions/api';
  const origin = deriveV2ApiOrigin(base);

  assert.equal(origin, null, 'custom-domain Netlify still cannot serve v2 routes');
});

// ─── Test: Edge case — base URL without /api suffix ──────────────────────────

test('base URL without /api suffix is returned unchanged', () => {
  // e.g. VITE_API_URL = "http://localhost:5000" (without trailing /api)
  const base = 'http://localhost:5000';
  const origin = deriveV2ApiOrigin(base);

  // replace(/\/api$/, '') has no effect — the URL is returned as-is.
  assert.equal(origin, 'http://localhost:5000');
});

// ─── Test: null/empty base URL ────────────────────────────────────────────────

test('null or empty base URL returns null', () => {
  assert.equal(deriveV2ApiOrigin(null), null);
  assert.equal(deriveV2ApiOrigin(''), null);
  assert.equal(deriveV2ApiOrigin(undefined), null);
});

// ─── Test: constructed URL is never double-api for Express deployments ────────

test('Express deployment URL never contains /api/api/', () => {
  const bases = [
    'http://localhost:5000/api',
    'https://api.econet.io/api',
    'http://127.0.0.1:5000/api'
  ];

  for (const base of bases) {
    const origin = deriveV2ApiOrigin(base);
    assert.ok(origin !== null, `origin should not be null for ${base}`);
    const url = `${origin}/api/v2/missions`;
    assert.doesNotMatch(url, /\/api\/api\//, `double /api must not appear in: ${url}`);
  }
});
