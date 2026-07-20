/**
 * TaxEase UK — VAT Routes Integration Tests
 *
 * Tests the /api/vat/* endpoints with a real PostgreSQL test database.
 * Requires DATABASE_URL to be set in the test environment.
 */

'use strict';

const request  = require('supertest');
const app      = require('../../app');
const { sequelize, Merchant, Transaction } = require('../../models');

const MERCHANT_ID = 'test-merchant-uuid-vat-001';

beforeAll(async () => {
  await sequelize.sync({ force: true });

  // Create test merchant
  await Merchant.create({
    id:          MERCHANT_ID,
    shopDomain:  'test-vat.myshopify.com',
    plan:        'small_business',
    planStatus:  'active',
    vatNumber:   'GB123456789',
    isActive:    true,
  });

  // Create test transactions
  await Transaction.bulkCreate([
    {
      merchantId:  MERCHANT_ID,
      source:      'shopify',
      type:        'sale',
      externalId:  'order-001',
      date:        '2026-01-15',
      description: 'Shopify Order #1001',
      grossAmount: 12000,
      netAmount:   10000,
      vatAmount:   2000,
      vatRate:     'standard',
      currency:    'GBP',
      category:    'sales',
    },
    {
      merchantId:  MERCHANT_ID,
      source:      'shopify',
      type:        'sale',
      externalId:  'order-002',
      date:        '2026-02-10',
      description: 'Shopify Order #1002',
      grossAmount: 6000,
      netAmount:   5000,
      vatAmount:   1000,
      vatRate:     'standard',
      currency:    'GBP',
      category:    'sales',
    },
    {
      merchantId:  MERCHANT_ID,
      source:      'csv_upload',
      type:        'purchase',
      date:        '2026-01-20',
      description: 'Office supplies',
      grossAmount: 2400,
      netAmount:   2000,
      vatAmount:   400,
      vatRate:     'standard',
      currency:    'GBP',
      category:    'operating_expense',
    },
    {
      merchantId:  MERCHANT_ID,
      source:      'shopify',
      type:        'refund',
      externalId:  'refund-001',
      date:        '2026-03-05',
      description: 'Refund for Order #1001',
      grossAmount: 1200,
      netAmount:   1000,
      vatAmount:   200,
      vatRate:     'standard',
      currency:    'GBP',
      category:    'sales',
    },
  ]);
});

afterAll(async () => {
  await sequelize.close();
});

// ── POST /api/vat/calculate ───────────────────────────────────────────────────
describe('POST /api/vat/calculate', () => {
  test('returns correct 9-box for Q1 2026', async () => {
    const res = await request(app)
      .post('/api/vat/calculate')
      .send({
        merchantId:  MERCHANT_ID,
        periodStart: '2026-01-01',
        periodEnd:   '2026-03-31',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // box1: sales VAT (2000 + 1000) - refund VAT (200) = 2800
    expect(res.body.boxes.box1).toBe('28.00');
    // box4: purchase VAT = 400
    expect(res.body.boxes.box4).toBe('4.00');
    // box5: net payable = 2800 - 400 = 2400
    expect(res.body.boxes.box5).toBe('24.00');
    expect(res.body.isPayable).toBe(true);
  });

  test('returns 400 if merchantId missing', async () => {
    const res = await request(app)
      .post('/api/vat/calculate')
      .send({ periodStart: '2026-01-01', periodEnd: '2026-03-31' });
    expect(res.status).toBe(400);
  });

  test('returns zeros for period with no transactions', async () => {
    const res = await request(app)
      .post('/api/vat/calculate')
      .send({
        merchantId:  MERCHANT_ID,
        periodStart: '2025-01-01',
        periodEnd:   '2025-03-31',
      });
    expect(res.status).toBe(200);
    expect(res.body.boxes.box1).toBe('0.00');
    expect(res.body.boxes.box5).toBe('0.00');
  });
});

// ── POST /api/vat/prepare ─────────────────────────────────────────────────────
describe('POST /api/vat/prepare', () => {
  test('creates a VatReturn record with status prepared', async () => {
    const res = await request(app)
      .post('/api/vat/prepare')
      .send({
        merchantId:  MERCHANT_ID,
        periodKey:   '26AA',
        periodStart: '2026-01-01',
        periodEnd:   '2026-03-31',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.status).toBe('prepared');
    expect(res.body.vatReturnId).toBeDefined();
    expect(res.body.dueDate).toBe('2026-05-07');
    expect(res.body.isPayable).toBe(true);
    expect(res.body.hmrcPayload.periodKey).toBe('26AA');
    expect(res.body.hmrcPayload.finalised).toBe(true);
  });

  test('idempotent — calling twice returns same vatReturnId', async () => {
    const res1 = await request(app)
      .post('/api/vat/prepare')
      .send({ merchantId: MERCHANT_ID, periodKey: '26AA', periodStart: '2026-01-01', periodEnd: '2026-03-31' });
    const res2 = await request(app)
      .post('/api/vat/prepare')
      .send({ merchantId: MERCHANT_ID, periodKey: '26AA', periodStart: '2026-01-01', periodEnd: '2026-03-31' });

    expect(res1.body.vatReturnId).toBe(res2.body.vatReturnId);
  });
});

// ── GET /api/vat/returns ──────────────────────────────────────────────────────
describe('GET /api/vat/returns', () => {
  test('returns list of VAT returns for merchant', async () => {
    const res = await request(app)
      .get('/api/vat/returns')
      .query({ merchantId: MERCHANT_ID });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.returns)).toBe(true);
    expect(res.body.returns.length).toBeGreaterThan(0);
    expect(res.body.returns[0]).toHaveProperty('periodKey');
    expect(res.body.returns[0]).toHaveProperty('status');
    expect(res.body.returns[0]).toHaveProperty('netVatGBP');
  });

  test('returns 400 if merchantId missing', async () => {
    const res = await request(app).get('/api/vat/returns');
    expect(res.status).toBe(400);
  });
});

// ── GET /api/vat/due-date ─────────────────────────────────────────────────────
describe('GET /api/vat/due-date', () => {
  test('calculates correct due date for Q1', async () => {
    const res = await request(app)
      .get('/api/vat/due-date')
      .query({ periodEnd: '2026-03-31' });

    expect(res.status).toBe(200);
    expect(res.body.dueDate).toBe('2026-05-07');
    expect(res.body.isOverdue).toBe(false);
  });

  test('returns 400 if periodEnd missing', async () => {
    const res = await request(app).get('/api/vat/due-date');
    expect(res.status).toBe(400);
  });
});

// ── GET /health ───────────────────────────────────────────────────────────────
describe('GET /health', () => {
  test('returns healthy with db connected', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
    expect(res.body.db).toBe('connected');
  });
});
