'use strict';

const { Router } = require('express');
const { Op } = require('sequelize');
const { getAccessToken } = require('../services/uberTokenService');
const { activatePosStore } = require('../services/uberService');
const { updateStore } = require('../config/storeCache');
const logger = require('../config/logger');

module.exports = () => {
  const router = Router();

  // Re-runs POS activation for stores not yet activated (pos_integration_enabled = false).
  router.route('/').post(async (req, res) => {
    try {
      const pending = await global.Models.UberStores.findAll({
        where: {
          [Op.or]: [
            { pos_integration_enabled: false },
            { pos_integration_enabled: null }
          ]
        },
        include: [{ model: global.Models.UberAccount, attributes: ['client_id'] }]
      });

      if (pending.length === 0)
        return res.json({ success: true, message: 'All stores already activated', results: [] });

      const results = [];
      for (const store of pending) {
        const clientId = store.UberAccount?.client_id;
        if (!clientId) {
          results.push({ store_id: store.store_id, name: store.name, activated: false, error: 'No linked Uber account' });
          continue;
        }
        try {
          const accessToken = await getAccessToken(clientId);
          await activatePosStore(store.store_id, accessToken);
          await updateStore(store.store_id, { posIntegrationEnabled: true });
          results.push({ store_id: store.store_id, name: store.name, activated: true });
          logger.info('POS activation succeeded', { storeId: store.store_id, clientId });
        } catch (err) {
          results.push({ store_id: store.store_id, name: store.name, activated: false, error: err.message });
          logger.warn('POS activation failed', { storeId: store.store_id, clientId, error: err.message });
        }
      }

      res.json({ success: true, total: pending.length, activated: results.filter(r => r.activated).length, results });
    } catch (err) {
      logger.error('Bulk POS activation error', { error: err.message });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
};
