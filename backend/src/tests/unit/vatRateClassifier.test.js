/**
 * TaxEase UK — VAT Rate Classifier Unit Tests
 */

'use strict';

const {
  classifyLineItem,
  classifyOrder,
  rateFromDecimal,
} = require('../../services/shopify/vatRateClassifier');

// ── rateFromDecimal ───────────────────────────────────────────────────────────
describe('rateFromDecimal', () => {
  test('0.20 → standard', () => expect(rateFromDecimal(0.20).rateType).toBe('standard'));
  test('0.19 → standard (handles rounding)', () => expect(rateFromDecimal(0.19).rateType).toBe('standard'));
  test('0.05 → reduced', () => expect(rateFromDecimal(0.05).rateType).toBe('reduced'));
  test('0.04 → reduced', () => expect(rateFromDecimal(0.04).rateType).toBe('reduced'));
  test('0.00 → zero', () => expect(rateFromDecimal(0.00).rateType).toBe('zero'));
  test('0.01 → zero', () => expect(rateFromDecimal(0.01).rateType).toBe('zero'));
});

// ── classifyLineItem ──────────────────────────────────────────────────────────
describe('classifyLineItem — Priority 1: explicit tax_lines', () => {
  test('20% tax line → standard, high confidence', () => {
    const item = { tax_lines: [{ rate: 0.2, price: '2.00' }] };
    const r = classifyLineItem(item);
    expect(r.rateType).toBe('standard');
    expect(r.confidence).toBe('high');
    expect(r.reason).toBe('shopify_tax_line');
  });

  test('5% tax line → reduced', () => {
    const item = { tax_lines: [{ rate: 0.05, price: '0.50' }] };
    expect(classifyLineItem(item).rateType).toBe('reduced');
  });

  test('0% tax line → zero', () => {
    const item = { tax_lines: [{ rate: 0, price: '0.00' }] };
    expect(classifyLineItem(item).rateType).toBe('zero');
  });

  test('multiple tax lines — uses highest rate', () => {
    const item = { tax_lines: [{ rate: 0.05 }, { rate: 0.20 }] };
    expect(classifyLineItem(item).rateType).toBe('standard');
  });
});

describe('classifyLineItem — Priority 2: tax_exempt flag', () => {
  test('taxable: false → zero, high confidence', () => {
    const item = { taxable: false, tax_lines: [] };
    const r = classifyLineItem(item);
    expect(r.rateType).toBe('zero');
    expect(r.confidence).toBe('high');
    expect(r.reason).toBe('shopify_tax_exempt_flag');
  });

  test('tax_exempt: true → zero', () => {
    const item = { tax_exempt: true, tax_lines: [] };
    expect(classifyLineItem(item).rateType).toBe('zero');
  });
});

describe('classifyLineItem — Priority 3: product type', () => {
  const makeItem = (product_type) => ({ product_type, tax_lines: [] });

  test('food → zero', () => expect(classifyLineItem(makeItem('food')).rateType).toBe('zero'));
  test('book → zero', () => expect(classifyLineItem(makeItem('book')).rateType).toBe('zero'));
  test("children's clothing → zero", () => expect(classifyLineItem(makeItem("children's clothing")).rateType).toBe('zero'));
  test('medicine → zero', () => expect(classifyLineItem(makeItem('medicine')).rateType).toBe('zero'));
  test('fuel → reduced', () => expect(classifyLineItem(makeItem('fuel')).rateType).toBe('reduced'));
  test('sanitary product → reduced', () => expect(classifyLineItem(makeItem('sanitary product')).rateType).toBe('reduced'));
  test('insulation → reduced', () => expect(classifyLineItem(makeItem('insulation')).rateType).toBe('reduced'));
  test('insurance → exempt', () => expect(classifyLineItem(makeItem('insurance')).rateType).toBe('exempt'));
  test('education → exempt', () => expect(classifyLineItem(makeItem('education')).rateType).toBe('exempt'));
  test('electronics → default standard', () => expect(classifyLineItem(makeItem('electronics')).rateType).toBe('standard'));
});

describe('classifyLineItem — Priority 4: product tags', () => {
  const makeItem = (tags) => ({ tags, tax_lines: [] });

  test('zero-vat tag → zero', () => expect(classifyLineItem(makeItem('zero-vat,clothing')).rateType).toBe('zero'));
  test('reduced-vat tag → reduced', () => expect(classifyLineItem(makeItem('reduced-vat')).rateType).toBe('reduced'));
  test('exempt tag → exempt', () => expect(classifyLineItem(makeItem('exempt')).rateType).toBe('exempt'));
});

describe('classifyLineItem — Default fallback', () => {
  test('no signals → standard, low confidence', () => {
    const item = { tax_lines: [], title: 'Generic Product' };
    const r = classifyLineItem(item);
    expect(r.rateType).toBe('standard');
    expect(r.confidence).toBe('low');
    expect(r.reason).toBe('default_standard');
  });

  test('order-level tax line fallback', () => {
    const item = { tax_lines: [] };
    const orderTaxLines = [{ rate: 0.20 }];
    const r = classifyLineItem(item, orderTaxLines);
    expect(r.rateType).toBe('standard');
    expect(r.confidence).toBe('low');
    expect(r.reason).toBe('order_tax_line_fallback');
  });
});

// ── classifyOrder ─────────────────────────────────────────────────────────────
describe('classifyOrder', () => {
  test('single-rate order — no split', () => {
    const order = {
      id: 1, order_number: 1001,
      tax_lines: [{ rate: 0.20 }],
      line_items: [
        { id: 1, title: 'T-Shirt', price: '10.00', quantity: 1, tax_lines: [{ rate: 0.20 }] },
        { id: 2, title: 'Jeans',   price: '20.00', quantity: 1, tax_lines: [{ rate: 0.20 }] },
      ],
    };
    const { lineItems, orderSummary } = classifyOrder(order);
    expect(lineItems).toHaveLength(2);
    expect(orderSummary.hasMultipleRates).toBe(false);
    expect(orderSummary.dominantRate).toBe('standard');
  });

  test('mixed-rate order — hasMultipleRates true', () => {
    const order = {
      id: 2, order_number: 1002,
      tax_lines: [],
      line_items: [
        { id: 1, title: 'T-Shirt', price: '10.00', quantity: 1, tax_lines: [{ rate: 0.20 }] },
        { id: 2, title: 'Book',    price: '5.00',  quantity: 1, product_type: 'book', tax_lines: [] },
      ],
    };
    const { orderSummary } = classifyOrder(order);
    expect(orderSummary.hasMultipleRates).toBe(true);
  });
});
