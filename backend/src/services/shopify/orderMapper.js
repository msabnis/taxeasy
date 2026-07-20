/**
 * TaxEase UK — Shopify Order Mapper
 *
 * Converts Shopify order objects into TaxEase Transaction records.
 * Handles:
 *   - Standard paid orders → 'sale' transactions
 *   - Refunds → 'refund' transactions
 *   - Shopify fees (e.g. transaction fees) → 'fee' transactions
 *
 * All monetary amounts converted from Shopify's decimal strings to PENCE.
 */

'use strict';

const { classifyOrder } = require('./vatRateClassifier');
const logger            = require('../../utils/logger');

/**
 * Map a Shopify order to one or more Transaction records.
 *
 * For most orders this produces a single 'sale' transaction.
 * For orders with multiple VAT rates across line items, we produce
 * one transaction per VAT rate group (to keep the VAT engine accurate).
 *
 * @param {Object} order      - Shopify order object
 * @param {string} merchantId - TaxEase merchant UUID
 * @returns {Array<Object>} Array of transaction-ready objects
 */
function mapOrderToTransactions(order, merchantId) {
  const transactions = [];

  // Classify all line items
  const { lineItems, orderSummary } = classifyOrder(order);

  if (orderSummary.hasMultipleRates) {
    // Split into per-rate-group transactions for accurate 9-box calculation
    const groups = groupLineItemsByRate(lineItems);
    for (const [rateType, items] of Object.entries(groups)) {
      const tx = buildSaleTransaction(order, merchantId, items, rateType);
      if (tx) transactions.push(tx);
    }
  } else {
    // Single rate — one transaction for the whole order
    const rateType = orderSummary.dominantRate;
    const tx = buildSaleTransaction(order, merchantId, lineItems, rateType);
    if (tx) transactions.push(tx);
  }

  return transactions;
}

/**
 * Map a Shopify refund to a Transaction record.
 *
 * @param {Object} refund     - Shopify refund object
 * @param {Object} order      - Parent Shopify order
 * @param {string} merchantId - TaxEase merchant UUID
 * @returns {Object|null} Transaction-ready object or null if zero-value
 */
function mapRefundToTransaction(refund, order, merchantId) {
  // Sum refund line items
  const refundLines = refund.refund_line_items || [];
  if (refundLines.length === 0) return null;

  let grossPence = 0;
  let vatPence   = 0;

  for (const line of refundLines) {
    const subtotal = Math.round(parseFloat(line.subtotal || 0) * 100);
    const tax      = Math.round(parseFloat(line.total_tax || 0) * 100);
    grossPence += subtotal + tax;
    vatPence   += tax;
  }

  if (grossPence === 0) return null;

  const netPence = grossPence - vatPence;

  // Determine VAT rate from the refunded line items
  const { orderSummary } = classifyOrder(order);
  const rateType = orderSummary.dominantRate;

  return {
    merchantId,
    source:      'shopify',
    type:        'refund',
    externalId:  `refund-${refund.id}`,
    date:        (refund.created_at || order.created_at || '').split('T')[0],
    description: `Refund for Shopify Order #${order.order_number}`,
    grossAmount: grossPence,
    netAmount:   netPence,
    vatAmount:   vatPence,
    vatRate:     rateType === 'exempt' ? 'exempt' : rateType,
    currency:    order.currency || 'GBP',
    category:    'sales',
    isReconciled: false,
    rawData:     { refundId: refund.id, orderId: order.id, refundLines },
  };
}

/**
 * Map a Shopify transaction fee to a Transaction record.
 * Shopify charges a transaction fee on each order (if not using Shopify Payments).
 *
 * @param {Object} order      - Shopify order
 * @param {string} merchantId - TaxEase merchant UUID
 * @returns {Object|null}
 */
function mapTransactionFeeToTransaction(order, merchantId) {
  // total_outstanding or gateway fees — only if present
  const feeStr = order.total_outstanding || '0.00';
  const feePence = Math.round(parseFloat(feeStr) * 100);
  if (feePence === 0) return null;

  return {
    merchantId,
    source:      'shopify',
    type:        'fee',
    externalId:  `fee-${order.id}`,
    date:        (order.processed_at || order.created_at || '').split('T')[0],
    description: `Shopify transaction fee — Order #${order.order_number}`,
    grossAmount: feePence,
    netAmount:   feePence,
    vatAmount:   0,
    vatRate:     'exempt',   // Shopify fees are exempt from UK VAT
    currency:    order.currency || 'GBP',
    category:    'bank_charge',
    isReconciled: false,
    rawData:     { orderId: order.id, gateway: order.gateway },
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build a 'sale' transaction from a set of line items sharing the same VAT rate.
 */
function buildSaleTransaction(order, merchantId, lineItems, rateType) {
  // Sum amounts across line items
  let grossPence = 0;
  let vatPence   = 0;

  for (const item of lineItems) {
    const itemGross = Math.round(parseFloat(item.totalPriceGBP || 0) * 100);
    const itemVat   = calculateItemVat(itemGross, rateType);
    grossPence += itemGross;
    vatPence   += itemVat;
  }

  // If no line items contributed, use order totals (single-rate orders)
  if (grossPence === 0 && lineItems.length === 0) {
    grossPence = Math.round(parseFloat(order.total_price || 0) * 100);
    vatPence   = Math.round(parseFloat(order.total_tax   || 0) * 100);
  }

  if (grossPence === 0) return null;

  const netPence = grossPence - vatPence;

  // For single-rate orders, use the actual Shopify VAT amount (more accurate)
  const isSingleRate = lineItems.length === (order.line_items || []).length;
  const finalVatPence = isSingleRate
    ? Math.round(parseFloat(order.total_tax || 0) * 100)
    : vatPence;
  const finalNetPence = grossPence - finalVatPence;

  const suffix = lineItems.length < (order.line_items || []).length
    ? ` (${rateType} rate items)`
    : '';

  return {
    merchantId,
    source:      'shopify',
    type:        'sale',
    externalId:  lineItems.length < (order.line_items || []).length
      ? `${order.id}-${rateType}`
      : String(order.id),
    date:        (order.processed_at || order.created_at || '').split('T')[0],
    description: `Shopify Order #${order.order_number}${suffix}`,
    grossAmount: grossPence,
    netAmount:   finalNetPence,
    vatAmount:   finalVatPence,
    vatRate:     rateType === 'exempt' ? 'exempt' : rateType,
    currency:    order.currency || 'GBP',
    category:    'sales',
    isReconciled: false,
    rawData: {
      orderId:     order.id,
      orderNumber: order.order_number,
      gateway:     order.gateway,
      lineItemIds: lineItems.map(l => l.lineItemId),
    },
  };
}

function groupLineItemsByRate(lineItems) {
  const groups = {};
  for (const item of lineItems) {
    const rate = item.rateType || 'standard';
    if (!groups[rate]) groups[rate] = [];
    groups[rate].push(item);
  }
  return groups;
}

function calculateItemVat(grossPence, rateType) {
  const rates = { standard: 0.20, reduced: 0.05, zero: 0.00, exempt: 0 };
  const rate  = rates[rateType] || 0.20;
  // Extract VAT from gross: VAT = gross × rate / (1 + rate)
  return Math.round(grossPence * rate / (1 + rate));
}

module.exports = {
  mapOrderToTransactions,
  mapRefundToTransaction,
  mapTransactionFeeToTransaction,
};
