'use strict';

/**
 * CompaniesHouseFilings — annual accounts and confirmation statements.
 *
 * Tracks the preparation and submission of Companies House documents.
 * Supports micro-entity, small company, and dormant account types.
 *
 * Columns:
 *   id                UUID primary key
 *   merchantId        FK → Merchants.id
 *   companyNumber     Companies House registration number
 *   filingType        annual_accounts | confirmation_statement
 *   accountType       micro_entity | small_company | dormant | full
 *   accountingPeriodStart  Start of the accounting period
 *   accountingPeriodEnd    End of the accounting period
 *   filingDeadline    Companies House deadline
 *   status            draft | prepared | submitted | accepted | rejected | overdue
 *   turnover          Annual turnover in PENCE
 *   grossProfit       Gross profit in PENCE
 *   netProfit         Net profit in PENCE
 *   totalAssets       Total assets in PENCE
 *   totalLiabilities  Total liabilities in PENCE
 *   netAssets         Net assets (totalAssets - totalLiabilities) in PENCE
 *   submittedAt       When submitted to Companies House
 *   chReceiptId       Companies House confirmation reference
 *   errorMessage      Rejection reason if status = rejected
 *   documentData      JSONB — prepared account data
 *   createdAt / updatedAt
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('CompaniesHouseFilings', {
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
      companyNumber: {
        type: Sequelize.STRING(20),
        allowNull: false,
      },
      filingType: {
        type: Sequelize.ENUM('annual_accounts', 'confirmation_statement'),
        allowNull: false,
        defaultValue: 'annual_accounts',
      },
      accountType: {
        type: Sequelize.ENUM('micro_entity', 'small_company', 'dormant', 'full'),
        allowNull: false,
        defaultValue: 'micro_entity',
      },
      accountingPeriodStart: {
        type: Sequelize.DATEONLY,
        allowNull: false,
      },
      accountingPeriodEnd: {
        type: Sequelize.DATEONLY,
        allowNull: false,
      },
      filingDeadline: {
        type: Sequelize.DATEONLY,
        allowNull: true,
      },
      status: {
        type: Sequelize.ENUM('draft', 'prepared', 'submitted', 'accepted', 'rejected', 'overdue'),
        allowNull: false,
        defaultValue: 'draft',
      },
      // Financial summary in PENCE
      turnover:         { type: Sequelize.BIGINT, allowNull: true, defaultValue: 0 },
      grossProfit:      { type: Sequelize.BIGINT, allowNull: true, defaultValue: 0 },
      netProfit:        { type: Sequelize.BIGINT, allowNull: true, defaultValue: 0 },
      totalAssets:      { type: Sequelize.BIGINT, allowNull: true, defaultValue: 0 },
      totalLiabilities: { type: Sequelize.BIGINT, allowNull: true, defaultValue: 0 },
      netAssets:        { type: Sequelize.BIGINT, allowNull: true, defaultValue: 0 },
      submittedAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      chReceiptId: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      errorMessage: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      documentData: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'Prepared account data ready for Companies House submission',
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

    await queryInterface.addIndex('CompaniesHouseFilings', ['merchantId'], {
      name: 'ch_filings_merchant_id_idx',
    });
    await queryInterface.addIndex('CompaniesHouseFilings', ['companyNumber'], {
      name: 'ch_filings_company_number_idx',
    });
    await queryInterface.addIndex('CompaniesHouseFilings', ['filingDeadline'], {
      name: 'ch_filings_deadline_idx',
    });
    await queryInterface.addIndex('CompaniesHouseFilings', ['status'], {
      name: 'ch_filings_status_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('CompaniesHouseFilings');
  },
};
