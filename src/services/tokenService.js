'use strict';

const axios = require('axios');
const logger = require('../config/logger');

/**
 * TOKEN SERVICE
 * ─────────────────────────────────────────────────────────────────────────────
 * Manages Uber Eats OAuth 2.0 tokens using the refresh_token flow.
 *
 * Flow:
 *   1. On first call, uses UBER_ACCESS_TOKEN from .env directly (30-day token
 *      you already have from the authorization_code exchange).
 *   2. When that token is about to expire, automatically exchanges
 *      UBER_REFRESH_TOKEN for a fresh access token.
 *   3. New tokens are cached in memory and the refresh token is updated
 *      in-process (persist to DB/env in production).
 *
 * Required .env vars:
 *   UBER_CLIENT_ID
 *   UBER_CLIENT_SECRET
 *   UBER_ACCESS_TOKEN      ← from your authorization_code exchange
 *   UBER_REFRESH_TOKEN     ← from your authorization_code exchange
 *   UBER_TOKEN_EXPIRES_AT  ← optional, unix ms; defaults to 30 days from now
 */

const UBER_TOKEN_URL = 'https://sandbox-login.uber.com/oauth/v2/token';

let _cache = {
  accessToken: process.env.UBER_ACCESS_TOKEN || null,
  refreshToken: process.env.UBER_REFRESH_TOKEN || null,
  // Default to 30 days from now if not set; service will refresh before expiry
  expiresAt: process.env.UBER_TOKEN_EXPIRES_AT
    ? parseInt(process.env.UBER_TOKEN_EXPIRES_AT)
    : Date.now() + 30 * 24 * 60 * 60 * 1000
};

/**
 * Returns a valid access token, refreshing automatically if needed.
 */
async function getAccessToken() {
  const now = Date.now();
  const MARGIN = 5 * 60 * 1000; // refresh 5 minutes before expiry

  // Return cached token if still valid
  if (_cache.accessToken && now < _cache.expiresAt - MARGIN) {
    return _cache.accessToken;
  }

  // Need to refresh
  if (!_cache.refreshToken) {
    throw new Error(
      'No refresh token available. Set UBER_REFRESH_TOKEN in your .env file.'
    );
  }

  logger.info('Access token expiring — refreshing via refresh_token flow');

  const params = new URLSearchParams({
    client_id: process.env.UBER_CLIENT_ID,
    client_secret: process.env.UBER_CLIENT_SECRET,
    grant_type: 'refresh_token',
    refresh_token: _cache.refreshToken
  });

  const response = await axios.post(UBER_TOKEN_URL, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });

  const { access_token, refresh_token, expires_in } = response.data;

  // Update in-memory cache
  _cache = {
    accessToken: access_token,
    // Uber may rotate the refresh token — always use the latest one
    refreshToken: refresh_token || _cache.refreshToken,
    expiresAt: now + expires_in * 1000
  };

  logger.info('Access token refreshed successfully', {
    expiresIn: expires_in,
    expiresAt: new Date(_cache.expiresAt).toISOString()
  });

  // ── Production note ────────────────────────────────────────────────────────
  // Persist the new tokens to your database or secrets manager here so they
  // survive a server restart.  Example:
  //   await db.settings.upsert({ key: 'uber_access_token', value: access_token });
  //   await db.settings.upsert({ key: 'uber_refresh_token', value: _cache.refreshToken });
  // ──────────────────────────────────────────────────────────────────────────

  return _cache.accessToken;
}

/**
 * Manually set tokens (useful when onboarding a new restaurant client
 * after they complete the OAuth authorization flow in your dashboard).
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
  logger.info('Tokens updated manually', {
    expiresAt: new Date(_cache.expiresAt).toISOString()
  });
}

module.exports = { getAccessToken, setTokens };
