/**
 * TaxEase UK — HMRC MTD Service Integration Tests
 *
 * Tests the full MTD pipeline with a real DB but mocked HMRC API.
 */

'use strict';

jest.mock('../../services/hmrc/hmrcApiClient');
jest.mock('../../services/hmrc/hmrcTokenManager');

const { createHmrcClient }    = require('../../services/hmrc/hmrcApiClient');
const { getValidAccessToken }  = require('../../services/hmrc/hmrcTokenManager');
const hmrcMtdService           = require('../../services/hmrc/hmrcMtdService');
const { sequelize, Merchant, Transaction, VatReturn } = require('../../models');

// Valid UUIDs required by PostgreSQL UUID column type
const MERCHANT_ID = 'a1b2c3d4-0001-0001-0001-000000000001';
const VRN         = 'GB123456789';

// ── Mock HMRC client ──────────────────────────────────────────────────────────
const mockClient = {
  getObligations:     jest.fn(),
  getOpenObligations: jest.fn(),
  submitVatReturn:    jest.fn(),
  getVatReturn:       jest.fn(),
  getLiabilities:     jest.fn(),
  getPayments:        jest.fn(),
  getPenalties:       jest.fn(),
};
createHmrcClient.mockReturnValue(mockClient);
getValidAccessToken.mockResolvedValue('mock-access-token');

beforeAll(async () => {
  await sequelize.sync({ force: true });

  await Merchant.create({
    id:         MERCHANT_ID,
    shopDomain: 'test-hmrc.myshopify.com',
    plan:       'small_business',
    planStatus: 'active',
    vatNumber:  VRN,
    isActive:   true,
  });

  // Seed transactions for Q1 2026
  await Transaction.bulkCreate([
    {
      merchantId:  MERCHANT_ID,
      source:      'shopify',
      type:        'sale',
      date:        '2026-01-15',
      description: 'Order #1001',
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
      type:        'purchase',
      date:        '2026-02-10',
      description: 'Office supplies',
      grossAmount: 2400,
      netAmount:   2000,
      vatAmount:   400,
      vatRate:     'standard',
      currency:    'GBP',
      category:    'operating_expense',
    },
  ]);
});

afterAll(async () => {
  await sequelize.close();
});

beforeEach(() => {
  jest.clearAllMocks();
  getValidAccessToken.mockResolvedValue('mock-access-token');
  createHmrcClient.mockReturnValue(mockClient);
});

// ── syncObligations ───────────────────────────────────────────────────────────
describe('syncObligations', () => {
  test('creates draft VatReturn records for open obligations', async () => {
    mockClient.getOpenObligations.mockResolvedValue([
      { periodKey: '26AA', start: '2026-01-01', end: '2026-03-31', due: '2026-05-07', status: 'O' },
    ]);

    const result = await hmrcMtdService.syncObligations(MERCHANT_ID);

    expect(result.obligations).toHaveLength(1);
    expect(result.synced).toBe(1);

    const vatReturn = await VatReturn.findOne({ where: { merchantId: MERCHANT_ID, periodKey: '26AA' } });
    expect(vatReturn).not.toBeNull();
    expect(vatReturn.status).toBe('draft');
    expect(vatReturn.periodStart).toBe('2026-01-01');
    expect(vatReturn.dueDate).toBe('2026-05-07');
  });

  test('idempotent — calling twice does not duplicate records', async () => {
    mockClient.getOpenObligations.mockResolvedValue([
      { periodKey: '26AA', start: '2026-01-01', end: '2026-03-31', due: '2026-05-07', status: 'O' },
    ]);

    await hmrcMtdService.syncObligations(MERCHANT_ID);
    const result2 = await hmrcMtdService.syncObligations(MERCHANT_ID);

    expect(result2.synced).toBe(0);

    const count = await VatReturn.count({ where: { merchantId: MERCHANT_ID, periodKey: '26AA' } });
    expect(count).toBe(1);
  });

  test('throws if merchant has no VRN', async () => {
    const noVrnId = 'a1b2c3d4-0001-0001-0001-000000000099';
    await Merchant.create({
      id: noVrnId, shopDomain: 'no-vrn.myshopify.com',
      plan: 'sole_trader', planStatus: 'active', isActive: true,
    });
    await expect(hmrcMtdService.syncObligations(noVrnId)).rejects.toThrow('VAT registration number');
  });
});

// ── submitReturn ──────────────────────────────────────────────────────────────
describe('submitReturn', () => {
  let vatReturnId;

  beforeEach(async () => {
    const { vatReturn } = await require('../../services/vatEngine').prepareVatReturn(
      MERCHANT_ID, '26BB', '2026-01-01', '2026-03-31', '2026-05-07'
    );
    vatReturnId = vatReturn.id;
  });

  test('submits prepared return and updates status to submitted', async () => {
    mockClient.submitVatReturn.mockResolvedValue({
      formBundleNumber: 'BUNDLE-001',
      processingDate:   '2026-04-01',
      paymentIndicator: 'PAYMENT',
      correlationId:    'corr-001',
    });

    const receipt = await hmrcMtdService.submitReturn(MERCHANT_ID, vatReturnId);

    expect(receipt.success).toBe(true);
    expect(receipt.formBundleNumber).toBe('BUNDLE-001');

    const updated = await VatReturn.findByPk(vatReturnId);
    expect(updated.status).toBe('submitted');
    expect(updated.submittedAt).not.toBeNull();
    expect(updated.hmrcReceiptId).toBe('BUNDLE-001');
  });

  test('handles duplicate submission gracefully', async () => {
    const dupError = new Error('Duplicate submission');
    dupError.isDuplicate = true;
    mockClient.submitVatReturn.mockRejectedValue(dupError);

    const receipt = await hmrcMtdService.submitReturn(MERCHANT_ID, vatReturnId);
    expect(receipt.duplicate).toBe(true);
    expect(receipt.status).toBe('submitted');
  });

  test('marks return as rejected on HMRC validation error', async () => {
    const validationError = new Error('Invalid VAT return');
    validationError.hmrcStatus = 422;
    validationError.hmrcBody   = { code: 'INVALID_REQUEST', message: 'Box 5 is invalid' };
    mockClient.submitVatReturn.mockRejectedValue(validationError);

    await expect(hmrcMtdService.submitReturn(MERCHANT_ID, vatReturnId)).rejects.toThrow();

    const updated = await VatReturn.findByPk(vatReturnId);
    expect(updated.status).toBe('rejected');
    expect(updated.errorMessage).toContain('INVALID_REQUEST');
  });

  test('throws if return not in prepared status', async () => {
    await VatReturn.update({ status: 'draft' }, { where: { id: vatReturnId } });
    await expect(hmrcMtdService.submitReturn(MERCHANT_ID, vatReturnId))
      .rejects.toThrow("'prepared' status");
  });

  test('throws if vatReturnId not found', async () => {
    await expect(hmrcMtdService.submitReturn(MERCHANT_ID, 'a1b2c3d4-ffff-ffff-ffff-ffffffffffff'))
      .rejects.toThrow('not found');
  });
});

// ── getLiabilities ────────────────────────────────────────────────────────────
describe('getLiabilities', () => {
  test('returns formatted liabilities with GBP amounts', async () => {
    mockClient.getLiabilities.mockResolvedValue({
      liabilities: [
        {
          taxPeriod:         { from: '2026-01-01', to: '2026-03-31' },
          type:              'VAT Return Debit Charge',
          originalAmount:    1000.00,
          outstandingAmount: 1000.00,
          due:               '2026-05-07',
        },
      ],
    });

    const result = await hmrcMtdService.getLiabilities(MERCHANT_ID, '2026-01-01', '2026-03-31');

    expect(result.liabilities).toHaveLength(1);
    expect(result.liabilities[0].outstandingAmountGBP).toBe('1000.00');
    expect(result.totalOutstandingGBP).toBe('1000.00');
    expect(result.hasOutstanding).toBe(true);
  });

  test('returns zero outstanding when no liabilities', async () => {
    mockClient.getLiabilities.mockResolvedValue({ liabilities: [] });
    const result = await hmrcMtdService.getLiabilities(MERCHANT_ID, '2026-01-01', '2026-03-31');
    expect(result.totalOutstandingGBP).toBe('0.00');
    expect(result.hasOutstanding).toBe(false);
  });
});

// ── getPayments ───────────────────────────────────────────────────────────────
describe('getPayments', () => {
  test('returns formatted payment history', async () => {
    mockClient.getPayments.mockResolvedValue({
      payments: [
        { received: '2026-04-15', amount: 1000.00 },
        { received: '2025-11-10', amount: 500.00 },
      ],
    });

    const result = await hmrcMtdService.getPayments(MERCHANT_ID, '2025-01-01', '2026-12-31');

    expect(result.payments).toHaveLength(2);
    expect(result.totalPaidGBP).toBe('1500.00');
    expect(result.count).toBe(2);
    expect(result.payments[0].amountGBP).toBe('1000.00');
  });
});
