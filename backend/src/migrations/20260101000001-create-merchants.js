'use strict';

/**
 * Merchants — one row per Shopify store that installs TaxEase UK.
 *
 * Columns:
 *   id              UUID primary key
 *   shopDomain      e.g. "my-store.myshopify.com"
 *   accessToken     Shopify OAuth access token (encrypted at rest in Phase 2)
 *   email           Store owner email
 *   plan            Subscription plan: sole_trader | small_business | growth
 *   planStatus      active | trialing | cancelled | past_due
 *   trialEndsAt     End of 30-day free trial
 *   shopifyBillingId Shopify recurring charge ID
 *   vatNumber       UK VAT registration number (VRN), nullable
 *   companyNumber   Companies House number, nullable
 *   isActive        Soft-delete flag
 *   createdAt / updatedAt
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Merchants', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      shopDomain: {
        type: Sequelize.STRING(255),
        allowNull: false,
        unique: true,
      },
      accessToken: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      email: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      plan: {
        type: Sequelize.ENUM('sole_trader', 'small_business', 'growth'),
        allowNull: false,
        defaultValue: 'sole_trader',
      },
      planStatus: {
        type: Sequelize.ENUM('trialing', 'active', 'cancelled', 'past_due'),
        allowNull: false,
        defaultValue: 'trialing',
      },
      trialEndsAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      shopifyBillingId: {
        type: Sequelize.BIGINT,
        allowNull: true,
      },
      vatNumber: {
        type: Sequelize.STRING(20),
        allowNull: true,
        comment: 'UK VAT Registration Number (VRN), e.g. GB123456789',
      },
      companyNumber: {
        type: Sequelize.STRING(20),
        allowNull: true,
        comment: 'Companies House registration number, e.g. 12345678',
      },
      isActive: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
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

    await queryInterface.addIndex('Merchants', ['shopDomain'], {
      name: 'merchants_shop_domain_idx',
      unique: true,
    });
    await queryInterface.addIndex('Merchants', ['isActive'], {
      name: 'merchants_is_active_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('Merchants');
  },
};
