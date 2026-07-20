/**
 * TaxEase UK — HMRC MTD Service
 *
 * Orchestrates the full HMRC MTD VAT submission pipeline:
 *
 *   1. Fetch open obligations from HMRC (what periods need filing)
 *   2. For each open obligation, calculate the 9-box return from transactions
 *   3. Prepare the return (save to DB with status 'prepared')
 *   4. Submit to HMRC MTD API
 *   5. Store submission receipt and update status
 *   6. Fetch payment status and liabilities
 *   7. Track penalties for overdue returns
 *
 * This service is the bridge between the VAT engine and HMRC's API.
 */

'use strict';

const { VatReturn, Merchant, AuditLog } = require('../../models');
const { createHmrcClient }              = require('./hmrcApiClient');
const { getValidAccessToken }           = require('./hmrcTokenManager');
const { prepareVatReturn, formatForHmrc, calculateDueDate } = require('../vatEngine');
const logger                            = require('../../utils/logger');

// ── Obligation Management ─────────────────────────────────────────────────────

/**
 * Fetch and sync VAT obligations from HMRC for a merchant.
 * Creates/updates VatReturn records for each open obligation.
 *
 * @param {string} merchantId
 * @param {Object} req - Express request (for fraud headers)
 * @returns {{ obligations: Array, synced: number }}
 */
async function syncObligations(merchantId, req = null) {
  const merchant = await getMerchantWithVrn(merchantId);
  const client   = createHmrcClient(merchantId, req);

  logger.info(`HMRC MTD: syncing obligations for merchant ${merchantId}, VRN ${merchant.vatNumber}`);

  // Fetch open obligations (last 12 months)
  const obligations = await client.getOpenObligations(merchant.vatNumber);

  logger.info(`HMRC MTD: found ${obligations.length} open obligations`);

  let synced = 0;
  for (const obligation of obligations) {
    const periodKey   = obligation.periodKey;
    const periodStart = obligation.start;
    const periodEnd   = obligation.end;
    const dueDate     = obligation.due || calculateDueDate(periodEnd);

    // Create a draft VatReturn record if one doesn't exist
    const [vatReturn, created] = await VatReturn.findOrCreate({
      where:    { merchantId, periodKey },
      defaults: {
        periodStart,
        periodEnd,
        dueDate,
        status: 'draft',
        box1: 0, box2: 0, box3: 0, box4: 0, box5: 0,
        box6: 0, box7: 0, box8: 0, box9: 0,
        isPayable: true,
      },
    });

    if (created) {
      synced++;
      logger.debug(`HMRC MTD: created draft VatReturn for period ${periodKey}`);
    }
  }

  return { obligations, synced };
}

/**
 * Get all VAT obligations for a merchant (open + fulfilled).
 * @param {string} merchantId
 * @param {string} from - 'YYYY-MM-DD'
 * @param {string} to   - 'YYYY-MM-DD'
 * @param {string} status - 'O' | 'F' | null (all)
 * @param {Object} req
 * @returns {Object} HMRC obligations response
 */
async function getObligations(merchantId, from, to, status, req = null) {
  const merchant = await getMerchantWithVrn(merchantId);
  const client   = createHmrcClient(merchantId, req);
  return client.getObligations(merchant.vatNumber, from, to, status);
}

// ── VAT Return Submission Pipeline ────────────────────────────────────────────

/**
 * Full submission pipeline for a single VAT period:
 *   1. Calculate 9-box from transactions
 *   2. Prepare (save to DB)
 *   3. Submit to HMRC
 *   4. Store receipt
 *
 * @param {string} merchantId
 * @param {string} periodKey   - HMRC period key, e.g. "24AA"
 * @param {string} periodStart - 'YYYY-MM-DD'
 * @param {string} periodEnd   - 'YYYY-MM-DD'
 * @param {Object} req         - Express request
 * @returns {Object} Submission result
 */
async function calculateAndSubmit(merchantId, periodKey, periodStart, periodEnd, req = null) {
  const merchant = await getMerchantWithVrn(merchantId);

  logger.info(`HMRC MTD: calculate-and-submit for merchant ${merchantId}, period ${periodKey}`);

  // Step 1 & 2: Calculate 9-box and prepare
  const dueDate = calculateDueDate(periodEnd);
  const { vatReturn, nineBox, hmrcPayload } = await prepareVatReturn(
    merchantId, periodKey, periodStart, periodEnd, dueDate
  );

  // Step 3: Submit to HMRC
  const receipt = await submitReturn(merchantId, vatReturn.id, req);

  return {
    vatReturnId:  vatReturn.id,
    periodKey,
    status:       'submitted',
    nineBox,
    receipt,
  };
}

/**
 * Submit a prepared VatReturn to HMRC.
 * The return must already be in 'prepared' status.
 *
 * @param {string} merchantId
 * @param {string} vatReturnId - UUID of the VatReturn record
 * @param {Object} req
 * @returns {Object} HMRC receipt
 */
async function submitReturn(merchantId, vatReturnId, req = null) {
  const merchant  = await getMerchantWithVrn(merchantId);
  const vatReturn = await VatReturn.findByPk(vatReturnId);

  if (!vatReturn) throw new Error(`VatReturn ${vatReturnId} not found`);
  if (vatReturn.merchantId !== merchantId) throw new Error('VatReturn does not belong to this merchant');

  // Guard: already submitted
  if (['submitted', 'accepted'].includes(vatReturn.status)) {
    logger.warn(`HMRC MTD: VatReturn ${vatReturnId} already ${vatReturn.status}`);
    return {
      alreadySubmitted: true,
      status:           vatReturn.status,
      hmrcReceiptId:    vatReturn.hmrcReceiptId,
      submittedAt:      vatReturn.submittedAt,
    };
  }

  if (vatReturn.status !== 'prepared') {
    throw new Error(`VatReturn must be in 'prepared' status before submission (current: ${vatReturn.status})`);
  }

  // Build HMRC payload from stored 9-box values
  const hmrcPayload = vatReturn.toHmrcPayload();

  logger.info(`HMRC MTD: submitting VatReturn ${vatReturnId} for VRN ${merchant.vatNumber}`);

  const client = createHmrcClient(merchantId, req);

  try {
    const receipt = await client.submitVatReturn(merchant.vatNumber, hmrcPayload);

    // Update VatReturn with submission details
    await vatReturn.update({
      status:            'submitted',
      submittedAt:       new Date(),
      hmrcReceiptId:     receipt.formBundleNumber || receipt.receiptId,
      hmrcCorrelationId: receipt.correlationId,
      rawResponse:       receipt,
    });

    await logAudit(merchantId, 'hmrc.vat_return.submitted', 'VatReturn', vatReturnId, {
      vrn:           merchant.vatNumber,
      periodKey:     vatReturn.periodKey,
      netVatPence:   vatReturn.box5,
      isPayable:     vatReturn.isPayable,
      hmrcReceiptId: vatReturn.hmrcReceiptId,
    });

    logger.info(`HMRC MTD: submission successful — receipt ${vatReturn.hmrcReceiptId}`);

    return {
      success:          true,
      formBundleNumber: receipt.formBundleNumber,
      processingDate:   receipt.processingDate,
      paymentIndicator: receipt.paymentIndicator,
      correlationId:    receipt.correlationId,
      hmrcReceiptId:    vatReturn.hmrcReceiptId,
      submittedAt:      vatReturn.submittedAt,
    };
  } catch (err) {
    // Handle duplicate submission gracefully
    if (err.isDuplicate) {
      logger.warn(`HMRC MTD: duplicate submission for period ${vatReturn.periodKey} — marking as submitted`);
      await vatReturn.update({ status: 'submitted', submittedAt: new Date() });
      return { success: true, duplicate: true, status: 'submitted' };
    }

    // Mark as rejected for validation errors
    if (err.hmrcStatus === 422 || err.hmrcStatus === 400) {
      await vatReturn.update({
        status:       'rejected',
        errorMessage: JSON.stringify(err.hmrcBody),
      });
      await logAudit(merchantId, 'hmrc.vat_return.rejected', 'VatReturn', vatReturnId, {
        error: err.hmrcBody,
      });
    }

    throw err;
  }
}

// ── Payment Status & Liabilities ──────────────────────────────────────────────

/**
 * Get VAT liabilities (amounts owed to HMRC) for a date range.
 * @param {string} merchantId
 * @param {string} from - 'YYYY-MM-DD'
 * @param {string} to   - 'YYYY-MM-DD'
 * @param {Object} req
 * @returns {Object} Liabilities with formatted amounts
 */
async function getLiabilities(merchantId, from, to, req = null) {
  const merchant = await getMerchantWithVrn(merchantId);
  const client   = createHmrcClient(merchantId, req);

  const data = await client.getLiabilities(merchant.vatNumber, from, to);

  // Enrich with payment status
  const liabilities = (data.liabilities || []).map(l => ({
    ...l,
    outstandingAmountGBP: l.outstandingAmount?.toFixed(2) || '0.00',
    originalAmountGBP:    l.originalAmount?.toFixed(2)    || '0.00',
    isOverdue:            l.due ? new Date() > new Date(l.due) : false,
    daysOverdue:          l.due ? Math.max(0, Math.floor((Date.now() - new Date(l.due)) / 86400000)) : 0,
  }));

  const totalOutstanding = liabilities.reduce((s, l) => s + (l.outstandingAmount || 0), 0);

  return {
    liabilities,
    totalOutstandingGBP: totalOutstanding.toFixed(2),
    hasOutstanding:      totalOutstanding > 0,
  };
}

/**
 * Get VAT payment history for a date range.
 * @param {string} merchantId
 * @param {string} from
 * @param {string} to
 * @param {Object} req
 * @returns {Object} Payment history
 */
async function getPayments(merchantId, from, to, req = null) {
  const merchant = await getMerchantWithVrn(merchantId);
  const client   = createHmrcClient(merchantId, req);

  const data = await client.getPayments(merchant.vatNumber, from, to);

  const payments = (data.payments || []).map(p => ({
    ...p,
    amountGBP: p.amount?.toFixed(2) || '0.00',
  }));

  const totalPaid = payments.reduce((s, p) => s + (p.amount || 0), 0);

  return {
    payments,
    totalPaidGBP: totalPaid.toFixed(2),
    count:        payments.length,
  };
}

/**
 * Get financial penalties for a merchant.
 * @param {string} merchantId
 * @param {string} from
 * @param {string} to
 * @param {Object} req
 * @returns {Object} Penalties
 */
async function getPenalties(merchantId, from, to, req = null) {
  const merchant = await getMerchantWithVrn(merchantId);
  const client   = createHmrcClient(merchantId, req);

  try {
    const data = await client.getPenalties(merchant.vatNumber, from, to);
    return data;
  } catch (err) {
    // 404 means no penalties — return empty
    if (err.isNotFound) return { penalties: [], totalPenaltiesGBP: '0.00' };
    throw err;
  }
}

/**
 * Get a comprehensive VAT dashboard summary for a merchant.
 * Combines obligations, liabilities, and payment status.
 *
 * @param {string} merchantId
 * @param {Object} req
 * @returns {Object} Dashboard summary
 */
async function getVatDashboard(merchantId, req = null) {
  const merchant = await getMerchantWithVrn(merchantId);
  const client   = createHmrcClient(merchantId, req);

  const now  = new Date();
  const from = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()).toISOString().split('T')[0];
  const to   = now.toISOString().split('T')[0];

  // Fetch in parallel
  const [obligationsData, liabilitiesData, paymentsData] = await Promise.allSettled([
    client.getOpenObligations(merchant.vatNumber),
    client.getLiabilities(merchant.vatNumber, from, to),
    client.getPayments(merchant.vatNumber, from, to),
  ]);

  const openObligations = obligationsData.status === 'fulfilled' ? obligationsData.value : [];
  const liabilities     = liabilitiesData.status === 'fulfilled' ? liabilitiesData.value.liabilities || [] : [];
  const payments        = paymentsData.status    === 'fulfilled' ? paymentsData.value.payments       || [] : [];

  // Find next due date
  const nextDue = openObligations
    .map(o => ({ periodKey: o.periodKey, due: o.due, start: o.start, end: o.end }))
    .sort((a, b) => new Date(a.due) - new Date(b.due))[0] || null;

  // Total outstanding
  const totalOutstanding = liabilities.reduce((s, l) => s + (l.outstandingAmount || 0), 0);

  // Overdue obligations
  const overdueObligations = openObligations.filter(o => new Date() > new Date(o.due));

  return {
    vrn:              merchant.vatNumber,
    openObligations:  openObligations.length,
    overdueCount:     overdueObligations.length,
    nextDue,
    totalOutstandingGBP: totalOutstanding.toFixed(2),
    hasOutstanding:   totalOutstanding > 0,
    recentPayments:   payments.slice(0, 5).map(p => ({
      ...p,
      amountGBP: p.amount?.toFixed(2) || '0.00',
    })),
    liabilities: liabilities.map(l => ({
      ...l,
      outstandingAmountGBP: l.outstandingAmount?.toFixed(2) || '0.00',
      isOverdue: l.due ? new Date() > new Date(l.due) : false,
    })),
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getMerchantWithVrn(merchantId) {
  const merchant = await Merchant.findByPk(merchantId);
  if (!merchant) throw new Error(`Merchant ${merchantId} not found`);
  if (!merchant.vatNumber) {
    throw new Error('Merchant has no VAT registration number. Please add your VRN in Settings.');
  }
  return merchant;
}

async function logAudit(merchantId, action, entityType, entityId, metadata) {
  try {
    await AuditLog.create({ merchantId, action, entityType, entityId, actorType: 'system', metadata });
  } catch (err) {
    logger.warn('Audit log write failed:', err.message);
  }
}

module.exports = {
  syncObligations,
  getObligations,
  calculateAndSubmit,
  submitReturn,
  getLiabilities,
  getPayments,
  getPenalties,
  getVatDashboard,
};
