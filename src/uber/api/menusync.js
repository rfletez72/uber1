'use strict';

const { Router } = require('express');
const { check, validationResult } = require('express-validator');
const { GetReqValues } = require('../utils/utils');
const { syncMenu } = require('../services/uberService');
const { pushEvent } = require('../config/eventStore');
const logger = require('../utils/logger');

module.exports = () => {
  const router = Router();

  router.route('/').post([
    check('storeId').not().isEmpty(),
  ], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ error: true, code: 400, message: 'Required fields missing.', data: errors.array() });

    const { storeId, ...menuData } = GetReqValues(req);
    if (!menuData || Object.keys(menuData).length === 0)
      return res.status(400).json({ error: true, code: 400, message: 'Menu payload is required.', data: null });
    try {
      const result = await syncMenu(storeId, menuData);
      pushEvent('MENU_SYNC', { storeId, itemCount: menuData.categories?.length });
      return res.status(200).json({ error: false, code: 200, message: 'Successful.', data: result });
    } catch (err) {
      const errmsg = err.message ? err.message : 'Menu sync failed.';
      logger.error('Menu sync failed', { storeId, error: errmsg });
      return res.status(502).json({ error: true, code: 502, message: errmsg, data: null });
    }
  });

  return router;
};
