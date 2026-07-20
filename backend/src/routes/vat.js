const express = require('express');
const router = express.Router();
const axios = require('axios');
const { generate9BoxReturn } = require('../utils/vatCalculator');
const logger = require('../utils/logger');

/**
 * GET /api/vat/obligations
 * Fetch VAT return obligations from HMRC MTD API
 */
router.get('/obligations', async (req, res) => {
  const { vrn, from, to } = req.query;
  // TODO: Get HMRC access token from DB for this merchant
  const hmrcToken = req.headers['x-hmrc-token'];
  try {
    const response = await axios.get(
      `${process.env.HMRC_BASE_URL}/organisations/vat/${vrn}/obligations`,
      {
        params: { from, to, status: 'O' },
        headers: {
          Authorization: `Bearer ${hmrcToken}`,
          Accept: 'application/vnd.hmrc.1.0+json',
          'Gov-Client-Connection-Method': 'WEB_APP_VIA_SERVER',
          'Gov-Client-Public-IP': req.ip,
          'Gov-Vendor-Version': 'taxease-uk=1.0.0'
        }
      }
    );
    res.json(response.data);
  } catch (err) {
    logger.error('HMRC obligations error:', err.message);
    res.status(err.response?.status || 500).json({ error: err.message });
  }
});

/**
 * POST /api/vat/calculate
 * Calculate 9-box VAT return from transactions
 */
router.post('/calculate', async (req, res) => {
  const { transactions, periodStart, periodEnd } = req.body;
  try {
    const vatReturn = generate9BoxReturn(
      transactions,
      new Date(periodStart),
      new Date(periodEnd)
    );
    res.json(vatReturn);
  } catch (err) {
    logger.error('VAT calculation error:', err.message);
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/vat/submit
 * Submit VAT return to HMRC MTD API
 */
router.post('/submit', async (req, res) => {
  const { vrn, periodKey, vatReturn } = req.body;
  const hmrcToken = req.headers['x-hmrc-token'];
  try {
    const response = await axios.post(
      `${process.env.HMRC_BASE_URL}/organisations/vat/${vrn}/returns`,
      {
        periodKey,
        vatDueSales: vatReturn.box1,
        vatDueAcquisitions: vatReturn.box2,
        totalVatDue: vatReturn.box3,
        vatReclaimedCurrPeriod: vatReturn.box4,
        netVatDue: vatReturn.box5,
        totalValueSalesExVAT: vatReturn.box6,
        totalValuePurchasesExVAT: vatReturn.box7,
        totalValueGoodsSuppliedExVAT: vatReturn.box8,
        totalAcquisitionsExVAT: vatReturn.box9,
        finalised: true
      },
      {
        headers: {
          Authorization: `Bearer ${hmrcToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/vnd.hmrc.1.0+json',
          'Gov-Client-Connection-Method': 'WEB_APP_VIA_SERVER',
          'Gov-Client-Public-IP': req.ip,
          'Gov-Vendor-Version': 'taxease-uk=1.0.0'
        }
      }
    );
    logger.info(`VAT return submitted for VRN: ${vrn}, period: ${periodKey}`);
    res.json({ success: true, receipt: response.data });
  } catch (err) {
    logger.error('VAT submission error:', err.message);
    res.status(err.response?.status || 500).json({ error: err.message });
  }
});

module.exports = router;
