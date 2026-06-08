'use strict';

require('dotenv').config();

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

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

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