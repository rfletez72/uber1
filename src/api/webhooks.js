'use strict';

const { Router } = require('express');
const express = require('express');
const { verifyUberSignature } = require('../middleware/webhookAuth');
const { relayOrderToPOS } = require('../services/posRelayService');
const { acceptOrder } = require('../services/uberService');
const { pushEvent } = require('../config/eventStore');
const logger = require('../config/logger');

async function handleOrderPlaced(event) {
  const order = event.data;
  const storeId = order?.store?.id;
  const orderId = order?.id;

  pushEvent('ORDER_RECEIVED', { storeId, orderId, order });

  const relay = await relayOrderToPOS(order);
  if (!relay.success) {
    logger.error('Failed to relay order to POS', { orderId, error: relay.error });
    pushEvent('ERROR', { storeId, orderId, error: relay.error });
    return;
  }

  await acceptOrder(orderId, 20);
  pushEvent('ORDER_ACCEPTED', { storeId, orderId, auto: true });
}

async function handleOrderCancelled(event) {
  const order = event.data;
  pushEvent('STATUS_UPDATE', {
    storeId: order?.store?.id,
    orderId: order?.id,
    status: 'CANCELLED',
    cancelledBy: event.event_type
  });
  logger.info('Order cancelled', { orderId: order?.id, reason: event.event_type });
}

module.exports = () => {
  const router = Router();

  router.post(
    '/uber-eats',
    express.raw({ type: 'application/json' }),
    verifyUberSignature,
    async (req, res) => {
      res.status(200).json({ received: true });

      const event = req.body;
      const eventType = event.event_type;

      logger.info('Webhook received', { eventType, eventId: event.event_id });

      try {
        switch (eventType) {
          case 'eats.order.scheduled.placed':
          case 'eats.order.cart.placed':
            await handleOrderPlaced(event);
            break;
          case 'eats.order.cancelled.by_uber':
          case 'eats.order.cancelled.by_eater':
            await handleOrderCancelled(event);
            break;
          default:
            logger.debug('Unhandled webhook event type', { eventType });
        }
      } catch (err) {
        logger.error('Error processing webhook event', { eventType, error: err.message });
        pushEvent('ERROR', { storeId: event.data?.store?.id, eventType, error: err.message });
      }
    }
  );

  return router;
};
