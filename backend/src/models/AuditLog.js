'use strict';
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const AuditLog = sequelize.define('AuditLog', {
    id:         { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    merchantId: { type: DataTypes.UUID },
    action:     { type: DataTypes.STRING(100), allowNull: false },
    entityType: { type: DataTypes.STRING(100) },
    entityId:   { type: DataTypes.UUID },
    actorType:  { type: DataTypes.ENUM('merchant', 'system', 'webhook'), defaultValue: 'merchant' },
    ipAddress:  { type: DataTypes.STRING(45) },
    userAgent:  { type: DataTypes.TEXT },
    metadata:   { type: DataTypes.JSONB },
  }, {
    tableName: 'AuditLogs',
    timestamps: true,
    updatedAt: false,  // Audit logs are immutable
  });

  AuditLog.associate = (models) => {
    AuditLog.belongsTo(models.Merchant, { foreignKey: 'merchantId' });
  };

  return AuditLog;
};
