'use strict';

/**
 * WebhookEvents — audit log of all incoming Shopify webhooks.
 *
 * Every webhook received is logged here before processing.
 * This enables replay, debugging, and idempotency checks.
 *
 * Columns:
 *   id              UUID primary key
 *   merchantId      FK → Merchants.id (null if merchant not yet identified)
 *   topic           Shopify webhook topic, e.g. "orders/create"
 *   shopifyEventId  X-Shopify-Webhook-Id header value (for idempotency)
 *   status          received | processed | failed | skipped
 *   payload         JSONB — raw webhook body
 *   errorMessage    Processing error if status = failed
 *   processedAt     When processing completed
 *   createdAt / updatedAt
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('WebhookEvents', {
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
      topic: {
        type: Sequelize.STRING(100),
        allowNull: false,
        comment: 'Shopify webhook topic, e.g. orders/create',
      },
      shopifyEventId: {
        type: Sequelize.STRING(255),
        allowNull: true,
        comment: 'X-Shopify-Webhook-Id for idempotency checks',
      },
      status: {
        type: Sequelize.ENUM('received', 'processed', 'failed', 'skipped'),
        allowNull: false,
        defaultValue: 'received',
      },
      payload: {
        type: Sequelize.JSONB,
        allowNull: true,
      },
      errorMessage: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      processedAt: {
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

    await queryInterface.addIndex('WebhookEvents', ['merchantId'], {
      name: 'webhook_events_merchant_id_idx',
    });
    await queryInterface.addIndex('WebhookEvents', ['topic'], {
      name: 'webhook_events_topic_idx',
    });
    await queryInterface.addIndex('WebhookEvents', ['shopifyEventId'], {
      name: 'webhook_events_shopify_event_id_idx',
      unique: true,
      where: { shopifyEventId: { [Symbol.for('ne')]: null } },
    });
    await queryInterface.addIndex('WebhookEvents', ['status'], {
      name: 'webhook_events_status_idx',
    });
    await queryInterface.addIndex('WebhookEvents', ['createdAt'], {
      name: 'webhook_events_created_at_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('WebhookEvents');
  },
};
