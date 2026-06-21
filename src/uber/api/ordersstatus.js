'use strict';

const { Router } = require('express');
const { check, validationResult } = require('express-validator');
const { GetReqValues } = require('../utils/utils');
const { updateOrderStatus } = require('../services/uberService');
const { pushEvent } = require('../config/eventStore');
const logger = require('../utils/logger');

module.exports = () => {
  const router = Router();

  router.route('/').post([
    check('storeId').not().isEmpty(),
    check('orderId').not().isEmpty(),
    check('status').not().isEmpty(),
  ], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ error: true, code: 400, message: 'Required fields missing.', data: errors.array() });

    const { storeId, orderId, status } = GetReqValues(req);
    try {
      const result = await updateOrderStatus(orderId, status);
      pushEvent('STATUS_UPDATE', { storeId, orderId, status });
      return res.status(200).json({ error: false, code: 200, message: 'Successful.', data: result });
    } catch (err) {
      const errmsg = err.message ? err.message : 'Failed to update order status.';
      logger.error('Failed to update order status', { orderId, error: errmsg });
      return res.status(502).json({ error: true, code: 502, message: errmsg, data: null });
    }
  });

  return router;
};
