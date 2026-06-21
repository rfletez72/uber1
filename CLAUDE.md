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
        │  POST /uber/webhooks/uber-eats  (HMAC-SHA256 via X-Postmates-Signature)
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
        → GET /uber/uberlink?code=...&state=<client-label>
        → tokens saved to UberAccount table
        → stores upserted in UberStores table (idUberAccount FK)
        → POST /stores/{store_id}/pos_data called per store (activates integration)
```

---

## Project conventions

### Models — factory pattern
Each model file exports `(sequelize) => sequelize.define(...)`. `model/index.js` auto-discovers all `.js` files in its folder, calls each factory, builds the `db` object, and exposes it as `global.UberModels`. No model imports needed anywhere — just use `global.UberModels.UberAccount`, `global.UberModels.UberStores`.

```js
// server.js (at project root)
global.UberModels = require('./src/uber/model/index')(false); // false = don't force-drop tables
```

### API routes — factory pattern, one action per file
Each file in `src/uber/api/` exports `() => { const router = Router(); ...; return router; }`. In `server.js` require into a variable and mount as a pair, grouped by category. The full action path goes in `app.use()` so the route inside always uses `router.route('/').METHOD(...)`:

```js
// menu
const menusync = require('./src/uber/api/menusync')();
app.use('/menu/sync', express.json(), menusync);

const menuavailability = require('./src/uber/api/menuavailability')();
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
    return res.status(400).json({ error: true, code: 400, message: 'Required fields missing.', data: errors.array() });
  const { storeId } = GetReqValues(req);
  try {
    const result = await someService(storeId); // always assign to const first — never inline in data:
    return res.status(200).json({ error: false, code: 200, message: 'Successful.', data: result });
  } catch (err) {
    const errmsg = err.message ? err.message : 'Operation failed.';
    return res.status(502).json({ error: true, code: 502, message: errmsg, data: null });
  }
});
```

`GetReqValues(req)` returns `req.query` if it has keys, otherwise `req.body` — so the same handler works for both GET query params and POST body.

### API response envelope — all endpoints use this shape

```js
{ error: false, code: 200, message: 'Successful.', data: <payload> }  // success
{ error: true,  code: 400, message: '...',          data: errors }     // bad input
{ error: true,  code: 500, message: '...',          data: null }       // our fault
{ error: true,  code: 502, message: '...',          data: null }       // upstream fault
```

**HTTP status code convention** (also documented in `server.js`):
- `400` — caller sent bad or missing input
- `500` — something broke on our side (bug, memory failure, bad mapping)
- `502` — we called an upstream service (Uber API, POS endpoint) and it failed

**Always assign the result to a `const` before passing to `data:`** — never inline a function call inside the response object:
```js
// correct
const result = await getStore(storeId);
return res.status(200).json({ error: false, code: 200, message: 'Successful.', data: result });

// wrong — do not do this
return res.status(200).json({ error: false, code: 200, message: 'Successful.', data: await getStore(storeId) });
```

### Dashboard HTML — consuming the envelope

All `apiFetch` / `apiPost` calls in `dashboard/index.html` must follow this pattern:

```js
// apiFetch throws on non-2xx — always wrap in try/catch
try {
  const resp = await apiFetch('/dashboard/clients');
  if (resp.error) { toast(resp.message, true); return; }
  const data = resp.data; // use data here
} catch(e) {
  toast('Failed to load: ' + e.message, true);
}

// apiPost does NOT throw on non-2xx — check resp.error directly, still wrap for network errors
try {
  const r = await apiPost('/orders/accept', { orderId, storeId });
  r.error ? toast(r.message, true) : toast('Order accepted');
} catch(e) {
  toast('Network error: ' + e.message, true);
}
```

**Important:** order action endpoints (`/orders/accept`, `/orders/deny`, `/orders/status`) expect `orderId` and `storeId` in the **request body** — never in the URL path.

---

## Key files

| File | Purpose |
|------|---------|
| [server.js](server.js) | Entry point (project root) — `global.UberModels` setup, middleware, route mounting, startup cache load. Uses `console` directly (no logger). Morgan traffic logging commented out. |
| [src/uber/model/index.js](src/uber/model/index.js) | All DB setup: Sequelize instance, auto-discovers models, associations, authenticate + syncTables on startup. Exports `(force) => db`. |
| [src/uber/model/UberAccount.js](src/uber/model/UberAccount.js) | OAuth token table — factory `(sequelize) => sequelize.define(...)` |
| [src/uber/model/UberStores.js](src/uber/model/UberStores.js) | Restaurant store table — factory `(sequelize) => sequelize.define(...)` |
| [src/uber/model/UberErrorLog.js](src/uber/model/UberErrorLog.js) | Log table — stores all `logger.warn()` and `logger.error()` calls; fallback to `logs/ubererror.log` if DB unavailable |
| [src/uber/model/UberEventStore.js](src/uber/model/UberEventStore.js) | Event log table — persists all `pushEvent()` calls; memory array is the read cache |
| [src/uber/services/uberTokenService.js](src/uber/services/uberTokenService.js) | In-memory token cache, auto-refresh 5 min before expiry. Uses `global.UberModels.UberAccount`. |
| [src/uber/services/uberService.js](src/uber/services/uberService.js) | Uber Eats API client — orders, menu, stores, POS activation |
| [src/uber/services/posRelayService.js](src/uber/services/posRelayService.js) | Transforms Uber order → POS schema, POSTs to `pos_endpoint` |
| [src/uber/config/storeCache.js](src/uber/config/storeCache.js) | In-memory store map, loaded from DB at startup. Uses `global.UberModels.UberStores`. |
| [src/uber/config/eventStore.js](src/uber/config/eventStore.js) | In-memory event ring buffer (max 500) for dashboard — DB-backed via `UberEventStore`; `loadEventsFromDB()` warms memory on startup |
| [src/uber/utils/logger.js](src/uber/utils/logger.js) | Winston — console + `logs/ubererror.log` only (combined.log disabled) |
| [src/uber/middleware/webhookAuth.js](src/uber/middleware/webhookAuth.js) | HMAC-SHA256 verification of Uber webhook signature |
| [src/uber/utils/fetch.js](src/uber/utils/fetch.js) | `getData`, `postData`, `patchData`, `postForm` with 30s timeout |

### API files — one action per file

| File | Endpoint |
|------|---------|
| [src/uber/api/webhooks.js](src/uber/api/webhooks.js) | `POST /uber/webhooks/uber-eats` |
| [src/uber/api/ordersaccept.js](src/uber/api/ordersaccept.js) | `POST /uber/orders/accept` |
| [src/uber/api/ordersdeny.js](src/uber/api/ordersdeny.js) | `POST /uber/orders/deny` |
| [src/uber/api/ordersstatus.js](src/uber/api/ordersstatus.js) | `POST /uber/orders/status` |
| [src/uber/api/menusync.js](src/uber/api/menusync.js) | `POST /uber/menu/sync` |
| [src/uber/api/menuavailability.js](src/uber/api/menuavailability.js) | `POST /uber/menu/availability` |
| [src/uber/api/dashstats.js](src/uber/api/dashstats.js) | `GET /uber/dashboard/stats` |
| [src/uber/api/dashevents.js](src/uber/api/dashevents.js) | `GET /uber/dashboard/events` |
| [src/uber/api/dashclients.js](src/uber/api/dashclients.js) | `GET /uber/dashboard/clients` — returns all clients |
| [src/uber/api/dashclient.js](src/uber/api/dashclient.js) | `GET /uber/dashboard/client?storeId=` — single store lookup via Uber API (not used by dashboard UI) |
| [src/uber/api/uberlink.js](src/uber/api/uberlink.js) | `GET /uber/uberlink` (OAuth callback) |
| [src/uber/api/uberlinkactivate.js](src/uber/api/uberlinkactivate.js) | `POST /uber/uberlink/activate` |
| [dashboard/index.html](dashboard/index.html) | Static dashboard UI — polls stats/events/clients every 5s, accept/deny orders, "Activate POS" button |

---

## Database models

### `UberAccount`
| Column | Type | Notes |
|--------|------|-------|
| `id` | `BIGINT` PK autoincrement | Links to `UberStores.idUberAccount` |
| `client_id` | `VARCHAR(64)` UNIQUE | Human label (e.g. `tacofuego`), passed as `state` in OAuth URL |
| `access_token` | `TEXT` | Auto-refreshed 5 min before expiry |
| `refresh_token` | `TEXT` | |
| `token_type` | `VARCHAR(32)` | `Bearer` |
| `scope` | `VARCHAR(255)` | Currently `eats.pos_provisioning` |
| `expires_at` | `BIGINT` | Unix ms — used for in-memory expiry checks |
| `expires_date` | `DATETIME` | Human-readable expiration datetime |
| `lastSync` | `DATETIME` | Last OAuth link or token refresh |
| `createdAt` / `updatedAt` | `DATETIME` | Sequelize timestamps |

### `UberStores`
| Column | Type | Notes |
|--------|------|-------|
| `id` | `BIGINT` PK autoincrement | |
| `idUberAccount` | `BIGINT` FK → `UberAccount.id` | Which Uber account owns this store |
| `store_id` | `VARCHAR(64)` UNIQUE | Uber Eats store UUID |
| `name` | `VARCHAR(255)` | |
| `pos_endpoint` | `VARCHAR(500)` | Set manually after onboarding — orders are forwarded here |
| `pos_integration_enabled` | `BOOLEAN` | Set to `true` after `POST /stores/{store_id}/pos_data` succeeds |
| `status` | `VARCHAR(32)` | `active` / `inactive` |
| `address`, `address_2`, `city`, `state`, `postal_code`, `country` | `VARCHAR` | Flattened from Uber location object |
| `latitude` / `longitude` | `FLOAT` | |
| `timezone` | `VARCHAR(64)` | |
| `avg_prep_time` | `INT` | Minutes |
| `web_url` | `VARCHAR(500)` | |
| `lastSync` | `DATETIME` | Last store sync from Uber API |
| `createdAt` / `updatedAt` | `DATETIME` | Sequelize timestamps |

### `UberEventStore`
| Column | Type | Notes |
|--------|------|-------|
| `id` | `BIGINT` PK autoincrement | |
| `type` | `VARCHAR(32)` | `ORDER_RECEIVED` · `ORDER_ACCEPTED` · `ORDER_DENIED` · `STATUS_UPDATE` · `MENU_SYNC` · `ERROR` |
| `storeId` | `VARCHAR(64)` nullable | Uber Eats store UUID |
| `orderId` | `VARCHAR(128)` nullable | |
| `meta` | `TEXT` nullable | JSON string of remaining payload fields (order object, error message, status, etc.) |
| `createdAt` | `DATETIME` | Auto timestamp — no `updatedAt` |

Written by `pushEvent()` in [src/uber/config/eventStore.js](src/uber/config/eventStore.js) (fire-and-forget, non-blocking). `loadEventsFromDB()` loads the last 500 rows into memory on startup so the dashboard has history after a restart.

### `UberErrorLog`
| Column | Type | Notes |
|--------|------|-------|
| `id` | `BIGINT` PK autoincrement | |
| `level` | `VARCHAR(20)` | Always `'error'` |
| `message` | `TEXT` | The log message string |
| `meta` | `TEXT` | JSON string of extra fields (storeId, orderId, error details, etc.) |
| `createdAt` | `DATETIME` | Auto timestamp — no `updatedAt` |

Written by `DBLogTransport` in [src/uber/utils/logger.js](src/uber/utils/logger.js). Falls back to `logs/ubererror.log` if DB is unavailable.

---

## Model / DB setup

All DB logic is in [src/uber/model/index.js](src/uber/model/index.js):
- Creates the Sequelize instance (Azure SQL, mssql dialect, port 1433, encryption on, pool max 5)
- Auto-discovers all model files via `fs.readdirSync`, calls each factory with `sequelize`
- Defines associations: `UberAccount.hasMany(UberStores)`
- On first call: runs `authenticate()` then `sync({ force })` — `force: false` = create if missing, never drop
- `started` guard prevents re-initialization if required multiple times
- Exits the process (`process.exit(1)`) if DB connection fails

Models are accessed everywhere as `global.UberModels.UberAccount` / `global.UberModels.UberStores` — no imports needed. There is no `db.js`.

---

## Logging

`server.js` uses `console.log/warn/error` directly — no Winston there. All `src/uber/api/`, `src/uber/services/`, `src/uber/middleware/` use Winston via [src/uber/utils/logger.js](src/uber/utils/logger.js):
- **Console** — all levels (warn, error)
- **`UberErrorLog` DB table** — primary destination for all `logger.warn(...)` and `logger.error(...)` calls, written via `DBLogTransport` in `logger.js`
- **`logs/ubererror.log`** — fallback only; written when DB is unavailable (not connected yet at startup, or DB write fails)
- **`logs/combined.log`** — disabled (was for info/warn; removed)
- `logger.info` is not used — removed project-wide; only `logger.warn` and `logger.error` are active, both recorded to DB

**Log priority (DBLogTransport — captures `warn` and `error`):**
1. If `global.UberModels.UberErrorLog` is ready → write to DB
2. If DB write fails → write to `logs/ubererror.log`
3. If DB model not ready yet (early startup) → write to `logs/ubererror.log`

Morgan HTTP request logging is commented out in `server.js`. Uncomment to re-enable.

---

## Environment variables

```env
UBER_CLIENT_ID="..."          # from Uber developer dashboard
UBER_CLIENT_SECRET="..."      # from Uber developer dashboard
UBER_BASE_URL="https://test-api.uber.com/v1/eats"   # sandbox
                              # "https://api.uber.com/v1/eats" for production
UBER_WEBHOOK_SECRET="..."     # hex string — generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
PORT=3000
NODE_ENV="development"
DB_SERVER="your-server.database.windows.net"
DB_USER="..."
DB_PASS="..."
DB_NAME="..."
```

**Note:** Wrap all values in quotes in `.env` — passwords or secrets with `#` or `!` break dotenv parsing without quotes.

---

## Quick Start

```bash
npm install
cp .env.example .env   # fill in credentials
npm run dev            # development with auto-reload
npm start              # production
```

On startup the server:
1. `global.UberModels = require('./src/uber/model/index')(false)` — connects to DB, creates `UberAccount`, `UberStores`, `UberErrorLog` tables if missing
2. Loads all tokens and stores from the DB into memory
3. If a token exists but the store cache is empty → fetches stores from Uber API automatically

**Link a Uber Eats account via OAuth** — direct the merchant to:
```
https://sandbox-login.uber.com/oauth/v2/authorize?client_id=<UBER_CLIENT_ID>&redirect_uri=https://kukipos-sync.azurewebsites.net/uber/uberlink&scope=eats.pos_provisioning&response_type=code&state=<client-label>
```
`state` is a short human label for the account (e.g. `tacofuego`, no spaces). Server handles token exchange, store sync, and POS activation at `GET /uber/uberlink`. Multiple accounts: repeat with a different `state` label per merchant.

**Configure POS endpoint per store** — update the `pos_endpoint` column in the `UberStores` table directly (via Azure SQL or a future admin route). This is the URL where orders will be forwarded.

**Register webhook URL with Uber** — in Uber Eats Restaurant Manager, set the webhook endpoint to:
```
https://kukipos-sync.azurewebsites.net/uber/webhooks/uber-eats
```

Tokens auto-refresh in memory 5 minutes before expiry and are saved back to DB. No re-authorization needed after restart.

---

## POS activation

Uber requires `POST /stores/{store_id}/pos_data` once per store using the merchant's user access token (`eats.pos_provisioning` scope) to register your integration.

- **Automatic:** happens in `GET /uber/uberlink` immediately after OAuth completes
- **Manual re-run:** `POST /uber/uberlink/activate` — activates all stores where `pos_integration_enabled = false`; also via the **Activate POS** button in the dashboard
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
https://sandbox-login.uber.com/oauth/v2/authorize?client_id=<ID>&redirect_uri=https://kukipos-sync.azurewebsites.net/uber/uberlink&scope=eats.pos_provisioning&response_type=code&state=<client-label>
```
Server handles token exchange, store sync, and POS activation automatically.

**Add a new API endpoint:**
1. Create `src/uber/api/myaction.js` exporting `() => { const router = Router(); router.route('/').METHOD(...); return router; }`
2. In `server.js` add as a pair under the relevant group comment:
   ```js
   const myaction = require('./src/uber/api/myaction')();
   app.use('/full/path', express.json(), myaction);
   ```
3. Use `GetReqValues(req)` to read params — never `req.params`
4. Use `global.UberModels.ModelName` for DB access — no imports needed
5. Always return the standard envelope: `{ error, code, message, data }` — see the API response envelope section above

**Add a new Uber Eats API call:**
1. Add a method to [src/uber/services/uberService.js](src/uber/services/uberService.js)
2. Use `authHeaders()` for client_credentials token, or pass an explicit token for user-scoped calls (`eats.pos_provisioning`)
3. Use `global.uber` as the base URL

**Add a new webhook event type:**
Extend the `switch` block in [src/uber/api/webhooks.js](src/uber/api/webhooks.js). Events arrive as `{ event_type, meta, data }`.

---

## API Reference

All routes are prefixed with `/uber/`. All responses use `{ error, code, message, data }` envelope.

### Auth & Provisioning
| Method | Path | Params | Description |
|--------|------|--------|-------------|
| `GET` | `/uber/uberlink` | `?code=&state=<label>` | OAuth callback — saves tokens, syncs stores, activates POS |
| `POST` | `/uber/uberlink/activate` | body: `{}` | Re-runs POS activation for stores where `pos_integration_enabled = false` |

### Webhooks
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/uber/webhooks/uber-eats` | Receives all Uber Eats events (HMAC-SHA256 signature verified) |

### Orders (requires `eats.order` scope in production)
| Method | Path | Body | Description |
|--------|------|------|-------------|
| `POST` | `/uber/orders/accept` | `{ orderId, storeId, minutesToPrepare? }` | Accept an order |
| `POST` | `/uber/orders/deny` | `{ orderId, storeId, reason? }` | Deny an order |
| `POST` | `/uber/orders/status` | `{ orderId, storeId, status }` | Update order status |

**Note:** `orderId` and `storeId` always go in the **request body** — never in the URL path.

Valid deny reasons: `ITEM_UNAVAILABLE` · `RESTAURANT_TOO_BUSY` · `CLOSED_TEMPORARILY` · `TECHNICAL_DIFFICULTIES`

Valid statuses: `ACCEPTED` · `IN_PREPARATION` · `READY_FOR_PICKUP` · `IN_DELIVERY` · `DELIVERED` · `CANCELLED`

### Menu (requires `eats.store.menu.write` scope)
| Method | Path | Body | Description |
|--------|------|------|-------------|
| `POST` | `/uber/menu/sync` | `{ storeId, ...menu }` | Push full menu to Uber Eats |
| `POST` | `/uber/menu/availability` | `{ storeId, items: [{item_id, available}] }` | Toggle item availability |

### Dashboard
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/uber/dashboard/stats` | Aggregate stats (last 60 min) |
| `GET` | `/uber/dashboard/events` | Event log (`?limit=100&storeId=xxx`) |
| `GET` | `/uber/dashboard/clients` | All registered clients (store map) |
| `GET` | `/uber/dashboard/client` | Single store lookup via Uber API (`?storeId=xxx`) — not used by dashboard UI |

### Health
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Returns `{ status, uptime, version }` |

---

## Production Checklist

- [ ] Set `NODE_ENV="production"`
- [ ] Set `UBER_BASE_URL="https://api.uber.com/v1/eats"` (live API — currently `test-api.uber.com`)
- [ ] Set all Azure SQL env vars (`DB_SERVER`, `DB_USER`, `DB_PASS`, `DB_NAME`)
- [ ] Complete OAuth link at `GET /uber/uberlink?code=...&state=<label>` for each Uber account
- [ ] Set `pos_endpoint` for each store in `UberStores` table (required before orders can be forwarded)
- [ ] Update webhook URL in Uber Eats Restaurant Manager to `https://kukipos-sync.azurewebsites.net/uber/webhooks/uber-eats`
- [ ] Apply for `eats.order` scope (for accept/deny/status in production)
- [ ] Apply for `eats.store.menu.write` scope (for menu push in production)
- [ ] Add authentication (API key or JWT) to `/uber/orders`, `/uber/menu`, `/uber/dashboard`, `/uber/uberlink/activate`
- [ ] Verify HTTPS is active on App Service (required by Uber for webhooks)
- [ ] Set up log rotation for `logs/` directory

---

## Deployment (Azure App Service)

Deployed to `kukipos-sync.azurewebsites.net`. The `.deployment` file tells Azure to run `npm install` during deployment.

To deploy from VS Code: use the Azure App Service extension (workspace settings in `.vscode/settings.json`).

To view error logs via SSH in Azure Portal:
```bash
cat /home/site/wwwroot/logs/ubererror.log
```

---

## Known limitations / TODO

- No authentication on `/uber/orders`, `/uber/menu`, `/uber/dashboard`, `/uber/uberlink/activate` — add API key or JWT before exposing publicly
- `eats.order` and `eats.store.menu.write` scopes needed for live order management and menu push
- `UBER_BASE_URL` must be switched from `test-api.uber.com` to `api.uber.com` for production
