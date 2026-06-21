'use strict';

const { Router } = require('express');
const { postForm } = require('../utils/fetch');
const { setTokens } = require('../services/uberTokenService');
const { getStores, activatePosStore } = require('../services/uberService');
const { mergeUberStores } = require('../config/storeCache');
const logger = require('../config/logger');

const UBER_TOKEN_URL = 'https://sandbox-login.uber.com/oauth/v2/token';
const REDIRECT_URI = 'https://kukipos-sync.azurewebsites.net/uberlink';

module.exports = () => {
  const router = Router();

  // Uber redirects here after OAuth. Exchanges code for tokens, syncs stores, activates POS.
  router.route('/').get(async (req, res) => {
    const { code, error, state: rawState = 'NewUser' } = req.query;
    const clientId = rawState.replace(/[^a-zA-Z0-9]/g, '');

    if (error) {
      logger.warn('Uber OAuth denied by user', { error });
      return res.status(400).json({ error: 'Authorization denied', detail: error });
    }
    if (!code) return res.status(400).json({ error: 'Missing authorization code' });

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
      const uberAccountId = await setTokens(clientId, data.access_token, data.refresh_token, data.expires_in, data.scope, linkedAt);

      let stores = [];
      try {
        stores = await getStores();
        await mergeUberStores(stores, uberAccountId);
      } catch (err) {
        logger.warn('Could not fetch stores after OAuth link', { error: err.message });
      }

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

      logger.info('Uber OAuth link complete', { clientId, uberAccountId, scope: data.scope, storeCount: stores.length });

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

  return router;
};
