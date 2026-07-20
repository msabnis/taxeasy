/**
 * TaxEase UK — VAT Calculator Utility
 *
 * All monetary values are in PENCE (integers) to avoid floating-point issues.
 * Divide by 100 when displaying to users.
 *
 * UK VAT Rates (2025/26):
 *   Standard  20%  — most goods & services
 *   Reduced    5%  — home energy, children's car seats, etc.
 *   Zero       0%  — food, children's clothes, books, newspapers
 *   Exempt     —   — financial services, insurance, some property
 */

'use strict';

const VAT_RATES = {
  standard: 0.20,
  reduced:  0.05,
  zero:     0.00,
  exempt:   null,   // No VAT calculation possible
};

/**
 * Add VAT to a net (ex-VAT) amount.
 * @param {number} netPence  - Net amount in pence
 * @param {string} rateType  - 'standard' | 'reduced' | 'zero' | 'exempt'
 * @returns {{ netPence, vatPence, grossPence, rate, rateType }}
 */
function addVAT(netPence, rateType = 'standard') {
  if (!Number.isInteger(netPence) || netPence < 0) {
    throw new Error(`netPence must be a non-negative integer, got: ${netPence}`);
  }
  const rate = VAT_RATES[rateType];
  if (rate === undefined) {
    throw new Error(`Unknown VAT rate type: ${rateType}. Must be standard | reduced | zero | exempt`);
  }
  if (rate === null) {
    throw new Error('Cannot calculate VAT for exempt supplies');
  }
  const vatPence   = Math.round(netPence * rate);
  const grossPence = netPence + vatPence;
  return { netPence, vatPence, grossPence, rate, rateType };
}

/**
 * Extract VAT from a gross (inc-VAT) amount.
 * @param {number} grossPence - Gross amount in pence
 * @param {string} rateType   - 'standard' | 'reduced' | 'zero' | 'exempt'
 * @returns {{ netPence, vatPence, grossPence, rate, rateType }}
 */
function removeVAT(grossPence, rateType = 'standard') {
  if (!Number.isInteger(grossPence) || grossPence < 0) {
    throw new Error(`grossPence must be a non-negative integer, got: ${grossPence}`);
  }
  const rate = VAT_RATES[rateType];
  if (rate === undefined) {
    throw new Error(`Unknown VAT rate type: ${rateType}`);
  }
  if (rate === null) {
    throw new Error('Cannot calculate VAT for exempt supplies');
  }
  const netPence = Math.round(grossPence / (1 + rate));
  const vatPence = grossPence - netPence;
  return { netPence, vatPence, grossPence, rate, rateType };
}

/**
 * Determine the VAT rate type from a Shopify tax line.
 * Shopify stores tax rates as decimals (e.g. 0.2 for 20%).
 * @param {number} shopifyTaxRate - e.g. 0.2, 0.05, 0
 * @returns {string} rateType
 */
function rateTypeFromShopify(shopifyTaxRate) {
  const rate = parseFloat(shopifyTaxRate);
  if (rate >= 0.20) return 'standard';
  if (rate >= 0.05) return 'reduced';
  return 'zero';
}

/**
 * Convert a Shopify order to a transaction-ready VAT breakdown.
 * Shopify stores amounts as decimal strings (e.g. "12.00").
 * @param {Object} shopifyOrder - Raw Shopify order object
 * @returns {{ grossPence, netPence, vatPence, rateType, externalId, date, description }}
 */
function shopifyOrderToVat(shopifyOrder) {
  const grossPence = Math.round(parseFloat(shopifyOrder.total_price || 0) * 100);
  const vatPence   = Math.round(parseFloat(shopifyOrder.total_tax   || 0) * 100);
  const netPence   = grossPence - vatPence;

  // Determine dominant VAT rate from tax lines
  let rateType = 'zero';
  if (shopifyOrder.tax_lines && shopifyOrder.tax_lines.length > 0) {
    const maxRate = Math.max(...shopifyOrder.tax_lines.map(t => parseFloat(t.rate || 0)));
    rateType = rateTypeFromShopify(maxRate);
  } else if (vatPence > 0) {
    rateType = 'standard';
  }

  return {
    grossPence,
    netPence,
    vatPence,
    rateType,
    externalId:  String(shopifyOrder.id),
    date:        (shopifyOrder.created_at || '').split('T')[0],
    description: `Shopify Order #${shopifyOrder.order_number}`,
  };
}

module.exports = { VAT_RATES, addVAT, removeVAT, rateTypeFromShopify, shopifyOrderToVat };
