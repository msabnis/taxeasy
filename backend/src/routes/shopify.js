/**
 * TaxEase UK — Shopify Routes
 *
 * Endpoints for Shopify data access and sync management.
 */

'use strict';

const express  = require('express');
const router   = express.Router();
const { Op }   = require('sequelize');
const { Transaction, Merchant } = require('../models');
const { syncMerchant }          = require('../services/shopify/shopifySyncService');
const { createShopifyClient }   = require('../services/shopify/shopifyClient');
const logger                    = require('../utils/logger');

// ── POST /api/shopify/sync ────────────────────────────────────────────────────
/**
 * Manually trigger a Shopify sync for a merchant.
 * Useful for initial setup and on-demand refresh.
 */
router.post('/sync', async (req, res) => {
  const { merchantId, fullSync, sinceDate, dryRun } = req.body;
  if (!merchantId) return res.status(400).json({ error: 'merchantId is required' });

  try {
    logger.info(`Manual sync triggered for merchant ${merchantId}`);
    const result = await syncMerchant(merchantId, { fullSync, sinceDate, dryRun });
    res.json({ success: result.errors.length === 0, ...result });
  } catch (err) {
    logger.error('Manual sync error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/shopify/orders ───────────────────────────────────────────────────
/**
 * Fetch orders from Shopify API directly (for preview/debugging).
 */
router.get('/orders', async (req, res) => {
  const { merchantId, since, limit = 50 } = req.query;
  if (!merchantId) return res.status(400).json({ error: 'merchantId is required' });

  try {
    const merchant = await Merchant.findByPk(merchantId);
    if (!merchant) return res.status(404).json({ error: 'Merchant not found' });

    const shopify = createShopifyClient(merchant.shopDomain, merchant.accessToken);
    const { orders } = await shopify.getOrdersPage({
      created_at_min: since,
      limit: Math.min(parseInt(limit), 250),
    });

    res.json({ orders, count: orders.length });
  } catch (err) {
    logger.error('Shopify orders fetch error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/shopify/transactions ─────────────────────────────────────────────
/**
 * Get ingested transactions for a merchant with filtering.
 */
router.get('/transactions', async (req, res) => {
  const { merchantId, from, to, type, vatRate, page = 1, limit = 50 } = req.query;
  if (!merchantId) return res.status(400).json({ error: 'merchantId is required' });

  const where = { merchantId, source: 'shopify' };
  if (from || to) {
    where.date = {};
    if (from) where.date[Op.gte] = from;
    if (to)   where.date[Op.lte] = to;
  }
  if (type)    where.type    = type;
  if (vatRate) where.vatRate = vatRate;

  try {
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const { count, rows } = await Transaction.findAndCountAll({
      where,
      order:  [['date', 'DESC']],
      limit:  parseInt(limit),
      offset,
      attributes: [
        'id', 'type', 'externalId', 'date', 'description',
        'grossAmount', 'netAmount', 'vatAmount', 'vatRate',
        'currency', 'category', 'isReconciled', 'createdAt',
      ],
    });

    // Convert pence to pounds for display
    const transactions = rows.map(t => ({
      ...t.toJSON(),
      grossGBP: (t.grossAmount / 100).toFixed(2),
      netGBP:   (t.netAmount   / 100).toFixed(2),
      vatGBP:   (t.vatAmount   / 100).toFixed(2),
    }));

    res.json({
      transactions,
      pagination: {
        total: count,
        page:  parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(count / parseInt(limit)),
      },
    });
  } catch (err) {
    logger.error('Transactions fetch error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/shopify/transactions/summary ─────────────────────────────────────
/**
 * Get a VAT-rate breakdown summary of transactions for a period.
 * Useful for the dashboard P&L and VAT overview cards.
 */
router.get('/transactions/summary', async (req, res) => {
  const { merchantId, from, to } = req.query;
  if (!merchantId || !from || !to) {
    return res.status(400).json({ error: 'merchantId, from, and to are required' });
  }

  try {
    const transactions = await Transaction.findAll({
      where: {
        merchantId,
        source: 'shopify',
        date:   { [Op.between]: [from, to] },
      },
      attributes: ['type', 'vatRate', 'grossAmount', 'netAmount', 'vatAmount'],
    });

    const summary = {
      period: { from, to },
      totals: { grossGBP: '0.00', netGBP: '0.00', vatGBP: '0.00' },
      byType: {},
      byVatRate: {},
      transactionCount: transactions.length,
    };

    let totalGross = 0, totalNet = 0, totalVat = 0;

    for (const t of transactions) {
      // By type
      if (!summary.byType[t.type]) {
        summary.byType[t.type] = { count: 0, grossGBP: '0.00', vatGBP: '0.00', _gross: 0, _vat: 0 };
      }
      summary.byType[t.type].count++;
      summary.byType[t.type]._gross += t.grossAmount;
      summary.byType[t.type]._vat   += t.vatAmount;

      // By VAT rate
      if (!summary.byVatRate[t.vatRate]) {
        summary.byVatRate[t.vatRate] = { count: 0, netGBP: '0.00', vatGBP: '0.00', _net: 0, _vat: 0 };
      }
      summary.byVatRate[t.vatRate].count++;
      summary.byVatRate[t.vatRate]._net += t.netAmount;
      summary.byVatRate[t.vatRate]._vat += t.vatAmount;

      // Totals (refunds reduce totals)
      const sign = t.type === 'refund' ? -1 : 1;
      totalGross += sign * t.grossAmount;
      totalNet   += sign * t.netAmount;
      totalVat   += sign * t.vatAmount;
    }

    // Format pence → pounds
    summary.totals.grossGBP = (totalGross / 100).toFixed(2);
    summary.totals.netGBP   = (totalNet   / 100).toFixed(2);
    summary.totals.vatGBP   = (totalVat   / 100).toFixed(2);

    for (const type of Object.values(summary.byType)) {
      type.grossGBP = (type._gross / 100).toFixed(2);
      type.vatGBP   = (type._vat   / 100).toFixed(2);
      delete type._gross; delete type._vat;
    }
    for (const rate of Object.values(summary.byVatRate)) {
      rate.netGBP = (rate._net / 100).toFixed(2);
      rate.vatGBP = (rate._vat / 100).toFixed(2);
      delete rate._net; delete rate._vat;
    }

    res.json(summary);
  } catch (err) {
    logger.error('Transaction summary error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/shopify/status ───────────────────────────────────────────────────
/**
 * Check Shopify connection status for a merchant.
 */
router.get('/status', async (req, res) => {
  const { merchantId } = req.query;
  if (!merchantId) return res.status(400).json({ error: 'merchantId is required' });

  try {
    const merchant = await Merchant.findByPk(merchantId);
    if (!merchant) return res.status(404).json({ error: 'Merchant not found' });

    const hasToken = !!merchant.accessToken;
    let tokenValid = false;
    let shopInfo   = null;

    if (hasToken) {
      const shopify = createShopifyClient(merchant.shopDomain, merchant.accessToken);
      tokenValid = await shopify.verifyToken();
      if (tokenValid) {
        shopInfo = await shopify.getShop();
      }
    }

    const txCount = await Transaction.count({
      where: { merchantId, source: 'shopify' },
    });

    res.json({
      connected:    hasToken && tokenValid,
      shopDomain:   merchant.shopDomain,
      tokenValid,
      shopName:     shopInfo?.name,
      currency:     shopInfo?.currency,
      timezone:     shopInfo?.iana_timezone,
      txCount,
    });
  } catch (err) {
    logger.error('Shopify status error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
