/**
 * TaxEase UK — VAT Calculator Unit Tests
 *
 * Tests the pure calculation functions (no DB, no network).
 * All amounts in pence.
 */

'use strict';

const {
  addVAT,
  removeVAT,
  rateTypeFromShopify,
  shopifyOrderToVat,
  VAT_RATES,
} = require('../../utils/vatCalculator');

// ── addVAT ────────────────────────────────────────────────────────────────────
describe('addVAT', () => {
  test('adds 20% standard rate to £10.00 (1000p)', () => {
    const r = addVAT(1000, 'standard');
    expect(r.netPence).toBe(1000);
    expect(r.vatPence).toBe(200);
    expect(r.grossPence).toBe(1200);
    expect(r.rate).toBe(0.20);
  });

  test('adds 5% reduced rate to £100.00 (10000p)', () => {
    const r = addVAT(10000, 'reduced');
    expect(r.vatPence).toBe(500);
    expect(r.grossPence).toBe(10500);
  });

  test('adds 0% zero rate — no VAT', () => {
    const r = addVAT(5000, 'zero');
    expect(r.vatPence).toBe(0);
    expect(r.grossPence).toBe(5000);
  });

  test('throws for exempt rate', () => {
    expect(() => addVAT(1000, 'exempt')).toThrow('exempt');
  });

  test('throws for unknown rate type', () => {
    expect(() => addVAT(1000, 'invalid')).toThrow('Unknown VAT rate type');
  });

  test('throws for negative amount', () => {
    expect(() => addVAT(-100, 'standard')).toThrow('non-negative integer');
  });

  test('throws for non-integer amount', () => {
    expect(() => addVAT(10.5, 'standard')).toThrow('non-negative integer');
  });

  test('handles zero amount', () => {
    const r = addVAT(0, 'standard');
    expect(r.vatPence).toBe(0);
    expect(r.grossPence).toBe(0);
  });

  test('rounds VAT correctly for £1.01 (101p) at 20%', () => {
    const r = addVAT(101, 'standard');
    expect(r.vatPence).toBe(20);   // Math.round(101 * 0.20) = 20
    expect(r.grossPence).toBe(121);
  });
});

// ── removeVAT ─────────────────────────────────────────────────────────────────
describe('removeVAT', () => {
  test('removes 20% from £12.00 gross (1200p)', () => {
    const r = removeVAT(1200, 'standard');
    expect(r.netPence).toBe(1000);
    expect(r.vatPence).toBe(200);
    expect(r.grossPence).toBe(1200);
  });

  test('removes 5% from £10.50 gross (1050p)', () => {
    const r = removeVAT(1050, 'reduced');
    expect(r.netPence).toBe(1000);
    expect(r.vatPence).toBe(50);
  });

  test('removes 0% — net equals gross', () => {
    const r = removeVAT(5000, 'zero');
    expect(r.netPence).toBe(5000);
    expect(r.vatPence).toBe(0);
  });

  test('throws for exempt', () => {
    expect(() => removeVAT(1000, 'exempt')).toThrow('exempt');
  });

  test('net + vat always equals gross', () => {
    const amounts = [100, 999, 1234, 9999, 100000];
    amounts.forEach(gross => {
      const r = removeVAT(gross, 'standard');
      expect(r.netPence + r.vatPence).toBe(gross);
    });
  });
});

// ── rateTypeFromShopify ───────────────────────────────────────────────────────
describe('rateTypeFromShopify', () => {
  test('0.2 → standard', () => expect(rateTypeFromShopify(0.2)).toBe('standard'));
  test('0.20 → standard', () => expect(rateTypeFromShopify(0.20)).toBe('standard'));
  test('0.05 → reduced', () => expect(rateTypeFromShopify(0.05)).toBe('reduced'));
  test('0 → zero', () => expect(rateTypeFromShopify(0)).toBe('zero'));
  test('0.0 → zero', () => expect(rateTypeFromShopify(0.0)).toBe('zero'));
});

// ── shopifyOrderToVat ─────────────────────────────────────────────────────────
describe('shopifyOrderToVat', () => {
  const mockOrder = {
    id: 12345,
    order_number: 1001,
    total_price: '120.00',
    total_tax: '20.00',
    created_at: '2026-01-15T10:30:00Z',
    tax_lines: [{ rate: 0.2, price: '20.00' }],
  };

  test('converts Shopify order to pence correctly', () => {
    const r = shopifyOrderToVat(mockOrder);
    expect(r.grossPence).toBe(12000);
    expect(r.vatPence).toBe(2000);
    expect(r.netPence).toBe(10000);
    expect(r.rateType).toBe('standard');
    expect(r.externalId).toBe('12345');
    expect(r.date).toBe('2026-01-15');
    expect(r.description).toBe('Shopify Order #1001');
  });

  test('handles zero-rated order', () => {
    const zeroOrder = { ...mockOrder, total_tax: '0.00', tax_lines: [{ rate: 0, price: '0.00' }] };
    const r = shopifyOrderToVat(zeroOrder);
    expect(r.vatPence).toBe(0);
    expect(r.rateType).toBe('zero');
  });

  test('handles order with no tax lines', () => {
    const noTaxOrder = { ...mockOrder, total_tax: '0.00', tax_lines: [] };
    const r = shopifyOrderToVat(noTaxOrder);
    expect(r.vatPence).toBe(0);
    expect(r.rateType).toBe('zero');
  });

  test('handles order with VAT but no tax_lines array', () => {
    const noLinesOrder = { ...mockOrder, tax_lines: undefined };
    const r = shopifyOrderToVat(noLinesOrder);
    expect(r.vatPence).toBe(2000);
    expect(r.rateType).toBe('standard');  // inferred from vatPence > 0
  });
});
