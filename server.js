'use strict';

require('dotenv').config();

global.uber   = process.env.UBER_BASE_URL || 'https://test-api.uber.com/v1/eats';
global.appVer = '2026.06.21.0';
// Production API -> 'https://api.uber.com/v1/eats'

global.UberModels = require('./src/uber/model/index')(false);

const express   = require('express');
const rateLimit = require('express-rate-limit');
const path      = require('path');

const { loadTokensFromDB, getAccessToken } = require('./src/uber/services/uberTokenService');
const { loadStoresFromDB, getStoreMap, mergeUberStores } = require('./src/uber/config/storeCache');
const { loadEventsFromDB } = require('./src/uber/config/eventStore');
const { getStores } = require('./src/uber/services/uberService');

const app  = express();
const PORT = process.env.PORT || 3000;

// app.use(require('morgan')('combined', { stream: { write: (msg) => console.log(msg.trim()) } }));

app.use(rateLimit({ windowMs: 60 * 1000, max: 200, standardHeaders: true, legacyHeaders: false }));
app.use(express.static(path.join(__dirname, 'dashboard')));

// error returned
// 500 — something broke on our side: unhandled exception, memory failure, bad mapping, a bug in our code. The caller did nothing wrong.
// 502 — we made a call to an upstream service (Uber API, POS endpoint) and that upstream failed or returned bad data. We're the middle man and the failure is theirs.
// 400 — the caller sent bad or missing input. Their fault.

// webhooks — express.raw() handled inside the route for HMAC verification
const webhooks = require('./src/uber/api/webhooks')();
app.use('/uber/webhooks', webhooks);

// orders
const ordersaccept = require('./src/uber/api/ordersaccept')();
app.use('/uber/orders/accept', express.json(), ordersaccept);
const ordersdeny = require('./src/uber/api/ordersdeny')();
app.use('/uber/orders/deny', express.json(), ordersdeny);
const ordersstatus = require('./src/uber/api/ordersstatus')();
app.use('/uber/orders/status', express.json(), ordersstatus);

// menu
const menusync = require('./src/uber/api/menusync')();
app.use('/uber/menu/sync', express.json(), menusync);
const menuavailability = require('./src/uber/api/menuavailability')();
app.use('/uber/menu/availability', express.json(), menuavailability);

// dashboard
const dashstats = require('./src/uber/api/dashstats')();
app.use('/uber/dashboard/stats', dashstats);
const dashevents = require('./src/uber/api/dashevents')();
app.use('/uber/dashboard/events', dashevents);
const dashclients = require('./src/uber/api/dashclients')();
app.use('/uber/dashboard/clients', dashclients);
const dashclient = require('./src/uber/api/dashclient')();
app.use('/uber/dashboard/client', dashclient); // not used by dashboard UI — standalone single-store lookup (GET ?storeId=)

// uberlink
const uberlink = require('./src/uber/api/uberlink')();
app.use('/uber/uberlink', uberlink);
const uberlinkactivate = require('./src/uber/api/uberlinkactivate')();
app.use('/uber/uberlink/activate', express.json(), uberlinkactivate);

// health
app.get('/health', (req, res) => {
  const s    = Math.floor(process.uptime());
  const days = Math.floor(s / 86400);
  const hh   = Math.floor((s % 86400) / 3600).toString().padStart(2, '0');
  const mm   = Math.floor((s % 3600) / 60).toString().padStart(2, '0');
  const ss   = (s % 60).toString().padStart(2, '0');
  res.json({ status: 'ok', uptime: `${days}d ${hh}:${mm}:${ss}`, version: global.appVer });
});

app.use((err, req, res, next) => {
  console.error('Unhandled error', err.message, err.stack);
  res.status(500).json({ error: true, code: 500, message: 'Internal server error.', data: null });
});

async function syncStoresOnStartup() {
  try {
    await getAccessToken();
  } catch {
    console.warn('No tokens in DB — complete OAuth at /uberlink to link stores');
    return;
  }

  const storeCount = Object.keys(getStoreMap()).length;
  if (storeCount > 0) {
    console.log(`Store cache ready — ${storeCount} store(s) loaded`);
    return;
  }

  console.log('Store cache empty — token found, syncing stores from Uber API...');
  try {
    const stores = await getStores();
    mergeUberStores(stores);
    console.log(`Startup store sync complete — ${stores.length} store(s) loaded`);
  } catch (err) {
    console.warn('Startup store sync failed — run /menu/sync manually', err.message);
  }
}

app.listen(PORT, async () => {
  console.log(`Uber Eats POS middleware running on port ${PORT}`);
  console.log(`Dashboard  → http://localhost:${PORT}`);
  console.log(`Webhooks   → http://localhost:${PORT}/uber/webhooks/uber-eats`);
  console.log(`Health     → http://localhost:${PORT}/health`);

  await loadTokensFromDB();
  await loadStoresFromDB();
  await loadEventsFromDB();
  await syncStoresOnStartup();
});

module.exports = app;

// npm run dev  — nodemon
// npm start    — production

// Generate UBER_WEBHOOK_SECRET:
// node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

// OAuth URL:
// https://sandbox-login.uber.com/oauth/v2/authorize?client_id=GoPVbSUAoIjlRmk6Ej-j__HBPjpfOgP3&redirect_uri=https://kukipos-sync.azurewebsites.net/uber/uberlink&scope=eats.pos_provisioning&response_type=code&state=tacofuego

// to drop tables
// drop table UberStores
// drop table UberAccount
// drop table UberEventStore
// drop table UberErrorLog
