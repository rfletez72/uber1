'use strict';

/**
 * CLIENT REGISTRY
 * ─────────────────────────────────────────────────────────────────────────────
 * Maps each Uber Eats store_id to the corresponding POS REST endpoint for that
 * restaurant client.  In production you would typically load this from a
 * database; here we read it from the CLIENT_STORE_MAP env var (JSON) so the
 * service stays stateless and easy to deploy.
 *
 * Shape:
 *   {
 *     "<uber_store_id>": {
 *       posEndpoint : "http://...",   // where we POST incoming orders
 *       name        : "My Restaurant" // human-readable label for the dashboard
 *     }
 *   }
 */

function loadClientMap() {
  try {
    const raw = process.env.CLIENT_STORE_MAP || '{}';
    const parsed = JSON.parse(raw);

    // Support both simple string values (legacy) and full objects
    const normalized = {};
    for (const [storeId, value] of Object.entries(parsed)) {
      if (typeof value === 'string') {
        normalized[storeId] = { posEndpoint: value, name: storeId };
      } else {
        normalized[storeId] = value;
      }
    }
    return normalized;
  } catch (err) {
    throw new Error(`Failed to parse CLIENT_STORE_MAP: ${err.message}`);
  }
}

module.exports = { loadClientMap };
