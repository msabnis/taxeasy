'use strict';

/**
 * HmrcTokens — stores HMRC MTD OAuth2 tokens per merchant.
 *
 * HMRC tokens expire and must be refreshed using the refresh_token.
 * One merchant can have one active HMRC token record.
 *
 * Columns:
 *   id              UUID primary key
 *   merchantId      FK → Merchants.id
 *   accessToken     HMRC OAuth2 access token (short-lived, ~4 hours)
 *   refreshToken    HMRC OAuth2 refresh token (long-lived)
 *   tokenType       Usually "Bearer"
 *   expiresAt       When the access token expires
 *   scope           Space-separated scopes granted, e.g. "read:vat write:vat"
 *   createdAt / updatedAt
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('HmrcTokens', {
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
      accessToken: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      refreshToken: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      tokenType: {
        type: Sequelize.STRING(50),
        allowNull: false,
        defaultValue: 'Bearer',
      },
      expiresAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      scope: {
        type: Sequelize.TEXT,
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

    await queryInterface.addIndex('HmrcTokens', ['merchantId'], {
      name: 'hmrc_tokens_merchant_id_idx',
    });
    await queryInterface.addIndex('HmrcTokens', ['expiresAt'], {
      name: 'hmrc_tokens_expires_at_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('HmrcTokens');
  },
};
