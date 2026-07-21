const express = require('express');
const router = express.Router();
const companiesHouseService = require('../services/companiesHouseService');

// Search for a company
router.get('/search', async (req, res) => {
  try {
    const results = await companiesHouseService.searchCompany(req.query.q);
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get company profile
router.get('/company/:companyNumber', async (req, res) => {
  try {
    const profile = await companiesHouseService.getCompanyProfile(req.params.companyNumber);
    res.json(profile);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// File confirmation statement
router.post('/confirmation-statement', async (req, res) => {
  try {
    const { companyNumber, merchantId } = req.body;
    const result = await companiesHouseService.fileConfirmationStatement(companyNumber, merchantId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// File annual accounts
router.post('/annual-accounts', async (req, res) => {
  try {
    const { companyNumber, merchantId, accountsData } = req.body;
    const result = await companiesHouseService.fileAnnualAccounts(
      companyNumber, merchantId, accountsData
    );
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get filing history
router.get('/filing-history/:companyNumber', async (req, res) => {
  try {
    const history = await companiesHouseService.getFilingHistory(req.params.companyNumber);
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
