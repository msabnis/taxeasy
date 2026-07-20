const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');

/**
 * GET /api/dashboard/summary
 * Returns a summary of key financial metrics for the dashboard
 */
router.get('/summary', async (req, res) => {
  const { merchantId } = req.query;
  try {
    // TODO: Pull real data from DB for this merchant
    // Placeholder structure showing expected response shape
    res.json({
      merchantId,
      generatedAt: new Date().toISOString(),
      vat: {
        nextDeadline: null,       // Date of next VAT return deadline
        lastSubmitted: null,      // Date of last successful submission
        vatOwed: 0,               // Current VAT liability
        status: 'not_connected'   // 'connected' | 'not_connected' | 'overdue'
      },
      companiesHouse: {
        nextFilingDeadline: null,
        lastFiled: null,
        status: 'not_connected'
      },
      pnl: {
        currentMonthRevenue: 0,
        currentMonthVat: 0,
        currentMonthProfit: 0,
        ytdRevenue: 0,
        ytdProfit: 0
      },
      bank: {
        connected: false,
        lastSync: null,
        accountCount: 0
      }
    });
  } catch (err) {
    logger.error('Dashboard summary error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
