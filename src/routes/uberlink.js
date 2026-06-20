'use strict';

const express = require('express');
const { Op } = require('sequelize');
const { postForm } = require('../utils/fetch');
const { setTokens, getAccessToken } = require('../services/uberTokenService');
const { getStores, activatePosStore } = require('../services/uberService');
const { mergeUberStores, updateStore } = require('../config/storeCache');
const UberStores = require('../model/UberStores');
const UberAccount = require('../model/UberAccount');
const logger = require('../config/logger');

const router = express.Router();

const UBER_TOKEN_URL = 'https://sandbox-login.uber.com/oauth/v2/token';
const REDIRECT_URI = 'https://kukipos-sync.azurewebsites.net/uberlink';

// GET /uberlink?code=...&client=<label>
// Uber redirects here after the client authorizes. We exchange the code for tokens,
// save them to the DB under the given client label, and sync the linked stores.
// The `client` param (e.g. "taco-fuego") identifies which Uber account this is.
router.get('/', async (req, res) => {
  const { code, error, state: rawState = 'NewUser' } = req.query;
  const clientId = rawState.replace(/[^a-zA-Z0-9]/g, '');

  if (error) {
    logger.warn('Uber OAuth denied by user', { error });
    return res.status(400).json({ error: 'Authorization denied', detail: error });
  }

  if (!code) {
    return res.status(400).json({ error: 'Missing authorization code' });
  }

  try {
    const params = new URLSearchParams({
      client_id: process.env.UBER_CLIENT_ID,
      client_secret: process.env.UBER_CLIENT_SECRET,
      grant_type: 'authorization_code',
      redirect_uri: REDIRECT_URI,
      code
    });

    const data = await postForm(UBER_TOKEN_URL, params);

    const linkedAt = new Date();

    // Persist to DB, hot-update cache, get the auto-increment id for FK linking
    const uberAccountId = await setTokens(clientId, data.access_token, data.refresh_token, data.expires_in, data.scope, linkedAt);

    // Fetch all stores for this Uber account and link them via uberAccountId
    let stores = [];
    try {
      stores = await getStores();
      await mergeUberStores(stores, uberAccountId);
    } catch (err) {
      logger.warn('Could not fetch stores after OAuth link — run /menu sync manually', { error: err.message });
    }

    // Activate POS integration for each store using the merchant's user token
    const activationResults = [];
    for (const store of stores) {
      try {
        await activatePosStore(store.store_id, data.access_token);
        activationResults.push({ store_id: store.store_id, activated: true });
        logger.info('POS activation succeeded', { storeId: store.store_id });
      } catch (err) {
        activationResults.push({ store_id: store.store_id, activated: false, error: err.message });
        logger.warn('POS activation failed for store', { storeId: store.store_id, error: err.message });
      }
    }

    logger.info('Uber OAuth link complete — tokens saved to DB', {
      clientId,
      uberAccountId,
      scope: data.scope,
      storeCount: stores.length,
      activated: activationResults.filter(r => r.activated).length
    });

    res.json({
      success: true,
      clientId,
      uberAccountId,
      scope: data.scope,
      stores: stores.map(s => ({ store_id: s.store_id, name: s.name })),
      activation: activationResults
    });
  } catch (err) {
    const detail = err.response?.data || err.message;
    logger.error('Uber OAuth token exchange failed', { detail });
    res.status(502).json({ success: false, error: 'Token exchange failed', detail });
  }
});

// POST /uberlink/activate
// Re-runs POS activation for stores in the DB that are not yet activated.
// Useful when stores were synced before activation was implemented, or when
// a previous activation attempt failed.
router.post('/activate', async (req, res) => {
  try {
    const pending = await UberStores.findAll({
      where: {
        [Op.or]: [
          { pos_integration_enabled: false },
          { pos_integration_enabled: null }
        ]
      },
      include: [{ model: UberAccount, attributes: ['client_id'] }]
    });
    console.log('si: ',pending);

    if (pending.length === 0) {
      return res.json({ success: true, message: 'All stores already activated', results: [] });
    }

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

    res.json({
      success: true,
      total: pending.length,
      activated: results.filter(r => r.activated).length,
      results
    });
  } catch (err) {
    logger.error('Bulk POS activation error', { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
