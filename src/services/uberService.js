'use strict';

const axios = require('axios');
const { getAccessToken } = require('./tokenService');
const logger = require('../config/logger');

const BASE_URL = process.env.UBER_BASE_URL || 'https://api.uber.com/v1/eats';

/**
 * Build an axios instance with a fresh bearer token for every call.
 */
async function uberClient() {
  const token = await getAccessToken();
  return axios.create({
    baseURL: BASE_URL,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
}

// ─── Orders ──────────────────────────────────────────────────────────────────

/**
 * Accept an order received via webhook.
 * @param {string} orderId
 * @param {number} [minutesToPrepare=20]  ETA in minutes sent back to the customer
 */
async function acceptOrder(orderId, minutesToPrepare = 20) {
  logger.info('Accepting order', { orderId, minutesToPrepare });
  const client = await uberClient();
  const response = await client.post(`/orders/${orderId}/accept_pos_order`, {
    reason: 'ORDER_RECEIVED',
    minutes_to_prepare: minutesToPrepare
  });
  return response.data;
}

/**
 * Deny/cancel an order.
 * @param {string} orderId
 * @param {string} [reason='ITEM_UNAVAILABLE']
 */
async function denyOrder(orderId, reason = 'ITEM_UNAVAILABLE') {
  logger.info('Denying order', { orderId, reason });
  const client = await uberClient();
  const response = await client.post(`/orders/${orderId}/deny_pos_order`, {
    reason
  });
  return response.data;
}

/**
 * Update the fulfilment status of an order.
 * Valid statuses: ACCEPTED | IN_PREPARATION | READY_FOR_PICKUP | IN_DELIVERY | DELIVERED | CANCELLED
 * @param {string} orderId
 * @param {string} status
 */
async function updateOrderStatus(orderId, status) {
  logger.info('Updating order status', { orderId, status });
  const client = await uberClient();
  const response = await client.post(`/orders/${orderId}/updateStatus`, {
    status
  });
  return response.data;
}

// ─── Menu Sync ────────────────────────────────────────────────────────────────

/**
 * Push a full menu to an Uber Eats store.
 * The menu object must follow the Uber Eats Menu API schema:
 * https://developer.uber.com/docs/eats/api/v1/post-eats-stores-storeid-menus
 *
 * @param {string} storeId   Uber Eats store_id
 * @param {object} menuData  Full menu payload
 */
async function syncMenu(storeId, menuData) {
  logger.info('Syncing menu', { storeId });
  const client = await uberClient();
  const response = await client.post(`/stores/${storeId}/menus`, menuData);
  return response.data;
}

/**
 * Update availability of specific items (e.g. mark as out-of-stock).
 *
 * @param {string} storeId
 * @param {Array<{item_id: string, available: boolean}>} items
 */
async function updateItemAvailability(storeId, items) {
  logger.info('Updating item availability', { storeId, count: items.length });
  const client = await uberClient();
  const response = await client.patch(`/stores/${storeId}/menus/items`, {
    items
  });
  return response.data;
}

/**
 * Retrieve store details (hours, status, etc.)
 * @param {string} storeId
 */
async function getStore(storeId) {
  const client = await uberClient();
  const response = await client.get(`/stores/${storeId}`);
  return response.data;
}

module.exports = {
  acceptOrder,
  denyOrder,
  updateOrderStatus,
  syncMenu,
  updateItemAvailability,
  getStore
};
