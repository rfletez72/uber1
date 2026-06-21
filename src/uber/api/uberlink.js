'use strict';

const { Router } = require('express');
const { postForm } = require('../utils/fetch');
const { setTokens } = require('../services/uberTokenService');
const { getStores, activatePosStore } = require('../services/uberService');
const { mergeUberStores } = require('../config/storeCache');
const logger = require('../utils/logger');

const UBER_TOKEN_URL = 'https://sandbox-login.uber.com/oauth/v2/token';
const REDIRECT_URI = 'https://kukipos-sync.azurewebsites.net/uber/uberlink';

module.exports = () => {
  const router = Router();

  // Uber redirects here after OAuth. Exchanges code for tokens, syncs stores, activates POS.
  router.route('/').get(async (req, res) => {
    const { code, error, state: rawState = 'NewUser' } = req.query;
    const clientId = rawState.replace(/[^a-zA-Z0-9]/g, '');

    if (error) {
      logger.warn('Uber OAuth denied by user', { error });
      return res.status(400).json({ error: true, code: 400, message: 'Authorization denied.', data: { detail: error } });
    }
    if (!code) return res.status(400).json({ error: true, code: 400, message: 'Missing authorization code.', data: null });
    if (!clientId) return res.status(400).json({ error: true, code: 400, message: 'Missing or invalid state label.', data: null });

    try {
      const existing = await global.UberModels.UberAccount.findOne({ where: { client_id: clientId } });
      if (existing) {
        return res.status(400).json({
          error: true,
          code: 400,
          message: `Client '${clientId}' is already registered. Use a different state label or remove the existing account first.`,
          data: { uberAccountId: Number(existing.id), linkedAt: existing.lastSync }
        });
      }

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
        } catch (err) {
          activationResults.push({ store_id: store.store_id, activated: false, error: err.message });
          logger.warn('POS activation failed for store', { storeId: store.store_id, error: err.message });
        }
      }

      const result = {
        clientId,
        uberAccountId,
        scope: data.scope,
        stores: stores.map(s => ({ store_id: s.store_id, name: s.name })),
        activation: activationResults
      };
      return res.status(200).json({ error: false, code: 200, message: 'Successful.', data: result });
    } catch (err) {
      const errmsg = err.message ? err.message : 'Token exchange failed.';
      logger.error('Uber OAuth token exchange failed', { error: errmsg });
      return res.status(502).json({ error: true, code: 502, message: errmsg, data: null });
    }
  });

  return router;
};
