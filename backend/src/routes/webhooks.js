const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const logger = require('../utils/logger');

/**
 * Verify Shopify webhook HMAC signature
 */
function verifyShopifyWebhook(req) {
  const hmac = req.headers['x-shopify-hmac-sha256'];
  const body = JSON.stringify(req.body);
  const hash = crypto
    .createHmac('sha256', process.env.SHOPIFY_WEBHOOK_SECRET)
    .update(body, 'utf8')
    .digest('base64');
  return hmac === hash;
}

/**
 * POST /webhooks/shopify/orders/create
 * Triggered when a new order is created in Shopify
 */
router.post('/orders/create', express.json({ type: 'application/json' }), (req, res) => {
  if (!verifyShopifyWebhook(req)) {
    return res.status(401).json({ error: 'Webhook verification failed' });
  }
  const order = req.body;
  logger.info(`New Shopify order: #${order.order_number} — £${order.total_price}`);
  // TODO: Process order — update VAT records, P&L, trigger reconciliation
  res.status(200).send('OK');
});

/**
 * POST /webhooks/shopify/orders/paid
 * Triggered when an order is paid
 */
router.post('/orders/paid', express.json({ type: 'application/json' }), (req, res) => {
  if (!verifyShopifyWebhook(req)) {
    return res.status(401).json({ error: 'Webhook verification failed' });
  }
  const order = req.body;
  logger.info(`Order paid: #${order.order_number} — £${order.total_price}`);
  // TODO: Record payment, update VAT liability
  res.status(200).send('OK');
});

/**
 * POST /webhooks/shopify/refunds/create
 * Triggered when a refund is issued
 */
router.post('/refunds/create', express.json({ type: 'application/json' }), (req, res) => {
  if (!verifyShopifyWebhook(req)) {
    return res.status(401).json({ error: 'Webhook verification failed' });
  }
  const refund = req.body;
  logger.info(`Refund created for order: ${refund.order_id}`);
  // TODO: Reverse VAT entry, update P&L
  res.status(200).send('OK');
});

module.exports = router;
