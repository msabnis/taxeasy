const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');

/**
 * POST /api/companies-house/prepare
 * Prepare micro-entity or small company accounts for filing
 */
router.post('/prepare', async (req, res) => {
  const { companyNumber, accountType, financialData, periodEnd } = req.body;

  // Validate account type
  const validTypes = ['micro-entity', 'small-company', 'dormant'];
  if (!validTypes.includes(accountType)) {
    return res.status(400).json({ error: `Invalid account type. Must be one of: ${validTypes.join(', ')}` });
  }

  try {
    // Micro-entity thresholds (from 6 April 2025)
    const MICRO_ENTITY_THRESHOLDS = {
      turnover: 632000,
      balanceSheet: 316000,
      employees: 10
    };

    const isMicroEligible =
      (financialData.turnover || 0) <= MICRO_ENTITY_THRESHOLDS.turnover &&
      (financialData.balanceSheet || 0) <= MICRO_ENTITY_THRESHOLDS.balanceSheet;

    const accounts = {
      companyNumber,
      accountType,
      periodEnd,
      preparedAt: new Date().toISOString(),
      isMicroEligible,
      financialSummary: {
        turnover: financialData.turnover || 0,
        grossProfit: financialData.grossProfit || 0,
        netProfit: financialData.netProfit || 0,
        totalAssets: financialData.totalAssets || 0,
        totalLiabilities: financialData.totalLiabilities || 0,
        netAssets: (financialData.totalAssets || 0) - (financialData.totalLiabilities || 0),
        balanceSheet: financialData.balanceSheet || 0
      },
      status: 'prepared',
      notes: isMicroEligible
        ? 'Eligible for micro-entity accounts (reduced disclosure requirements)'
        : 'Full small company accounts required'
    };

    logger.info(`Companies House accounts prepared for company: ${companyNumber}`);
    res.json(accounts);
  } catch (err) {
    logger.error('Companies House prepare error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/companies-house/deadlines
 * Get filing deadlines for a company
 */
router.get('/deadlines', (req, res) => {
  const { accountingReferenceDate, companyType } = req.query;

  // Private companies: 9 months after ARD
  // Public companies: 6 months after ARD
  const monthsAllowed = companyType === 'public' ? 6 : 9;
  const ard = new Date(accountingReferenceDate);
  const deadline = new Date(ard);
  deadline.setMonth(deadline.getMonth() + monthsAllowed);

  const today = new Date();
  const daysRemaining = Math.ceil((deadline - today) / (1000 * 60 * 60 * 24));

  res.json({
    accountingReferenceDate,
    filingDeadline: deadline.toISOString().split('T')[0],
    daysRemaining,
    isOverdue: daysRemaining < 0,
    isUrgent: daysRemaining >= 0 && daysRemaining <= 30
  });
});

module.exports = router;
