'use strict';

const { Router } = require('express');
const { check, validationResult } = require('express-validator');
const { GetReqValues } = require('../utils/utils');
const { updateItemAvailability } = require('../services/uberService');
const logger = require('../utils/logger');

module.exports = () => {
  const router = Router();

  router.route('/').post([
    check('storeId').not().isEmpty(),
    check('items').isArray({ min: 1 }),
  ], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ error: true, code: 400, message: 'Required fields missing.', data: errors.array() });

    const { storeId, items } = GetReqValues(req);
    try {
      const result = await updateItemAvailability(storeId, items);
      return res.status(200).json({ error: false, code: 200, message: 'Successful.', data: result });
    } catch (err) {
      const errmsg = err.message ? err.message : 'Availability update failed.';
      logger.error('Availability update failed', { storeId, error: errmsg });
      return res.status(502).json({ error: true, code: 502, message: errmsg, data: null });
    }
  });

  return router;
};
