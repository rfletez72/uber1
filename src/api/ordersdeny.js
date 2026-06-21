'use strict';

const { Router } = require('express');
const { check, validationResult } = require('express-validator');
const { GetReqValues } = require('../utils/utils');
const { denyOrder } = require('../services/uberService');
const { pushEvent } = require('../config/eventStore');
const logger = require('../config/logger');

module.exports = () => {
  const router = Router();

  router.route('/').post([
    check('storeId').not().isEmpty(),
    check('orderId').not().isEmpty(),
  ], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ error: 'Required fields missing.', details: errors.array() });

    const { storeId, orderId, reason = 'ITEM_UNAVAILABLE' } = GetReqValues(req);
    try {
      const result = await denyOrder(orderId, reason);
      pushEvent('ORDER_DENIED', { storeId, orderId, reason });
      logger.info('Order denied', { orderId, reason });
      res.json({ success: true, data: result });
    } catch (err) {
      logger.error('Failed to deny order', { orderId, error: err.message });
      res.status(502).json({ success: false, error: err.message });
    }
  });

  return router;
};
