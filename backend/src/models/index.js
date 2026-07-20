'use strict';
const { Sequelize } = require('sequelize');
const logger = require('../utils/logger');

const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  logging: (msg) => logger.debug(msg),
  dialectOptions: {
    ssl: process.env.NODE_ENV === 'production'
      ? { require: true, rejectUnauthorized: false }
      : false,
  },
  pool: { max: 10, min: 0, acquire: 30000, idle: 10000 },
});

// Auto-load all model files
const Merchant             = require('./Merchant')(sequelize);
const HmrcToken            = require('./HmrcToken')(sequelize);
const BankAccount          = require('./BankAccount')(sequelize);
const Transaction          = require('./Transaction')(sequelize);
const VatReturn            = require('./VatReturn')(sequelize);
const CompaniesHouseFiling = require('./CompaniesHouseFiling')(sequelize);
const WebhookEvent         = require('./WebhookEvent')(sequelize);
const AuditLog             = require('./AuditLog')(sequelize);

const models = {
  Merchant,
  HmrcToken,
  BankAccount,
  Transaction,
  VatReturn,
  CompaniesHouseFiling,
  WebhookEvent,
  AuditLog,
};

// Set up associations
Object.values(models).forEach((model) => {
  if (model.associate) model.associate(models);
});

module.exports = { sequelize, Sequelize, ...models };
