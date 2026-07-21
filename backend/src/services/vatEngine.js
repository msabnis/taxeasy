/**
 * TaxEase UK — VAT Engine Service
 *
 * Generates HMRC-compliant 9-box VAT returns from transaction records.
 * All amounts are in PENCE throughout; converted to pounds only for HMRC API.
 *
 * HMRC 9-Box Reference:
 *   Box 1 — VAT due on sales and other outputs
 *   Box 2 — VAT due on acquisitions from EC (post-Brexit: always 0)
 *   Box 3 — Total VAT due (Box 1 + Box 2)
 *   Box 4 — VAT reclaimed on purchases and other inputs
 *   Box 5 — Net VAT to pay HMRC (Box 3 − Box 4) or reclaim if negative
 *   Box 6 — Total value of sales and outputs, excluding VAT (whole pounds)
 *   Box 7 — Total value of purchases and inputs, excluding VAT (whole pounds)
 *   Box 8 — Total value of EC supplies, excluding VAT (post-Brexit: 0)
 *   Box 9 — Total value of EC acquisitions, excluding VAT (post-Brexit: 0)
 *
 * Note: Boxes 6 & 7 are submitted to HMRC as whole pounds (rounded down).
 *       Boxes 1–5 are submitted as pounds with up to 2 decimal places.
 */

'use strict';

const { Op }         = require('sequelize');
const { Transaction, VatReturn } = require('../models');
const logger         = require('../utils/logger');

// ── Constants ─────────────────────────────────────────────────────────────────

const TRANSACTION_TYPES_SALES     = ['sale'];
const TRANSACTION_TYPES_PURCHASES = ['purchase', 'fee'];
const TRANSACTION_TYPES_REFUNDS   = ['refund'];

// ── Core 9-Box Calculation ────────────────────────────────────────────────────

/**
 * Calculate the HMRC 9-box VAT return from an array of transaction records.
 *
 * @param {Array}  transactions  - Array of Transaction model instances or plain objects
 * @param {string} periodStart   - ISO date string 'YYYY-MM-DD'
 * @param {string} periodEnd     - ISO date string 'YYYY-MM-DD'
 * @returns {Object} 9-box return with pence values + metadata
 */
function calculate9BoxReturn(transactions, periodStart, periodEnd) {
  // Filter to period
  const inPeriod = transactions.filter(t => {
    const d = t.date instanceof Date ? t.date.toISOString().split('T')[0] : t.date;
    return d >= periodStart && d <= periodEnd;
  });

  // Accumulators (all in pence)
  let box1Pence = 0;  // VAT on sales
  let box4Pence = 0;  // VAT reclaimed on purchases
  let box6Pence = 0;  // Net sales value (ex-VAT)
  let box7Pence = 0;  // Net purchases value (ex-VAT)

  const breakdown = {
    sales:     { count: 0, grossPence: 0, netPence: 0, vatPence: 0 },
    purchases: { count: 0, grossPence: 0, netPence: 0, vatPence: 0 },
    refunds:   { count: 0, grossPence: 0, netPence: 0, vatPence: 0 },
    exempt:    { count: 0, grossPence: 0 },
    byRate: {
      standard: { sales: 0, purchases: 0 },
      reduced:  { sales: 0, purchases: 0 },
      zero:     { sales: 0, purchases: 0 },
    },
  };

  for (const t of inPeriod) {
    const gross = t.grossAmount || 0;
    const net   = t.netAmount   || 0;
    const vat   = t.vatAmount   || 0;
    const rate  = t.vatRate     || 'standard';
    const type  = t.type;

    if (TRANSACTION_TYPES_SALES.includes(type)) {
      box1Pence += vat;
      box6Pence += net;
      breakdown.sales.count++;
      breakdown.sales.grossPence += gross;
      breakdown.sales.netPence   += net;
      breakdown.sales.vatPence   += vat;
      if (breakdown.byRate[rate]) breakdown.byRate[rate].sales += net;

    } else if (TRANSACTION_TYPES_REFUNDS.includes(type)) {
      box1Pence -= vat;
      box6Pence -= net;
      breakdown.refunds.count++;
      breakdown.refunds.grossPence += gross;
      breakdown.refunds.netPence   += net;
      breakdown.refunds.vatPence   += vat;

    } else if (TRANSACTION_TYPES_PURCHASES.includes(type)) {
      if (rate === 'exempt') {
        breakdown.exempt.count++;
        breakdown.exempt.grossPence += gross;
      } else {
        box4Pence += vat;
        box7Pence += net;
        breakdown.purchases.count++;
        breakdown.purchases.grossPence += gross;
        breakdown.purchases.netPence   += net;
        breakdown.purchases.vatPence   += vat;
        if (breakdown.byRate[rate]) breakdown.byRate[rate].purchases += net;
      }
    }
  }

  // Ensure no negative values from refunds exceeding sales
  box1Pence = Math.max(0, box1Pence);
  box6Pence = Math.max(0, box6Pence);

  const box2Pence = 0;
  const box3Pence = box1Pence + box2Pence;
  const box5Pence = box3Pence - box4Pence;
  const box8Pence = 0;
  const box9Pence = 0;

  // isPayable: true when merchant owes HMRC (box5 >= 0)
  // When all boxes are zero (no transactions), net is 0 — not payable
  const isPayable = box5Pence > 0;

  return {
    periodStart,
    periodEnd,
    transactionCount: inPeriod.length,
    box1: box1Pence,
    box2: box2Pence,
    box3: box3Pence,
    box4: box4Pence,
    box5: Math.abs(box5Pence),
    box6: box6Pence,
    box7: box7Pence,
    box8: box8Pence,
    box9: box9Pence,
    isPayable,
    netVatPence: box5Pence,
    breakdown,
  };
}

/**
 * Format a 9-box result (pence) for HMRC MTD API submission (pounds).
 * HMRC requires:
 *   - Boxes 1–5: decimal pounds (up to 2dp), e.g. 1234.56
 *   - Boxes 6–9: whole pounds (rounded down), e.g. 12345
 *
 * @param {Object} nineBox - Result from calculate9BoxReturn
 * @param {string} periodKey - HMRC period key, e.g. "24AA"
 * @returns {Object} HMRC API payload
 */
function formatForHmrc(nineBox, periodKey) {
  return {
    periodKey,
    vatDueSales:                  parseFloat((nineBox.box1 / 100).toFixed(2)),
    vatDueAcquisitions:           parseFloat((nineBox.box2 / 100).toFixed(2)),
    totalVatDue:                  parseFloat((nineBox.box3 / 100).toFixed(2)),
    vatReclaimedCurrPeriod:       parseFloat((nineBox.box4 / 100).toFixed(2)),
    netVatDue:                    parseFloat((nineBox.box5 / 100).toFixed(2)),
    totalValueSalesExVAT:         Math.floor(nineBox.box6 / 100),
    totalValuePurchasesExVAT:     Math.floor(nineBox.box7 / 100),
    totalValueGoodsSuppliedExVAT: Math.floor(nineBox.box8 / 100),
    totalAcquisitionsExVAT:       Math.floor(nineBox.box9 / 100),
    finalised: true,
  };
}

/**
 * Format a 9-box result for display in the UI (pounds with 2dp).
 * @param {Object} nineBox - Result from calculate9BoxReturn
 * @returns {Object} Display-friendly object
 */
function formatForDisplay(nineBox) {
  const p = (pence) => (pence / 100).toFixed(2);
  return {
    periodStart:      nineBox.periodStart,
    periodEnd:        nineBox.periodEnd,
    transactionCount: nineBox.transactionCount,
    isPayable:        nineBox.isPayable,
    netVat:           p(Math.abs(nineBox.netVatPence)),
    boxes: {
      box1: p(nineBox.box1),
      box2: p(nineBox.box2),
      box3: p(nineBox.box3),
      box4: p(nineBox.box4),
      box5: p(nineBox.box5),
      box6: p(nineBox.box6),
      box7: p(nineBox.box7),
      box8: p(nineBox.box8),
      box9: p(nineBox.box9),
    },
    summary: {
      totalSales:     p(nineBox.breakdown.sales.grossPence),
      totalPurchases: p(nineBox.breakdown.purchases.grossPence),
      totalRefunds:   p(nineBox.breakdown.refunds.grossPence),
      vatOnSales:     p(nineBox.breakdown.sales.vatPence),
      vatReclaimed:   p(nineBox.breakdown.purchases.vatPence),
    },
  };
}

// ── Database-Integrated Functions ─────────────────────────────────────────────

/**
 * Fetch transactions for a merchant in a date range and calculate 9-box return.
 */
async function calculateForMerchant(merchantId, periodStart, periodEnd) {
  logger.info(`VAT Engine: calculating for merchant ${merchantId}, period ${periodStart} to ${periodEnd}`);

  const transactions = await Transaction.findAll({
    where: {
      merchantId,
      date: { [Op.between]: [periodStart, periodEnd] },
      type: { [Op.in]: [...TRANSACTION_TYPES_SALES, ...TRANSACTION_TYPES_PURCHASES, ...TRANSACTION_TYPES_REFUNDS] },
    },
    order: [['date', 'ASC']],
  });

  logger.info(`VAT Engine: found ${transactions.length} transactions`);
  const result = calculate9BoxReturn(transactions, periodStart, periodEnd);
  logger.info(`VAT Engine: box1=${result.box1}p, box4=${result.box4}p, box5=${result.box5}p, isPayable=${result.isPayable}`);
  return result;
}

/**
 * Prepare a VAT return record in the database (status: 'prepared').
 */
async function prepareVatReturn(merchantId, periodKey, periodStart, periodEnd, dueDate) {
  const nineBox = await calculateForMerchant(merchantId, periodStart, periodEnd);

  const [vatReturn, created] = await VatReturn.findOrCreate({
    where: { merchantId, periodKey },
    defaults: {
      periodStart,
      periodEnd,
      dueDate,
      status: 'prepared',
      ...pick9Box(nineBox),
      isPayable: nineBox.isPayable,
    },
  });

  if (!created) {
    await vatReturn.update({
      periodStart,
      periodEnd,
      dueDate,
      status: 'prepared',
      ...pick9Box(nineBox),
      isPayable: nineBox.isPayable,
    });
  }

  const hmrcPayload  = formatForHmrc(nineBox, periodKey);
  const displayData  = formatForDisplay(nineBox);

  logger.info(`VAT Engine: ${created ? 'created' : 'updated'} VatReturn ${vatReturn.id} for period ${periodKey}`);
  return { vatReturn, nineBox, hmrcPayload, displayData };
}

/**
 * Calculate the HMRC filing deadline for a VAT period.
 * Rule: 1 calendar month + 7 days after period end.
 *
 * Uses UTC date arithmetic to avoid month-overflow and DST issues.
 * Example: 2026-03-31 + 1 month = 2026-04-30 (not May 1) + 7 days = 2026-05-07
 *
 * @param {string} periodEnd - 'YYYY-MM-DD'
 * @returns {string} dueDate 'YYYY-MM-DD'
 */
function calculateDueDate(periodEnd) {
  const [year, month, day] = periodEnd.split('-').map(Number);

  // Add 1 calendar month using UTC to avoid DST shifts
  // Use day=0 of the month after next to get last day of target month,
  // then cap to avoid overflow (e.g. Jan 31 + 1 month = Feb 28, not Mar 3)
  const targetMonth = month; // month is 1-based; adding 1 month means month index stays same in 0-based
  const targetYear  = month === 12 ? year + 1 : year;
  const targetMonthIndex = month === 12 ? 0 : month; // 0-based month for Date

  // Get last day of target month to cap overflow
  const lastDayOfTargetMonth = new Date(Date.UTC(targetYear, targetMonthIndex + 1, 0)).getUTCDate();
  const cappedDay = Math.min(day, lastDayOfTargetMonth);

  // Build the date 1 month after period end (capped)
  const afterOneMonth = new Date(Date.UTC(targetYear, targetMonthIndex, cappedDay));

  // Add 7 days
  afterOneMonth.setUTCDate(afterOneMonth.getUTCDate() + 7);

  const y = afterOneMonth.getUTCFullYear();
  const m = String(afterOneMonth.getUTCMonth() + 1).padStart(2, '0');
  const d2 = String(afterOneMonth.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d2}`;
}

/**
 * Get a summary of all VAT returns for a merchant.
 */
async function getVatReturnHistory(merchantId) {
  return VatReturn.findAll({
    where: { merchantId },
    order: [['periodEnd', 'DESC']],
    attributes: [
      'id', 'periodKey', 'periodStart', 'periodEnd', 'dueDate',
      'status', 'box1', 'box3', 'box4', 'box5', 'isPayable',
      'submittedAt', 'hmrcReceiptId', 'createdAt',
    ],
  });
}

/**
 * Check if a VAT return is overdue.
 */
function isOverdue(dueDate) {
  return new Date() > new Date(dueDate);
}

function parsePeriodFromObligation(obligation) {
  return {
    periodStart: obligation.start,
    periodEnd:   obligation.end,
    periodKey:   obligation.periodKey,
    dueDate:     obligation.due || calculateDueDate(obligation.end),
  };
}

function pick9Box(nineBox) {
  return {
    box1: nineBox.box1, box2: nineBox.box2, box3: nineBox.box3,
    box4: nineBox.box4, box5: nineBox.box5, box6: nineBox.box6,
    box7: nineBox.box7, box8: nineBox.box8, box9: nineBox.box9,
  };
}

module.exports = {
  calculate9BoxReturn,
  formatForHmrc,
  formatForDisplay,
  calculateDueDate,
  parsePeriodFromObligation,
  isOverdue,
  calculateForMerchant,
  prepareVatReturn,
  getVatReturnHistory,
};
