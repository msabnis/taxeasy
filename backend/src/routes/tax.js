const express = require('express');
const router = express.Router();
const taxCalculator = require('../services/taxCalculator');
const vatEngine = require('../services/vatEngine');

// Calculate VAT for a period
router.post('/vat/calculate', async (req, res) => {
  try {
    const { merchantId, periodStart, periodEnd } = req.body;
    const result = await vatEngine.calculatePeriodVAT(merchantId, periodStart, periodEnd);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get VAT rate classification for a product
router.get('/vat/classify/:productType', async (req, res) => {
  try {
    const rate = vatEngine.classifyVatRate(req.params.productType);
    res.json({ productType: req.params.productType, ...rate });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Calculate Self Assessment tax
router.post('/self-assessment/calculate', async (req, res) => {
  try {
    const { income, expenses, allowances } = req.body;
    const result = taxCalculator.calculateSelfAssessment(income, expenses, allowances);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Calculate Corporation Tax
router.post('/corporation-tax/calculate', async (req, res) => {
  try {
    const { profits, accountingPeriodStart, accountingPeriodEnd } = req.body;
    const result = taxCalculator.calculateCorporationTax(profits, accountingPeriodStart, accountingPeriodEnd);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get tax summary for dashboard
router.get('/summary/:merchantId', async (req, res) => {
  try {
    const summary = await taxCalculator.getTaxSummary(req.params.merchantId);
    res.json(summary);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
