# CLAUDE.md — Uber Eats POS Integration

## What this project is

Multi-tenant Node.js/Express middleware that connects restaurant POS systems to Uber Eats. It receives Uber Eats orders via webhook, transforms them to a POS-friendly format, relays them to each restaurant's POS endpoint, and calls back the Uber Eats API to accept/deny orders and push status updates.

Deployed to: `kukipos-sync.azurewebsites.net` (Azure App Service)
Database: Azure SQL Server (`kukisync.database.windows.net`) via Sequelize + Tedious

---

## Uber Eats API — Developer Scope Limitation

**Current developer access: `eats.pos_provisioning` only.**

This scope covers:
- OAuth token exchange and store provisioning (`/uberlink`)
- Reading store data (`GET /eats/stores`)
- POS activation per store (`POST /stores/{store_id}/pos_data`)
- Read/update/delete integration config (`GET|PATCH|DELETE /stores/{store_id}/pos_data`)
- Webhook receipt (webhook registration must be done in Uber Eats Restaurant Manager)

**Not yet available in sandbox:**
- Live order webhooks (use Uber's webhook simulator in the developer dashboard for testing)
- Production order accept/deny/status APIs require `eats.order` scope (apply when going live)
- Menu push APIs require `eats.store.menu.write` scope

When adding new Uber API calls, check whether the required scope is available before coding — if not, stub the call and note the scope needed.

---

## Architecture

```
[Uber Eats Platform]
        │  POST /webhooks/uber-eats  (HMAC-SHA256 via X-Postmates-Signature)
        ▼
[This Middleware — Express on port 3000]
        │
        ├── webhookAuth.js      — HMAC signature verification
        ├── storeCache (memory) — maps store_id → store row (DB-backed at startup)
        │
        ├── posRelayService.js  — transform Uber order → POS format → POST to pos_endpoint
        └── uberService.js      — call Uber Eats API (accept/status/menu/activation)
                │  Bearer token auto-refreshed by uberTokenService.js
          [Uber Eats API]
```

OAuth + provisioning flow:
```
Browser → Uber authorize URL (scope=eats.pos_provisioning)
        → GET /uberlink?code=...&state=<client-label>
        → tokens saved to UberAccount table
        → stores upserted in UberStores table (idUberAccount FK)
        → POST /stores/{store_id}/pos_data called per store (activates integration)
```

---

## Key files

| File | Purpose |
|------|---------|
| [src/server.js](src/server.js) | Entry point — Express setup, route mounting, startup sequence. Uses `console.log/warn/error` directly (no logger). Morgan HTTP traffic logging is commented out. |
| [src/model/index.js](src/model/index.js) | All DB setup: Sequelize instance, connection test, model associations, `syncTables()` |
| [src/model/UberAccount.js](src/model/UberAccount.js) | OAuth token table (one row per Uber account, keyed by `client_id`) |
| [src/model/UberStores.js](src/model/UberStores.js) | Restaurant store table (FK → UberAccount.id) |
| [src/services/uberTokenService.js](src/services/uberTokenService.js) | In-memory token cache, auto-refresh 5 min before expiry |
| [src/services/uberService.js](src/services/uberService.js) | Uber Eats API client — orders, menu, stores, POS activation |
| [src/services/posRelayService.js](src/services/posRelayService.js) | Transforms Uber order → POS schema, POSTs to pos_endpoint |
| [src/config/storeCache.js](src/config/storeCache.js) | In-memory store map, loaded from DB at startup |
| [src/config/eventStore.js](src/config/eventStore.js) | Ring buffer (max 500 events) for dashboard — NOT persisted |
| [src/config/logger.js](src/config/logger.js) | Winston logger — console + `logs/error.log` (combined.log disabled) |
| [src/middleware/webhookAuth.js](src/middleware/webhookAuth.js) | HMAC-SHA256 verification of Uber webhook signature |
| [src/utils/fetch.js](src/utils/fetch.js) | `getData`, `postData`, `patchData`, `postForm` with 30s timeout |
| [src/routes/webhooks.js](src/routes/webhooks.js) | Handles `eats.order.*.placed` and `eats.order.cancelled.*` events |
| [src/routes/orders.js](src/routes/orders.js) | Manual accept/deny/status endpoints |
| [src/routes/menu.js](src/routes/menu.js) | Menu sync and item availability toggle |
| [src/routes/uberlink.js](src/routes/uberlink.js) | OAuth callback, token save, store sync, POS activation; bulk re-activation at `POST /uberlink/activate` |
| [src/routes/dashboard.js](src/routes/dashboard.js) | Dashboard stats, event log, client list |
| [dashboard/index.html](dashboard/index.html) | Static dashboard UI — includes "Activate POS" button that calls `POST /uberlink/activate` |

---

## Database models

### `UberAccount` — one row per Uber Eats account
- `client_id` (UNIQUE) — human label like `"taco-fuego"`, passed as `state` param in OAuth URL
- `access_token`, `refresh_token`, `expires_at` (unix ms), `expires_date`
- `scope` — currently `eats.pos_provisioning`

### `UberStores` — one row per restaurant location
- `store_id` (UNIQUE) — Uber Eats UUID
- `idUberAccount` (FK → UberAccount.id)
- `pos_endpoint` — set manually after onboarding; this is where orders are forwarded
- `pos_integration_enabled` — set to `true` after `POST /stores/{store_id}/pos_data` succeeds

---

## Model / DB setup

All DB logic is in [src/model/index.js](src/model/index.js):
- Creates the Sequelize instance (Azure SQL, mssql dialect, port 1433, encryption on)
- Runs `authenticate()` on startup — logs success or failure to console
- Defines `UberAccount.hasMany(UberStores)` association
- Exports `syncTables()` — called once in `server.js` on startup; runs `sequelize.sync({ alter: false })` which creates tables if missing but does NOT alter existing columns

`UberAccount.js` and `UberStores.js` import `{ sequelize }` directly from `./index`. There is no `db.js`.

---

## Logging

`server.js` uses `console.log/warn/error` directly — no Winston there. All other files (`routes/`, `services/`, `middleware/`) use Winston via [src/config/logger.js](src/config/logger.js):
- **Console** — all levels (info, warn, error)
- **`logs/error.log`** — only `logger.error(...)` calls (webhook failures, order errors, OAuth errors)
- **`logs/combined.log`** — disabled

Morgan HTTP request traffic logging is commented out in `server.js` line 33. Uncomment to re-enable per-request logging to the console.

---

## Environment variables

```env
UBER_CLIENT_ID          # from Uber developer dashboard
UBER_CLIENT_SECRET      # from Uber developer dashboard
UBER_BASE_URL           # https://test-api.uber.com/v1/eats  (sandbox)
                        # https://api.uber.com/v1/eats         (production)
UBER_WEBHOOK_SECRET     # hex string for HMAC verification
PORT                    # default 3000
NODE_ENV                # development | production
DB_SERVER               # Azure SQL hostname
DB_USER / DB_PASS / DB_NAME
```

**Note:** Wrap DB_PASS in quotes in `.env` — passwords with `#` or `!` break dotenv parsing.

---

## Dev workflow

```bash
npm run dev     # nodemon auto-reload
npm start       # production
```

On startup:
1. `syncTables()` — creates DB tables if missing
2. Tokens loaded from `UberAccount` into memory (`uberTokenService.loadTokensFromDB`)
3. Stores loaded from `UberStores` into memory (`storeCache.loadStoresFromDB`)
4. If tokens exist but store cache is empty → auto-fetches stores from Uber API

---

## POS activation

Uber requires `POST /stores/{store_id}/pos_data` to be called once per store using the merchant's user access token (`eats.pos_provisioning` scope) to register your integration.

- **Automatic:** happens in `/uberlink` immediately after OAuth completes
- **Manual re-run:** `POST /uberlink/activate` — activates all stores in `UberStores` where `pos_integration_enabled = false`; also accessible via the **Activate POS** button in the dashboard
- Uses `getAccessToken(clientId)` from the token cache — auto-refreshes if needed
- On success, sets `pos_integration_enabled = true` in DB and storeCache

If you get "User not allowed access" errors, the merchant needs to re-do the OAuth flow to get a fresh token.

---

## Webhook testing (sandbox)

With `eats.pos_provisioning` scope you won't receive live order events in sandbox. Use the **Uber Eats Restaurant Manager → Developer → Webhook Simulator** to send test payloads. The server verifies `X-Postmates-Signature` via HMAC-SHA256 — simulator sends a valid signature.

To bypass signature check locally: in `dev` mode, `webhookAuth.js` skips verification when `UBER_WEBHOOK_SECRET` is empty.

---

## Common tasks

**Link a new Uber account:**
Direct the merchant to:
```
https://sandbox-login.uber.com/oauth/v2/authorize?client_id=<ID>&redirect_uri=https://kukipos-sync.azurewebsites.net/uberlink&scope=eats.pos_provisioning&response_type=code&state=<client-label>
```
Server handles token exchange, store sync, and POS activation automatically at `GET /uberlink`.

**Re-activate stores that failed activation:**
Click **Activate POS** in the dashboard, or call `POST /uberlink/activate` directly.

**Set a store's POS endpoint after onboarding:**
Update `UberStores.pos_endpoint` via the dashboard or directly in the DB.

**Add a new Uber Eats API call:**
1. Add a method to [src/services/uberService.js](src/services/uberService.js)
2. Use `authHeaders()` for client_credentials token, or pass an explicit token for user-scoped calls
3. Use `global.uber` as the base URL (set in `server.js` from `UBER_BASE_URL`)
4. Check if the required Uber scope is available before coding

**Add a new webhook event type:**
Extend the `switch` block in [src/routes/webhooks.js](src/routes/webhooks.js). Events arrive as `{ event_type, meta, data }`.

---

## Known limitations / TODO

- `eventStore` (dashboard events) is in-memory only — lost on restart; replace with DB table for production
- No authentication on `/orders`, `/menu`, `/dashboard`, `/uberlink/activate` routes — add API key or JWT before exposing publicly
- `eats.order` and `eats.store.menu.write` scopes needed for live order management and menu push (apply when going to production)
- `UBER_BASE_URL` must be manually switched from `test-api.uber.com` to `api.uber.com` for production
