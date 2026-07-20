/**
 * TaxEase UK — Shopify Sync Cron Job
 *
 * Runs every 15 minutes to pull new orders from all active merchants.
 * Uses node-cron for scheduling.
 *
 * Schedule: every 15 minutes (cron: star-slash-15 star star star star)
 *
 * To run manually:
 *   node -e "require('./src/jobs/shopifySyncJob').runNow()"
 */

'use strict';

const cron   = require('node-cron');
const logger = require('../utils/logger');
const { syncAllMerchants } = require('../services/shopify/shopifySyncService');

let isRunning = false;

/**
 * Execute the sync job immediately (used for manual triggers and testing).
 * @param {Object} options - Passed to syncAllMerchants
 */
async function runNow(options = {}) {
  if (isRunning) {
    logger.warn('Shopify Sync Job: already running, skipping');
    return;
  }

  isRunning = true;
  const startTime = Date.now();
  logger.info('Shopify Sync Job: starting');

  try {
    const results = await syncAllMerchants(options);

    const totalOrders  = results.reduce((s, r) => s + (r.ordersProcessed     || 0), 0);
    const totalCreated = results.reduce((s, r) => s + (r.transactionsCreated || 0), 0);
    const totalErrors  = results.reduce((s, r) => s + (r.errors?.length      || 0), 0);
    const duration     = ((Date.now() - startTime) / 1000).toFixed(1);

    logger.info(`Shopify Sync Job: completed in ${duration}s`, {
      merchants:    results.length,
      totalOrders,
      totalCreated,
      totalErrors,
    });

    return results;
  } catch (err) {
    logger.error('Shopify Sync Job: unhandled error:', err.message);
    throw err;
  } finally {
    isRunning = false;
  }
}

/**
 * Start the cron scheduler.
 * Call this from server.js after the DB connection is established.
 */
function start() {
  logger.info('Shopify Sync Job: scheduler started (every 15 minutes)');

  // Run every 15 minutes
  cron.schedule('*/15 * * * *', async () => {
    try {
      await runNow();
    } catch (err) {
      logger.error('Shopify Sync Job: cron execution error:', err.message);
    }
  });

  // Also run once on startup (after a short delay to let DB settle)
  setTimeout(() => {
    runNow().catch(err => logger.error('Shopify Sync Job: startup run error:', err.message));
  }, 5000);
}

module.exports = { start, runNow };
