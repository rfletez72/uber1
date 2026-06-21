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

## Project conventions

### Models — factory pattern
Each model file exports `(sequelize) => sequelize.define(...)`. `model/index.js` auto-discovers all `.js` files in its folder, calls each factory, builds the `db` object, and exposes it as `global.Models`. No model imports needed anywhere — just use `global.Models.UberAccount`, `global.Models.UberStores`.

```js
// server.js (at project root)
global.Models = require('./src/model/index')(false); // false = don't force-drop tables
```

### API routes — factory pattern, one action per file
Each file in `src/api/` exports `() => { const router = Router(); ...; return router; }`. In `server.js` require into a variable and mount as a pair, grouped by category. The full action path goes in `app.use()` so the route inside always uses `router.route('/').METHOD(...)`:

```js
// menu
const menusync = require('./src/api/menusync')();
app.use('/menu/sync', express.json(), menusync);

const menuavailability = require('./src/api/menuavailability')();
app.use('/menu/availability', express.json(), menuavailability);
```

Inside each file use `router.route('/')` style and get all params via `GetReqValues(req)` — never from `req.params`:

```js
const { check, validationResult } = require('express-validator');
const { GetReqValues } = require('../utils/utils');

router.route('/').post([
  check('storeId').not().isEmpty(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty())
    return res.status(400).json({ error: 'Required fields missing.', details: errors.array() });
  const { storeId } = GetReqValues(req);
  // ...
});
```

`GetReqValues(req)` returns `req.query` if it has keys, otherwise `req.body` — so the same handler works for both GET query params and POST body.

---

## Key files

| File | Purpose |
|------|---------|
| [server.js](server.js) | Entry point (project root) — `global.Models` setup, middleware, route mounting, startup cache load. Uses `console` directly (no logger). Morgan traffic logging commented out. |
| [src/model/index.js](src/model/index.js) | All DB setup: Sequelize instance, auto-discovers models, associations, authenticate + syncTables on startup. Exports `(force) => db`. |
| [src/model/UberAccount.js](src/model/UberAccount.js) | OAuth token table — factory `(sequelize) => sequelize.define(...)` |
| [src/model/UberStores.js](src/model/UberStores.js) | Restaurant store table — factory `(sequelize) => sequelize.define(...)` |
| [src/services/uberTokenService.js](src/services/uberTokenService.js) | In-memory token cache, auto-refresh 5 min before expiry. Uses `global.Models.UberAccount`. |
| [src/services/uberService.js](src/services/uberService.js) | Uber Eats API client — orders, menu, stores, POS activation |
| [src/services/posRelayService.js](src/services/posRelayService.js) | Transforms Uber order → POS schema, POSTs to `pos_endpoint` |
| [src/config/storeCache.js](src/config/storeCache.js) | In-memory store map, loaded from DB at startup. Uses `global.Models.UberStores`. |
| [src/config/eventStore.js](src/config/eventStore.js) | Ring buffer (max 500 events) for dashboard — NOT persisted to DB |
| [src/config/logger.js](src/config/logger.js) | Winston — console + `logs/error.log` only (combined.log disabled) |
| [src/middleware/webhookAuth.js](src/middleware/webhookAuth.js) | HMAC-SHA256 verification of Uber webhook signature |
| [src/utils/fetch.js](src/utils/fetch.js) | `getData`, `postData`, `patchData`, `postForm` with 30s timeout |

### API files — one action per file

| File | Endpoint |
|------|---------|
| [src/api/webhooks.js](src/api/webhooks.js) | `POST /webhooks/uber-eats` |
| [src/api/ordersaccept.js](src/api/ordersaccept.js) | `POST /orders/accept` |
| [src/api/ordersdeny.js](src/api/ordersdeny.js) | `POST /orders/deny` |
| [src/api/ordersstatus.js](src/api/ordersstatus.js) | `POST /orders/status` |
| [src/api/menusync.js](src/api/menusync.js) | `POST /menu/sync` |
| [src/api/menuavailability.js](src/api/menuavailability.js) | `POST /menu/availability` |
| [src/api/dashstats.js](src/api/dashstats.js) | `GET /dashboard/stats` |
| [src/api/dashevents.js](src/api/dashevents.js) | `GET /dashboard/events` |
| [src/api/dashclients.js](src/api/dashclients.js) | `GET /dashboard/clients` |
| [src/api/dashclient.js](src/api/dashclient.js) | `GET /dashboard/clients` (storeId via query param) |
| [src/api/uberlink.js](src/api/uberlink.js) | `GET /uberlink` (OAuth callback) |
| [src/api/uberlinkactivate.js](src/api/uberlinkactivate.js) | `POST /uberlink/activate` |
| [dashboard/index.html](dashboard/index.html) | Static dashboard UI — "Activate POS" button calls `POST /uberlink/activate` |

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
- Creates the Sequelize instance (Azure SQL, mssql dialect, port 1433, encryption on, pool max 5)
- Auto-discovers all model files via `fs.readdirSync`, calls each factory with `sequelize`
- Defines associations: `UberAccount.hasMany(UberStores)`
- On first call: runs `authenticate()` then `sync({ force })` — `force: false` = create if missing, never drop
- `started` guard prevents re-initialization if required multiple times
- Exits the process (`process.exit(1)`) if DB connection fails

Models are accessed everywhere as `global.Models.UberAccount` / `global.Models.UberStores` — no imports needed. There is no `db.js`.

---

## Logging

`server.js` uses `console.log/warn/error` directly — no Winston there. All `src/api/`, `src/services/`, `src/middleware/` use Winston via [src/config/logger.js](src/config/logger.js):
- **Console** — all levels (info, warn, error)
- **`logs/error.log`** — only `logger.error(...)` calls (webhook failures, order errors, OAuth errors)
- **`logs/combined.log`** — disabled

Morgan HTTP request logging is commented out in `server.js`. Uncomment to re-enable.

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
1. `global.Models = require('./src/model/index')(false)` — connects to DB, creates tables if missing
2. Tokens loaded from `UberAccount` into memory (`uberTokenService.loadTokensFromDB`)
3. Stores loaded from `UberStores` into memory (`storeCache.loadStoresFromDB`)
4. If tokens exist but store cache is empty → auto-fetches stores from Uber API

---

## POS activation

Uber requires `POST /stores/{store_id}/pos_data` once per store using the merchant's user access token (`eats.pos_provisioning` scope) to register your integration.

- **Automatic:** happens in `GET /uberlink` immediately after OAuth completes
- **Manual re-run:** `POST /uberlink/activate` — activates all stores where `pos_integration_enabled = false`; also via the **Activate POS** button in the dashboard
- Uses `getAccessToken(clientId)` — auto-refreshes token if needed
- On success sets `pos_integration_enabled = true` in DB and storeCache

If you get "User not allowed access": the merchant needs to re-do the OAuth flow, OR the sandbox app needs Uber's approval for the `/pos_data` endpoint.

---

## Webhook testing (sandbox)

With `eats.pos_provisioning` scope you won't receive live order events in sandbox. Use **Uber Eats Restaurant Manager → Developer → Webhook Simulator**. The server verifies `X-Postmates-Signature` via HMAC-SHA256 — the simulator sends a valid signature.

To bypass locally: `webhookAuth.js` skips verification when `UBER_WEBHOOK_SECRET` is empty in dev mode.

---

## Common tasks

**Link a new Uber account:**
Direct the merchant to:
```
https://sandbox-login.uber.com/oauth/v2/authorize?client_id=<ID>&redirect_uri=https://kukipos-sync.azurewebsites.net/uberlink&scope=eats.pos_provisioning&response_type=code&state=<client-label>
```
Server handles token exchange, store sync, and POS activation automatically.

**Add a new API endpoint:**
1. Create `src/api/myaction.js` exporting `() => { const router = Router(); router.route('/').METHOD(...); return router; }`
2. In `server.js` add as a pair under the relevant group comment:
   ```js
   const myaction = require('./src/api/myaction')();
   app.use('/full/path', express.json(), myaction);
   ```
3. Use `GetReqValues(req)` to read params — never `req.params`
4. Use `global.Models.ModelName` for DB access — no imports needed

**Add a new Uber Eats API call:**
1. Add a method to [src/services/uberService.js](src/services/uberService.js)
2. Use `authHeaders()` for client_credentials token, or pass an explicit token for user-scoped calls (`eats.pos_provisioning`)
3. Use `global.uber` as the base URL

**Add a new webhook event type:**
Extend the `switch` block in [src/api/webhooks.js](src/api/webhooks.js). Events arrive as `{ event_type, meta, data }`.

---

## Known limitations / TODO

- `eventStore` (dashboard events) is in-memory only — lost on restart; replace with DB table for production
- No authentication on `/orders`, `/menu`, `/dashboard`, `/uberlink/activate` — add API key or JWT before exposing publicly
- `eats.order` and `eats.store.menu.write` scopes needed for live order management and menu push
- `UBER_BASE_URL` must be switched from `test-api.uber.com` to `api.uber.com` for production
