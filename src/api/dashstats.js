'use strict';

const { Router } = require('express');
const { getStats } = require('../config/eventStore');

module.exports = () => {
  const router = Router();
  router.get('/', (req, res) => {
    res.json(getStats());
  });
  return router;
};
