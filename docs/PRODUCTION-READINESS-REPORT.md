# EcoNet.io — Production Readiness Report

**Date:** 2026-09-26  
**Scope:** Atlas connectivity, canonical persistence, shared data, production config  
**Result:** ✅ Connected to shared persistent storage. Cross-user data verified.

---

## Completed

### 1. Root cause of `querySrv ENOTFOUND` identified

The error was **transient**, not structural. DNS SRV resolution works correctly in Node.js (`dns.resolveSrv` returns all three shard hosts). The Atlas M0 free-tier cluster **auto-pauses after 60 minutes of inactivity**, which causes TCP connect to fail and Mongoose to surface it as a server-selection error. The cluster comes back online within ~30 seconds of a new connection attempt or a manual resume in the Atlas dashboard. No IP allowlist change was needed — the current machine's IP was already whitelisted.

### 2. TLS regression fixed (Node.js 24 / OpenSSL 3.5)

`server/index.js` and `infrastructure/persistence/CanonicalMongoConnection.js` had `tls: true, tlsAllowInvalidCertificates: true` in their Mongoose connect options. On Node.js 24 with OpenSSL 3.5, these flags cause the server to send a client TLS extension that Atlas rejects with **TLS alert 80 (internal error)**. Removed both flags. The Atlas `mongodb+srv://` URI enables TLS automatically without needing them.

**Files changed:**
- `server/index.js` — removed `tls: true, tlsAllowInvalidCertificates: true`
- `infrastructure/persistence/CanonicalMongoConnection.js` — same

### 3. Dotenv load-order race fixed

`CanonicalPersistenceConfig.js` reads `process.env.CANONICAL_PERSISTENCE` at module evaluation time. In ES modules all `import` statements are hoisted, so the canonical module chain was evaluating before `dotenv.config()` ran in `server/index.js`. This meant `CANONICAL_PERSISTENCE` was always `undefined` → defaulted to `memory` regardless of what `.env` said.

**Fix:** Added `import 'dotenv/config'` as the very first import in `server/index.js`. This side-effect import runs `dotenv.config()` synchronously during the module evaluation phase, before any downstream module reads `process.env`.

**Files changed:**
- `server/index.js` — `import 'dotenv/config'` added as first line

### 4. Canonical MongoDB persistence enabled

`CANONICAL_PERSISTENCE=mongo` is now set in `server/.env`. On startup the server logs:

```
[canonical] MongoDB connected — persistence: mongo
[canonical] Using MongoMissionRepository (canonical_missions collection)
[canonical] Using MongoIdempotencyStore (canonical_idempotency_keys collection)
[canonical] MissionEngine initialised — persistence: mongo
```

The `canonical_missions` and `canonical_idempotency_keys` collections were created in the Atlas `test` database automatically on first write. Verified contents:

```
canonical_missions: 3 documents
  - Clean the Jabi Lake Shoreline    ACTIVE  version=2
  - Usuma Reservoir Flood Monitoring  ACTIVE  version=2
  - Lagos Flood Monitoring Station    DRAFT   version=1
canonical_idempotency_keys: auto-managed, TTL index active
```

Missions survive backend restarts — they are loaded from Atlas on the next startup, not re-seeded.

### 5. DEV_AUTH disabled, MongoDB auth active

`DEV_AUTH=true` was commented out in `server/.env`. New users now register and login via the MongoDB `users` collection in Atlas. Verified: registered users receive MongoDB ObjectIds (e.g. `6ab7c3c1851ca8085e07bbf5`), not the `dev_` prefixed in-memory IDs. `devMode` is absent from login responses.

**Files changed:**
- `server/.env` — `DEV_AUTH=true` commented out with explanation

### 6. Cross-user shared data verified

Two users registered and logged in during this session via MongoDB auth. The full sharing path was confirmed:

| Step | Result |
|---|---|
| User A (Nigeria) registers | MongoDB ObjectId issued, user stored in Atlas `users` |
| User B (New York) registers | Same |
| User A logs in | JWT issued from JWT_SECRET, no devMode flag |
| User B logs in | Same |
| User A creates a report | Report stored in Atlas `reports` collection |
| User B reads `GET /api/reports/feed` | Sees User A's report — confirmed by matching report ID |
| Both users hit `GET /api/v2/missions` | Return same 3 canonical missions from Atlas |

A post created by a user in Nigeria is retrievable by a user in New York through the same shared Atlas database. **The core success criterion is met.**

### 7. 503 guards added to all MongoDB-dependent routes

Routes that previously threw unhandled Mongoose errors when the database was disconnected now return a clean `503 DATABASE_UNAVAILABLE` response. This prevents confusing 500 errors and makes the degraded-mode behaviour explicit.

**Files changed:**
- `server/routes/reports.js` — all 7 handlers guarded
- `server/routes/map.js` — GET /reports guarded
- `server/routes/profile.js` — all 8 handlers guarded
- `server/routes/comments.js` — all 3 handlers guarded

### 8. MongoDB connection options hardened

Both the legacy Mongoose connection (`server/index.js`) and the canonical connection (`CanonicalMongoConnection.js`) now use:
- `serverSelectionTimeoutMS: 15000` (was 10000)
- `socketTimeoutMS: 45000` (was absent on legacy connection)
- `heartbeatFrequencyMS: 10000` (keeps connection alive, reduces auto-pause impact)
- `maxPoolSize: 10`

### 9. Engines.js made non-crashing on Atlas startup failure

The original `throw err` inside the IS_MONGO block caused an unhandled top-level rejection that terminated the Node.js process when Atlas was unreachable. Replaced with a graceful fallback: log the error clearly, fall back to `InMemoryMissionRepository` for startup only, and continue. Routes return 503 until the process is restarted with a live Atlas connection.

**Files changed:**
- `server/canonical/engines.js`

### 10. Health endpoint upgraded

`GET /health/health` now separately reports:
- `services.legacyDatabase` — `connected` / `disconnected`
- `services.canonicalEngine.available` — boolean
- `services.canonicalEngine.persistence` — `mongo` / `memory`
- `services.canonicalEngine.database` — `connected` / `disconnected` / `not_applicable`

**Files changed:**
- `server/routes/health.js` — full rewrite

### 11. Production config prepared

- `server/.env` — `CANONICAL_PERSISTENCE=mongo`, DEV_AUTH commented out
- `.env.production` — added `CANONICAL_PERSISTENCE=mongo`, `FRONTEND_URL`, explicit DEV_AUTH warning
- `.env` — added clear comments on production vs development VITE_API_URL
- `netlify.toml` — added VITE_API_URL deployment instructions, added `Referrer-Policy` header
- `server/index.js` — CORS now reads `FRONTEND_URL` env var to add custom production origins

### 12. Tests and build

- **Tests:** 519/519 pass, 0 fail, 0 skip. 30 suites. Exit 0.
- **Build:** 811 modules transformed. Exit 0. 1m 10s.

---

## Still Blocked

### Atlas M0 auto-pause

The free-tier M0 cluster pauses after 60 minutes of inactivity. When paused, all connections fail at the TCP level. The `heartbeatFrequencyMS: 10000` setting keeps the connection alive while the server is running, but a cold start when the cluster is already paused will fail.

**Impact:** The server starts with `InMemoryMissionRepository` as a temporary fallback. After Atlas resumes (~30 seconds), the server must be restarted to establish the canonical connection to the live database. Legacy auth/reports/map routes return 503 until Atlas is reachable on startup.

**This is not a code problem** — it is a free-tier Atlas limitation.

### Production JWT_SECRET is weak

`JWT_SECRET=drive_econetio_authority` in both `.env` and `.env.production` is a short, guessable string. Anyone who knows this value can forge JWTs and authenticate as any user.

**Required action before any public deployment:** Replace with a cryptographically random 64-byte secret:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### VITE_API_URL not set for deployed frontend

The current `.env` has `VITE_API_URL=http://localhost:5000`. A frontend build deployed to Netlify without overriding this will fall back to `/.netlify/functions/api` (the Netlify serverless function), not the Express backend. The serverless function uses Netlify Blobs for storage — a separate auth system, not MongoDB.

**Required action:** Set `VITE_API_URL` to the deployed Express backend URL in the Netlify dashboard environment variables before the next production build.

---

## User Action Required

### 1. Upgrade Atlas cluster from M0 (free) to M2 or higher — recommended

M0 clusters auto-pause. An M2 cluster ($9/month) stays online continuously. This is the single change that eliminates the cold-start connection failure and makes EcoNet reliably persistent for users worldwide.

**Steps:**
1. Go to [cloud.mongodb.com](https://cloud.mongodb.com)
2. Select **Cluster0** → **Edit Configuration** → upgrade to **M2** (or higher)
3. No code changes required — the connection string stays the same

### 2. Rotate JWT_SECRET before going public

In the Netlify dashboard (or your backend hosting platform), set:
```
JWT_SECRET=<64-byte hex string from the command above>
```
All existing sessions will be invalidated — users will need to log in again once.

### 3. Set VITE_API_URL in Netlify dashboard

In **Netlify → Site configuration → Environment variables**, add:
```
VITE_API_URL=https://<your-express-backend-url>
```
Then trigger a new Netlify deploy. Without this, the production frontend calls the Netlify function (Blobs storage), not MongoDB.

---

## Production Readiness

### What works right now (with Atlas awake)

| Capability | Status |
|---|---|
| User registration (MongoDB) | ✅ Persists to Atlas `users` collection |
| User login (JWT, MongoDB) | ✅ Verified |
| Reports — create, read, feed | ✅ Persists to Atlas `reports` collection |
| Cross-user shared feed | ✅ Verified: User A post visible to User B |
| Map data (`GET /api/map/reports`) | ✅ Reads from Atlas `reports` |
| Canonical missions — list, create, activate | ✅ Persists to Atlas `canonical_missions` |
| Mission history survives restart | ✅ Verified in Atlas |
| Canonical idempotency | ✅ Atlas `canonical_idempotency_keys` with TTL index |
| Health check (full detail) | ✅ Separately reports legacy DB + canonical engine |
| DEV_AUTH blocked in production | ✅ `NODE_ENV=production` guard in place |
| Frontend build | ✅ 811 modules, exit 0 |
| Automated tests | ✅ 519/519 pass |

### What is not yet production-ready

| Item | Blocker |
|---|---|
| Atlas auto-pause on M0 | Upgrade to M2 — user action |
| JWT_SECRET strength | Replace before public deployment — user action |
| VITE_API_URL for deployed frontend | Set in Netlify dashboard — user action |
| Lilo opportunity pipeline (WorldMap pins) | Not yet connected to persistence layer |
| Participation and evidence lifecycle | Canonical engine layer exists; HTTP routes not yet wired |

---

## Deployment Instructions

### Express backend (Railway / Render / VPS)

Set these environment variables in your hosting platform — do not put secrets in `.env.production` in source control:

```
NODE_ENV=production
PORT=5000
MONGODB_URI=<atlas connection string>
CANONICAL_PERSISTENCE=mongo
JWT_SECRET=<strong 64-byte random hex>
GROQ_API_KEY=<groq key>
OPENWEATHER_API_KEY=<key>
NEWS_API_KEY=<key>
NASA_FIRMS_API_KEY=<key>
VAPID_PUBLIC_KEY=<key>
VAPID_PRIVATE_KEY=<key>
VAPID_SUBJECT=mailto:<email>
FRONTEND_URL=https://econet.netlify.app
```

Start command: `node server/index.js` (from project root, or `node index.js` from `server/`).

### Netlify frontend

In **Netlify → Site configuration → Environment variables**:

```
VITE_API_URL=https://<your-backend-url>
```

The build command (`npm run build`) and publish directory (`dist`) are already set in `netlify.toml`. No other Netlify configuration changes are needed.

### Atlas Network Access

Your current machine's IP is already whitelisted. For a cloud backend deployment, you have two options:
- **Recommended:** Add the static IP of your backend host to Atlas Network Access
- **Simpler (less secure):** Allow access from anywhere (`0.0.0.0/0`) — acceptable for an M2 cluster with strong credentials, not ideal for production

---

*Report generated from live verification against the running server and Atlas cluster.*
