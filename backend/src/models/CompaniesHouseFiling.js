'use strict';
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const CompaniesHouseFiling = sequelize.define('CompaniesHouseFiling', {
    id:                    { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    merchantId:            { type: DataTypes.UUID, allowNull: false },
    companyNumber:         { type: DataTypes.STRING(20), allowNull: false },
    filingType:            { type: DataTypes.ENUM('annual_accounts', 'confirmation_statement'), defaultValue: 'annual_accounts' },
    accountType:           { type: DataTypes.ENUM('micro_entity', 'small_company', 'dormant', 'full'), defaultValue: 'micro_entity' },
    accountingPeriodStart: { type: DataTypes.DATEONLY, allowNull: false },
    accountingPeriodEnd:   { type: DataTypes.DATEONLY, allowNull: false },
    filingDeadline:        { type: DataTypes.DATEONLY },
    status:                { type: DataTypes.ENUM('draft', 'prepared', 'submitted', 'accepted', 'rejected', 'overdue'), defaultValue: 'draft' },
    turnover:              { type: DataTypes.BIGINT, defaultValue: 0 },
    grossProfit:           { type: DataTypes.BIGINT, defaultValue: 0 },
    netProfit:             { type: DataTypes.BIGINT, defaultValue: 0 },
    totalAssets:           { type: DataTypes.BIGINT, defaultValue: 0 },
    totalLiabilities:      { type: DataTypes.BIGINT, defaultValue: 0 },
    netAssets:             { type: DataTypes.BIGINT, defaultValue: 0 },
    submittedAt:           { type: DataTypes.DATE },
    chReceiptId:           { type: DataTypes.STRING },
    errorMessage:          { type: DataTypes.TEXT },
    documentData:          { type: DataTypes.JSONB },
  }, { tableName: 'CompaniesHouseFilings', timestamps: true });

  CompaniesHouseFiling.associate = (models) => {
    CompaniesHouseFiling.belongsTo(models.Merchant, { foreignKey: 'merchantId' });
  };

  return CompaniesHouseFiling;
};
