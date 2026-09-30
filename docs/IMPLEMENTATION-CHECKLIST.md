# EcoNet.io — Implementation Checklist

> Generated: 2026-09-26 from full codebase inspection.
> Status column reflects actual code state, not previous reports.

---

## Legend
- ✅ Real, verified, working
- ⚠️ Partial — exists but incomplete or uses fallback
- 🔴 Placeholder / stub — UI exists, no backend connection
- ❌ Not implemented

---

## Phase 2 — Text readability & profile

### 2A — Input / textarea / select contrast

| Surface | File | Issue |
|---|---|---|
| Login inputs | `Login.jsx` | ✅ `text-white` + `var(--eco-bg-elevated)` — correct |
| Register inputs | `Register.jsx` | ⚠️ Uses map over fields but no explicit `color` on `<input>` elements; autofill override missing |
| SubmitReport textarea/inputs | `SubmitReport.jsx` | 🔴 Uses Tailwind classes without explicit text color — typed text may be invisible on some browsers |
| EditProfile inputs | `EditProfile.jsx` | ⚠️ Inputs have dark bg, no `text-white` class, rely on global styles that may not cover all browsers |
| CommandCenter (Mission Studio) | `CommandCenter.jsx` | ✅ `text-white placeholder:text-[var(--eco-text-muted)]` — correct |
| `<select>` elements | `CommandCenter.jsx`, `SocialDashboard.jsx` | ⚠️ `<option>` inherits system styling — dark background with black text on some OS |
| Global CSS autofill | `index.css` | 🔴 No `-webkit-autofill` override — browser autofill turns inputs yellow/white bg with black text |

**Fix required:** Global CSS rule covering `input, textarea, select, option` color on dark backgrounds + autofill override.

### 2B — Avatar lifecycle

| Step | Status | Notes |
|---|---|---|
| File selection | ✅ | Both `Profile.jsx` and `EditProfile.jsx` have file input |
| Type validation | ⚠️ | `EditProfile.jsx` checks `file.type.startsWith('image/')` — ok. `Profile.jsx` relies on multer server-side only |
| Size validation | 🔴 | No client-side size check before upload attempt |
| Upload to server | ✅ | `POST /api/upload/image` via `uploadAvatar()` in `EditProfile.jsx` |
| Upload saves to disk | ✅ | `multer` saves to `uploads/` directory, returns `/uploads/filename` URL |
| Avatar URL saved to profile | ⚠️ | `EditProfile.jsx` calls `PATCH /api/profile` — works when Atlas connected. Falls back to `localStorage` when Atlas down |
| Display in navbar/home | ⚠️ | Uses `u.avatar` from auth context — only correct if auth context refreshed after save |
| Cross-session persistence | ⚠️ | Avatar URL in `uploads/` is server-local — not on CDN. If server restarts/redeploys, local files are lost |
| Remove / reset avatar | 🔴 | No "remove avatar" action in the UI |

**Fix required:** Client-side size check (5MB), ensure auth context is updated after avatar save, add remove action.

---

## Phase 3 — Engine 16 Community

| Item | Status | Notes |
|---|---|---|
| `CommunityEngine` domain layer | ✅ | Full engine: Create, Update, Membership CRUD, Status transitions, 16 tests pass |
| `InMemoryCommunityRepository` | ✅ | Complete, isolated, no cross-engine deps |
| HTTP routes `/api/v2/communities` | ❌ | **No routes file exists.** Engine is never imported by `server/index.js` |
| `Communities.jsx` frontend | 🔴 | Shows hardcoded category tiles + "Coming soon" banner. No API calls. |
| Community engine in `engines.js` | ❌ | Not added to the canonical composition root |

**Fix required:** Add `server/routes/v2/communities.js`, mount it in `server/index.js`, rewrite `Communities.jsx` to call real API.

---

## Phase 4 — Lilo opportunity / funding lifecycle

| Item | Status | Notes |
|---|---|---|
| Lilo opportunity data model | ⚠️ | Dev fixtures in `WhaleHome.jsx` and `WorldMap.jsx` — hardcoded, no stable IDs, no coords |
| "Fund Mission" button | 🔴 | Navigates to `/command` (Mission Studio blank form) — loses all opportunity context |
| Opportunity → mission ID preservation | ❌ | Not implemented |
| "View on Map" button | 🔴 | Navigates to `/map` with no location context — map always centers on Abuja default |
| Funding details display | 🔴 | Budget/evidence/coords shown on card but not in a dedicated fund flow |
| Mission lifecycle guard | ⚠️ | `CreateMission` + `ActivateMission` exist; no guard blocking Grinders from joining unfunded opportunities |
| Opportunity persistence | ❌ | Opportunities are dev fixtures only, not stored in any database |

**Fix required:** Add opportunity data to a real store (in-memory engine or Atlas), wire Fund Mission to pre-populate the mission studio with the opportunity context, fix map navigation to use opportunity coordinates.

---

## Phase 5 — Currency model

| Item | Status | Notes |
|---|---|---|
| EcoCoin display | ⚠️ | `user.reputation.ecoCoins` exists in User schema, not consistently displayed |
| Mission budget display | 🔴 | `estimatedFunding: '₦450,000'` — hardcoded string in dev fixtures, no currency code stored |
| NGN as default | ⚠️ | Implied from hardcoded ₦ strings, never made explicit |
| Currency code stored with amount | ❌ | Amounts are plain numbers or strings without ISO 4217 code |
| Exchange rate data | ❌ | Not implemented — no external rate service |
| Monetary semantics (coins vs money) | ⚠️ | EcoCoins are in the User model; no clear separation from real money |

**Fix required:** Add currency utility (`formatCurrency(amount, currencyCode)`), store amounts with currency code in mission data, document EcoCoin vs money distinction.

---

## Phase 6 — Lilo context-awareness

| Item | Status | Notes |
|---|---|---|
| Lilo chat UI | ✅ | `LiloAI.jsx` renders, `useLilo.js` handles conversation |
| Intent detection | ✅ | Covers forecast, incident, greeting, identity, guidance, general |
| Multi-turn memory | ⚠️ | `messages` array passed to `humanizeResponse` but only `answerGreeting` and `answerConversation` use it |
| Mission data retrieval | 🔴 | `useLilo.js` has zero API calls — all answers are hardcoded response templates |
| Report context | ❌ | Lilo cannot see actual reports |
| Community context | ❌ | No connection |
| Avoid fabrication | ⚠️ | Current templates are honest placeholders but say "I can help" without actually doing it |
| GROQ model | ✅ (fixed) | Updated to `qwen/qwen3.8-27b` — verified working |
| `/analyze-report` classification | ✅ | Working, uses GROQ API |
| Lilo tool use (mission lookup) | ❌ | Not implemented |

**Fix required:** Connect `useLilo.js` to real mission/report data via API calls; upgrade multi-turn handling; add mission lookup intent.

---

## Phase 7 — Security audit

| Item | Status | Notes |
|---|---|---|
| Auth JWT signed with secret | ✅ | `JWT_SECRET` in env, never in frontend |
| JWT_SECRET strength | ⚠️ | `drive_econetio_authority` — too short, guessable |
| DEV_AUTH blocked in production | ✅ | `NODE_ENV=production` guard in `DevAuthStore.IS_ALLOWED()` |
| Input validation on auth routes | ✅ | `express-validator` on register/login |
| Input validation on v2 missions | ⚠️ | Basic checks, no schema validation library |
| Role-based authorization | ⚠️ | `actorFromRequest` maps JWT role to canonical roles; Whale vs Grinder distinction is UI-only, not enforced server-side on mutation routes |
| Whale-only mission creation guard | 🔴 | `POST /api/v2/missions` accepts any authenticated user |
| Grinder cannot activate missions | 🔴 | `POST /api/v2/missions/:id/activate` has no role check |
| Profile data access | ✅ | `protect` middleware on all profile routes |
| Report creation | ✅ | `protect` middleware required |
| Audit logging | ✅ | Engine 23 AuditEngine subscribes to all canonical events |
| Secrets in frontend bundle | ✅ | No backend secrets in `src/` |
| `VITE_API_URL` in frontend build | ⚠️ | Points to localhost — wrong for production builds |
| Blockchain / on-chain components | ❌ | No blockchain contracts, signatures, or verification in codebase |

**Fix required:** Generate strong JWT_SECRET, add role guard to mission mutation routes (Whale only), document blockchain as out-of-scope.

---

## Phase 8 — EcoCoins and payouts

| Item | Status | Notes |
|---|---|---|
| EcoCoin field in User model | ✅ | `user.reputation.ecoCoins` exists |
| EcoCoin transactions | ❌ | No transaction log model or collection |
| EcoCoin earn/spend endpoints | ❌ | No API routes for EcoCoin accounting |
| Real money payouts | ❌ | No payment provider integrated |
| Payout idempotency | ❌ | Not applicable — no payout system exists |
| Platform coins vs real money separation | ⚠️ | EcoCoins are platform rewards, not real money — but this distinction is not documented in code |
| Economy service | ⚠️ | `src/services/economy.js` exists but manages client-side reputation display only |

**Fix required:** Document EcoCoins as non-monetary platform credits; add a simple transaction schema for EcoCoin accounting (no real money without payment provider setup and compliance review).

---

## Phase 9 — Simulation engine

| Item | Status | Notes |
|---|---|---|
| Engine 19 domain | ✅ | `SimulationApplicationService`, `SimulationModel`, `SimulationScenario`, `SimulationRun`, `SimulationResult` all exist |
| Engine 19 tests | ✅ | Included in 519 passing tests |
| `DATA_ORIGIN_SIMULATED` constant | ✅ | All simulation results tagged with origin |
| Simulation UI page | ❌ | No `/simulation` page in `src/pages/` |
| Simulation in App.jsx routing | ❌ | Not routed |
| Separation from production data | ✅ | Engine 19 never writes to other engines |

**Fix required:** No simulation writeback exists (good). Need minimal UI stub with honest "simulation mode" label before showing any simulated results.

---

## Phase 10 — Production infrastructure

| Item | Status | Notes |
|---|---|---|
| Atlas M0 auto-pause | 🔴 | Fundamental free-tier limitation |
| TLS connection fix | ✅ | `tls/tlsAllowInvalidCertificates` removed, atlas+srv handles TLS |
| Dotenv load order | ✅ | `import 'dotenv/config'` as first import |
| `CANONICAL_PERSISTENCE=mongo` | ✅ | Set in `server/.env` |
| DEV_AUTH in `server/.env` | ⚠️ | Currently `true` (re-enabled for local preview) |
| `VITE_API_URL` for production | 🔴 | Points to `localhost:5000` — must be updated before deployment |
| CORS missing deployed frontend | ⚠️ | `FRONTEND_URL` env var read, but actual production URL is placeholder |
| No publicly deployed backend | 🔴 | Required for global shared data |
| JWT_SECRET weak | ⚠️ | Needs rotation |

---

## Priority order for this session

1. **Phase 2A** — CSS input contrast (affects every form, high user-visible impact, low risk)
2. **Phase 2B** — Avatar size validation + auth context refresh (specific, completable)
3. **Phase 3** — Engine 16 community routes + UI (self-contained, engine already built)
4. **Phase 4** — Fund Mission flow fix (high user-visible impact for Whales)
5. **Phase 6** — Lilo mission data connection (improves core Lilo value immediately)
6. **Phase 5** — Currency utility (small, correctness improvement)
7. **Phase 7** — Role guard on mission mutation routes (security)
8. **Phase 8** — EcoCoin transaction schema + documentation
9. **Phase 9** — Simulation UI stub
10. **Phase 10** — Infrastructure verification
11. **Phase 11/12** — Tests, build, preview, final report
