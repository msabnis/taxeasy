/**
 * TaxEase UK — VAT Engine Unit Tests
 */

'use strict';

const {
  calculate9BoxReturn,
  formatForHmrc,
  formatForDisplay,
  calculateDueDate,
  isOverdue,
} = require('../../services/vatEngine');

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

  test('empty transactions — all boxes zero, not payable', () => {
    const r = calculate9BoxReturn([], PERIOD_START, PERIOD_END);
    expect(r.box1).toBe(0);
    expect(r.box3).toBe(0);
    expect(r.box4).toBe(0);
    expect(r.box5).toBe(0);
    expect(r.netVatPence).toBe(0);
    // When net VAT is exactly 0, merchant neither owes nor reclaims — not payable
    expect(r.isPayable).toBe(false);
  });

  test('single sale — box1 and box6 populated', () => {
    const txs = [makeTx()];
    const r = calculate9BoxReturn(txs, PERIOD_START, PERIOD_END);
    expect(r.box1).toBe(2000);
    expect(r.box6).toBe(10000);
    expect(r.box4).toBe(0);
    expect(r.box3).toBe(2000);
    expect(r.box5).toBe(2000);
    expect(r.isPayable).toBe(true);
  });

  test('sale + purchase — correct box5 (net payable)', () => {
    const txs = [
      makeTx({ type: 'sale',     netAmount: 10000, vatAmount: 2000 }),
      makeTx({ type: 'purchase', netAmount: 5000,  vatAmount: 1000 }),
    ];
    const r = calculate9BoxReturn(txs, PERIOD_START, PERIOD_END);
    expect(r.box1).toBe(2000);
    expect(r.box4).toBe(1000);
    expect(r.box5).toBe(1000);
    expect(r.box6).toBe(10000);
    expect(r.box7).toBe(5000);
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
    expect(r.netVatPence).toBe(-800);
    expect(r.box5).toBe(800);
  });

  test('refund reduces box1 and box6', () => {
    const txs = [
      makeTx({ type: 'sale',   netAmount: 10000, vatAmount: 2000 }),
      makeTx({ type: 'refund', netAmount: 5000,  vatAmount: 1000 }),
    ];
    const r = calculate9BoxReturn(txs, PERIOD_START, PERIOD_END);
    expect(r.box1).toBe(1000);
    expect(r.box6).toBe(5000);
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
      makeTx({ date: '2025-12-31' }),
      makeTx({ date: '2026-01-01' }),
      makeTx({ date: '2026-03-31' }),
      makeTx({ date: '2026-04-01' }),
    ];
    const r = calculate9BoxReturn(txs, PERIOD_START, PERIOD_END);
    expect(r.transactionCount).toBe(2);
    expect(r.box1).toBe(4000);
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
    expect(r.box1).toBe(3400);
    expect(r.box6).toBe(17000);
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
    expect(payload.totalValueSalesExVAT).toBe(10000);
    expect(payload.totalValuePurchasesExVAT).toBe(5000);
    expect(Number.isInteger(payload.totalValueSalesExVAT)).toBe(true);
  });

  test('includes periodKey and finalised=true', () => {
    const payload = formatForHmrc(nineBox, '24AA');
    expect(payload.periodKey).toBe('24AA');
    expect(payload.finalised).toBe(true);
  });

  test('boxes 1-5 have 2 decimal places', () => {
    const oddBox = { ...nineBox, box1: 333 };
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
  // HMRC rule: 1 calendar month + 7 days after period end
  // Q1: Mar 31 + 1 month = Apr 30 + 7 days = May 7
  test('Q1 end 31 March → due 7 May', () => {
    expect(calculateDueDate('2026-03-31')).toBe('2026-05-07');
  });

  // Q2: Jun 30 + 1 month = Jul 30 + 7 days = Aug 6
  test('Q2 end 30 June → due 6 August', () => {
    expect(calculateDueDate('2026-06-30')).toBe('2026-08-06');
  });

  // Q3: Sep 30 + 1 month = Oct 30 + 7 days = Nov 6
  test('Q3 end 30 September → due 6 November', () => {
    expect(calculateDueDate('2026-09-30')).toBe('2026-11-06');
  });

  // Q4: Dec 31 + 1 month = Jan 31 + 7 days = Feb 7
  test('Q4 end 31 December → due 7 February', () => {
    expect(calculateDueDate('2026-12-31')).toBe('2027-02-07');
  });

  // Edge: Jan 31 + 1 month = Feb 28 (capped) + 7 days = Mar 7
  test('Jan 31 → due 7 March (month-end capping)', () => {
    expect(calculateDueDate('2026-01-31')).toBe('2026-03-07');
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
