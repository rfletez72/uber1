'use strict';

const express = require('express');
const { getEvents, getStats } = require('../config/eventStore');
const { loadClientMap } = require('../config/clients');
const { getStore } = require('../services/uberService');
const logger = require('../config/logger');

const router = express.Router();

/**
 * GET /dashboard/stats
 * Returns aggregate stats for the summary cards.
 */
router.get('/stats', (req, res) => {
  res.json(getStats());
});

/**
 * GET /dashboard/events?limit=50&storeId=abc123
 * Returns recent event log entries.
 */
router.get('/events', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const storeId = req.query.storeId || undefined;
  res.json(getEvents({ limit, storeId }));
});

/**
 * GET /dashboard/clients
 * Returns all registered restaurant clients.
 */
router.get('/clients', async (req, res) => {
  const clientMap = loadClientMap();
  const clients = Object.entries(clientMap).map(([storeId, info]) => ({
    storeId,
    name: info.name || storeId,
    posEndpoint: info.posEndpoint
  }));
  res.json(clients);
});

/**
 * GET /dashboard/clients/:storeId
 * Returns Uber Eats store details for one client.
 */
router.get('/clients/:storeId', async (req, res) => {
  try {
    const store = await getStore(req.params.storeId);
    res.json(store);
  } catch (err) {
    logger.error('Failed to fetch store', { storeId: req.params.storeId, error: err.message });
    res.status(502).json({ error: err.message });
  }
});

module.exports = router;
