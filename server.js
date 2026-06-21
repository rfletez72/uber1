'use strict';

require('dotenv').config();

global.uber   = process.env.UBER_BASE_URL || 'https://test-api.uber.com/v1/eats';
global.appVer = '2026.06.20.0';
// Production API -> 'https://api.uber.com/v1/eats'

global.Models = require('./src/model/index')(false);

const express   = require('express');
const rateLimit = require('express-rate-limit');
const path      = require('path');

const { loadTokensFromDB, getAccessToken } = require('./src/services/uberTokenService');
const { loadStoresFromDB, getStoreMap, mergeUberStores } = require('./src/config/storeCache');
const { getStores } = require('./src/services/uberService');

const app  = express();
const PORT = process.env.PORT || 3000;

// app.use(require('morgan')('combined', { stream: { write: (msg) => console.log(msg.trim()) } }));

app.use(rateLimit({ windowMs: 60 * 1000, max: 200, standardHeaders: true, legacyHeaders: false }));
app.use(express.static(path.join(__dirname, 'dashboard')));

// webhooks — express.raw() handled inside the route for HMAC verification
const webhooks = require('./src/api/webhooks')();
app.use('/webhooks', webhooks);

// orders
const ordersaccept = require('./src/api/ordersaccept')();
app.use('/orders/accept', express.json(), ordersaccept);
const ordersdeny = require('./src/api/ordersdeny')();
app.use('/orders/deny', express.json(), ordersdeny);
const ordersstatus = require('./src/api/ordersstatus')();
app.use('/orders/status', express.json(), ordersstatus);

// menu
const menusync = require('./src/api/menusync')();
app.use('/menu/sync', express.json(), menusync);
const menuavailability = require('./src/api/menuavailability')();
app.use('/menu/availability', express.json(), menuavailability);

// dashboard
const dashstats = require('./src/api/dashstats')();
app.use('/dashboard/stats', dashstats);
const dashevents = require('./src/api/dashevents')();
app.use('/dashboard/events', dashevents);
const dashclients = require('./src/api/dashclients')();
app.use('/dashboard/clients', dashclients);
const dashclient = require('./src/api/dashclient')();
app.use('/dashboard/clients', dashclient);

// uberlink
const uberlink = require('./src/api/uberlink')();
app.use('/uberlink', uberlink);
const uberlinkactivate = require('./src/api/uberlinkactivate')();
app.use('/uberlink/activate', express.json(), uberlinkactivate);

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
  res.status(500).json({ error: 'Internal server error' });
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
  console.log(`Webhooks   → http://localhost:${PORT}/webhooks/uber-eats`);
  console.log(`Health     → http://localhost:${PORT}/health`);

  await loadTokensFromDB();
  await loadStoresFromDB();
  await syncStoresOnStartup();
});

module.exports = app;

// npm run dev  — nodemon
// npm start    — production

// Generate UBER_WEBHOOK_SECRET:
// node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

// OAuth URL:
// https://sandbox-login.uber.com/oauth/v2/authorize?client_id=GoPVbSUAoIjlRmk6Ej-j__HBPjpfOgP3&redirect_uri=https://kukipos-sync.azurewebsites.net/uberlink&scope=eats.pos_provisioning&response_type=code&state=taco-fuego
