/**
 * TaxEase UK — Order Mapper Unit Tests
 */

'use strict';

const {
  mapOrderToTransactions,
  mapRefundToTransaction,
} = require('../../services/shopify/orderMapper');

const MERCHANT_ID = 'test-merchant-uuid';

// ── Fixtures ──────────────────────────────────────────────────────────────────
const makeOrder = (overrides = {}) => ({
  id:               12345,
  order_number:     1001,
  financial_status: 'paid',
  total_price:      '120.00',
  total_tax:        '20.00',
  currency:         'GBP',
  processed_at:     '2026-01-15T10:00:00Z',
  created_at:       '2026-01-15T10:00:00Z',
  gateway:          'shopify_payments',
  tax_lines:        [{ rate: 0.20, price: '20.00' }],
  line_items: [
    {
      id: 1, title: 'T-Shirt', price: '60.00', quantity: 1,
      line_price: '60.00', taxable: true,
      tax_lines: [{ rate: 0.20, price: '10.00' }],
    },
    {
      id: 2, title: 'Jeans', price: '60.00', quantity: 1,
      line_price: '60.00', taxable: true,
      tax_lines: [{ rate: 0.20, price: '10.00' }],
    },
  ],
  refunds: [],
  ...overrides,
});

// ── mapOrderToTransactions ────────────────────────────────────────────────────
describe('mapOrderToTransactions', () => {
  test('single-rate order → one transaction', () => {
    const txs = mapOrderToTransactions(makeOrder(), MERCHANT_ID);
    expect(txs).toHaveLength(1);
    const tx = txs[0];
    expect(tx.type).toBe('sale');
    expect(tx.source).toBe('shopify');
    expect(tx.merchantId).toBe(MERCHANT_ID);
    expect(tx.externalId).toBe('12345');
    expect(tx.vatRate).toBe('standard');
    expect(tx.currency).toBe('GBP');
    expect(tx.category).toBe('sales');
    expect(tx.date).toBe('2026-01-15');
  });

  test('amounts converted to pence correctly', () => {
    const txs = mapOrderToTransactions(makeOrder(), MERCHANT_ID);
    const tx  = txs[0];
    expect(tx.grossAmount).toBe(12000);  // £120.00
    expect(tx.vatAmount).toBe(2000);     // £20.00
    expect(tx.netAmount).toBe(10000);    // £100.00
  });

  test('description includes order number', () => {
    const txs = mapOrderToTransactions(makeOrder(), MERCHANT_ID);
    expect(txs[0].description).toContain('1001');
  });

  test('rawData includes orderId', () => {
    const txs = mapOrderToTransactions(makeOrder(), MERCHANT_ID);
    expect(txs[0].rawData.orderId).toBe(12345);
  });

  test('zero-rated order → zero vatAmount', () => {
    const order = makeOrder({
      total_tax: '0.00',
      tax_lines: [{ rate: 0, price: '0.00' }],
      line_items: [{
        id: 1, title: 'Book', price: '10.00', quantity: 1,
        line_price: '10.00', product_type: 'book',
        tax_lines: [{ rate: 0, price: '0.00' }],
      }],
    });
    const txs = mapOrderToTransactions(order, MERCHANT_ID);
    expect(txs[0].vatAmount).toBe(0);
    expect(txs[0].vatRate).toBe('zero');
  });

  test('mixed-rate order → multiple transactions', () => {
    const order = makeOrder({
      total_price: '130.00',
      total_tax:   '20.00',
      tax_lines:   [],
      line_items: [
        {
          id: 1, title: 'T-Shirt', price: '120.00', quantity: 1,
          line_price: '120.00', tax_lines: [{ rate: 0.20, price: '20.00' }],
        },
        {
          id: 2, title: 'Book', price: '10.00', quantity: 1,
          line_price: '10.00', product_type: 'book',
          tax_lines: [{ rate: 0, price: '0.00' }],
        },
      ],
    });
    const txs = mapOrderToTransactions(order, MERCHANT_ID);
    expect(txs.length).toBeGreaterThan(1);
    const rates = txs.map(t => t.vatRate);
    expect(rates).toContain('standard');
    expect(rates).toContain('zero');
  });

  test('isReconciled defaults to false', () => {
    const txs = mapOrderToTransactions(makeOrder(), MERCHANT_ID);
    expect(txs[0].isReconciled).toBe(false);
  });
});

// ── mapRefundToTransaction ────────────────────────────────────────────────────
describe('mapRefundToTransaction', () => {
  const order = makeOrder();
  const refund = {
    id:         99001,
    created_at: '2026-01-20T12:00:00Z',
    refund_line_items: [
      { subtotal: '60.00', total_tax: '10.00', line_item_id: 1 },
    ],
  };

  test('maps refund to refund transaction', () => {
    const tx = mapRefundToTransaction(refund, order, MERCHANT_ID);
    expect(tx).not.toBeNull();
    expect(tx.type).toBe('refund');
    expect(tx.source).toBe('shopify');
    expect(tx.externalId).toBe('refund-99001');
  });

  test('refund amounts in pence', () => {
    const tx = mapRefundToTransaction(refund, order, MERCHANT_ID);
    expect(tx.grossAmount).toBe(7000);  // £60 + £10 = £70
    expect(tx.vatAmount).toBe(1000);    // £10
    expect(tx.netAmount).toBe(6000);    // £60
  });

  test('returns null for zero-value refund', () => {
    const emptyRefund = { id: 99002, refund_line_items: [] };
    expect(mapRefundToTransaction(emptyRefund, order, MERCHANT_ID)).toBeNull();
  });

  test('date extracted from refund created_at', () => {
    const tx = mapRefundToTransaction(refund, order, MERCHANT_ID);
    expect(tx.date).toBe('2026-01-20');
  });
});
