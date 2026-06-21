'use strict';

const { Router } = require('express');
const { check, validationResult } = require('express-validator');
const { GetReqValues } = require('../utils/utils');
const { acceptOrder } = require('../services/uberService');
const { pushEvent } = require('../config/eventStore');
const logger = require('../utils/logger');

module.exports = () => {
  const router = Router();

  router.route('/').post([
    check('storeId').not().isEmpty(),
    check('orderId').not().isEmpty(),
  ], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ error: true, code: 400, message: 'Required fields missing.', data: errors.array() });

    const { storeId, orderId, minutesToPrepare = 20 } = GetReqValues(req);
    try {
      const result = await acceptOrder(orderId, minutesToPrepare);
      pushEvent('ORDER_ACCEPTED', { storeId, orderId, manual: true });
      return res.status(200).json({ error: false, code: 200, message: 'Successful.', data: result });
    } catch (err) {
      const errmsg = err.message ? err.message : 'Failed to accept order.';
      logger.error('Failed to accept order', { orderId, error: errmsg });
      return res.status(502).json({ error: true, code: 502, message: errmsg, data: null });
    }
  });

  return router;
};
