'use strict';

const { Router } = require('express');
const { loadClientMap } = require('../config/clients');
const logger = require('../utils/logger');

module.exports = () => {
  const router = Router();
  router.get('/', (req, res) => {
    try {
      const clientMap = loadClientMap();
      const clients = Object.entries(clientMap).map(([storeId, info]) => ({
        storeId,
        name: info.name || storeId,
        posEndpoint: info.posEndpoint
      }));
      return res.status(200).json({ error: false, code: 200, message: 'Successful.', data: clients });
    } catch (err) {
      const errmsg = err.message ? err.message : 'Failed to load client map.';
      logger.error('Failed to load client map', { error: errmsg });
      return res.status(500).json({ error: true, code: 500, message: errmsg, data: null });
    }
  });
  return router;
};
