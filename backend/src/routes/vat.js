/**
 * TaxEase UK — VAT Routes (Full MTD Integration)
 *
 * Complete VAT API: calculation, preparation, HMRC submission,
 * obligations, liabilities, payments, and dashboard.
 */

'use strict';

const express        = require('express');
const router         = express.Router();
const vatEngine      = require('../services/vatEngine');
const hmrcMtdService = require('../services/hmrc/hmrcMtdService');
const { VatReturn }  = require('../models');
const logger         = require('../utils/logger');

// ── POST /api/vat/calculate ───────────────────────────────────────────────────
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
router.post('/prepare', async (req, res) => {
  const { merchantId, periodKey, periodStart, periodEnd, dueDate } = req.body;
  if (!merchantId || !periodKey || !periodStart || !periodEnd) {
    return res.status(400).json({ error: 'merchantId, periodKey, periodStart, and periodEnd are required' });
  }
  try {
    const resolvedDueDate = dueDate || vatEngine.calculateDueDate(periodEnd);
    const result = await vatEngine.prepareVatReturn(merchantId, periodKey, periodStart, periodEnd, resolvedDueDate);
    res.json({
      success:     true,
      vatReturnId: result.vatReturn.id,
      status:      result.vatReturn.status,
      dueDate:     resolvedDueDate,
      isPayable:   result.nineBox.isPayable,
      netVat:      (Math.abs(result.nineBox.netVatPence) / 100).toFixed(2),
      hmrcPayload: result.hmrcPayload,
      display:     result.displayData,
    });
  } catch (err) {
    logger.error('VAT prepare error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/vat/submit ──────────────────────────────────────────────────────
/**
 * Submit a prepared VAT return to HMRC MTD API.
 */
router.post('/submit', async (req, res) => {
  const { merchantId, vatReturnId } = req.body;
  if (!merchantId || !vatReturnId) {
    return res.status(400).json({ error: 'merchantId and vatReturnId are required' });
  }
  try {
    const receipt = await hmrcMtdService.submitReturn(merchantId, vatReturnId, req);
    res.json({ success: true, ...receipt });
  } catch (err) {
    logger.error('VAT submit error:', err.message);
    const status = err.hmrcStatus || 500;
    res.status(status).json({
      error:    err.message,
      hmrcCode: err.hmrcCode,
      details:  err.hmrcBody,
    });
  }
});

// ── POST /api/vat/calculate-and-submit ───────────────────────────────────────
/**
 * Full pipeline: calculate 9-box → prepare → submit to HMRC in one call.
 */
router.post('/calculate-and-submit', async (req, res) => {
  const { merchantId, periodKey, periodStart, periodEnd } = req.body;
  if (!merchantId || !periodKey || !periodStart || !periodEnd) {
    return res.status(400).json({ error: 'merchantId, periodKey, periodStart, and periodEnd are required' });
  }
  try {
    const result = await hmrcMtdService.calculateAndSubmit(merchantId, periodKey, periodStart, periodEnd, req);
    res.json({ success: true, ...result });
  } catch (err) {
    logger.error('VAT calculate-and-submit error:', err.message);
    res.status(err.hmrcStatus || 500).json({ error: err.message, hmrcCode: err.hmrcCode });
  }
});

// ── GET /api/vat/obligations ──────────────────────────────────────────────────
/**
 * Fetch VAT obligations from HMRC and sync to DB.
 */
router.get('/obligations', async (req, res) => {
  const { merchantId, from, to, status } = req.query;
  if (!merchantId) return res.status(400).json({ error: 'merchantId is required' });
  try {
    if (from && to) {
      // Direct HMRC fetch
      const data = await hmrcMtdService.getObligations(merchantId, from, to, status, req);
      res.json(data);
    } else {
      // Sync open obligations and return
      const result = await hmrcMtdService.syncObligations(merchantId, req);
      res.json(result);
    }
  } catch (err) {
    logger.error('VAT obligations error:', err.message);
    res.status(err.hmrcStatus || 500).json({ error: err.message });
  }
});

// ── GET /api/vat/liabilities ──────────────────────────────────────────────────
router.get('/liabilities', async (req, res) => {
  const { merchantId, from, to } = req.query;
  if (!merchantId || !from || !to) {
    return res.status(400).json({ error: 'merchantId, from, and to are required' });
  }
  try {
    const data = await hmrcMtdService.getLiabilities(merchantId, from, to, req);
    res.json(data);
  } catch (err) {
    logger.error('VAT liabilities error:', err.message);
    res.status(err.hmrcStatus || 500).json({ error: err.message });
  }
});

// ── GET /api/vat/payments ─────────────────────────────────────────────────────
router.get('/payments', async (req, res) => {
  const { merchantId, from, to } = req.query;
  if (!merchantId || !from || !to) {
    return res.status(400).json({ error: 'merchantId, from, and to are required' });
  }
  try {
    const data = await hmrcMtdService.getPayments(merchantId, from, to, req);
    res.json(data);
  } catch (err) {
    logger.error('VAT payments error:', err.message);
    res.status(err.hmrcStatus || 500).json({ error: err.message });
  }
});

// ── GET /api/vat/penalties ────────────────────────────────────────────────────
router.get('/penalties', async (req, res) => {
  const { merchantId, from, to } = req.query;
  if (!merchantId || !from || !to) {
    return res.status(400).json({ error: 'merchantId, from, and to are required' });
  }
  try {
    const data = await hmrcMtdService.getPenalties(merchantId, from, to, req);
    res.json(data);
  } catch (err) {
    logger.error('VAT penalties error:', err.message);
    res.status(err.hmrcStatus || 500).json({ error: err.message });
  }
});

// ── GET /api/vat/dashboard ────────────────────────────────────────────────────
/**
 * Comprehensive VAT dashboard: obligations + liabilities + payments.
 */
router.get('/dashboard', async (req, res) => {
  const { merchantId } = req.query;
  if (!merchantId) return res.status(400).json({ error: 'merchantId is required' });
  try {
    const data = await hmrcMtdService.getVatDashboard(merchantId, req);
    res.json(data);
  } catch (err) {
    logger.error('VAT dashboard error:', err.message);
    res.status(err.hmrcStatus || 500).json({ error: err.message });
  }
});

// ── GET /api/vat/returns ──────────────────────────────────────────────────────
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
router.get('/returns/:id', async (req, res) => {
  try {
    const vatReturn = await VatReturn.findByPk(req.params.id);
    if (!vatReturn) return res.status(404).json({ error: 'VAT return not found' });
    const nineBox = {
      box1: vatReturn.box1, box2: vatReturn.box2, box3: vatReturn.box3,
      box4: vatReturn.box4, box5: vatReturn.box5, box6: vatReturn.box6,
      box7: vatReturn.box7, box8: vatReturn.box8, box9: vatReturn.box9,
      isPayable: vatReturn.isPayable,
      netVatPence: vatReturn.isPayable ? vatReturn.box5 : -vatReturn.box5,
      periodStart: vatReturn.periodStart, periodEnd: vatReturn.periodEnd,
      transactionCount: 0, breakdown: {},
    };
    res.json({
      ...vatReturn.toJSON(),
      display:     vatEngine.formatForDisplay(nineBox),
      hmrcPayload: vatEngine.formatForHmrc(nineBox, vatReturn.periodKey),
      isOverdue:   vatReturn.dueDate ? vatEngine.isOverdue(vatReturn.dueDate) : false,
    });
  } catch (err) {
    logger.error('VAT return get error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/vat/due-date ─────────────────────────────────────────────────────
router.get('/due-date', (req, res) => {
  const { periodEnd } = req.query;
  if (!periodEnd) return res.status(400).json({ error: 'periodEnd is required' });
  const dueDate = vatEngine.calculateDueDate(periodEnd);
  res.json({ periodEnd, dueDate, isOverdue: vatEngine.isOverdue(dueDate) });
});

module.exports = router;
