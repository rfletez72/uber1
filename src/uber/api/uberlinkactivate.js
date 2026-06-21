'use strict';

const { Router } = require('express');
const { Op } = require('sequelize');
const { getAccessToken } = require('../services/uberTokenService');
const { activatePosStore } = require('../services/uberService');
const { updateStore } = require('../config/storeCache');
const logger = require('../utils/logger');

module.exports = () => {
  const router = Router();

  // Re-runs POS activation for stores not yet activated (pos_integration_enabled = false).
  router.route('/').post(async (req, res) => {
    try {
      const pending = await global.UberModels.UberStores.findAll({
        where: {
          [Op.or]: [
            { pos_integration_enabled: false },
            { pos_integration_enabled: null }
          ]
        },
        include: [{ model: global.UberModels.UberAccount, attributes: ['client_id'] }]
      });

      if (pending.length === 0)
        return res.status(200).json({ error: false, code: 200, message: 'All stores already activated.', data: { total: 0, activated: 0, results: [] } });

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
        } catch (err) {
          results.push({ store_id: store.store_id, name: store.name, activated: false, error: err.message });
          logger.warn('POS activation failed', { storeId: store.store_id, clientId, error: err.message });
        }
      }

      const result = { total: pending.length, activated: results.filter(r => r.activated).length, results };
      return res.status(200).json({ error: false, code: 200, message: 'Successful.', data: result });
    } catch (err) {
      const errmsg = err.message ? err.message : 'Bulk activation error.';
      logger.error('Bulk POS activation error', { error: errmsg });
      return res.status(500).json({ error: true, code: 500, message: errmsg, data: null });
    }
  });

  return router;
};
