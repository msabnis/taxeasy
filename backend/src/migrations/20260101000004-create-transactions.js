'use strict';

/**
 * Transactions — financial transactions from Shopify orders and bank feeds.
 *
 * This is the core financial ledger. Every Shopify order and every bank
 * transaction is stored here. The VAT engine reads from this table to
 * generate 9-box VAT returns.
 *
 * Columns:
 *   id              UUID primary key
 *   merchantId      FK → Merchants.id
 *   bankAccountId   FK → BankAccounts.id (null for Shopify-sourced transactions)
 *   source          shopify | bank_feed | csv_upload | manual
 *   type            sale | purchase | refund | transfer | fee
 *   externalId      Shopify order ID or GoCardless transaction ID
 *   date            Transaction date (not created_at)
 *   description     Merchant description or Shopify order number
 *   grossAmount     Amount including VAT (in pence to avoid float issues)
 *   netAmount       Amount excluding VAT (in pence)
 *   vatAmount       VAT portion (in pence)
 *   vatRate         VAT rate applied: standard | reduced | zero | exempt
 *   currency        ISO 4217, e.g. "GBP"
 *   category        Expense category for P&L: sales | cost_of_goods | operating_expense | etc.
 *   isReconciled    Whether matched to a bank transaction
 *   notes           Free-text notes
 *   rawData         JSONB — original payload from Shopify or GoCardless
 *   createdAt / updatedAt
 *
 * Note: All monetary amounts stored in PENCE (integer) to avoid floating
 * point precision issues. Divide by 100 when displaying to users.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Transactions', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      merchantId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'Merchants', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      bankAccountId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'BankAccounts', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      source: {
        type: Sequelize.ENUM('shopify', 'bank_feed', 'csv_upload', 'manual'),
        allowNull: false,
      },
      type: {
        type: Sequelize.ENUM('sale', 'purchase', 'refund', 'transfer', 'fee'),
        allowNull: false,
      },
      externalId: {
        type: Sequelize.STRING(255),
        allowNull: true,
        comment: 'Shopify order ID or GoCardless transaction ID',
      },
      date: {
        type: Sequelize.DATEONLY,
        allowNull: false,
        comment: 'Transaction date (not the created_at timestamp)',
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      grossAmount: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: 'Amount including VAT, stored in PENCE (e.g. £12.00 = 1200)',
      },
      netAmount: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: 'Amount excluding VAT, stored in PENCE',
      },
      vatAmount: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'VAT portion, stored in PENCE',
      },
      vatRate: {
        type: Sequelize.ENUM('standard', 'reduced', 'zero', 'exempt'),
        allowNull: false,
        defaultValue: 'standard',
      },
      currency: {
        type: Sequelize.STRING(3),
        allowNull: false,
        defaultValue: 'GBP',
      },
      category: {
        type: Sequelize.ENUM(
          'sales',
          'cost_of_goods',
          'operating_expense',
          'payroll',
          'tax_payment',
          'bank_charge',
          'transfer',
          'other'
        ),
        allowNull: true,
      },
      isReconciled: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      rawData: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'Original payload from Shopify webhook or GoCardless API',
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
    });

    // Indexes for common query patterns
    await queryInterface.addIndex('Transactions', ['merchantId', 'date'], {
      name: 'transactions_merchant_date_idx',
    });
    await queryInterface.addIndex('Transactions', ['merchantId', 'type'], {
      name: 'transactions_merchant_type_idx',
    });
    await queryInterface.addIndex('Transactions', ['merchantId', 'vatRate'], {
      name: 'transactions_merchant_vat_rate_idx',
    });
    await queryInterface.addIndex('Transactions', ['externalId'], {
      name: 'transactions_external_id_idx',
    });
    await queryInterface.addIndex('Transactions', ['isReconciled'], {
      name: 'transactions_is_reconciled_idx',
    });
    await queryInterface.addIndex('Transactions', ['source'], {
      name: 'transactions_source_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('Transactions');
  },
};
