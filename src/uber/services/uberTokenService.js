'use strict';

const { postForm } = require('../utils/fetch');
const logger = require('../utils/logger');

const UBER_TOKEN_URL = 'https://sandbox-login.uber.com/oauth/v2/token';
// In-memory cache keyed by client_id — supports multiple Uber accounts.
let _tokens = {};

async function loadTokensFromDB() {
  try {
    const rows = await global.UberModels.UberAccount.findAll();
    _tokens = {};
    for (const row of rows) {
      _tokens[row.client_id] = {
        id: row.id,
        accessToken: row.access_token,
        refreshToken: row.refresh_token,
        expiresAt: Number(row.expires_at)
      };
    }
  } catch (err) {
    logger.warn('Could not load tokens from DB', { error: err.message });
  }
}

// Upserts by client_id (unique) and returns the auto-increment id.
async function saveToDB(clientId, accessToken, refreshToken, expiresAt, scope, linkedAt) {
  try {
    await global.UberModels.UberAccount.upsert({
      client_id: clientId,
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: 'Bearer',
      scope: scope || '',
      expires_at: expiresAt,
      expires_date: new Date(expiresAt),
      lastSync: linkedAt || new Date()
    });
    const row = await global.UberModels.UberAccount.findOne({ where: { client_id: clientId } });
    return row.id;
  } catch (err) {
    logger.warn('Could not persist tokens to DB', { error: err.message });
    return null;
  }
}

// clientId is optional — omit to use the first available token (single-account setups).
async function getAccessToken(clientId) {
  const now = Date.now();
  const MARGIN = 5 * 60 * 1000;

  const key = clientId || Object.keys(_tokens)[0];
  const entry = _tokens[key];

  if (!entry) {
    throw new Error(
      'No tokens available. Client must authorize via the Uber OAuth link (/uber/uberlink).'
    );
  }

  if (entry.accessToken && now < entry.expiresAt - MARGIN) {
    return entry.accessToken;
  }


  const params = new URLSearchParams({
    client_id: process.env.UBER_CLIENT_ID,
    client_secret: process.env.UBER_CLIENT_SECRET,
    grant_type: 'refresh_token',
    refresh_token: entry.refreshToken
  });

  const { access_token, refresh_token, expires_in, scope } = await postForm(UBER_TOKEN_URL, params);
  const expiresAt = now + expires_in * 1000;

  const id = await saveToDB(key, access_token, refresh_token || entry.refreshToken, expiresAt, scope);

  _tokens[key] = { id: id || entry.id, accessToken: access_token, refreshToken: refresh_token || entry.refreshToken, expiresAt };


  return access_token;
}

// Called by /uberlink after OAuth completes. Returns the global.UberModels.UberAccount auto-increment id.
async function setTokens(clientId, accessToken, refreshToken, expiresIn, scope, linkedAt) {
  const expiresAt = Date.now() + expiresIn * 1000;
  const id = await saveToDB(clientId, accessToken, refreshToken, expiresAt, scope, linkedAt);
  _tokens[clientId] = { id, accessToken, refreshToken, expiresAt };
  return id;
}

module.exports = { loadTokensFromDB, getAccessToken, setTokens };