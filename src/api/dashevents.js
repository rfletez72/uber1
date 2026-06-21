'use strict';

const { Router } = require('express');
const { getEvents } = require('../config/eventStore');

module.exports = () => {
  const router = Router();
  router.get('/', (req, res) => {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const storeId = req.query.storeId || undefined;
    res.json(getEvents({ limit, storeId }));
  });
  return router;
};
