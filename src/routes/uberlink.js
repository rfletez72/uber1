'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const { postForm } = require('../utils/fetch');
const { setTokens } = require('../services/tokenService');
const { getStores } = require('../services/uberService');
const { mergeUberStores } = require('../config/storeCache');
const logger = require('../config/logger');

const router = express.Router();

const UBER_TOKEN_URL = 'https://sandbox-login.uber.com/oauth/v2/token';
const REDIRECT_URI = 'https://kukipos-sync.azurewebsites.net/uberlink';
const LINK_FILE = path.join(__dirname, '../../linkuber.json');

// GET /uberlink?code=...
// Uber redirects here after the client authorizes. We exchange the code for
// tokens and persist them to linkuber.json so the server can use them immediately.
router.get('/', async (req, res) => {
  const { code, error } = req.query;

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

    const expiresAt = Date.now() + data.expires_in * 1000;

    const record = {
      ...data,
      expires_at: expiresAt,
      expires_at_iso: new Date(expiresAt).toISOString(),
      linked_at: new Date().toISOString()
    };

    fs.writeFileSync(LINK_FILE, JSON.stringify(record, null, 2));

    // Hot-update the in-memory token cache so API calls work immediately
    setTokens(data.access_token, data.refresh_token, data.expires_in);

    // Fetch all stores linked to this account and merge into stores.json
    let stores = [];
    try {
      stores = await getStores();
      mergeUberStores(stores);
    } catch (err) {
      logger.warn('Could not fetch stores after OAuth link — run /menu sync manually', { error: err.message });
    }

    logger.info('Uber OAuth link complete — tokens saved to linkuber.json', {
      scope: data.scope,
      expiresAt: record.expires_at_iso,
      storeCount: stores.length
    });

    res.json({
      success: true,
      scope: data.scope,
      expires_at: record.expires_at_iso,
      stores: stores.map(s => ({ store_id: s.store_id, name: s.name }))
    });
  } catch (err) {
    const detail = err.response?.data || err.message;
    logger.error('Uber OAuth token exchange failed', { detail });
    res.status(502).json({ success: false, error: 'Token exchange failed', detail });
  }
});

module.exports = router;
