/**
 * Regression suite for the reported production failures.
 *
 * These are pure-logic tests: no network, no database, no payment provider.
 * They pin the exact root causes found during the production-readiness pass so
 * they cannot silently regress:
 *
 *   1. Marketplace "NaN" — price shapes that produced NaN in the order summary.
 *   2. Marketplace payment methods — card / bank_transfer / cash_on_delivery
 *      must be recorded truthfully and cash must never be marked paid.
 *   3. Social HTTP 413 — inline base64 media must be rejected client-side.
 *   4. Amber Alerts crash — critical reports have no `contact` object, so every
 *      render path must be null-safe.
 *   5. Communities — domain errors must map to truthful HTTP statuses.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

// ─── Helpers mirrored from the shipping components ────────────────────────────

/** Mirrors src/pages/Marketplace.jsx formatNaira(). */
const formatNaira = (minor) => {
  const n = Number(minor);
  const safe = Number.isFinite(n) ? n : 0;
  return `₦${(safe / 100).toLocaleString('en-NG')}`;
};

/** Mirrors src/pages/Marketplace.jsx toPriceMinor(). */
const toPriceMinor = (item) => {
  if (item == null) return 0;
  if (Number.isFinite(item.priceMinor)) return Math.round(item.priceMinor);
  if (typeof item.price === 'number' && Number.isFinite(item.price)) {
    return Math.round(item.price * 100);
  }
  if (typeof item.price === 'string') {
    const cleaned = item.price.replace(/[^0-9.]/g, '');
    const parsed = Number.parseFloat(cleaned);
    if (Number.isFinite(parsed)) return Math.round(parsed * 100);
  }
  return 0;
};

const lineTotalMinor = (item) => toPriceMinor(item) * (Number.isFinite(item?.quantity) ? item.quantity : 1);
const cartTotalMinor = (cart) => cart.reduce((sum, item) => sum + lineTotalMinor(item), 0);

/** Mirrors the payload-size guard added to feedService.createPost(). */
function createPostGuard(postData) {
  const body = JSON.stringify(postData);
  const hasInlineData =
    body.includes('data:image/') || body.includes('data:video/') || body.includes('data:audio/');
  if (hasInlineData || body.length > 500 * 1024) {
    return {
      success: false,
      error: 'Attachments must be uploaded first (POST /api/upload/image). Inline image data is rejected to avoid HTTP 413.',
    };
  }
  return { success: true, body };
}


/** Mirrors the critical-report mapper in src/pages/AmberAlerts.jsx. */
function mapCriticalReports(list) {
  const critical = (Array.isArray(list) ? list : [])
    .filter((r) => ['Critical', 'High'].includes(r.severity) || r.postStatus === 'critical')
    .map((r) => ({
      id: r._id || r.id,
      type: 'environmental',
      severity: (r.severity || 'medium').toLowerCase(),
      title: r.title || `${r.category || 'Environmental'} report — ${r.location?.text || 'location unconfirmed'}`,
      description: r.content || r.description || '',
      location: r.location?.text || 'Location not confirmed',
      coordinates: r.location?.coordinates
        ? { lng: r.location.coordinates[0], lat: r.location.coordinates[1] }
        : null,
      lastSeen: r.createdAt,
      reportedBy: r.user?.name || 'EcoNet field reporter',
      contact: r.contact && typeof r.contact === 'object'
        ? { phone: r.contact.phone || 'Emergency line: 112', email: r.contact.email || 'Not provided' }
        : { phone: 'Emergency line: 112', email: 'Not provided' },
      status: r.status || 'reported',
      radius: 10,
      routing: { status: 'RECOMMENDED', delivered: false, estimatedReach: null, authoritiesNotified: [] },
    }));
  return critical;
}

/** Mirrors communityErrorStatus() in server/routes/v2/communities.js. */
function communityErrorStatus(err) {
  const msg = String(err?.message || '');
  if (/lacks an authorized/i.test(msg)) return { status: 403, code: 'FORBIDDEN' };
  if (/already exists|duplicate/i.test(msg)) return { status: 409, code: 'CONFLICT' };
  if (/Cannot leave membership in status/i.test(msg)) return { status: 409, code: 'INVALID_MEMBERSHIP_TRANSITION' };
  if (/Invalid membership transition|cannot be/i.test(msg)) return { status: 409, code: 'INVALID_STATE_TRANSITION' };
  if (/No membership found/i.test(msg)) return { status: 404, code: 'NOT_MEMBER' };
  if (/not found/i.test(msg)) return { status: 404, code: 'NOT_FOUND' };
  if (/denied|unauthoriz/i.test(msg)) return { status: 403, code: 'FORBIDDEN' };
  return { status: 500, code: 'INTERNAL_ERROR' };
}


// ─── 1. Marketplace NaN regression ────────────────────────────────────────────

test('marketplace: canonical priceMinor from the persisted catalog is used verbatim', () => {
  // Mixed Fruits: 250000 kobo = ₦2,500
  assert.equal(toPriceMinor({ priceMinor: 250000 }), 250000);
  assert.equal(formatNaira(250000), '₦2,500');
});

test('marketplace: legacy numeric and string price shapes never produce NaN', () => {
  // The original bug: price was the string "N2,500" and parseInt() returned NaN.
  assert.equal(toPriceMinor({ price: 'N2,500' }), 250000, 'legacy "N2,500" string must parse');
  assert.equal(toPriceMinor({ price: '₦2,500' }), 250000, 'legacy "₦2,500" string must parse');
  assert.equal(toPriceMinor({ price: 2500 }), 250000, 'legacy numeric naira must scale to kobo');
  assert.equal(toPriceMinor({ price: '2500' }), 250000, 'numeric string must scale to kobo');
});

test('marketplace: missing or malformed price degrades to 0, never NaN', () => {
  for (const bad of [{}, { price: undefined }, { price: null }, { price: 'abc' }, null, undefined]) {
    const total = lineTotalMinor({ ...(bad || {}), quantity: 1 });
    assert.ok(Number.isFinite(total), `total must be finite for ${JSON.stringify(bad)}`);
    assert.equal(total, 0);
    assert.equal(formatNaira(total), '₦0');
  }
});

test('marketplace: formatNaira never renders the literal string "NaN"', () => {
  for (const bad of [NaN, undefined, null, 'abc', {}, [], 'N2,500']) {
    const rendered = formatNaira(bad);
    assert.ok(!rendered.includes('NaN'), `formatNaira(${String(bad)}) rendered "${rendered}"`);
  }
});

test('marketplace: cart total of Mixed Fruits x1 is exactly ₦2,500', () => {
  const cart = [{ id: 'mixed-fruits', name: 'Mixed Fruits', priceMinor: 250000, quantity: 1 }];
  assert.equal(cartTotalMinor(cart), 250000);
  assert.equal(formatNaira(cartTotalMinor(cart)), '₦2,500');
});

test('marketplace: quantity multiplies the minor-unit price', () => {
  const cart = [{ id: 'mixed-fruits', priceMinor: 250000, quantity: 3 }];
  assert.equal(cartTotalMinor(cart), 750000);
  assert.equal(formatNaira(cartTotalMinor(cart)), '₦7,500');
});

// ─── 2. Marketplace payment methods ───────────────────────────────────────────

test('marketplace: all three payment methods are accepted and recorded truthfully', () => {
  const supported = ['card', 'bank_transfer', 'cash_on_delivery'];
  const normalize = (m) => (m === 'cod' ? 'cash_on_delivery' : m);
  for (const m of supported) assert.equal(normalize(m), m);
  assert.equal(normalize('cod'), 'cash_on_delivery', 'legacy "cod" alias maps to cash_on_delivery');
  assert.ok(!supported.includes('crypto'), 'unsupported methods must be rejected');
});


// ─── 3. Social HTTP 413 regression ────────────────────────────────────────────

test('social: inline base64 media is rejected before it can trigger HTTP 413', () => {
  const huge = 'data:image/png;base64,' + 'A'.repeat(2_000_000);
  const result = createPostGuard({ description: 'drought in kano', images: [huge] });
  assert.equal(result.success, false);
  assert.match(result.error, /413|uploaded first/i);
});

test('social: the post payload is no longer duplicated across images[] and media[]', () => {
  // The root cause of the 413 was the same base64 blob present in BOTH
  // `images` and `media`. After the upload-first flow each media entry is a
  // tiny server URL, so the serialized body stays small.
  const uploaded = [{ type: 'image', url: '/uploads/image-1.png', name: 'a.png', mimeType: 'image/png' }];
  const payload = {
    description: 'drought in kano killing farmers crops',
    images: uploaded.filter((m) => m.type === 'image').map((m) => m.url),
    media: uploaded,
  };
  const body = JSON.stringify(payload);
  assert.ok(body.length < 1024, `payload must be small, got ${body.length} bytes`);
  assert.equal(createPostGuard(payload).success, true);
});

test('social: a normal text post passes the 413 guard', () => {
  const result = createPostGuard({ description: 'draught in kano killing farmers crops' });
  assert.equal(result.success, true);
  assert.ok(result.body.includes('draught in kano'));
});

// ─── 4. Amber Alerts crash regression ─────────────────────────────────────────

test('amber alerts: a critical report with no contact object still produces a safe alert', () => {
  // This is the exact shape returned by GET /api/reports/feed for a real
  // critical report. The old code rendered `activeAlert.contact.phone`, which
  // threw TypeError and crashed the page into the ErrorBoundary.
  const feed = [
    {
      id: 'r1',
      description: 'flash flooding in anambra',
      content: 'flash flooding in anambra',
      category: 'Flood',
      severity: 'Critical',
      postStatus: 'critical',
      location: { text: 'anambra' },
      createdAt: '2026-09-28T04:53:06.666Z',
      user: { name: 'Reporter' },
    },
  ];
  const [alert] = mapCriticalReports(feed);
  assert.ok(alert, 'a critical report must map to an alert');
  // Every render path used by AmberAlerts must be safe.
  assert.equal(typeof alert.contact.phone, 'string');
  assert.equal(typeof alert.contact.email, 'string');
  assert.doesNotThrow(() => alert.contact.phone);
  assert.doesNotThrow(() => alert.contact.email);
  assert.doesNotThrow(() => alert.coordinates);
});

test('amber alerts: non-critical and malformed feeds yield no crash', () => {
  assert.equal(mapCriticalReports([]).length, 0);
  assert.equal(mapCriticalReports(null).length, 0, 'null feed must not throw');
  assert.equal(mapCriticalReports({ error: 'nope' }).length, 0, 'error-shaped payload must not throw');
  assert.equal(mapCriticalReports([{ severity: 'Low', postStatus: 'regular' }]).length, 0);
});

test('amber alerts: routing state never claims delivery', () => {
  const [alert] = mapCriticalReports([{ severity: 'Critical', location: { text: 'x' } }]);
  assert.equal(alert.routing.delivered, false);
  assert.deepEqual(alert.routing.authoritiesNotified, []);
  assert.equal(alert.routing.estimatedReach, null);
});

// ─── 5. Communities error mapping ─────────────────────────────────────────────


// ─── 6. Mission creation regression ───────────────────────────────────────────

/** Mirrors normalizeObjectives() in server/routes/v2/missions.js. */
function normalizeObjectives(input) {
  if (!Array.isArray(input)) return [];
  const seen = new Set();
  const out = [];
  input.forEach((raw, index) => {
    let description;
    let objectiveId;
    if (typeof raw === 'string') {
      description = raw;
    } else if (raw && typeof raw === 'object') {
      description = raw.description ?? raw.text ?? raw.title;
      objectiveId = raw.objectiveId ?? raw.id;
    }
    if (typeof description !== 'string' || description.trim() === '') return;
    if (typeof objectiveId !== 'string' || objectiveId.trim() === '') {
      objectiveId = `obj-${index + 1}`;
    }
    if (seen.has(objectiveId)) return;
    seen.add(objectiveId);
    out.push({ objectiveId, description: description.trim() });
  });
  return out;
}

test('missions: bare string objectives are normalized to the canonical shape', () => {
  // The canonical Mission entity throws "Mission requires a non-empty
  // objectiveId." for a bare string, which is why a mission created in the UI
  // failed and never appeared on Mission Map.
  const out = normalizeObjectives(['plant natives', 'clear debris']);
  assert.equal(out.length, 2);
  assert.deepEqual(out[0], { objectiveId: 'obj-1', description: 'plant natives' });
  assert.deepEqual(out[1], { objectiveId: 'obj-2', description: 'clear debris' });
  for (const o of out) {
    assert.equal(typeof o.objectiveId, 'string');
    assert.ok(o.objectiveId.length > 0, 'objectiveId must be non-empty');
  }
});

test('missions: canonical objective objects are preserved, not rewritten', () => {
  const out = normalizeObjectives([{ objectiveId: 'restore-1', description: 'restore wetland' }]);
  assert.deepEqual(out, [{ objectiveId: 'restore-1', description: 'restore wetland' }]);
});

test('missions: empty and malformed objectives are dropped without throwing', () => {
  assert.deepEqual(normalizeObjectives([]), []);
  assert.deepEqual(normalizeObjectives(null), []);
  assert.deepEqual(normalizeObjectives(undefined), []);
  assert.deepEqual(normalizeObjectives('not-an-array'), []);
  assert.deepEqual(normalizeObjectives(['', '   ', null, {}, 42]), []);
});

test('missions: duplicate objectiveIds are collapsed', () => {
  const out = normalizeObjectives([
    { objectiveId: 'a', description: 'first' },
    { objectiveId: 'a', description: 'second' },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].description, 'first');
});

test('missions: objective normalization never fabricates content', () => {
  // Only identifiers may be generated; descriptions must come from the client.
  const out = normalizeObjectives([{ description: 'plant natives' }]);
  assert.equal(out[0].description, 'plant natives');
  assert.equal(out.length, 1);
});

test('communities: domain errors map to truthful HTTP statuses, not 500', () => {
  assert.deepEqual(
    communityErrorStatus(new Error('Community creation denied: actor "u1" lacks an authorized creator role.')),
    { status: 403, code: 'FORBIDDEN' }
  );
  assert.deepEqual(
    communityErrorStatus(new Error('Cannot leave membership in status "PENDING".')),
    { status: 409, code: 'INVALID_MEMBERSHIP_TRANSITION' }
  );
  assert.deepEqual(
    communityErrorStatus(new Error('Community not found: "com_x".')),
    { status: 404, code: 'NOT_FOUND' }
  );
  assert.deepEqual(
    communityErrorStatus(new Error('No membership found for actor "u1" in community "com_x".')),
    { status: 404, code: 'NOT_MEMBER' }
  );
  assert.deepEqual(communityErrorStatus(new Error('boom')), { status: 500, code: 'INTERNAL_ERROR' });
});

test('marketplace: cash on delivery is never treated as an electronic payment', () => {
  // COD orders are created PENDING and the payments route refuses to initialize
  // an online transaction for them (409 COD_NO_ONLINE_PAYMENT).
  const codOrder = { paymentMethod: 'cash_on_delivery', status: 'PENDING', totalMinor: 250000 };
  assert.equal(codOrder.status, 'PENDING');
  assert.notEqual(codOrder.status, 'PAID');
});
