'use strict';

require('dotenv').config();

global.uber = process.env.UBER_BASE_URL || 'https://test-api.uber.com/v1/eats';
global.appVer = '2026.06.10.3';
// Production API -> 'https://api.uber.com/v1/eats';

const express = require('express');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
const logger = require('./config/logger');

// ─── Database ─────────────────────────────────────────────────────────────────
const sequelize = require('./model/index');
const UberAccount = require('./model/UberAccount');
const UberStores = require('./model/UberStores');

// ─── Services / Cache ────────────────────────────────────────────────────────
const { loadTokensFromDB, getAccessToken } = require('./services/uberTokenService');
const { loadStoresFromDB, getStoreMap, mergeUberStores } = require('./config/storeCache');
const { getStores } = require('./services/uberService');

// ─── Routes ──────────────────────────────────────────────────────────────────
const webhookRoutes = require('./routes/webhooks');
const orderRoutes = require('./routes/orders');
const menuRoutes = require('./routes/menu');
const dashboardRoutes = require('./routes/dashboard');
const uberlinkRoutes = require('./routes/uberlink');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Global Middleware ────────────────────────────────────────────────────────
app.use(morgan('combined', { stream: { write: (msg) => logger.info(msg.trim()) } }));

// JSON body parser for all routes EXCEPT /webhooks (which uses raw for HMAC)
app.use((req, res, next) => {
  if (req.path.startsWith('/webhooks')) return next();
  express.json()(req, res, next);
});

// Rate limiter — protect the API surface
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false
});
app.use(limiter);

// ─── Static Dashboard ─────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '../dashboard')));

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/webhooks', webhookRoutes);
app.use('/orders', orderRoutes);
app.use('/menu', menuRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/uberlink', uberlinkRoutes);

// Health Check
app.get('/health', (req, res) => {
  const s = Math.floor(process.uptime());
  const days = Math.floor(s / 86400);
  const hh = Math.floor((s % 86400) / 3600).toString().padStart(2, '0');
  const mm = Math.floor((s % 3600) / 60).toString().padStart(2, '0');
  const ss = (s % 60).toString().padStart(2, '0');
  res.json({ status: 'ok', uptime: `${days}d ${hh}:${mm}:${ss}`, version: global.appVer });
});

// ─── Global Error Handler ────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

// ─── Startup Store Sync ───────────────────────────────────────────────────────
async function syncStoresOnStartup() {
  try {
    await getAccessToken();
  } catch {
    logger.warn('No tokens in DB — complete OAuth at /uberlink to link stores');
    return;
  }

  const storeCount = Object.keys(getStoreMap()).length;
  if (storeCount > 0) {
    logger.info(`Store cache ready — ${storeCount} store(s) loaded from stores.json`);
    return;
  }

  logger.info('Store cache empty — token found, syncing stores from Uber API...');
  try {
    const stores = await getStores();
    mergeUberStores(stores);
    logger.info(`Startup store sync complete — ${stores.length} store(s) loaded`);
  } catch (err) {
    logger.warn('Startup store sync failed — run /menu sync manually', { error: err.message });
  }
}

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, async () => {
  logger.info(`🍔 Uber Eats POS integration running on port ${PORT}`);
  logger.info(`📊 Dashboard → http://localhost:${PORT}`);
  logger.info(`🪝 Webhook endpoint → http://localhost:${PORT}/webhooks/uber-eats`);

  await UberAccount.sync({ alter: false });
  await UberStores.sync({ alter: false });
  logger.info('DB tables ready');

  await loadTokensFromDB();
  await loadStoresFromDB();
  await syncStoresOnStartup();
});

module.exports = app;

// npm start
// npm run dev

// with this we generated a key for UBER_WEBHOOK_SECRET=<the value you generated>
// node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"


// https://sandbox-login.uber.com/oauth/v2/authorize?client_id=GoPVbSUAoIjlRmk6Ej-j__HBPjpfOgP3&redirect_uri=https://kukipos-sync.azurewebsites.net/uberlink&scope=<SPACE_DELIMITED_LIST_OF_SCOPES>&response_type=code
// GET https://kukipos-sync.azurewebsites.net/uberlink/?code=<AUTHORIZATION_CODE>
// https://sandbox-login.uber.com/oauth/v2/authorize?client_id=GoPVbSUAoIjlRmk6Ej-j__HBPjpfOgP3&redirect_uri=https://kukipos-sync.azurewebsites.net/uberlink&scope=eats.pos_provisioning&response_type=code

//  new call with state (client id)
// https://sandbox-login.uber.com/oauth/v2/authorize?client_id=GoPVbSUAoIjlRmk6Ej-j__HBPjpfOgP3&redirect_uri=https://kukipos-sync.azurewebsites.net/uberlink&scope=eats.pos_provisioning&response_type=code&state=taco-fuego
// https://kukipos-sync.azurewebsites.net/uberlink?code=AUTH_CODE&state=taco-fuego


// Alt + Ctrl + F to align the code

// https://kukipos-sync.azurewebsites.net/health