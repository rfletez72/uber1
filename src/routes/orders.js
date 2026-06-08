'use strict';

const express = require('express');
const { acceptOrder, denyOrder, updateOrderStatus } = require('../services/uberService');
const { pushEvent } = require('../config/eventStore');
const logger = require('../config/logger');

const router = express.Router();

/**
 * POST /orders/:orderId/accept
 * Body: { storeId, minutesToPrepare? }
 */
router.post('/:orderId/accept', async (req, res) => {
  const { orderId } = req.params;
  const { storeId, minutesToPrepare = 20 } = req.body;

  try {
    const result = await acceptOrder(orderId, minutesToPrepare);
    pushEvent('ORDER_ACCEPTED', { storeId, orderId, manual: true });
    logger.info('Order manually accepted', { orderId });
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error('Failed to accept order', { orderId, error: err.message });
    res.status(502).json({ success: false, error: err.message });
  }
});

/**
 * POST /orders/:orderId/deny
 * Body: { storeId, reason? }
 * Valid reasons: ITEM_UNAVAILABLE | RESTAURANT_TOO_BUSY | CLOSED_TEMPORARILY |
 *                TECHNICAL_DIFFICULTIES | UNDELIVERABLE_AREA | OTHER
 */
router.post('/:orderId/deny', async (req, res) => {
  const { orderId } = req.params;
  const { storeId, reason = 'ITEM_UNAVAILABLE' } = req.body;

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

/**
 * POST /orders/:orderId/status
 * Body: { storeId, status }
 * Valid statuses: ACCEPTED | IN_PREPARATION | READY_FOR_PICKUP |
 *                 IN_DELIVERY | DELIVERED | CANCELLED
 */
router.post('/:orderId/status', async (req, res) => {
  const { orderId } = req.params;
  const { storeId, status } = req.body;

  if (!status) return res.status(400).json({ error: '"status" is required' });

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

module.exports = router;
