'use strict';

const { Router } = require('express');
const { check, validationResult } = require('express-validator');
const { GetReqValues } = require('../utils/utils');
const { updateItemAvailability } = require('../services/uberService');
const logger = require('../config/logger');

module.exports = () => {
  const router = Router();

  router.route('/').post([
    check('storeId').not().isEmpty(),
    check('items').isArray({ min: 1 }),
  ], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ error: 'Required fields missing.', details: errors.array() });

    const { storeId, items } = GetReqValues(req);
    try {
      const result = await updateItemAvailability(storeId, items);
      logger.info('Item availability updated', { storeId, count: items.length });
      res.json({ success: true, data: result });
    } catch (err) {
      logger.error('Availability update failed', { storeId, error: err.message });
      res.status(502).json({ success: false, error: err.message });
    }
  });

  return router;
};
