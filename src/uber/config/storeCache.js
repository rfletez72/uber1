'use strict';

const logger = require('../utils/logger');

let _cache = {};

// ── Helpers ───────────────────────────────────────────────────────────────────

function rowToCache(row) {
  return {
    name: row.name,
    posEndpoint: row.pos_endpoint,
    status: row.status,
    location: {
      address: row.address,
      address_2: row.address_2,
      city: row.city,
      state: row.state,
      postal_code: row.postal_code,
      country: row.country,
      latitude: row.latitude,
      longitude: row.longitude
    },
    timezone: row.timezone,
    avgPrepTime: row.avg_prep_time,
    webUrl: row.web_url,
    posIntegrationEnabled: row.pos_integration_enabled,
    lastSync: row.lastSync,
    uberAccountId: row.idUberAccount
  };
}

function storeToRow(storeId, data) {
  return {
    store_id: storeId,
    name: data.name || null,
    pos_endpoint: data.posEndpoint || null,
    status: data.status || null,
    address: data.location?.address || null,
    address_2: data.location?.address_2 || null,
    city: data.location?.city || null,
    state: data.location?.state || null,
    postal_code: data.location?.postal_code || null,
    country: data.location?.country || null,
    latitude: data.location?.latitude || null,
    longitude: data.location?.longitude || null,
    timezone: data.timezone || null,
    avg_prep_time: data.avgPrepTime || null,
    web_url: data.webUrl || null,
    pos_integration_enabled: data.posIntegrationEnabled ?? false,
    lastSync: data.lastSync ? new Date(data.lastSync) : new Date(),
    idUberAccount: data.uberAccountId || null
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

async function loadStoresFromDB() {
  try {
    const rows = await global.UberModels.UberStores.findAll();
    _cache = {};
    for (const row of rows) {
      _cache[row.store_id] = rowToCache(row);
    }
  } catch (err) {
    logger.warn('Could not load stores from DB — cache empty', { error: err.message });
    _cache = {};
  }
}

function getStoreMap() {
  return _cache;
}

async function mergeUberStores(uberStores, uberAccountId) {
  for (const store of uberStores) {
    const id = store.store_id;
    const existing = _cache[id] || {};

    const merged = {
      name: store.name || existing.name || id,
      posEndpoint: existing.posEndpoint || null,
      status: store.status || null,
      location: store.location || existing.location || null,
      timezone: store.timezone || existing.timezone || null,
      avgPrepTime: store.avg_prep_time || existing.avgPrepTime || null,
      webUrl: store.web_url || existing.webUrl || null,
      posIntegrationEnabled: store.pos_data?.integration_enabled ?? existing.posIntegrationEnabled ?? false,
      lastSyncedAt: new Date().toISOString(),
      uberAccountId: uberAccountId || existing.uberAccountId || null
    };

    _cache[id] = merged;

    try {
      await global.UberModels.UberStores.upsert(storeToRow(id, merged));
    } catch (err) {
      logger.warn('Could not upsert store to DB', { storeId: id, error: err.message });
    }
  }

}

async function updateStore(storeId, fields) {
  _cache[storeId] = { ..._cache[storeId], ...fields };

  try {
    await global.UberModels.UberStores.upsert(storeToRow(storeId, _cache[storeId]));
  } catch (err) {
    logger.warn('Could not update store in DB', { storeId, error: err.message });
  }
}

module.exports = { loadStoresFromDB, getStoreMap, mergeUberStores, updateStore };