# EcoNet.io — Known Blockers & Resolution Guide

> Last updated: 2026-09-26  
> All blockers are environment/infrastructure issues. No code changes are required to resolve them.

---

## Blocker 1 — MongoDB Atlas DNS failure

**Symptom**
```
❌ MongoDB connection error: querySrv ENOTFOUND _mongodb._tcp.cluster0.2svodd4.mongodb.net
[server] MongoDB unavailable. Legacy routes (auth/reports/profile/map) will return 503.
```

**Root cause**  
The Atlas cluster uses DNS SRV records. The development machine cannot resolve
`_mongodb._tcp.cluster0.2svodd4.mongodb.net` — either because the machine's DNS
blocks SRV lookups, the network blocks the MongoDB port (27017/TLS), or the
Atlas Network Access list does not include the machine's public IP.

**Impact**
| Route family | Status without Atlas |
|---|---|
| `POST /api/auth/register` | ✅ Works (DEV_AUTH in-memory) |
| `POST /api/auth/login` | ✅ Works (DEV_AUTH in-memory) |
| `GET /api/v2/missions` | ✅ Works (canonical in-memory) |
| `POST /api/v2/missions` | ✅ Works (canonical in-memory) |
| `GET /api/profile` | ❌ 500 (requires MongoDB) |
| `GET /api/reports` | ❌ 503 (requires MongoDB) |
| `GET /api/map` | ❌ 503 (requires MongoDB) |

**Resolution steps (in order)**

1. **Add your IP to Atlas Network Access**
   - Go to [https://cloud.mongodb.com](https://cloud.mongodb.com)
   - Select **Cluster0** → **Network Access** → **+ Add IP Address**
   - Click **Add Current IP Address**, then **Confirm**
   - Wait ~30 seconds for propagation

2. **If IP allowlist doesn't help** (corporate/VPN DNS blocking SRV)
   - Add `0.0.0.0/0` temporarily to Network Access (development only)
   - Or switch to a connection string that uses direct `mongodb://` (no SRV)

3. **Verify the fix**
   ```powershell
   Invoke-RestMethod -Uri "http://localhost:5000/health/health" -Method GET
   # Expect: status "healthy", services.database "connected"
   ```

**Connection string** (in `server/.env`):
```
MONGODB_URI=mongodb+srv://graylinksautoai_db_user:<password>@cluster0.2svodd4.mongodb.net/?appName=Cluster0
```

---

## Blocker 2 — Production `VITE_API_URL` not set

**Symptom**  
After `npm run build` the frontend calls `http://localhost:5000` in production,
which is unreachable from any browser that isn't on the build machine.

**Current state** (`.env` in project root):
```
VITE_API_URL=http://localhost:5000   ← correct for local dev only
```

**Resolution**  
Before running a production build, set the URL to the deployed backend:
```bash
# Option A — edit .env directly
VITE_API_URL=https://api.econet.io

# Option B — pass it at build time
VITE_API_URL=https://api.econet.io npm run build
```

The Vite proxy (`vite.config.js` → `/api → http://127.0.0.1:5000`) only applies
during `npm run dev`. It has no effect in the production build — the frontend
calls `VITE_API_URL` directly.

**Verify before building for production**
```powershell
# Confirm the value Vite will bake in
Get-Content .env | Select-String "VITE_API_URL"
```

---

## Blocker 3 — MMS (mongodb-memory-server) persistence tests skip when binary is unavailable

**Symptom**
```
# 3 test files skip / are blocked when the MMS binary is not cached:
tests/mongo-mission-repository.test.js
tests/mongo-idempotency-store.test.js
tests/mission-concurrency.test.js   ← independent, does NOT require MMS
```

**Current test counts**
```
519 pass  |  0 fail  |  0 skip  |  0 cancelled
```
The MMS binary is present in the current environment. All 519 tests pass.

**If MMS binary is absent** (network-restricted environment)  
The three files above emit `skip` / `blocked` — they are not failures.
The canonical count drops to ~458 passing + ~61 skipped. This is expected
behaviour and does not indicate a code defect.

**Resolution**  
Allow outbound network access for the npm/npx process so MMS can download its
binary on first run, or pre-cache the binary at:
```
node_modules/.cache/mongodb-memory-server/
```

---

## Blocker 4 — DEV_AUTH must not be set in production

**Current state**: `DEV_AUTH=true` in `server/.env`.

The auth middleware explicitly blocks DEV_AUTH when `NODE_ENV=production`:
```js
// server/middleware/auth.js
if (process.env.DEV_AUTH === 'true' && process.env.NODE_ENV !== 'production') { ... }
```

**Action required before production deploy**
1. Remove or comment out `DEV_AUTH=true` in `server/.env` / deployment environment
2. Ensure `MONGODB_URI` is set and reachable so real auth routes work
3. Rotate `JWT_SECRET` to a strong random value (current value `drive_econetio_authority` is weak)

---

## Blocker 5 — Canonical persistence is ephemeral (in-memory)

**Symptom**  
On every server restart, all missions created via `/api/v2/missions` are wiped.
The two dev-seeded missions (Jabi Lake, Usuma Reservoir) re-appear because
`seedDevMissions()` runs on startup.

**Root cause**  
`CANONICAL_PERSISTENCE` is not set → defaults to `memory`.

**Resolution**  
Once MongoDB Atlas is reachable (Blocker 1 resolved):
```bash
# server/.env
CANONICAL_PERSISTENCE=mongo
CANONICAL_MONGODB_URI=mongodb+srv://...   # same URI as MONGODB_URI, or separate
```
The `MongoMissionRepository` implementation is complete and ready.

---

## Quick-reference: what works right now (DEV_AUTH + memory)

| Feature | Status |
|---|---|
| Register / Login | ✅ JWT issued, full user object |
| Fetch missions (`GET /api/v2/missions`) | ✅ 2 active seeded missions |
| Create mission (`POST /api/v2/missions`) | ✅ In-memory, lost on restart |
| Activate mission (`POST /api/v2/missions/:id/activate`) | ✅ In-memory |
| Mission map markers (no overlap) | ✅ spreadDuplicateCoords applied |
| Grinder / Whale role dashboards | ✅ Role persisted in localStorage |
| Lilo AI conversation (general queries) | ✅ answerGeneral() active |
| Social feed (real API + mock fallback) | ✅ |
| Frontend build | ✅ 811 modules, exit 0 |
| Test suite | ✅ 519/519 pass |
| Legacy profile / reports / map routes | ❌ Require MongoDB (Blocker 1) |
| Mission persistence across restarts | ❌ Requires Blocker 1 + 5 resolved |
| Production deployment | ❌ Requires Blockers 2 + 4 resolved |
