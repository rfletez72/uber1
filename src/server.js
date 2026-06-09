'use strict';

require('dotenv').config();

const appVersion = 2;
const express = require('express');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
const logger = require('./config/logger');

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

// Health check

app.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime(), version: appVersion }));

// ─── Global Error Handler ────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  logger.info(`🍔 Uber Eats POS integration running on port ${PORT}`);
  logger.info(`📊 Dashboard → http://localhost:${PORT}`);
  logger.info(`🪝 Webhook endpoint → http://localhost:${PORT}/webhooks/uber-eats`);
});

module.exports = app;

// npm start
// npm run dev

// with this we generated a key for UBER_WEBHOOK_SECRET=<the value you generated>
// node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"


 // https://sandbox-login.uber.com/oauth/v2/authorize?client_id=GoPVbSUAoIjlRmk6Ej-j__HBPjpfOgP3&redirect_uri=https://kukipos-sync.azurewebsites.net/uberlink&scope=<SPACE_DELIMITED_LIST_OF_SCOPES>&response_type=code
 // GET https://kukipos-sync.azurewebsites.net/uberlink/?code=<AUTHORIZATION_CODE>
 // https://sandbox-login.uber.com/oauth/v2/authorize?client_id=GoPVbSUAoIjlRmk6Ej-j__HBPjpfOgP3&redirect_uri=https://kukipos-sync.azurewebsites.net/uberlink&scope=eats.pos_provisioning&response_type=code

 