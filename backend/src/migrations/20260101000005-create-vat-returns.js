'use strict';

/**
 * VatReturns — HMRC MTD VAT return records.
 *
 * Each row represents one VAT return period for a merchant.
 * The 9-box values are stored as integers (pence) matching HMRC's format.
 *
 * HMRC 9-Box Reference:
 *   box1  — VAT due on sales and other outputs
 *   box2  — VAT due on acquisitions from EC (post-Brexit: usually 0)
 *   box3  — Total VAT due (box1 + box2)
 *   box4  — VAT reclaimed on purchases and other inputs
 *   box5  — Net VAT to pay/reclaim (box3 - box4)
 *   box6  — Total value of sales and outputs (ex-VAT)
 *   box7  — Total value of purchases and inputs (ex-VAT)
 *   box8  — Total value of EC supplies (post-Brexit: usually 0)
 *   box9  — Total value of EC acquisitions (post-Brexit: usually 0)
 *
 * Columns:
 *   id              UUID primary key
 *   merchantId      FK → Merchants.id
 *   periodKey       HMRC period key, e.g. "24AA" (year + quarter)
 *   periodStart     Start date of VAT period
 *   periodEnd       End date of VAT period
 *   dueDate         HMRC filing deadline
 *   status          draft | prepared | submitted | accepted | rejected
 *   box1..box9      9-box values in PENCE
 *   isPayable       true if merchant owes HMRC, false if reclaiming
 *   submittedAt     When successfully submitted to HMRC
 *   hmrcReceiptId   HMRC confirmation receipt ID
 *   hmrcCorrelationId HMRC correlation ID for support queries
 *   errorMessage    HMRC rejection reason if status = rejected
 *   rawResponse     JSONB — full HMRC API response
 *   createdAt / updatedAt
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('VatReturns', {
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
      periodKey: {
        type: Sequelize.STRING(10),
        allowNull: false,
        comment: 'HMRC period key, e.g. 24AA for Q1 2024',
      },
      periodStart: {
        type: Sequelize.DATEONLY,
        allowNull: false,
      },
      periodEnd: {
        type: Sequelize.DATEONLY,
        allowNull: false,
      },
      dueDate: {
        type: Sequelize.DATEONLY,
        allowNull: true,
        comment: 'HMRC filing deadline (period end + 1 month + 7 days)',
      },
      status: {
        type: Sequelize.ENUM('draft', 'prepared', 'submitted', 'accepted', 'rejected'),
        allowNull: false,
        defaultValue: 'draft',
      },
      // 9-box values stored in PENCE
      box1: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      box2: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      box3: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      box4: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      box5: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      box6: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      box7: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      box8: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      box9: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      isPayable: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: 'true = merchant owes HMRC; false = merchant is reclaiming',
      },
      submittedAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      hmrcReceiptId: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      hmrcCorrelationId: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      errorMessage: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      rawResponse: {
        type: Sequelize.JSONB,
        allowNull: true,
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

    await queryInterface.addIndex('VatReturns', ['merchantId', 'periodKey'], {
      name: 'vat_returns_merchant_period_idx',
      unique: true,
    });
    await queryInterface.addIndex('VatReturns', ['merchantId', 'status'], {
      name: 'vat_returns_merchant_status_idx',
    });
    await queryInterface.addIndex('VatReturns', ['dueDate'], {
      name: 'vat_returns_due_date_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('VatReturns');
  },
};
