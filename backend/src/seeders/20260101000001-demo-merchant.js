'use strict';
const { v4: uuidv4 } = require('uuid');

/**
 * Demo seed — creates a test merchant for local development.
 * Run with: npm run seed
 * Undo with: npx sequelize-cli db:seed:undo
 */
const MERCHANT_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

module.exports = {
  async up(queryInterface) {
    const now = new Date();
    const trialEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    await queryInterface.bulkInsert('Merchants', [{
      id:           MERCHANT_ID,
      shopDomain:   'taxease-demo.myshopify.com',
      accessToken:  'shpat_demo_token_not_real',
      email:        'demo@taxeaseuk.com',
      plan:         'small_business',
      planStatus:   'trialing',
      trialEndsAt:  trialEnd,
      vatNumber:    'GB123456789',
      companyNumber: '12345678',
      isActive:     true,
      createdAt:    now,
      updatedAt:    now,
    }]);

    // Seed some demo transactions
    const transactions = [
      { id: uuidv4(), merchantId: MERCHANT_ID, source: 'shopify', type: 'sale',
        externalId: '5001', date: '2026-01-15', description: 'Shopify Order #1001',
        grossAmount: 12000, netAmount: 10000, vatAmount: 2000, vatRate: 'standard',
        currency: 'GBP', category: 'sales', isReconciled: false,
        rawData: JSON.stringify({}), createdAt: now, updatedAt: now },
      { id: uuidv4(), merchantId: MERCHANT_ID, source: 'shopify', type: 'sale',
        externalId: '5002', date: '2026-01-22', description: 'Shopify Order #1002',
        grossAmount: 6000, netAmount: 5000, vatAmount: 1000, vatRate: 'standard',
        currency: 'GBP', category: 'sales', isReconciled: false,
        rawData: JSON.stringify({}), createdAt: now, updatedAt: now },
      { id: uuidv4(), merchantId: MERCHANT_ID, source: 'csv_upload', type: 'purchase',
        externalId: null, date: '2026-01-10', description: 'Office supplies',
        grossAmount: 2400, netAmount: 2000, vatAmount: 400, vatRate: 'standard',
        currency: 'GBP', category: 'operating_expense', isReconciled: false,
        rawData: JSON.stringify({}), createdAt: now, updatedAt: now },
    ];

    await queryInterface.bulkInsert('Transactions', transactions);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('Transactions', { merchantId: MERCHANT_ID });
    await queryInterface.bulkDelete('Merchants', { id: MERCHANT_ID });
  },
};
