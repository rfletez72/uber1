'use strict';

const { Router } = require('express');
const { getEvents } = require('../config/eventStore');
const logger = require('../utils/logger');

module.exports = () => {
  const router = Router();
  router.get('/', (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit) || 50, 200);
      const storeId = req.query.storeId || undefined;
      const events = getEvents({ limit, storeId });
      return res.status(200).json({ error: false, code: 200, message: 'Successful.', data: events });
    } catch (err) {
      const errmsg = err.message ? err.message : 'Failed to load events.';
      logger.error('Failed to load events', { error: errmsg });
      return res.status(500).json({ error: true, code: 500, message: errmsg, data: null });
    }
  });
  return router;
};
