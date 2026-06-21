'use strict';

const { Router } = require('express');
const { check, validationResult } = require('express-validator');
const { GetReqValues } = require('../utils/utils');
const { getStore } = require('../services/uberService');
const logger = require('../utils/logger');

module.exports = () => {
  const router = Router();

  router.get('/', [
    check('storeId').not().isEmpty(),
  ], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ error: true, code: 400, message: 'Required fields missing.', data: errors.array() });

    const { storeId } = GetReqValues(req);
    try {
      const store = await getStore(storeId);
      return res.status(200).json({ error: false, code: 200, message: 'Successful.', data: store });
    } catch (err) {
      // 502 = Uber API call failed
      const errmsg = err.message ? err.message : 'Failed to fetch store.';
      logger.error('Failed to fetch store', { storeId, error: errmsg });
      return res.status(502).json({ error: true, code: 502, message: errmsg, data: null });
    }
  });

  return router;
};
