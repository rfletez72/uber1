'use strict';

const { Router } = require('express');
const { check, validationResult } = require('express-validator');
const { GetReqValues } = require('../utils/utils');
const { updateOrderStatus } = require('../services/uberService');
const { pushEvent } = require('../config/eventStore');
const logger = require('../config/logger');

module.exports = () => {
  const router = Router();

  router.route('/').post([
    check('storeId').not().isEmpty(),
    check('orderId').not().isEmpty(),
    check('status').not().isEmpty(),
  ], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ error: 'Required fields missing.', details: errors.array() });

    const { storeId, orderId, status } = GetReqValues(req);
    try {
      const result = await updateOrderStatus(orderId, status);
      pushEvent('STATUS_UPDATE', { storeId, orderId, status });
      logger.info('Order status updated', { orderId, status });
      res.json({ success: true, data: result });
    } catch (err) {
      logger.error('Failed to update order status', { orderId, error: err.message });
      res.status(502).json({ success: false, error: err.message });
    }
  });

  return router;
};
