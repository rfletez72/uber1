# Uber Eats POS Integration

Multi-tenant middleware that connects your POS system to Uber Eats for multiple restaurant clients.

## Features

- **Webhook receiver** — ingests all Uber Eats order events with signature verification
- **Order routing** — maps each `store_id` to the correct POS REST endpoint
- **Accept / Deny orders** — manual or automatic via the dashboard
- **Status updates** — push order lifecycle changes back to Uber Eats
- **Menu sync** — push full menus or toggle item availability
- **Live dashboard** — real-time order log, stats, and client management
- **Multi-account OAuth** — multiple Uber Eats accounts each get their own token row; stores are linked to the account that owns them
- **DB-backed persistence** — tokens and stores are stored in Azure SQL (`UberAccount` + `UberStores` tables); no JSON files needed

---

## Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
# Edit .env with your credentials
```

Required variables in `.env`:

```env
# Uber Eats API
UBER_CLIENT_ID="..."
UBER_CLIENT_SECRET="..."
UBER_BASE_URL="https://test-api.uber.com/v1/eats"   # switch to "https://api.uber.com/v1/eats" for production
UBER_WEBHOOK_SECRET="..."                            # generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Server
PORT=3000
NODE_ENV="development"

# Azure SQL — required for token and store persistence
# Wrap values in quotes — passwords containing # would otherwise be treated as comments
DB_SERVER="your-server.database.windows.net"
DB_USER="..."
DB_PASS="..."
DB_NAME="..."
```

### 3. Start the server
```bash
npm start          # production
npm run dev        # development with auto-reload
```

On startup the server:
1. Creates the `UberAccount` and `UberStores` tables if they don't exist (`sync({ alter: false })`)
2. Loads all tokens and stores from the DB into memory
3. If a token exists but the store cache is empty, fetches stores from the Uber API automatically

### 4. Link a Uber Eats account via OAuth

Add a `client` label to the state so the server knows which account is authorizing (e.g. `taco-fuego`). Direct the restaurant owner to:

```
https://sandbox-login.uber.com/oauth/v2/authorize
  ?client_id=<UBER_CLIENT_ID>
  &redirect_uri=https://kukipos-sync.azurewebsites.net/uberlink
  &scope=eats.pos_provisioning
  &response_type=code
```

After they authorize, Uber redirects to:
```
GET /uberlink?code=...&client=taco-fuego
```

The server:
1. Exchanges the code for access + refresh tokens
2. Upserts a row in `UberAccount` (keyed by `client_id`), gets back the auto-increment `id`
3. Fetches all stores for that account and upserts them in `UberStores` with `idUberAccount` set
4. Returns `{ clientId, uberAccountId, scope, stores[] }`

Tokens are automatically refreshed in memory 5 minutes before expiry and saved back to the DB. No re-authorization needed after restart.

**Multiple accounts:** repeat the OAuth flow with a different `?client=` label for each Uber Eats account. Each account gets its own `UberAccount` row and its stores are linked to it via `idUberAccount`.

### 5. Configure POS endpoints per store

After linking, set each store's POS endpoint via `PATCH /dashboard/clients/:storeId` or update the `UberStores` table directly (`pos_endpoint` column).

### 6. Register your webhook URL with Uber

In the Uber Eats Restaurant Manager, set your webhook endpoint to:
```
https://kukipos-sync.azurewebsites.net/webhooks/uber-eats
```

---

## API Reference

### Auth & Linking
| Method | Path | Query params | Description |
|--------|------|------|-------------|
| `GET` | `/uberlink` | `code`, `client` (label) | OAuth callback — saves tokens to DB and syncs stores |

### Webhooks
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/webhooks/uber-eats` | Receives all Uber Eats events (signature verified) |

### Orders
| Method | Path | Body | Description |
|--------|------|------|-------------|
| `POST` | `/orders/:orderId/accept` | `{ storeId, minutesToPrepare? }` | Accept an order |
| `POST` | `/orders/:orderId/deny` | `{ storeId, reason? }` | Deny an order |
| `POST` | `/orders/:orderId/status` | `{ storeId, status }` | Update order status |

**Valid deny reasons:** `ITEM_UNAVAILABLE` · `RESTAURANT_TOO_BUSY` · `CLOSED_TEMPORARILY` · `TECHNICAL_DIFFICULTIES`

**Valid statuses:** `ACCEPTED` · `IN_PREPARATION` · `READY_FOR_PICKUP` · `IN_DELIVERY` · `DELIVERED` · `CANCELLED`

### Menu
| Method | Path | Body | Description |
|--------|------|------|-------------|
| `POST` | `/menu/:storeId/sync` | Full menu object | Push full menu to Uber Eats |
| `PATCH` | `/menu/:storeId/availability` | `{ items: [{item_id, available}] }` | Toggle item availability |

### Dashboard API
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/dashboard/stats` | Aggregate stats (last 60 min) |
| `GET` | `/dashboard/events` | Event log (`?limit=50&storeId=xxx`) |
| `GET` | `/dashboard/clients` | List all registered clients |
| `GET` | `/dashboard/clients/:storeId` | Uber Eats store details for one client |

### Health
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Returns `{ status, uptime, version }` |

---

## Database Schema

### `UberAccount`
| Column | Type | Notes |
|--------|------|-------|
| `id` | `BIGINT` PK autoincrement | Links to `UberStores.idUberAccount` |
| `createdAt` / `updatedAt` | `DATETIME` | Sequelize timestamps |
| `lastSync` | `DATETIME` | last OAuth link or token refresh |
| `client_id` | `VARCHAR(64)` UNIQUE | Human label for the account (e.g. `taco-fuego`) |
| `access_token` | `TEXT` | Auto-refreshed 5 min before expiry |
| `refresh_token` | `TEXT` | |
| `token_type` | `VARCHAR(32)` NOT NULL | `Bearer` |
| `scope` | `VARCHAR(255)` NOT NULL | defaults to `''` |
| `expires_date` | `DATETIME` NOT NULL | calculated expiration date (`Date.now() + expires_in * 1000`) |
| `expires_at` | `BIGINT` NOT NULL | unix ms — used for in-memory expiry checks |

### `UberStores`
| Column | Type | Notes |
|--------|------|-------|
| `id` | `BIGINT` PK autoincrement | |
| `createdAt` / `updatedAt` | `DATETIME` | Sequelize timestamps |
| `lastSync` | `DATETIME` | last store sync from Uber API |
| `idUberAccount` | `BIGINT` FK → `UberAccount.id` | which Uber account owns this store |
| `store_id` | `VARCHAR(64)` UNIQUE | Uber Eats store UUID |
| `name` | `VARCHAR(255)` | |
| `pos_endpoint` | `VARCHAR(500)` | set manually after onboarding |
| `status` | `VARCHAR(32)` | `active` / `inactive` |
| `address`, `address_2`, `city`, `state`, `postal_code`, `country` | `VARCHAR` | flattened from Uber location object |
| `latitude` / `longitude` | `FLOAT` | |
| `timezone` | `VARCHAR(64)` | |
| `avg_prep_time` | `INT` | minutes |
| `web_url` | `VARCHAR(500)` | |
| `pos_integration_enabled` | `BOOLEAN` | |

---

## Architecture

```
[Uber Eats Platform]
        │
        │  POST /webhooks/uber-eats
        │  (HMAC signature verified)
        ▼
[This Middleware — Node.js/Express]
        │
        ├── Validate signature
        ├── Log event to event store
        ├── Look up store_id in storeCache (loaded from DB)
        │
        ├── POST to POS endpoint (per store)
        │
        └── Call Uber Eats API (accept/deny/status)
              │  (token auto-refreshed, saved to uber_tokens)
         [Uber Eats API]

[OAuth Flow — multi-account]
  Browser → Uber authorize URL
         → GET /uberlink?code=...&client=<label>
         → token upserted in UberAccount   (gets auto-increment id)
         → stores upserted in UberStores  (idUberAccount = that id)
```

### Key source files

| File | Purpose |
|------|---------|
| `src/model/db.js` | Sequelize instance (Azure SQL via Tedious) |
| `src/model/UberAccount.js` | `UberAccount` table model |
| `src/model/UberStores.js` | `UberStores` table model + `idUberAccount` FK |
| `src/model/index.js` | Loads models, defines `UberAccount.hasMany(UberStores)` association |
| `src/services/uberTokenService.js` | Multi-account token cache; auto-refresh; reads/writes `uber_tokens` |
| `src/config/storeCache.js` | In-memory store map backed by `stores` table |
| `src/utils/fetch.js` | Thin native-fetch wrappers (`getData`, `postData`, `patchData`, `postForm`) |

---

## Deployment (Azure App Service)

The server is deployed to `kukipos-sync.azurewebsites.net`. The `.deployment` file configures Azure to run `npm install` during deployment.

To deploy from VS Code, use the Azure App Service extension with the workspace configured in `.vscode/settings.json`.

---

## Production Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Set `UBER_BASE_URL=https://api.uber.com/v1/eats` (live API)
- [ ] Set Azure SQL env vars (`DB_SERVER`, `DB_USER`, `DB_PASS`, `DB_NAME`)
- [ ] Complete OAuth link at `GET /uberlink?code=...&client=<label>` for each Uber account
- [ ] Set `pos_endpoint` for each store (via dashboard or directly in `stores` table)
- [ ] Add authentication to `/orders`, `/menu`, `/dashboard` routes
- [ ] Set up HTTPS (required by Uber for webhooks)
- [ ] Configure process manager (PM2, systemd, or App Service startup command)
- [ ] Set up log rotation for `/logs/`