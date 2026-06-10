'use strict';

const express = require('express');
const { postForm } = require('../utils/fetch');
const { setTokens } = require('../services/uberTokenService');
const { getStores } = require('../services/uberService');
const { mergeUberStores } = require('../config/storeCache');
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

    logger.info('Uber OAuth link complete — tokens saved to DB', {
      clientId,
      uberAccountId,
      scope: data.scope,
      storeCount: stores.length
    });

    res.json({
      success: true,
      clientId,
      uberAccountId,
      scope: data.scope,
      stores: stores.map(s => ({ store_id: s.store_id, name: s.name }))
    });
  } catch (err) {
    const detail = err.response?.data || err.message;
    logger.error('Uber OAuth token exchange failed', { detail });
    res.status(502).json({ success: false, error: 'Token exchange failed', detail });
  }
});

module.exports = router;
