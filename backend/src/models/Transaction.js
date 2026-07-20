'use strict';
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Transaction = sequelize.define('Transaction', {
    id:            { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    merchantId:    { type: DataTypes.UUID, allowNull: false },
    bankAccountId: { type: DataTypes.UUID },
    source:        { type: DataTypes.ENUM('shopify', 'bank_feed', 'csv_upload', 'manual'), allowNull: false },
    type:          { type: DataTypes.ENUM('sale', 'purchase', 'refund', 'transfer', 'fee'), allowNull: false },
    externalId:    { type: DataTypes.STRING },
    date:          { type: DataTypes.DATEONLY, allowNull: false },
    description:   { type: DataTypes.TEXT },
    grossAmount:   { type: DataTypes.INTEGER, allowNull: false, comment: 'In pence' },
    netAmount:     { type: DataTypes.INTEGER, allowNull: false, comment: 'In pence' },
    vatAmount:     { type: DataTypes.INTEGER, defaultValue: 0, comment: 'In pence' },
    vatRate:       { type: DataTypes.ENUM('standard', 'reduced', 'zero', 'exempt'), defaultValue: 'standard' },
    currency:      { type: DataTypes.STRING(3), defaultValue: 'GBP' },
    category:      { type: DataTypes.ENUM('sales', 'cost_of_goods', 'operating_expense', 'payroll', 'tax_payment', 'bank_charge', 'transfer', 'other') },
    isReconciled:  { type: DataTypes.BOOLEAN, defaultValue: false },
    notes:         { type: DataTypes.TEXT },
    rawData:       { type: DataTypes.JSONB },
  }, { tableName: 'Transactions', timestamps: true });

  Transaction.associate = (models) => {
    Transaction.belongsTo(models.Merchant,    { foreignKey: 'merchantId' });
    Transaction.belongsTo(models.BankAccount, { foreignKey: 'bankAccountId' });
  };

  // Helper: convert pence to pounds for display
  Transaction.prototype.toGBP = function () {
    return {
      gross: (this.grossAmount / 100).toFixed(2),
      net:   (this.netAmount   / 100).toFixed(2),
      vat:   (this.vatAmount   / 100).toFixed(2),
    };
  };

  return Transaction;
};
