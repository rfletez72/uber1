'use strict';

const { Router } = require('express');
const { loadClientMap } = require('../config/clients');

module.exports = () => {
  const router = Router();
  router.get('/', (req, res) => {
    const clientMap = loadClientMap();
    const clients = Object.entries(clientMap).map(([storeId, info]) => ({
      storeId,
      name: info.name || storeId,
      posEndpoint: info.posEndpoint
    }));
    res.json(clients);
  });
  return router;
};
