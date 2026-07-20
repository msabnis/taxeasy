'use strict';
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const VatReturn = sequelize.define('VatReturn', {
    id:                 { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    merchantId:         { type: DataTypes.UUID, allowNull: false },
    periodKey:          { type: DataTypes.STRING(10), allowNull: false },
    periodStart:        { type: DataTypes.DATEONLY, allowNull: false },
    periodEnd:          { type: DataTypes.DATEONLY, allowNull: false },
    dueDate:            { type: DataTypes.DATEONLY },
    status:             { type: DataTypes.ENUM('draft', 'prepared', 'submitted', 'accepted', 'rejected'), defaultValue: 'draft' },
    box1:               { type: DataTypes.INTEGER, defaultValue: 0 },
    box2:               { type: DataTypes.INTEGER, defaultValue: 0 },
    box3:               { type: DataTypes.INTEGER, defaultValue: 0 },
    box4:               { type: DataTypes.INTEGER, defaultValue: 0 },
    box5:               { type: DataTypes.INTEGER, defaultValue: 0 },
    box6:               { type: DataTypes.INTEGER, defaultValue: 0 },
    box7:               { type: DataTypes.INTEGER, defaultValue: 0 },
    box8:               { type: DataTypes.INTEGER, defaultValue: 0 },
    box9:               { type: DataTypes.INTEGER, defaultValue: 0 },
    isPayable:          { type: DataTypes.BOOLEAN, defaultValue: true },
    submittedAt:        { type: DataTypes.DATE },
    hmrcReceiptId:      { type: DataTypes.STRING },
    hmrcCorrelationId:  { type: DataTypes.STRING },
    errorMessage:       { type: DataTypes.TEXT },
    rawResponse:        { type: DataTypes.JSONB },
  }, { tableName: 'VatReturns', timestamps: true });

  VatReturn.associate = (models) => {
    VatReturn.belongsTo(models.Merchant, { foreignKey: 'merchantId' });
  };

  // Helper: format for HMRC API submission (converts pence to pounds)
  VatReturn.prototype.toHmrcPayload = function () {
    return {
      periodKey:                    this.periodKey,
      vatDueSales:                  this.box1 / 100,
      vatDueAcquisitions:           this.box2 / 100,
      totalVatDue:                  this.box3 / 100,
      vatReclaimedCurrPeriod:       this.box4 / 100,
      netVatDue:                    this.box5 / 100,
      totalValueSalesExVAT:         Math.round(this.box6 / 100),
      totalValuePurchasesExVAT:     Math.round(this.box7 / 100),
      totalValueGoodsSuppliedExVAT: Math.round(this.box8 / 100),
      totalAcquisitionsExVAT:       Math.round(this.box9 / 100),
      finalised: true,
    };
  };

  return VatReturn;
};
