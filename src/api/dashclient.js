'use strict';

const { Router } = require('express');
const { check, validationResult } = require('express-validator');
const { GetReqValues } = require('../utils/utils');
const { getStore } = require('../services/uberService');
const logger = require('../config/logger');

module.exports = () => {
  const router = Router();

  router.get('/', [
    check('storeId').not().isEmpty(),
  ], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ error: 'Required fields missing.', details: errors.array() });

    const { storeId } = GetReqValues(req);
    try {
      const store = await getStore(storeId);
      res.json(store);
    } catch (err) {
      logger.error('Failed to fetch store', { storeId, error: err.message });
      res.status(502).json({ error: err.message });
    }
  });

  return router;
};
