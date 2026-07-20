'use strict';
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const BankAccount = sequelize.define('BankAccount', {
    id:                   { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    merchantId:           { type: DataTypes.UUID, allowNull: false },
    gocardlessAccountId:  { type: DataTypes.STRING, allowNull: false },
    requisitionId:        { type: DataTypes.STRING },
    institutionId:        { type: DataTypes.STRING },
    institutionName:      { type: DataTypes.STRING },
    accountName:          { type: DataTypes.STRING },
    iban:                 { type: DataTypes.STRING(50) },
    currency:             { type: DataTypes.STRING(3), defaultValue: 'GBP' },
    status:               { type: DataTypes.ENUM('active', 'expired', 'revoked'), defaultValue: 'active' },
    consentExpiresAt:     { type: DataTypes.DATE },
    lastSyncAt:           { type: DataTypes.DATE },
  }, { tableName: 'BankAccounts', timestamps: true });

  BankAccount.associate = (models) => {
    BankAccount.belongsTo(models.Merchant, { foreignKey: 'merchantId' });
    BankAccount.hasMany(models.Transaction, { foreignKey: 'bankAccountId', as: 'transactions' });
  };

  // Helper: check if PSD2 re-auth is needed
  BankAccount.prototype.needsReauth = function () {
    if (!this.consentExpiresAt) return false;
    const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    return this.consentExpiresAt <= sevenDaysFromNow;
  };

  return BankAccount;
};
