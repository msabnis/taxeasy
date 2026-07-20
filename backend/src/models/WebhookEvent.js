'use strict';
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const WebhookEvent = sequelize.define('WebhookEvent', {
    id:             { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    merchantId:     { type: DataTypes.UUID },
    topic:          { type: DataTypes.STRING(100), allowNull: false },
    shopifyEventId: { type: DataTypes.STRING },
    status:         { type: DataTypes.ENUM('received', 'processed', 'failed', 'skipped'), defaultValue: 'received' },
    payload:        { type: DataTypes.JSONB },
    errorMessage:   { type: DataTypes.TEXT },
    processedAt:    { type: DataTypes.DATE },
  }, { tableName: 'WebhookEvents', timestamps: true });

  WebhookEvent.associate = (models) => {
    WebhookEvent.belongsTo(models.Merchant, { foreignKey: 'merchantId' });
  };

  return WebhookEvent;
};
