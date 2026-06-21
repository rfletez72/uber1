'use strict';

const { Router } = require('express');
const { getStats } = require('../config/eventStore');
const logger = require('../utils/logger');

module.exports = () => {
  const router = Router();
  router.get('/', (req, res) => {
    try {
      const stats = getStats();
      return res.status(200).json({ error: false, code: 200, message: 'Successful.', data: stats });
    } catch (err) {
      const errmsg = err.message ? err.message : 'Failed to load stats.';
      logger.error('Failed to load stats', { error: errmsg });
      return res.status(500).json({ error: true, code: 500, message: errmsg, data: null });
    }
  });
  return router;
};
