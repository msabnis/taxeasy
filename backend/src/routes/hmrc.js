const express = require('express');
const router = express.Router();
const hmrcService = require('../services/hmrcService');

// Initiate HMRC OAuth
router.get('/auth', (req, res) => {
  const authUrl = hmrcService.getAuthorizationUrl(req.session.merchantId);
  res.redirect(authUrl);
});

// HMRC OAuth callback
router.get('/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    const tokens = await hmrcService.exchangeCodeForTokens(code);
    await hmrcService.storeTokens(req.session.merchantId, tokens);
    res.redirect(`${process.env.FRONTEND_URL}/dashboard?hmrc=connected`);
  } catch (error) {
    res.status(500).json({ error: 'HMRC auth failed', details: error.message });
  }
});

// Get VAT obligations
router.get('/vat/obligations', async (req, res) => {
  try {
    const vrn = req.query.vrn;
    const obligations = await hmrcService.getVatObligations(vrn);
    res.json(obligations);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Submit VAT return
router.post('/vat/returns', async (req, res) => {
  try {
    const { vrn, returnData } = req.body;
    const result = await hmrcService.submitVatReturn(vrn, returnData);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get VAT return details
router.get('/vat/returns/:periodKey', async (req, res) => {
  try {
    const { vrn } = req.query;
    const details = await hmrcService.getVatReturnDetails(vrn, req.params.periodKey);
    res.json(details);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
