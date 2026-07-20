'use strict';

/**
 * AuditLog — immutable record of all significant actions.
 *
 * Required for HMRC compliance and security auditing.
 * Records who did what, when, and from where.
 *
 * Columns:
 *   id          UUID primary key
 *   merchantId  FK → Merchants.id
 *   action      Action performed, e.g. "vat_return.submitted"
 *   entityType  Type of entity affected, e.g. "VatReturn"
 *   entityId    UUID of the affected entity
 *   actorType   merchant | system | webhook
 *   ipAddress   IP address of the request
 *   userAgent   Browser/client user agent
 *   metadata    JSONB — additional context (e.g. VRN, period key)
 *   createdAt   Immutable timestamp (no updatedAt — audit logs never change)
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('AuditLogs', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      merchantId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'Merchants', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      action: {
        type: Sequelize.STRING(100),
        allowNull: false,
        comment: 'e.g. vat_return.submitted, bank_account.connected, merchant.plan_changed',
      },
      entityType: {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: 'e.g. VatReturn, BankAccount, Merchant',
      },
      entityId: {
        type: Sequelize.UUID,
        allowNull: true,
      },
      actorType: {
        type: Sequelize.ENUM('merchant', 'system', 'webhook'),
        allowNull: false,
        defaultValue: 'merchant',
      },
      ipAddress: {
        type: Sequelize.STRING(45),
        allowNull: true,
        comment: 'IPv4 or IPv6 address',
      },
      userAgent: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'Additional context, e.g. { vrn, periodKey, amount }',
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
    });

    await queryInterface.addIndex('AuditLogs', ['merchantId'], {
      name: 'audit_logs_merchant_id_idx',
    });
    await queryInterface.addIndex('AuditLogs', ['action'], {
      name: 'audit_logs_action_idx',
    });
    await queryInterface.addIndex('AuditLogs', ['entityType', 'entityId'], {
      name: 'audit_logs_entity_idx',
    });
    await queryInterface.addIndex('AuditLogs', ['createdAt'], {
      name: 'audit_logs_created_at_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('AuditLogs');
  },
};
