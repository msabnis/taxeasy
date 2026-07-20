const express = require('express');
const router = express.Router();
const axios = require('axios');
const { addVAT } = require('../utils/vatCalculator');
const logger = require('../utils/logger');

/**
 * GET /api/shopify/orders
 * Fetch orders from Shopify and enrich with VAT data
 */
router.get('/orders', async (req, res) => {
  const { shop, accessToken, since, limit = 50 } = req.query;
  try {
    const response = await axios.get(
      `https://${shop}/admin/api/2024-01/orders.json`,
      {
        params: { status: 'any', limit, created_at_min: since, financial_status: 'paid' },
        headers: { 'X-Shopify-Access-Token': accessToken }
      }
    );

    // Enrich orders with VAT breakdown
    const enriched = response.data.orders.map(order => {
      const netAmount = parseFloat(order.subtotal_price);
      const taxAmount = parseFloat(order.total_tax);
      const grossAmount = parseFloat(order.total_price);
      return {
        id: order.id,
        orderNumber: order.order_number,
        createdAt: order.created_at,
        customer: order.email,
        netAmount,
        vatAmount: taxAmount,
        grossAmount,
        currency: order.currency,
        financialStatus: order.financial_status,
        lineItems: order.line_items?.length || 0
      };
    });

    res.json({ orders: enriched, count: enriched.length });
  } catch (err) {
    logger.error('Shopify orders error:', err.message);
    res.status(err.response?.status || 500).json({ error: err.message });
  }
});

/**
 * GET /api/shopify/pnl
 * Calculate Profit & Loss from Shopify orders
 */
router.get('/pnl', async (req, res) => {
  const { shop, accessToken, from, to } = req.query;
  try {
    const response = await axios.get(
      `https://${shop}/admin/api/2024-01/orders.json`,
      {
        params: {
          status: 'any',
          financial_status: 'paid',
          created_at_min: from,
          created_at_max: to,
          limit: 250
        },
        headers: { 'X-Shopify-Access-Token': accessToken }
      }
    );

    const orders = response.data.orders;
    const revenue = orders.reduce((sum, o) => sum + parseFloat(o.subtotal_price), 0);
    const totalVat = orders.reduce((sum, o) => sum + parseFloat(o.total_tax), 0);
    const totalGross = orders.reduce((sum, o) => sum + parseFloat(o.total_price), 0);
    const refunds = orders.reduce((sum, o) => sum + (o.refunds?.length || 0), 0);

    res.json({
      period: { from, to },
      orderCount: orders.length,
      revenue: parseFloat(revenue.toFixed(2)),
      vatCollected: parseFloat(totalVat.toFixed(2)),
      grossRevenue: parseFloat(totalGross.toFixed(2)),
      refundCount: refunds,
      currency: 'GBP'
    });
  } catch (err) {
    logger.error('Shopify P&L error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
