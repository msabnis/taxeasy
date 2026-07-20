/**
 * TaxEase UK — Shopify Webhook Handler
 *
 * Processes real-time Shopify events and feeds them into the
 * transaction ingestion pipeline immediately (no waiting for cron).
 *
 * All webhooks are:
 *   1. HMAC-verified before processing
 *   2. Logged to WebhookEvents for audit and replay
 *   3. Processed asynchronously (respond 200 immediately)
 */

'use strict';

const express  = require('express');
const crypto   = require('crypto');
const router   = express.Router();
const logger   = require('../utils/logger');
const { WebhookEvent, Merchant } = require('../models');
const { processSingleOrder }     = require('../services/shopify/shopifySyncService');

// ── HMAC Verification ─────────────────────────────────────────────────────────

function verifyShopifyWebhook(rawBody, hmacHeader) {
  if (!hmacHeader || !process.env.SHOPIFY_WEBHOOK_SECRET) return false;
  const hash = crypto
    .createHmac('sha256', process.env.SHOPIFY_WEBHOOK_SECRET)
    .update(rawBody, 'utf8')
    .digest('base64');
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(hmacHeader));
}

// ── Middleware: parse raw body for HMAC verification ──────────────────────────
const rawBodyParser = express.raw({ type: 'application/json' });

// ── Helper: log webhook event ─────────────────────────────────────────────────
async function logWebhookEvent(topic, shopifyEventId, merchantId, payload, status, errorMessage) {
  try {
    await WebhookEvent.create({
      merchantId,
      topic,
      shopifyEventId,
      status,
      payload,
      errorMessage,
      processedAt: status !== 'received' ? new Date() : null,
    });
  } catch (err) {
    logger.warn('Failed to log webhook event:', err.message);
  }
}

// ── Helper: find merchant by shop domain ──────────────────────────────────────
async function findMerchantByShop(shopDomain) {
  return Merchant.findOne({ where: { shopDomain, isActive: true } });
}

// ── POST /webhooks/shopify/orders/create ──────────────────────────────────────
router.post('/orders/create', rawBodyParser, async (req, res) => {
  const hmac    = req.headers['x-shopify-hmac-sha256'];
  const topic   = req.headers['x-shopify-topic'] || 'orders/create';
  const eventId = req.headers['x-shopify-webhook-id'];
  const shop    = req.headers['x-shopify-shop-domain'];

  // Verify HMAC
  if (!verifyShopifyWebhook(req.body, hmac)) {
    logger.warn(`Webhook HMAC verification failed for ${topic} from ${shop}`);
    return res.status(401).json({ error: 'Webhook verification failed' });
  }

  // Respond immediately — Shopify requires < 5s response
  res.status(200).send('OK');

  // Process asynchronously
  setImmediate(async () => {
    let merchantId = null;
    try {
      const order    = JSON.parse(req.body.toString());
      const merchant = await findMerchantByShop(shop);

      if (!merchant) {
        logger.warn(`Webhook: no merchant found for shop ${shop}`);
        await logWebhookEvent(topic, eventId, null, order, 'skipped', 'Merchant not found');
        return;
      }

      merchantId = merchant.id;

      // Check idempotency — skip if already processed
      const existing = await WebhookEvent.findOne({ where: { shopifyEventId: eventId } });
      if (existing) {
        logger.debug(`Webhook: duplicate event ${eventId}, skipping`);
        return;
      }

      await logWebhookEvent(topic, eventId, merchantId, order, 'received', null);

      // Process the order
      const result = await processSingleOrder(order, merchantId, topic);

      logger.info(`Webhook orders/create: Order #${order.order_number} — created ${result.created} tx`);
      await WebhookEvent.update(
        { status: 'processed', processedAt: new Date() },
        { where: { shopifyEventId: eventId } }
      );
    } catch (err) {
      logger.error(`Webhook orders/create error:`, err.message);
      await logWebhookEvent(topic, eventId, merchantId, null, 'failed', err.message);
    }
  });
});

// ── POST /webhooks/shopify/orders/paid ────────────────────────────────────────
router.post('/orders/paid', rawBodyParser, async (req, res) => {
  const hmac    = req.headers['x-shopify-hmac-sha256'];
  const topic   = 'orders/paid';
  const eventId = req.headers['x-shopify-webhook-id'];
  const shop    = req.headers['x-shopify-shop-domain'];

  if (!verifyShopifyWebhook(req.body, hmac)) {
    return res.status(401).json({ error: 'Webhook verification failed' });
  }

  res.status(200).send('OK');

  setImmediate(async () => {
    let merchantId = null;
    try {
      const order    = JSON.parse(req.body.toString());
      const merchant = await findMerchantByShop(shop);
      if (!merchant) return;
      merchantId = merchant.id;

      const existing = await WebhookEvent.findOne({ where: { shopifyEventId: eventId } });
      if (existing) return;

      await logWebhookEvent(topic, eventId, merchantId, order, 'received', null);

      // orders/paid fires when payment is confirmed — upsert the transaction
      const result = await processSingleOrder(order, merchantId, topic);

      logger.info(`Webhook orders/paid: Order #${order.order_number} — ${result.created} created, ${result.updated} updated`);
      await WebhookEvent.update(
        { status: 'processed', processedAt: new Date() },
        { where: { shopifyEventId: eventId } }
      );
    } catch (err) {
      logger.error('Webhook orders/paid error:', err.message);
      await logWebhookEvent(topic, eventId, merchantId, null, 'failed', err.message);
    }
  });
});

// ── POST /webhooks/shopify/refunds/create ─────────────────────────────────────
router.post('/refunds/create', rawBodyParser, async (req, res) => {
  const hmac    = req.headers['x-shopify-hmac-sha256'];
  const topic   = 'refunds/create';
  const eventId = req.headers['x-shopify-webhook-id'];
  const shop    = req.headers['x-shopify-shop-domain'];

  if (!verifyShopifyWebhook(req.body, hmac)) {
    return res.status(401).json({ error: 'Webhook verification failed' });
  }

  res.status(200).send('OK');

  setImmediate(async () => {
    let merchantId = null;
    try {
      const refundPayload = JSON.parse(req.body.toString());
      const merchant      = await findMerchantByShop(shop);
      if (!merchant) return;
      merchantId = merchant.id;

      const existing = await WebhookEvent.findOne({ where: { shopifyEventId: eventId } });
      if (existing) return;

      await logWebhookEvent(topic, eventId, merchantId, refundPayload, 'received', null);

      // The refund payload includes the parent order
      const { mapRefundToTransaction } = require('../services/shopify/orderMapper');
      const { Transaction } = require('../models');

      const refundTx = mapRefundToTransaction(
        refundPayload,
        { id: refundPayload.order_id, order_number: refundPayload.order_id, currency: 'GBP' },
        merchantId
      );

      if (refundTx) {
        await Transaction.findOrCreate({
          where: { merchantId, externalId: refundTx.externalId, source: 'shopify' },
          defaults: refundTx,
        });
        logger.info(`Webhook refunds/create: refund ${refundPayload.id} processed`);
      }

      await WebhookEvent.update(
        { status: 'processed', processedAt: new Date() },
        { where: { shopifyEventId: eventId } }
      );
    } catch (err) {
      logger.error('Webhook refunds/create error:', err.message);
      await logWebhookEvent(topic, eventId, merchantId, null, 'failed', err.message);
    }
  });
});

// ── POST /webhooks/shopify/app/uninstalled ────────────────────────────────────
router.post('/app/uninstalled', rawBodyParser, async (req, res) => {
  const hmac  = req.headers['x-shopify-hmac-sha256'];
  const shop  = req.headers['x-shopify-shop-domain'];

  if (!verifyShopifyWebhook(req.body, hmac)) {
    return res.status(401).json({ error: 'Webhook verification failed' });
  }

  res.status(200).send('OK');

  setImmediate(async () => {
    try {
      const merchant = await findMerchantByShop(shop);
      if (!merchant) return;

      // Soft-delete: mark inactive, clear access token
      await merchant.update({ isActive: false, accessToken: null });
      logger.info(`Webhook app/uninstalled: merchant ${merchant.id} (${shop}) deactivated`);
    } catch (err) {
      logger.error('Webhook app/uninstalled error:', err.message);
    }
  });
});

module.exports = router;
