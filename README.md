# 🍔 Uber Eats ↔ POS Integration

Multi-tenant middleware that connects your POS system to Uber Eats for multiple restaurant clients.

## Features

- 📡 **Webhook receiver** — ingests all Uber Eats order events with signature verification  
- 🔄 **Order routing** — maps each `store_id` to the correct POS REST endpoint  
- ✅ **Accept / Deny orders** — manual or automatic via the dashboard  
- 📊 **Status updates** — push order lifecycle changes back to Uber Eats  
- 🍽️ **Menu sync** — push full menus or toggle item availability  
- 📋 **Live dashboard** — real-time order log, stats, and client management  

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

### 3. Register your restaurant clients
In `.env`, set `CLIENT_STORE_MAP` as a JSON object:
```json
{
  "uber_store_id_1": { "posEndpoint": "http://your-pos-1/api/orders", "name": "Le Burger Paris" },
  "uber_store_id_2": { "posEndpoint": "http://your-pos-2/api/orders", "name": "Pizza Roma" }
}
```

### 4. Start the server
```bash
npm start          # production
npm run dev        # development with auto-reload
```

### 5. Register your webhook URL with Uber
In the Uber Eats Restaurant Manager, set your webhook endpoint to:
```
https://your-domain.com/webhooks/uber-eats
```

---

## API Reference

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
        ├── Look up store_id in CLIENT_STORE_MAP
        │
        ├── POST to POS endpoint (per client)
        │
        └── Call Uber Eats API (accept/deny/status)
                │
         [Uber Eats API]
```

---

## Production Checklist

- [ ] Set `NODE_ENV=production` in environment  
- [ ] Store `CLIENT_STORE_MAP` in a database (not env var)  
- [ ] Replace in-memory `eventStore.js` with Postgres/MongoDB  
- [ ] Add authentication to `/orders`, `/menu`, `/dashboard` routes  
- [ ] Set up HTTPS (required by Uber for webhooks)  
- [ ] Configure process manager (PM2, systemd)  
- [ ] Set up log rotation for `/logs/`  
