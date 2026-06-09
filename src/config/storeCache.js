'use strict';

const fs = require('fs');
const path = require('path');
const logger = require('./logger');

/**
 * STORE CACHE
 * ─────────────────────────────────────────────────────────────────────────────
 * Persists the Uber Eats store registry to stores.json.
 * Populated automatically after each OAuth link (/uberlink).
 *
 * Shape of stores.json:
 *   {
 *     "<uber_store_id>": {
 *       "name": "Taco Fuego",
 *       "posEndpoint": "http://...",   ← set manually or via PATCH /dashboard/clients/:id
 *       "uberStatus": { ... },          ← from Uber API
 *       "lastSyncedAt": "2026-06-09T..."
 *     }
 *   }
 */

const STORES_FILE = path.join(__dirname, '../../stores.json');

let _cache = {};

function load() {
  try {
    _cache = JSON.parse(fs.readFileSync(STORES_FILE, 'utf8'));
    logger.info('Store cache loaded from stores.json', { count: Object.keys(_cache).length });
  } catch {
    logger.warn('stores.json not found — store cache empty until next OAuth link');
    _cache = {};
  }
}

function save() {
  try {
    fs.writeFileSync(STORES_FILE, JSON.stringify(_cache, null, 2));
  } catch (err) {
    logger.warn('Could not persist store cache to stores.json', { error: err.message });
  }
}

/**
 * Returns the current in-memory store map.
 * Shape matches what clients.js / posRelayService expect:
 *   { storeId: { name, posEndpoint } }
 */
function getStoreMap() {
  return _cache;
}

/**
 * Merge stores fetched from Uber API into the cache.
 * Preserves existing posEndpoint so manual config is never overwritten.
 *
 * @param {Array<{ store_id: string, name: string, status?: object }>} uberStores
 */
function mergeUberStores(uberStores) {
  for (const store of uberStores) {
    const id = store.store_id;
    _cache[id] = {
      name: store.name || _cache[id]?.name || id,
      posEndpoint: _cache[id]?.posEndpoint || null,
      status: store.status || null,
      location: store.location || null,
      timezone: store.timezone || null,
      avgPrepTime: store.avg_prep_time || null,
      webUrl: store.web_url || null,
      posIntegrationEnabled: store.pos_data?.integration_enabled ?? false,
      lastSyncedAt: new Date().toISOString()
    };
  }
  save();
  logger.info('Store cache merged from Uber API', { count: uberStores.length, total: Object.keys(_cache).length });
}

/**
 * Update one store's fields (e.g. set posEndpoint after onboarding).
 *
 * @param {string} storeId
 * @param {object} fields
 */
function updateStore(storeId, fields) {
  _cache[storeId] = { ..._cache[storeId], ...fields };
  save();
  logger.info('Store updated in cache', { storeId, fields });
}

load();

module.exports = { getStoreMap, mergeUberStores, updateStore };
