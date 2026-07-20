/**
 * TaxEase UK — Auth Routes
 *
 * Handles OAuth2 flows for Shopify and HMRC MTD.
 */

'use strict';

const express = require('express');
const router  = express.Router();
const logger  = require('../utils/logger');
const {
  buildAuthorizationUrl,
  exchangeCodeForTokens,
  getConnectionStatus,
  revokeTokens,
} = require('../services/hmrc/hmrcTokenManager');

// ── Shopify OAuth ─────────────────────────────────────────────────────────────

router.get('/shopify', (req, res) => {
  const { shop } = req.query;
  if (!shop) return res.status(400).json({ error: 'Missing shop parameter' });

  const scopes     = process.env.SHOPIFY_SCOPES;
  const redirectUri = `${process.env.SHOPIFY_APP_URL}/auth/shopify/callback`;
  const nonce      = require('crypto').randomBytes(16).toString('hex');

  const authUrl = `https://${shop}/admin/oauth/authorize?` +
    `client_id=${process.env.SHOPIFY_API_KEY}&` +
    `scope=${scopes}&redirect_uri=${redirectUri}&state=${nonce}`;

  res.redirect(authUrl);
});

router.get('/shopify/callback', async (req, res) => {
  const { shop, code } = req.query;
  try {
    const axios = require('axios');
    const tokenRes = await axios.post(`https://${shop}/admin/oauth/access_token`, {
      client_id:     process.env.SHOPIFY_API_KEY,
      client_secret: process.env.SHOPIFY_API_SECRET,
      code,
    });
    const accessToken = tokenRes.data.access_token;
    logger.info(`Shopify OAuth complete for shop: ${shop}`);
    // TODO: Store accessToken in DB, create/update merchant record
    res.redirect(`${process.env.FRONTEND_URL}/dashboard?shop=${shop}`);
  } catch (err) {
    logger.error('Shopify OAuth error:', err.message);
    res.status(500).json({ error: 'OAuth failed' });
  }
});

// ── HMRC MTD OAuth ────────────────────────────────────────────────────────────

/**
 * GET /auth/hmrc?merchantId=xxx
 * Redirect merchant to HMRC authorization page.
 */
router.get('/hmrc', (req, res) => {
  const { merchantId } = req.query;
  if (!merchantId) return res.status(400).json({ error: 'merchantId is required' });

  const authUrl = buildAuthorizationUrl(merchantId);
  logger.info(`HMRC OAuth: redirecting merchant ${merchantId} to HMRC`);
  res.redirect(authUrl);
});

/**
 * GET /auth/hmrc/callback?code=xxx&state=merchantId
 * HMRC redirects here after merchant grants consent.
 * Exchanges the authorization code for access + refresh tokens.
 */
router.get('/hmrc/callback', async (req, res) => {
  const { code, state: merchantId, error, error_description } = req.query;

  // Handle user denial
  if (error) {
    logger.warn(`HMRC OAuth denied for merchant ${merchantId}: ${error}`);
    return res.redirect(
      `${process.env.FRONTEND_URL}/settings?hmrc=denied&error=${encodeURIComponent(error_description || error)}`
    );
  }

  if (!code || !merchantId) {
    return res.status(400).json({ error: 'Missing code or state parameter' });
  }

  try {
    await exchangeCodeForTokens(code, merchantId);
    logger.info(`HMRC OAuth: successfully connected merchant ${merchantId}`);
    res.redirect(`${process.env.FRONTEND_URL}/settings?hmrc=connected`);
  } catch (err) {
    logger.error(`HMRC OAuth callback error for merchant ${merchantId}:`, err.message);
    res.redirect(
      `${process.env.FRONTEND_URL}/settings?hmrc=error&message=${encodeURIComponent(err.message)}`
    );
  }
});

/**
 * GET /auth/hmrc/status?merchantId=xxx
 * Check HMRC connection status for a merchant.
 */
router.get('/hmrc/status', async (req, res) => {
  const { merchantId } = req.query;
  if (!merchantId) return res.status(400).json({ error: 'merchantId is required' });

  try {
    const status = await getConnectionStatus(merchantId);
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /auth/hmrc?merchantId=xxx
 * Disconnect HMRC — revoke tokens and remove from DB.
 */
router.delete('/hmrc', async (req, res) => {
  const { merchantId } = req.query;
  if (!merchantId) return res.status(400).json({ error: 'merchantId is required' });

  try {
    await revokeTokens(merchantId);
    res.json({ success: true, message: 'HMRC connection removed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
