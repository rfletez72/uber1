'use strict';

const { getStoreMap } = require('./storeCache');

/**
 * CLIENT REGISTRY
 * ─────────────────────────────────────────────────────────────────────────────
 * Returns the live store map from storeCache (DB-backed, loaded at startup from UberStores table).
 * Stores are populated automatically after each Uber OAuth link (/uber/uberlink).
 */
function loadClientMap() {
  return getStoreMap();
}

module.exports = { loadClientMap };
