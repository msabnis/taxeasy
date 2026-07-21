const express = require('express');
const router = express.Router();
const bankingService = require('../services/bankingService');

// Initiate Open Banking connection via GoCardless
router.post('/connect', async (req, res) => {
  try {
    const { merchantId, institutionId } = req.body;
    const requisition = await bankingService.createRequisition(merchantId, institutionId);
    res.json({ link: requisition.link, requisitionId: requisition.id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get list of available banks
router.get('/institutions', async (req, res) => {
  try {
    const institutions = await bankingService.getInstitutions('GB');
    res.json(institutions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get account balances
router.get('/accounts/:merchantId', async (req, res) => {
  try {
    const accounts = await bankingService.getAccounts(req.params.merchantId);
    res.json(accounts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get transactions for reconciliation
router.get('/transactions/:accountId', async (req, res) => {
  try {
    const { dateFrom, dateTo } = req.query;
    const transactions = await bankingService.getTransactions(
      req.params.accountId, dateFrom, dateTo
    );
    res.json(transactions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Reconcile transactions with Shopify orders
router.post('/reconcile', async (req, res) => {
  try {
    const { merchantId, accountId, periodStart, periodEnd } = req.body;
    const result = await bankingService.reconcileTransactions(
      merchantId, accountId, periodStart, periodEnd
    );
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
