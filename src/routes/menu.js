'use strict';

const express = require('express');
const { syncMenu, updateItemAvailability } = require('../services/uberService');
const { pushEvent } = require('../config/eventStore');
const logger = require('../config/logger');

const router = express.Router();

/**
 * POST /menu/:storeId/sync
 * Body: full Uber Eats menu payload from your POS
 *
 * Call this whenever your POS menu changes (items added/removed/repriced).
 * The menu object must follow the Uber Eats Menu API schema.
 * See: https://developer.uber.com/docs/eats/api/v1/post-eats-stores-storeid-menus
 */
router.post('/:storeId/sync', async (req, res) => {
  const { storeId } = req.params;
  const menuData = req.body;

  if (!menuData || Object.keys(menuData).length === 0) {
    return res.status(400).json({ error: 'Menu payload is required' });
  }

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

/**
 * PATCH /menu/:storeId/availability
 * Body: { items: [{ item_id, available }] }
 *
 * Quickly mark individual items as in/out of stock without a full menu push.
 */
router.patch('/:storeId/availability', async (req, res) => {
  const { storeId } = req.params;
  const { items } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: '"items" array is required' });
  }

  try {
    const result = await updateItemAvailability(storeId, items);
    logger.info('Item availability updated', { storeId, count: items.length });
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error('Availability update failed', { storeId, error: err.message });
    res.status(502).json({ success: false, error: err.message });
  }
});

module.exports = router;
