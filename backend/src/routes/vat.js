/**
 * TaxEase UK — VAT Routes
 *
 * All VAT-related API endpoints. Uses the VatEngine service for
 * 9-box calculation and the HMRC MTD service for submission.
 */

'use strict';

const express    = require('express');
const router     = express.Router();
const axios      = require('axios');
const vatEngine  = require('../services/vatEngine');
const { VatReturn } = require('../models');
const logger     = require('../utils/logger');

// ── GET /api/vat/obligations ──────────────────────────────────────────────────
/**
 * Fetch VAT return obligations from HMRC MTD API.
 * Returns open (unfiled) obligations for the merchant's VRN.
 */
router.get('/obligations', async (req, res) => {
  const { vrn, from, to } = req.query;
  if (!vrn) return res.status(400).json({ error: 'vrn is required' });

  const hmrcToken = req.headers['x-hmrc-token'];
  if (!hmrcToken) return res.status(401).json({ error: 'x-hmrc-token header required' });

  try {
    const response = await axios.get(
      `${process.env.HMRC_BASE_URL}/organisations/vat/${vrn}/obligations`,
      {
        params: { from, to, status: 'O' },
        headers: buildHmrcHeaders(hmrcToken, req),
      }
    );
    res.json(response.data);
  } catch (err) {
    logger.error('HMRC obligations error:', err.response?.data || err.message);
    res.status(err.response?.status || 500).json({
      error: err.response?.data?.message || err.message,
    });
  }
});

// ── POST /api/vat/calculate ───────────────────────────────────────────────────
/**
 * Calculate a 9-box VAT return from the merchant's transaction records.
 * Does NOT submit to HMRC — use /prepare then /submit for that.
 */
router.post('/calculate', async (req, res) => {
  const { merchantId, periodStart, periodEnd } = req.body;
  if (!merchantId || !periodStart || !periodEnd) {
    return res.status(400).json({ error: 'merchantId, periodStart, and periodEnd are required' });
  }

  try {
    const nineBox    = await vatEngine.calculateForMerchant(merchantId, periodStart, periodEnd);
    const displayData = vatEngine.formatForDisplay(nineBox);
    res.json({ success: true, ...displayData, raw: nineBox });
  } catch (err) {
    logger.error('VAT calculate error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/vat/prepare ─────────────────────────────────────────────────────
/**
 * Prepare a VAT return — calculates 9-box and saves to DB with status 'prepared'.
 * Returns the HMRC-formatted payload ready for review before submission.
 */
router.post('/prepare', async (req, res) => {
  const { merchantId, periodKey, periodStart, periodEnd, dueDate } = req.body;
  if (!merchantId || !periodKey || !periodStart || !periodEnd) {
    return res.status(400).json({
      error: 'merchantId, periodKey, periodStart, and periodEnd are required',
    });
  }

  try {
    const resolvedDueDate = dueDate || vatEngine.calculateDueDate(periodEnd);
    const result = await vatEngine.prepareVatReturn(
      merchantId, periodKey, periodStart, periodEnd, resolvedDueDate
    );

    res.json({
      success:      true,
      vatReturnId:  result.vatReturn.id,
      status:       result.vatReturn.status,
      dueDate:      resolvedDueDate,
      isPayable:    result.nineBox.isPayable,
      netVat:       (Math.abs(result.nineBox.netVatPence) / 100).toFixed(2),
      hmrcPayload:  result.hmrcPayload,
      display:      result.displayData,
    });
  } catch (err) {
    logger.error('VAT prepare error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/vat/submit ──────────────────────────────────────────────────────
/**
 * Submit a prepared VAT return to HMRC via MTD API.
 * Requires a vatReturnId (from /prepare) and a valid HMRC access token.
 */
router.post('/submit', async (req, res) => {
  const { vatReturnId, vrn } = req.body;
  if (!vatReturnId || !vrn) {
    return res.status(400).json({ error: 'vatReturnId and vrn are required' });
  }

  const hmrcToken = req.headers['x-hmrc-token'];
  if (!hmrcToken) return res.status(401).json({ error: 'x-hmrc-token header required' });

  try {
    // Load the prepared return
    const vatReturn = await VatReturn.findByPk(vatReturnId);
    if (!vatReturn) return res.status(404).json({ error: 'VAT return not found' });
    if (vatReturn.status === 'submitted' || vatReturn.status === 'accepted') {
      return res.status(409).json({ error: `VAT return already ${vatReturn.status}` });
    }
    if (vatReturn.status !== 'prepared') {
      return res.status(400).json({ error: 'VAT return must be in prepared status before submission' });
    }

    // Build HMRC payload from stored 9-box values
    const hmrcPayload = vatReturn.toHmrcPayload();

    // Submit to HMRC MTD API
    const response = await axios.post(
      `${process.env.HMRC_BASE_URL}/organisations/vat/${vrn}/returns`,
      hmrcPayload,
      { headers: buildHmrcHeaders(hmrcToken, req) }
    );

    // Update record with submission details
    await vatReturn.update({
      status:            'submitted',
      submittedAt:       new Date(),
      hmrcReceiptId:     response.data.formBundleNumber || response.data.receiptId,
      hmrcCorrelationId: response.headers['x-correlationid'],
      rawResponse:       response.data,
    });

    logger.info(`VAT return submitted: ${vatReturnId}, VRN: ${vrn}, receipt: ${vatReturn.hmrcReceiptId}`);

    res.json({
      success:      true,
      vatReturnId,
      status:       'submitted',
      submittedAt:  vatReturn.submittedAt,
      hmrcReceiptId: vatReturn.hmrcReceiptId,
      formBundleNumber: response.data.formBundleNumber,
      processingDate:   response.data.processingDate,
    });
  } catch (err) {
    logger.error('VAT submit error:', err.response?.data || err.message);

    // Mark as rejected if HMRC returned an error
    if (err.response?.status === 422 || err.response?.status === 400) {
      const vatReturn = await VatReturn.findByPk(vatReturnId).catch(() => null);
      if (vatReturn) {
        await vatReturn.update({
          status:       'rejected',
          errorMessage: JSON.stringify(err.response.data),
        });
      }
    }

    res.status(err.response?.status || 500).json({
      error:   err.response?.data?.message || err.message,
      details: err.response?.data,
    });
  }
});

// ── GET /api/vat/returns ──────────────────────────────────────────────────────
/**
 * Get all VAT returns for a merchant.
 */
router.get('/returns', async (req, res) => {
  const { merchantId } = req.query;
  if (!merchantId) return res.status(400).json({ error: 'merchantId is required' });

  try {
    const returns = await vatEngine.getVatReturnHistory(merchantId);
    const enriched = returns.map(r => ({
      ...r.toJSON(),
      isOverdue:  r.dueDate ? vatEngine.isOverdue(r.dueDate) : false,
      netVatGBP:  (r.box5 / 100).toFixed(2),
      box1GBP:    (r.box1 / 100).toFixed(2),
    }));
    res.json({ returns: enriched, count: enriched.length });
  } catch (err) {
    logger.error('VAT returns list error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/vat/returns/:id ──────────────────────────────────────────────────
/**
 * Get a single VAT return by ID.
 */
router.get('/returns/:id', async (req, res) => {
  try {
    const vatReturn = await VatReturn.findByPk(req.params.id);
    if (!vatReturn) return res.status(404).json({ error: 'VAT return not found' });

    const nineBox = {
      box1: vatReturn.box1, box2: vatReturn.box2, box3: vatReturn.box3,
      box4: vatReturn.box4, box5: vatReturn.box5, box6: vatReturn.box6,
      box7: vatReturn.box7, box8: vatReturn.box8, box9: vatReturn.box9,
      isPayable: vatReturn.isPayable, netVatPence: vatReturn.isPayable
        ? vatReturn.box5 : -vatReturn.box5,
      periodStart: vatReturn.periodStart, periodEnd: vatReturn.periodEnd,
      transactionCount: 0, breakdown: {},
    };

    res.json({
      ...vatReturn.toJSON(),
      display:      vatEngine.formatForDisplay(nineBox),
      hmrcPayload:  vatEngine.formatForHmrc(nineBox, vatReturn.periodKey),
      isOverdue:    vatReturn.dueDate ? vatEngine.isOverdue(vatReturn.dueDate) : false,
    });
  } catch (err) {
    logger.error('VAT return get error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/vat/due-date ─────────────────────────────────────────────────────
/**
 * Calculate the HMRC filing deadline for a given period end date.
 */
router.get('/due-date', (req, res) => {
  const { periodEnd } = req.query;
  if (!periodEnd) return res.status(400).json({ error: 'periodEnd is required' });
  const dueDate = vatEngine.calculateDueDate(periodEnd);
  const overdue = vatEngine.isOverdue(dueDate);
  res.json({ periodEnd, dueDate, isOverdue: overdue });
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build HMRC MTD required headers.
 * Gov-Client-* and Gov-Vendor-* headers are mandatory for fraud prevention.
 */
function buildHmrcHeaders(accessToken, req) {
  return {
    'Authorization':                `Bearer ${accessToken}`,
    'Content-Type':                 'application/json',
    'Accept':                       'application/vnd.hmrc.1.0+json',
    'Gov-Client-Connection-Method': 'WEB_APP_VIA_SERVER',
    'Gov-Client-Public-IP':         req.ip || '127.0.0.1',
    'Gov-Client-Public-Port':       String(req.socket?.remotePort || 443),
    'Gov-Client-Device-ID':         req.headers['x-device-id'] || 'taxease-uk-server',
    'Gov-Client-User-IDs':          `os=TaxEaseUK`,
    'Gov-Client-Timezone':          'UTC+00:00',
    'Gov-Client-Local-IPs':         '127.0.0.1',
    'Gov-Client-Screens':           'width=1920&height=1080&scaling-factor=1&colour-depth=24',
    'Gov-Client-Window-Size':       'width=1280&height=720',
    'Gov-Client-Browser-Plugins':   '',
    'Gov-Client-Browser-JS-User-Agent': req.headers['user-agent'] || 'TaxEaseUK/1.0',
    'Gov-Client-Browser-Do-Not-Track': '1',
    'Gov-Vendor-Version':           'taxease-uk=1.0.0',
    'Gov-Vendor-License-IDs':       '',
    'Gov-Vendor-Public-IP':         req.ip || '127.0.0.1',
    'Gov-Vendor-Forwarded':         `by=${req.ip || '127.0.0.1'}&for=${req.ip || '127.0.0.1'}`,
  };
}

module.exports = router;
