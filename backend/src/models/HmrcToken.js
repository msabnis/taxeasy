'use strict';
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const HmrcToken = sequelize.define('HmrcToken', {
    id:           { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    merchantId:   { type: DataTypes.UUID, allowNull: false },
    accessToken:  { type: DataTypes.TEXT, allowNull: false },
    refreshToken: { type: DataTypes.TEXT },
    tokenType:    { type: DataTypes.STRING(50), defaultValue: 'Bearer' },
    expiresAt:    { type: DataTypes.DATE, allowNull: false },
    scope:        { type: DataTypes.TEXT },
  }, { tableName: 'HmrcTokens', timestamps: true });

  HmrcToken.associate = (models) => {
    HmrcToken.belongsTo(models.Merchant, { foreignKey: 'merchantId' });
  };

  // Helper: check if token needs refresh (expires within 5 minutes)
  HmrcToken.prototype.isExpired = function () {
    return new Date() >= new Date(this.expiresAt.getTime() - 5 * 60 * 1000);
  };

  return HmrcToken;
};
