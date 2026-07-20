/**
 * TaxEase UK — VAT Rate Classifier
 *
 * Maps Shopify line items to UK VAT rate categories:
 *   standard  20%  — default for most goods & services
 *   reduced    5%  — home energy, children's car seats, etc.
 *   zero       0%  — food, children's clothes, books, newspapers
 *   exempt     —   — financial services, insurance, some property
 *
 * Classification priority (highest to lowest):
 *   1. Explicit tax rate from Shopify tax_lines (most reliable)
 *   2. Product type keyword matching
 *   3. Product tags
 *   4. Default: standard rate
 *
 * References:
 *   https://www.gov.uk/guidance/rates-of-vat-on-different-goods-and-services
 *   https://www.gov.uk/vat-rates
 */

'use strict';

// ── Rate thresholds ───────────────────────────────────────────────────────────
const RATE_THRESHOLDS = {
  STANDARD_MIN: 0.18,   // ≥18% → standard (handles minor rounding)
  REDUCED_MIN:  0.03,   // ≥3%  → reduced
  // <3% → zero
};

// ── Zero-rated product type keywords (HMRC Schedule 8) ───────────────────────
const ZERO_RATED_PRODUCT_TYPES = new Set([
  // Food & drink (most unprocessed food)
  'food', 'groceries', 'fresh food', 'frozen food', 'bread', 'cereal',
  'fruit', 'vegetables', 'meat', 'fish', 'dairy', 'eggs', 'milk',
  'tea', 'coffee', 'juice', 'water', 'soft drink', 'baby food',
  // Children's clothing & footwear (under 14 years)
  "children's clothing", "kids clothing", "children's clothes",
  "children's shoes", "kids shoes", "baby clothes", "baby clothing",
  "children's footwear",
  // Books, newspapers, magazines
  'book', 'books', 'ebook', 'e-book', 'newspaper', 'magazine',
  'journal', 'periodical', 'newsletter', 'publication',
  // Medical & pharmaceutical
  'medicine', 'medication', 'pharmaceutical', 'prescription',
  'medical device', 'hearing aid', 'wheelchair',
  // Seeds & plants for food production
  'seeds', 'plants', 'seedlings',
  // Animal feed
  'animal feed', 'pet food', 'livestock feed',
]);

// ── Reduced-rated product type keywords (HMRC Schedule 7A) ───────────────────
const REDUCED_RATED_PRODUCT_TYPES = new Set([
  // Domestic fuel & power
  'fuel', 'energy', 'electricity', 'gas', 'heating oil', 'solid fuel',
  'domestic fuel', 'home energy',
  // Children's car seats
  "children's car seat", "child car seat", "baby car seat", "booster seat",
  // Mobility aids for elderly
  'mobility aid', 'stairlift', 'grab rail', 'walk-in shower',
  // Smoking cessation products
  'nicotine patch', 'nicotine gum', 'stop smoking',
  // Contraceptive products
  'contraceptive',
  // Sanitary products (since May 2021)
  'sanitary product', 'sanitary towel', 'tampon', 'menstrual cup',
  'period product', 'feminine hygiene',
  // Insulation & energy-saving materials
  'insulation', 'solar panel', 'wind turbine', 'heat pump',
  'energy saving', 'draught stripping',
]);

// ── Exempt product type keywords ──────────────────────────────────────────────
const EXEMPT_PRODUCT_TYPES = new Set([
  // Financial services
  'insurance', 'financial service', 'banking', 'mortgage', 'loan',
  'credit', 'investment', 'pension', 'fund',
  // Education
  'education', 'tuition', 'course', 'training', 'school',
  // Health & welfare
  'healthcare', 'medical treatment', 'dental', 'optician',
  'hospital', 'care home', 'welfare',
  // Postal services
  'postage', 'postal service', 'royal mail stamp',
  // Burial & cremation
  'burial', 'cremation', 'funeral',
  // Lottery & gambling
  'lottery', 'gambling', 'betting',
  // Property (some)
  'residential property', 'land sale',
]);

// ── Zero-rated product tags ───────────────────────────────────────────────────
const ZERO_RATED_TAGS = new Set([
  'zero-vat', 'zero-rated', 'vat-zero', 'vat-free',
  'zero_vat', 'zero_rated', 'food', 'book', 'children',
  'kids-clothing', 'baby-clothing', 'medical',
]);

// ── Reduced-rated product tags ────────────────────────────────────────────────
const REDUCED_RATED_TAGS = new Set([
  'reduced-vat', 'reduced-rated', 'vat-5', 'vat5',
  'reduced_vat', 'sanitary', 'energy', 'fuel',
]);

// ── Exempt product tags ───────────────────────────────────────────────────────
const EXEMPT_TAGS = new Set([
  'exempt', 'vat-exempt', 'exempt-vat', 'no-vat',
  'insurance', 'education', 'healthcare',
]);

/**
 * Classify a single Shopify line item's VAT rate.
 *
 * @param {Object} lineItem - Shopify line item object
 * @param {Array}  orderTaxLines - Order-level tax lines (fallback)
 * @returns {{ rateType: string, rate: number, confidence: string, reason: string }}
 */
function classifyLineItem(lineItem, orderTaxLines = []) {
  // ── Priority 1: Explicit tax rate from line item tax_lines ────────────────
  if (lineItem.tax_lines && lineItem.tax_lines.length > 0) {
    const maxRate = Math.max(...lineItem.tax_lines.map(t => parseFloat(t.rate || 0)));
    const result  = rateFromDecimal(maxRate);
    return { ...result, confidence: 'high', reason: 'shopify_tax_line' };
  }

  // ── Priority 2: Line item is tax_exempt flag ──────────────────────────────
  if (lineItem.tax_exempt === true || lineItem.taxable === false) {
    return { rateType: 'zero', rate: 0, confidence: 'high', reason: 'shopify_tax_exempt_flag' };
  }

  // ── Priority 3: Product type keyword matching ─────────────────────────────
  const productType = (lineItem.product_type || lineItem.vendor || '').toLowerCase().trim();
  if (productType) {
    const typeResult = classifyByProductType(productType);
    if (typeResult) return { ...typeResult, confidence: 'medium', reason: 'product_type_keyword' };
  }

  // ── Priority 4: Product title keyword matching ────────────────────────────
  const title = (lineItem.title || lineItem.name || '').toLowerCase();
  const titleResult = classifyByTitle(title);
  if (titleResult) return { ...titleResult, confidence: 'medium', reason: 'product_title_keyword' };

  // ── Priority 5: Product tags ──────────────────────────────────────────────
  const tags = parseTags(lineItem.tags || lineItem.product_tags || '');
  if (tags.length > 0) {
    const tagResult = classifyByTags(tags);
    if (tagResult) return { ...tagResult, confidence: 'medium', reason: 'product_tag' };
  }

  // ── Priority 6: Order-level tax lines (fallback) ──────────────────────────
  if (orderTaxLines.length > 0) {
    const maxRate = Math.max(...orderTaxLines.map(t => parseFloat(t.rate || 0)));
    const result  = rateFromDecimal(maxRate);
    return { ...result, confidence: 'low', reason: 'order_tax_line_fallback' };
  }

  // ── Default: standard rate ────────────────────────────────────────────────
  return { rateType: 'standard', rate: 0.20, confidence: 'low', reason: 'default_standard' };
}

/**
 * Classify an entire Shopify order, returning per-line-item classifications
 * and an order-level summary.
 *
 * @param {Object} order - Full Shopify order object
 * @returns {{ lineItems: Array, orderSummary: Object }}
 */
function classifyOrder(order) {
  const lineItems = (order.line_items || []).map(item => {
    const classification = classifyLineItem(item, order.tax_lines || []);
    return {
      lineItemId:     item.id,
      variantId:      item.variant_id,
      productId:      item.product_id,
      title:          item.title,
      quantity:       item.quantity,
      priceGBP:       item.price,
      totalPriceGBP:  item.line_price || (parseFloat(item.price) * item.quantity).toFixed(2),
      taxable:        item.taxable,
      ...classification,
    };
  });

  // Order-level summary — dominant rate by value
  const dominantRate = getDominantRate(lineItems, order);

  return {
    lineItems,
    orderSummary: {
      orderId:       order.id,
      orderNumber:   order.order_number,
      dominantRate,
      hasMultipleRates: new Set(lineItems.map(l => l.rateType)).size > 1,
      lineItemCount: lineItems.length,
    },
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function rateFromDecimal(rate) {
  if (rate >= RATE_THRESHOLDS.STANDARD_MIN) return { rateType: 'standard', rate: 0.20 };
  if (rate >= RATE_THRESHOLDS.REDUCED_MIN)  return { rateType: 'reduced',  rate: 0.05 };
  return { rateType: 'zero', rate: 0.00 };
}

function classifyByProductType(productType) {
  for (const keyword of EXEMPT_PRODUCT_TYPES) {
    if (productType.includes(keyword)) return { rateType: 'exempt', rate: null };
  }
  for (const keyword of ZERO_RATED_PRODUCT_TYPES) {
    if (productType.includes(keyword)) return { rateType: 'zero', rate: 0.00 };
  }
  for (const keyword of REDUCED_RATED_PRODUCT_TYPES) {
    if (productType.includes(keyword)) return { rateType: 'reduced', rate: 0.05 };
  }
  return null;
}

function classifyByTitle(title) {
  // Check for strong zero-rated signals in product title
  const zeroSignals = ['children\'s', 'kids\'', 'baby ', 'book ', 'ebook', 'newspaper'];
  for (const signal of zeroSignals) {
    if (title.includes(signal)) return { rateType: 'zero', rate: 0.00 };
  }
  return null;
}

function classifyByTags(tags) {
  for (const tag of tags) {
    if (EXEMPT_TAGS.has(tag))        return { rateType: 'exempt',   rate: null };
    if (ZERO_RATED_TAGS.has(tag))    return { rateType: 'zero',     rate: 0.00 };
    if (REDUCED_RATED_TAGS.has(tag)) return { rateType: 'reduced',  rate: 0.05 };
  }
  return null;
}

function parseTags(tags) {
  if (Array.isArray(tags)) return tags.map(t => t.toLowerCase().trim());
  if (typeof tags === 'string') return tags.split(',').map(t => t.toLowerCase().trim()).filter(Boolean);
  return [];
}

function getDominantRate(lineItems, order) {
  // Use order-level tax lines if available (most accurate)
  if (order.tax_lines && order.tax_lines.length > 0) {
    const maxRate = Math.max(...order.tax_lines.map(t => parseFloat(t.rate || 0)));
    return rateFromDecimal(maxRate).rateType;
  }
  // Otherwise use the most common rate among line items
  const counts = {};
  for (const item of lineItems) {
    counts[item.rateType] = (counts[item.rateType] || 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'standard';
}

module.exports = {
  classifyLineItem,
  classifyOrder,
  rateFromDecimal,
  // Exported for testing
  ZERO_RATED_PRODUCT_TYPES,
  REDUCED_RATED_PRODUCT_TYPES,
  EXEMPT_PRODUCT_TYPES,
};
