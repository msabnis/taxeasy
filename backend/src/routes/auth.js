const express = require('express');
const router = express.Router();
const axios = require('axios');
const logger = require('../utils/logger');

// ── Shopify OAuth ──────────────────────────────────────────────────────────────

// Step 1: Redirect merchant to Shopify OAuth
router.get('/shopify', (req, res) => {
  const { shop } = req.query;
  if (!shop) return res.status(400).json({ error: 'Missing shop parameter' });

  const scopes = process.env.SHOPIFY_SCOPES;
  const redirectUri = `${process.env.SHOPIFY_APP_URL}/auth/shopify/callback`;
  const nonce = require('crypto').randomBytes(16).toString('hex');

  const authUrl = `https://${shop}/admin/oauth/authorize?` +
    `client_id=${process.env.SHOPIFY_API_KEY}&` +
    `scope=${scopes}&` +
    `redirect_uri=${redirectUri}&` +
    `state=${nonce}`;

  res.redirect(authUrl);
});

// Step 2: Handle Shopify OAuth callback
router.get('/shopify/callback', async (req, res) => {
  const { shop, code, state } = req.query;
  try {
    const tokenRes = await axios.post(`https://${shop}/admin/oauth/access_token`, {
      client_id: process.env.SHOPIFY_API_KEY,
      client_secret: process.env.SHOPIFY_API_SECRET,
      code
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

// ── HMRC MTD OAuth ─────────────────────────────────────────────────────────────

// Step 1: Redirect to HMRC authorisation
router.get('/hmrc', (req, res) => {
  const { merchantId } = req.query;
  const authUrl = `${process.env.HMRC_BASE_URL}/oauth/authorize?` +
    `response_type=code&` +
    `client_id=${process.env.HMRC_CLIENT_ID}&` +
    `scope=read:vat+write:vat&` +
    `redirect_uri=${process.env.HMRC_REDIRECT_URI}&` +
    `state=${merchantId}`;
  res.redirect(authUrl);
});

// Step 2: Handle HMRC callback
router.get('/hmrc/callback', async (req, res) => {
  const { code, state: merchantId } = req.query;
  try {
    const tokenRes = await axios.post(`${process.env.HMRC_BASE_URL}/oauth/token`, {
      grant_type: 'authorization_code',
      client_id: process.env.HMRC_CLIENT_ID,
      client_secret: process.env.HMRC_CLIENT_SECRET,
      redirect_uri: process.env.HMRC_REDIRECT_URI,
      code
    });
    logger.info(`HMRC OAuth complete for merchant: ${merchantId}`);
    // TODO: Store HMRC tokens in DB
    res.redirect(`${process.env.FRONTEND_URL}/settings?hmrc=connected`);
  } catch (err) {
    logger.error('HMRC OAuth error:', err.message);
    res.status(500).json({ error: 'HMRC OAuth failed' });
  }
});

module.exports = router;
