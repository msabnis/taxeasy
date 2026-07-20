/**
 * TaxEase UK — VAT Engine Unit Tests
 *
 * Tests the pure 9-box calculation and formatting functions.
 * No database or network calls.
 */

'use strict';

const {
  calculate9BoxReturn,
  formatForHmrc,
  formatForDisplay,
  calculateDueDate,
  isOverdue,
} = require('../../services/vatEngine');

// ── Test fixtures ─────────────────────────────────────────────────────────────

const PERIOD_START = '2026-01-01';
const PERIOD_END   = '2026-03-31';

const makeTx = (overrides) => ({
  date:        '2026-01-15',
  type:        'sale',
  grossAmount: 12000,
  netAmount:   10000,
  vatAmount:   2000,
  vatRate:     'standard',
  ...overrides,
});

// ── calculate9BoxReturn ───────────────────────────────────────────────────────
describe('calculate9BoxReturn', () => {

  test('empty transactions — all boxes zero', () => {
    const r = calculate9BoxReturn([], PERIOD_START, PERIOD_END);
    expect(r.box1).toBe(0);
    expect(r.box3).toBe(0);
    expect(r.box4).toBe(0);
    expect(r.box5).toBe(0);
    expect(r.isPayable).toBe(false);
  });

  test('single sale — box1 and box6 populated', () => {
    const txs = [makeTx()];
    const r = calculate9BoxReturn(txs, PERIOD_START, PERIOD_END);
    expect(r.box1).toBe(2000);   // VAT on sales
    expect(r.box6).toBe(10000);  // Net sales value
    expect(r.box4).toBe(0);      // No purchases
    expect(r.box3).toBe(2000);   // box1 + box2
    expect(r.box5).toBe(2000);   // Net payable
    expect(r.isPayable).toBe(true);
  });

  test('sale + purchase — correct box5 (net payable)', () => {
    const txs = [
      makeTx({ type: 'sale',     netAmount: 10000, vatAmount: 2000 }),
      makeTx({ type: 'purchase', netAmount: 5000,  vatAmount: 1000 }),
    ];
    const r = calculate9BoxReturn(txs, PERIOD_START, PERIOD_END);
    expect(r.box1).toBe(2000);   // VAT on sales
    expect(r.box4).toBe(1000);   // VAT reclaimed
    expect(r.box5).toBe(1000);   // Net payable = 2000 - 1000
    expect(r.box6).toBe(10000);  // Net sales
    expect(r.box7).toBe(5000);   // Net purchases
    expect(r.isPayable).toBe(true);
  });

  test('more VAT reclaimed than owed — isPayable false', () => {
    const txs = [
      makeTx({ type: 'sale',     netAmount: 1000, vatAmount: 200 }),
      makeTx({ type: 'purchase', netAmount: 5000, vatAmount: 1000 }),
    ];
    const r = calculate9BoxReturn(txs, PERIOD_START, PERIOD_END);
    expect(r.box1).toBe(200);
    expect(r.box4).toBe(1000);
    expect(r.isPayable).toBe(false);
    expect(r.netVatPence).toBe(-800);  // Negative = reclaiming
    expect(r.box5).toBe(800);          // Stored as absolute value
  });

  test('refund reduces box1 and box6', () => {
    const txs = [
      makeTx({ type: 'sale',   netAmount: 10000, vatAmount: 2000 }),
      makeTx({ type: 'refund', netAmount: 5000,  vatAmount: 1000 }),
    ];
    const r = calculate9BoxReturn(txs, PERIOD_START, PERIOD_END);
    expect(r.box1).toBe(1000);   // 2000 - 1000 refund
    expect(r.box6).toBe(5000);   // 10000 - 5000 refund
  });

  test('exempt purchases excluded from box4 and box7', () => {
    const txs = [
      makeTx({ type: 'purchase', vatRate: 'exempt', netAmount: 5000, vatAmount: 0 }),
    ];
    const r = calculate9BoxReturn(txs, PERIOD_START, PERIOD_END);
    expect(r.box4).toBe(0);
    expect(r.box7).toBe(0);
    expect(r.breakdown.exempt.count).toBe(1);
  });

  test('transactions outside period are excluded', () => {
    const txs = [
      makeTx({ date: '2025-12-31' }),  // Before period
      makeTx({ date: '2026-01-01' }),  // First day of period — included
      makeTx({ date: '2026-03-31' }),  // Last day of period — included
      makeTx({ date: '2026-04-01' }),  // After period
    ];
    const r = calculate9BoxReturn(txs, PERIOD_START, PERIOD_END);
    expect(r.transactionCount).toBe(2);
    expect(r.box1).toBe(4000);  // 2 transactions × 2000 VAT each
  });

  test('box2, box8, box9 always zero (post-Brexit)', () => {
    const txs = [makeTx()];
    const r = calculate9BoxReturn(txs, PERIOD_START, PERIOD_END);
    expect(r.box2).toBe(0);
    expect(r.box8).toBe(0);
    expect(r.box9).toBe(0);
  });

  test('box3 = box1 + box2', () => {
    const txs = [makeTx({ vatAmount: 3500 })];
    const r = calculate9BoxReturn(txs, PERIOD_START, PERIOD_END);
    expect(r.box3).toBe(r.box1 + r.box2);
  });

  test('multiple sales accumulate correctly', () => {
    const txs = [
      makeTx({ netAmount: 10000, vatAmount: 2000 }),
      makeTx({ netAmount: 5000,  vatAmount: 1000 }),
      makeTx({ netAmount: 2000,  vatAmount: 400  }),
    ];
    const r = calculate9BoxReturn(txs, PERIOD_START, PERIOD_END);
    expect(r.box1).toBe(3400);   // 2000 + 1000 + 400
    expect(r.box6).toBe(17000);  // 10000 + 5000 + 2000
  });

  test('breakdown counts are correct', () => {
    const txs = [
      makeTx({ type: 'sale' }),
      makeTx({ type: 'sale' }),
      makeTx({ type: 'purchase' }),
      makeTx({ type: 'refund' }),
    ];
    const r = calculate9BoxReturn(txs, PERIOD_START, PERIOD_END);
    expect(r.breakdown.sales.count).toBe(2);
    expect(r.breakdown.purchases.count).toBe(1);
    expect(r.breakdown.refunds.count).toBe(1);
  });
});

// ── formatForHmrc ─────────────────────────────────────────────────────────────
describe('formatForHmrc', () => {
  const nineBox = {
    box1: 200000, box2: 0, box3: 200000, box4: 100000,
    box5: 100000, box6: 1000000, box7: 500000, box8: 0, box9: 0,
    isPayable: true, netVatPence: 100000,
    periodStart: PERIOD_START, periodEnd: PERIOD_END, transactionCount: 5, breakdown: {},
  };

  test('converts pence to pounds correctly', () => {
    const payload = formatForHmrc(nineBox, '24AA');
    expect(payload.vatDueSales).toBe(2000.00);
    expect(payload.vatReclaimedCurrPeriod).toBe(1000.00);
    expect(payload.netVatDue).toBe(1000.00);
  });

  test('boxes 6-9 are whole pounds (floor)', () => {
    const payload = formatForHmrc(nineBox, '24AA');
    expect(payload.totalValueSalesExVAT).toBe(10000);      // 1000000p / 100 = 10000
    expect(payload.totalValuePurchasesExVAT).toBe(5000);   // 500000p / 100 = 5000
    expect(Number.isInteger(payload.totalValueSalesExVAT)).toBe(true);
  });

  test('includes periodKey and finalised=true', () => {
    const payload = formatForHmrc(nineBox, '24AA');
    expect(payload.periodKey).toBe('24AA');
    expect(payload.finalised).toBe(true);
  });

  test('boxes 1-5 have 2 decimal places', () => {
    const oddBox = { ...nineBox, box1: 333 };  // £3.33
    const payload = formatForHmrc(oddBox, '24AA');
    expect(payload.vatDueSales).toBe(3.33);
  });
});

// ── formatForDisplay ──────────────────────────────────────────────────────────
describe('formatForDisplay', () => {
  const nineBox = {
    box1: 2000, box2: 0, box3: 2000, box4: 1000,
    box5: 1000, box6: 10000, box7: 5000, box8: 0, box9: 0,
    isPayable: true, netVatPence: 1000,
    periodStart: PERIOD_START, periodEnd: PERIOD_END, transactionCount: 3,
    breakdown: {
      sales:     { grossPence: 12000, vatPence: 2000 },
      purchases: { grossPence: 6000,  vatPence: 1000 },
      refunds:   { grossPence: 0 },
    },
  };

  test('converts pence to pound strings', () => {
    const d = formatForDisplay(nineBox);
    expect(d.boxes.box1).toBe('20.00');
    expect(d.boxes.box4).toBe('10.00');
    expect(d.boxes.box5).toBe('10.00');
    expect(d.netVat).toBe('10.00');
  });

  test('includes summary fields', () => {
    const d = formatForDisplay(nineBox);
    expect(d.summary.totalSales).toBe('120.00');
    expect(d.summary.vatOnSales).toBe('20.00');
    expect(d.summary.vatReclaimed).toBe('10.00');
  });
});

// ── calculateDueDate ──────────────────────────────────────────────────────────
describe('calculateDueDate', () => {
  test('Q1 end 31 March → due 7 May', () => {
    expect(calculateDueDate('2026-03-31')).toBe('2026-05-07');
  });

  test('Q2 end 30 June → due 7 August', () => {
    expect(calculateDueDate('2026-06-30')).toBe('2026-08-07');
  });

  test('Q3 end 30 September → due 7 November', () => {
    expect(calculateDueDate('2026-09-30')).toBe('2026-11-07');
  });

  test('Q4 end 31 December → due 7 February', () => {
    expect(calculateDueDate('2026-12-31')).toBe('2027-02-07');
  });
});

// ── isOverdue ─────────────────────────────────────────────────────────────────
describe('isOverdue', () => {
  test('past date is overdue', () => {
    expect(isOverdue('2020-01-01')).toBe(true);
  });

  test('future date is not overdue', () => {
    expect(isOverdue('2099-12-31')).toBe(false);
  });
});
