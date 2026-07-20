'use strict';

/**
 * BankAccounts — GoCardless Open Banking connections per merchant.
 *
 * A merchant can connect multiple bank accounts. Each account has a
 * GoCardless account ID used to fetch transactions.
 *
 * Columns:
 *   id                  UUID primary key
 *   merchantId          FK → Merchants.id
 *   gocardlessAccountId GoCardless account ID (from requisition)
 *   requisitionId       GoCardless requisition ID
 *   institutionId       Bank identifier, e.g. "MONZO_MONZGB2L"
 *   institutionName     Human-readable bank name, e.g. "Monzo"
 *   accountName         Account name from bank, e.g. "Business Current Account"
 *   iban                IBAN if available
 *   currency            ISO 4217, e.g. "GBP"
 *   status              active | expired | revoked
 *   consentExpiresAt    PSD2 re-auth required after this date (90 days)
 *   lastSyncAt          Last successful transaction sync
 *   createdAt / updatedAt
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('BankAccounts', {
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
      gocardlessAccountId: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      requisitionId: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      institutionId: {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: 'GoCardless institution ID, e.g. MONZO_MONZGB2L',
      },
      institutionName: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      accountName: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      iban: {
        type: Sequelize.STRING(50),
        allowNull: true,
      },
      currency: {
        type: Sequelize.STRING(3),
        allowNull: false,
        defaultValue: 'GBP',
      },
      status: {
        type: Sequelize.ENUM('active', 'expired', 'revoked'),
        allowNull: false,
        defaultValue: 'active',
      },
      consentExpiresAt: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'PSD2 requires re-authentication every 90 days',
      },
      lastSyncAt: {
        type: Sequelize.DATE,
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

    await queryInterface.addIndex('BankAccounts', ['merchantId'], {
      name: 'bank_accounts_merchant_id_idx',
    });
    await queryInterface.addIndex('BankAccounts', ['status'], {
      name: 'bank_accounts_status_idx',
    });
    await queryInterface.addIndex('BankAccounts', ['consentExpiresAt'], {
      name: 'bank_accounts_consent_expires_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('BankAccounts');
  },
};
