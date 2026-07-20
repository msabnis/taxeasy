'use strict';

require('dotenv').config();
const app    = require('./app');
const { sequelize } = require('./models');
const logger = require('./utils/logger');

const PORT = process.env.PORT || 3001;

async function startServer() {
  try {
    await sequelize.authenticate();
    logger.info('Database connection established successfully.');

    app.listen(PORT, () => {
      logger.info(`TaxEase UK server running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV}`);
    });

    // Start background jobs (only in non-test environments)
    if (process.env.NODE_ENV !== 'test') {
      const shopifySyncJob = require('./jobs/shopifySyncJob');
      shopifySyncJob.start();
      logger.info('Background jobs started.');
    }
  } catch (error) {
    logger.error('Unable to start server:', error);
    process.exit(1);
  }
}

startServer();
