'use strict';

const { getData, postData, patchData } = require('../utils/fetch');
const { getAccessToken } = require('./uberTokenService');
const logger = require('../config/logger');

const BASE_URL = global.uber;


async function authHeaders() {
  const token = await getAccessToken();
  return { Authorization: `Bearer ${token}` };
}

// ─── Orders ──────────────────────────────────────────────────────────────────

async function acceptOrder(orderId, minutesToPrepare = 20) {
  logger.info('Accepting order', { orderId, minutesToPrepare });
  return postData(
    `${BASE_URL}/orders/${orderId}/accept_pos_order`,
    { reason: 'ORDER_RECEIVED', minutes_to_prepare: minutesToPrepare },
    await authHeaders()
  );
}

async function denyOrder(orderId, reason = 'ITEM_UNAVAILABLE') {
  logger.info('Denying order', { orderId, reason });
  return postData(
    `${BASE_URL}/orders/${orderId}/deny_pos_order`,
    { reason },
    await authHeaders()
  );
}

async function updateOrderStatus(orderId, status) {
  logger.info('Updating order status', { orderId, status });
  return postData(
    `${BASE_URL}/orders/${orderId}/updateStatus`,
    { status },
    await authHeaders()
  );
}

// ─── Menu ─────────────────────────────────────────────────────────────────────

async function syncMenu(storeId, menuData) {
  logger.info('Syncing menu', { storeId });
  return postData(`${BASE_URL}/stores/${storeId}/menus`, menuData, await authHeaders());
}

async function updateItemAvailability(storeId, items) {
  logger.info('Updating item availability', { storeId, count: items.length });
  return patchData(`${BASE_URL}/stores/${storeId}/menus/items`, { items }, await authHeaders());
}

// ─── Stores ───────────────────────────────────────────────────────────────────

async function getStore(storeId) {
  return getData(`${BASE_URL}/stores/${storeId}`, await authHeaders());
}

async function getStores() {
  const data = await getData(`${BASE_URL}/stores`, await authHeaders());
  return data?.stores || [];
}

// Activate POS integration for a store using the merchant's user access token
// (authorization_code / eats.pos_provisioning scope — NOT client_credentials).
// Must be called once per store after the OAuth link is complete.
async function activatePosStore(storeId, userAccessToken) {
  logger.info('Activating POS integration for store', { storeId });
  return postData(
    `${BASE_URL}/stores/${storeId}/pos_data`,
    { pos_integration_enabled: true },
    { Authorization: `Bearer ${userAccessToken}` }
  );
}

module.exports = {
  acceptOrder,
  denyOrder,
  updateOrderStatus,
  syncMenu,
  updateItemAvailability,
  getStore,
  getStores,
  activatePosStore
};
