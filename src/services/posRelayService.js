'use strict';

const { postData } = require('../utils/fetch');
const { loadClientMap } = require('../config/clients');
const logger = require('../config/logger');

/**
 * POS RELAY SERVICE
 * ─────────────────────────────────────────────────────────────────────────────
 * Transforms an Uber Eats order payload into the shape your POS expects and
 * POSTs it to the correct restaurant endpoint.
 *
 * Adapt transformOrder() to match your POS API's request schema.
 */

/**
 * Map an Uber Eats order to your POS order schema.
 * Extend / modify this function to match your system's exact field names.
 *
 * @param {object} uberOrder  Raw Uber Eats order object from the webhook
 * @returns {object}          Payload for your POS REST endpoint
 */
function transformOrder(uberOrder) {
  return {
    source: 'UBER_EATS',
    externalOrderId: uberOrder.id,
    storeId: uberOrder.store?.id,
    status: uberOrder.current_state,
    placedAt: uberOrder.placed_at,
    estimatedReadyAt: uberOrder.estimated_ready_for_pickup_at,
    customer: {
      name: uberOrder.eater?.first_name + ' ' + (uberOrder.eater?.last_name || ''),
      phone: uberOrder.eater?.phone_number
    },
    items: (uberOrder.cart?.items || []).map((item) => ({
      id: item.id,
      name: item.title,
      quantity: item.quantity,
      price: item.price?.unit_price?.amount,
      currency: item.price?.unit_price?.currency_code,
      specialInstructions: item.special_instructions,
      modifiers: (item.selected_modifier_groups || []).flatMap((group) =>
        (group.selected_items || []).map((mod) => ({
          id: mod.id,
          name: mod.title,
          quantity: mod.quantity,
          price: mod.price?.unit_price?.amount
        }))
      )
    })),
    totals: {
      subtotal: uberOrder.payment?.charges?.total?.amount,
      currency: uberOrder.payment?.charges?.total?.currency_code
    },
    deliveryType: uberOrder.type, // PICK_UP | DELIVERY | DINE_IN
    raw: uberOrder // keep the original in case the POS needs extra fields
  };
}

/**
 * Forward an Uber Eats order to the POS of the matching restaurant client.
 *
 * @param {object} uberOrder  Raw order payload from the webhook event
 * @returns {{ success: boolean, posEndpoint: string, posResponse?: object, error?: string }}
 */
async function relayOrderToPOS(uberOrder) {
  const storeId = uberOrder.store?.id;
  const clientMap = loadClientMap();
  const client = clientMap[storeId];

  if (!client) {
    const msg = `No POS client registered for store_id "${storeId}"`;
    logger.warn(msg, { storeId });
    return { success: false, error: msg };
  }

  const posPayload = transformOrder(uberOrder);

  logger.info('Relaying order to POS', {
    orderId: uberOrder.id,
    storeId,
    posEndpoint: client.posEndpoint
  });

  const posResponse = await postData(client.posEndpoint, posPayload);

  logger.info('POS accepted order', { orderId: uberOrder.id });

  return { success: true, posEndpoint: client.posEndpoint, posResponse };
}

module.exports = { relayOrderToPOS, transformOrder };
