'use strict';

const crypto = require('crypto');
const logger = require('../utils/logger');

/**
 * WEBHOOK SIGNATURE MIDDLEWARE
 * ─────────────────────────────────────────────────────────────────────────────
 * Verifies the X-Postmates-Signature header that Uber Eats attaches to every
 * webhook delivery.  Requests with invalid signatures are rejected with 401.
 *
 * IMPORTANT: Express must be configured with express.raw() for the /webhooks
 * route so that req.body is a raw Buffer — HMAC must be computed over the
 * original bytes, not a re-serialised JSON string.
 */
function verifyUberSignature(req, res, next) {
  const secret = process.env.UBER_WEBHOOK_SECRET;

  // Skip verification in development if no secret is configured
  if (!secret) {
    if (process.env.NODE_ENV !== 'production') {
      logger.warn('UBER_WEBHOOK_SECRET not set — skipping signature check (dev mode)');
      req.body = JSON.parse(req.body || '{}');
      return next();
    }
    logger.error('UBER_WEBHOOK_SECRET is required in production');
    return res.status(500).json({ error: true, code: 500, message: 'Server misconfiguration.', data: null });
  }

  const signature = req.headers['x-postmates-signature'];
  if (!signature) {
    logger.warn('Webhook received without signature header');
    return res.status(401).json({ error: true, code: 401, message: 'Missing signature.', data: null });
  }

  const hmac = crypto
    .createHmac('sha256', secret)
    .update(req.body)
    .digest('hex');

  const trusted = Buffer.from(hmac);
  const received = Buffer.from(signature);

  if (trusted.length !== received.length || !crypto.timingSafeEqual(trusted, received)) {
    logger.warn('Webhook signature mismatch', { received: signature });
    return res.status(401).json({ error: true, code: 401, message: 'Invalid signature.', data: null });
  }

  // Parse body now that signature is verified
  req.body = JSON.parse(req.body.toString());
  next();
}

module.exports = { verifyUberSignature };
