'use strict';
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Merchant = sequelize.define('Merchant', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    shopDomain:        { type: DataTypes.STRING, allowNull: false, unique: true },
    accessToken:       { type: DataTypes.TEXT },
    email:             { type: DataTypes.STRING },
    plan:              { type: DataTypes.ENUM('sole_trader', 'small_business', 'growth'), defaultValue: 'sole_trader' },
    planStatus:        { type: DataTypes.ENUM('trialing', 'active', 'cancelled', 'past_due'), defaultValue: 'trialing' },
    trialEndsAt:       { type: DataTypes.DATE },
    shopifyBillingId:  { type: DataTypes.BIGINT },
    vatNumber:         { type: DataTypes.STRING(20) },
    companyNumber:     { type: DataTypes.STRING(20) },
    isActive:          { type: DataTypes.BOOLEAN, defaultValue: true },
  }, {
    tableName: 'Merchants',
    timestamps: true,
  });

  Merchant.associate = (models) => {
    Merchant.hasMany(models.HmrcToken,              { foreignKey: 'merchantId', as: 'hmrcTokens' });
    Merchant.hasMany(models.BankAccount,            { foreignKey: 'merchantId', as: 'bankAccounts' });
    Merchant.hasMany(models.Transaction,            { foreignKey: 'merchantId', as: 'transactions' });
    Merchant.hasMany(models.VatReturn,              { foreignKey: 'merchantId', as: 'vatReturns' });
    Merchant.hasMany(models.CompaniesHouseFiling,   { foreignKey: 'merchantId', as: 'chFilings' });
    Merchant.hasMany(models.WebhookEvent,           { foreignKey: 'merchantId', as: 'webhookEvents' });
    Merchant.hasMany(models.AuditLog,               { foreignKey: 'merchantId', as: 'auditLogs' });
  };

  return Merchant;
};
