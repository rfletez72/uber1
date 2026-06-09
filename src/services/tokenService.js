'use strict';

const fs = require('fs');
const path = require('path');
const { postForm } = require('../utils/fetch');
const logger = require('../config/logger');

/**
 * TOKEN SERVICE
 * ─────────────────────────────────────────────────────────────────────────────
 * Loads tokens from linkuber.json (written by the /uberlink OAuth callback).
 * Auto-refreshes before expiry and persists refreshed tokens back to the file
 * so they survive restarts.
 *
 * Required .env vars:
 *   UBER_CLIENT_ID
 *   UBER_CLIENT_SECRET
 */

const UBER_TOKEN_URL = 'https://sandbox-login.uber.com/oauth/v2/token';
const LINK_FILE = path.join(__dirname, '../../linkuber.json');

function loadFromFile() {
  try {
    const data = JSON.parse(fs.readFileSync(LINK_FILE, 'utf8'));
    logger.info('Tokens loaded from linkuber.json', {
      expiresAt: data.expires_at_iso || new Date(data.expires_at).toISOString()
    });
    return {
      accessToken: data.access_token || null,
      refreshToken: data.refresh_token || null,
      expiresAt: data.expires_at || 0
    };
  } catch {
    logger.warn('linkuber.json not found — client must complete OAuth at /uberlink');
    return { accessToken: null, refreshToken: null, expiresAt: 0 };
  }
}

function saveToFile(accessToken, refreshToken, expiresAt) {
  try {
    const record = {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: expiresAt,
      expires_at_iso: new Date(expiresAt).toISOString(),
      linked_at: (() => {
        try { return JSON.parse(fs.readFileSync(LINK_FILE, 'utf8')).linked_at; } catch { return new Date().toISOString(); }
      })()
    };
    fs.writeFileSync(LINK_FILE, JSON.stringify(record, null, 2));
  } catch (err) {
    logger.warn('Could not persist refreshed tokens to linkuber.json', { error: err.message });
  }
}

let _cache = loadFromFile();

/**
 * Returns a valid access token, refreshing automatically if needed.
 */
async function getAccessToken() {
  const now = Date.now();
  const MARGIN = 5 * 60 * 1000; // refresh 5 minutes before expiry

  if (_cache.accessToken && now < _cache.expiresAt - MARGIN) {
    return _cache.accessToken;
  }

  if (!_cache.refreshToken) {
    throw new Error(
      'No tokens available. Client must authorize via the Uber OAuth link (/uberlink).'
    );
  }

  logger.info('Access token expiring — refreshing via refresh_token flow');

  const params = new URLSearchParams({
    client_id: process.env.UBER_CLIENT_ID,
    client_secret: process.env.UBER_CLIENT_SECRET,
    grant_type: 'refresh_token',
    refresh_token: _cache.refreshToken
  });

  const { access_token, refresh_token, expires_in } = await postForm(UBER_TOKEN_URL, params);
  const expiresAt = now + expires_in * 1000;

  _cache = {
    accessToken: access_token,
    refreshToken: refresh_token || _cache.refreshToken,
    expiresAt
  };

  saveToFile(_cache.accessToken, _cache.refreshToken, expiresAt);

  logger.info('Access token refreshed and saved to linkuber.json', {
    expiresAt: new Date(expiresAt).toISOString()
  });

  return _cache.accessToken;
}

/**
 * Called by /uberlink after OAuth completes — updates the live cache.
 * File is written by the route itself before calling this.
 *
 * @param {string} accessToken
 * @param {string} refreshToken
 * @param {number} expiresIn   seconds until access token expires
 */
function setTokens(accessToken, refreshToken, expiresIn) {
  _cache = {
    accessToken,
    refreshToken,
    expiresAt: Date.now() + expiresIn * 1000
  };
  logger.info('Token cache updated from OAuth callback', {
    expiresAt: new Date(_cache.expiresAt).toISOString()
  });
}

module.exports = { getAccessToken, setTokens };
