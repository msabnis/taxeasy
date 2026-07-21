const express = require('express');
const router = express.Router();
const shopifyService = require('../services/shopifyService');
const crypto = require('crypto');
const config = require('../config');

// Shopify OAuth - Install endpoint
router.get('/auth', (req, res) => {
  const shop = req.query.shop;
  if (!shop) {
    return res.status(400).json({ error: 'Shop parameter is required' });
  }
  const nonce = crypto.randomBytes(16).toString('hex');
  req.session.nonce = nonce;
  req.session.shop = shop;

  const scopes = config.shopify.scopes.join(',');
  const redirectUri = `${config.shopify.appUrl}/api/shopify/auth/callback`;
  const installUrl = `https://${shop}/admin/oauth/authorize`
    + `?client_id=${config.shopify.apiKey}`
    + `&scope=${scopes}`
    + `&redirect_uri=${encodeURIComponent(redirectUri)}`
    + `&state=${nonce}`;

  res.redirect(installUrl);
});

// Shopify OAuth - Callback
router.get('/auth/callback', async (req, res) => {
  try {
    const { shop, code, state, hmac } = req.query;

    // Verify state/nonce
    if (state !== req.session.nonce) {
      return res.status(403).json({ error: 'Invalid state parameter' });
    }

    // Verify HMAC
    const isValid = shopifyService.verifyHmac(req.query, config.shopify.apiSecret);
    if (!isValid) {
      return res.status(401).json({ error: 'HMAC verification failed' });
    }

    // Exchange code for access token
    const accessToken = await shopifyService.exchangeCodeForToken(shop, code);

    // Store session
    req.session.shopify = { shop, accessToken };

    // Register webhooks
    await shopifyService.registerWebhooks(shop, accessToken);

    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/dashboard`);
  } catch (error) {
    res.status(500).json({ error: 'Shopify auth failed', details: error.message });
  }
});

// Verify shop installation
router.get('/verify', async (req, res) => {
  try {
    const shop = req.query.shop;
    const isActive = await shopifyService.verifyInstallation(shop);
    res.json({ installed: isActive, shop });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Webhook handler
router.post('/webhooks/:topic', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const topic = req.params.topic;
    const hmac = req.headers['x-shopify-hmac-sha256'];
    const isValid = shopifyService.verifyWebhookHmac(req.body, hmac, config.shopify.apiSecret);

    if (!isValid) {
      return res.status(401).json({ error: 'Invalid webhook HMAC' });
    }

    const data = JSON.parse(req.body);
    await shopifyService.handleWebhook(topic, data);
    res.status(200).json({ received: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
