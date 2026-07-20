const express = require('express');
const router = express.Router();
const axios = require('axios');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const logger = require('../utils/logger');

const upload = multer({ dest: 'tmp/uploads/' });
const GOCARDLESS_BASE = process.env.GOCARDLESS_BASE_URL;

/**
 * GET /api/bank/institutions
 * List available UK banks via GoCardless Open Banking
 */
router.get('/institutions', async (req, res) => {
  try {
    // Get GoCardless access token
    const tokenRes = await axios.post(`${GOCARDLESS_BASE}/token/new/`, {
      secret_id: process.env.GOCARDLESS_SECRET_ID,
      secret_key: process.env.GOCARDLESS_SECRET_KEY
    });
    const token = tokenRes.data.access;

    const response = await axios.get(`${GOCARDLESS_BASE}/institutions/?country=GB`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    res.json(response.data);
  } catch (err) {
    logger.error('GoCardless institutions error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/bank/connect
 * Initiate Open Banking connection for a merchant
 */
router.post('/connect', async (req, res) => {
  const { institutionId, merchantId } = req.body;
  try {
    const tokenRes = await axios.post(`${GOCARDLESS_BASE}/token/new/`, {
      secret_id: process.env.GOCARDLESS_SECRET_ID,
      secret_key: process.env.GOCARDLESS_SECRET_KEY
    });
    const token = tokenRes.data.access;

    // Create end-user agreement (90 days as per PSD2)
    const agreementRes = await axios.post(`${GOCARDLESS_BASE}/agreements/enduser/`, {
      institution_id: institutionId,
      max_historical_days: 90,
      access_valid_for_days: 90,
      access_scope: ['balances', 'details', 'transactions']
    }, { headers: { Authorization: `Bearer ${token}` } });

    // Build requisition (link for merchant to authorise)
    const reqRes = await axios.post(`${GOCARDLESS_BASE}/requisitions/`, {
      redirect: `${process.env.SHOPIFY_APP_URL}/api/bank/callback?merchantId=${merchantId}`,
      institution_id: institutionId,
      agreement: agreementRes.data.id,
      reference: `taxease-${merchantId}`
    }, { headers: { Authorization: `Bearer ${token}` } });

    res.json({ link: reqRes.data.link, requisitionId: reqRes.data.id });
  } catch (err) {
    logger.error('GoCardless connect error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/bank/transactions
 * Fetch transactions for a connected bank account
 */
router.get('/transactions', async (req, res) => {
  const { accountId, dateFrom, dateTo } = req.query;
  try {
    const tokenRes = await axios.post(`${GOCARDLESS_BASE}/token/new/`, {
      secret_id: process.env.GOCARDLESS_SECRET_ID,
      secret_key: process.env.GOCARDLESS_SECRET_KEY
    });
    const token = tokenRes.data.access;

    const response = await axios.get(
      `${GOCARDLESS_BASE}/accounts/${accountId}/transactions/`,
      {
        params: { date_from: dateFrom, date_to: dateTo },
        headers: { Authorization: `Bearer ${token}` }
      }
    );
    res.json(response.data);
  } catch (err) {
    logger.error('GoCardless transactions error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/bank/upload
 * Upload CSV bank statement for parsing
 */
router.post('/upload', upload.single('statement'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const transactions = [];
  fs.createReadStream(req.file.path)
    .pipe(csv())
    .on('data', (row) => {
      transactions.push({
        date: row.Date || row.date || row.DATE,
        description: row.Description || row.description || row.DESCRIPTION,
        amount: parseFloat(row.Amount || row.amount || row.AMOUNT || 0),
        type: parseFloat(row.Amount || 0) > 0 ? 'credit' : 'debit'
      });
    })
    .on('end', () => {
      fs.unlinkSync(req.file.path); // Clean up temp file
      logger.info(`Parsed ${transactions.length} transactions from CSV upload`);
      res.json({ transactions, count: transactions.length });
    })
    .on('error', (err) => {
      res.status(500).json({ error: 'Failed to parse CSV: ' + err.message });
    });
});

module.exports = router;
