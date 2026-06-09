'use strict';

const { getStoreMap } = require('./storeCache');

/**
 * CLIENT REGISTRY
 * ─────────────────────────────────────────────────────────────────────────────
 * Returns the live store map from storeCache (backed by stores.json).
 * Stores are populated automatically after each Uber OAuth link (/uberlink).
 * Set posEndpoint per store via PATCH /dashboard/clients/:storeId.
 */
function loadClientMap() {
  return getStoreMap();
}

module.exports = { loadClientMap };
