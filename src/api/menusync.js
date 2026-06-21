'use strict';

const { Router } = require('express');
const { check, validationResult } = require('express-validator');
const { GetReqValues } = require('../utils/utils');
const { syncMenu } = require('../services/uberService');
const { pushEvent } = require('../config/eventStore');
const logger = require('../config/logger');

module.exports = () => {
  const router = Router();

  router.route('/').post([
    check('storeId').not().isEmpty(),
  ], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ error: 'Required fields missing.', details: errors.array() });

    const { storeId, ...menuData } = GetReqValues(req);
    if (!menuData || Object.keys(menuData).length === 0)
      return res.status(400).json({ error: 'Menu payload is required' });
    try {
      const result = await syncMenu(storeId, menuData);
      pushEvent('MENU_SYNC', { storeId, itemCount: menuData.categories?.length });
      logger.info('Menu synced', { storeId });
      res.json({ success: true, data: result });
    } catch (err) {
      logger.error('Menu sync failed', { storeId, error: err.message });
      res.status(502).json({ success: false, error: err.message });
    }
  });

  return router;
};
