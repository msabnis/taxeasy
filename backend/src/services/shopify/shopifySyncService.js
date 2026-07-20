/**
 * TaxEase UK — Shopify Sync Service
 *
 * Orchestrates the full Shopify → TaxEase transaction ingestion pipeline:
 *
 *   1. Load merchant credentials from DB
 *   2. Determine sync window (last sync timestamp or full history)
 *   3. Fetch orders from Shopify API (paginated)
 *   4. Classify each order's VAT rate(s)
 *   5. Map orders to Transaction records
 *   6. Upsert transactions into DB (idempotent via externalId)
 *   7. Fetch and process refunds
 *   8. Update merchant's lastSyncAt timestamp
 *   9. Trigger VAT engine recalculation for affected periods
 *
 * Designed to run as:
 *   - A background cron job (every 15 minutes)
 *   - A webhook handler (real-time on order events)
 *   - A manual trigger (from the dashboard)
 */

'use strict';

const { Op }                    = require('sequelize');
const { Merchant, Transaction, WebhookEvent, AuditLog, sequelize } = require('../../models');
const { createShopifyClient }   = require('./shopifyClient');
const { mapOrderToTransactions, mapRefundToTransaction } = require('./orderMapper');
const { prepareVatReturn, calculateDueDate } = require('../vatEngine');
const logger                    = require('../../utils/logger');

// ── Sync Result Schema ────────────────────────────────────────────────────────
function createSyncResult() {
  return {
    merchantId:          null,
    startedAt:           new Date().toISOString(),
    completedAt:         null,
    ordersProcessed:     0,
    transactionsCreated: 0,
    transactionsUpdated: 0,
    refundsProcessed:    0,
    errors:              [],
    skipped:             0,
  };
}

// ── Main Sync Function ────────────────────────────────────────────────────────

/**
 * Run a full sync for a single merchant.
 *
 * @param {string}  merchantId  - TaxEase merchant UUID
 * @param {Object}  options
 * @param {boolean} options.fullSync    - If true, sync all history (ignores lastSyncAt)
 * @param {string}  options.sinceDate   - Override sync start date 'YYYY-MM-DD'
 * @param {boolean} options.dryRun      - If true, calculate but don't write to DB
 * @returns {Object} SyncResult
 */
async function syncMerchant(merchantId, options = {}) {
  const result = createSyncResult();
  result.merchantId = merchantId;

  logger.info(`Shopify Sync: starting for merchant ${merchantId}`, options);

  // ── Load merchant ─────────────────────────────────────────────────────────
  const merchant = await Merchant.findByPk(merchantId);
  if (!merchant) {
    result.errors.push(`Merchant ${merchantId} not found`);
    return result;
  }
  if (!merchant.accessToken) {
    result.errors.push('Merchant has no Shopify access token');
    return result;
  }
  if (!merchant.isActive) {
    result.errors.push('Merchant is inactive');
    return result;
  }

  // ── Determine sync window ─────────────────────────────────────────────────
  let sinceDate;
  if (options.sinceDate) {
    sinceDate = options.sinceDate;
  } else if (options.fullSync) {
    // Full history — Shopify stores orders for 60 days on basic plans
    sinceDate = '2020-01-01T00:00:00Z';
  } else {
    // Incremental — since last sync (or 30 days ago if never synced)
    const lastSync = await getLastSyncDate(merchantId);
    sinceDate = lastSync || getDefaultSinceDate();
  }

  logger.info(`Shopify Sync: syncing since ${sinceDate}`);

  // ── Create Shopify client ─────────────────────────────────────────────────
  const shopify = createShopifyClient(merchant.shopDomain, merchant.accessToken);

  // Verify token is still valid
  const tokenValid = await shopify.verifyToken();
  if (!tokenValid) {
    result.errors.push('Shopify access token is invalid or expired — merchant needs to reinstall');
    await logAudit(merchantId, 'shopify_sync.token_invalid', null, null, { merchantId });
    return result;
  }

  // ── Fetch and process orders ──────────────────────────────────────────────
  try {
    await shopify.getAllOrdersSince(sinceDate, async (orderBatch) => {
      await processBatch(orderBatch, merchant, result, options.dryRun);
    });
  } catch (err) {
    logger.error(`Shopify Sync: error fetching orders for ${merchantId}:`, err.message);
    result.errors.push(`Order fetch error: ${err.message}`);
  }

  // ── Update last sync timestamp ────────────────────────────────────────────
  if (!options.dryRun && result.errors.length === 0) {
    await updateLastSyncDate(merchantId);
  }

  result.completedAt = new Date().toISOString();

  logger.info(`Shopify Sync: completed for ${merchantId}`, {
    ordersProcessed:     result.ordersProcessed,
    transactionsCreated: result.transactionsCreated,
    transactionsUpdated: result.transactionsUpdated,
    refundsProcessed:    result.refundsProcessed,
    errors:              result.errors.length,
  });

  // ── Audit log ─────────────────────────────────────────────────────────────
  await logAudit(merchantId, 'shopify_sync.completed', null, null, {
    ordersProcessed:     result.ordersProcessed,
    transactionsCreated: result.transactionsCreated,
    errors:              result.errors.length,
  });

  return result;
}

/**
 * Process a single Shopify order (called from webhook handler).
 * Idempotent — safe to call multiple times for the same order.
 *
 * @param {Object} order      - Shopify order object
 * @param {string} merchantId - TaxEase merchant UUID
 * @param {string} eventTopic - Shopify webhook topic (for audit)
 * @returns {Object} { created, updated, transactions }
 */
async function processSingleOrder(order, merchantId, eventTopic = 'orders/create') {
  logger.info(`Shopify Sync: processing single order #${order.order_number} for merchant ${merchantId}`);

  const merchant = await Merchant.findByPk(merchantId);
  if (!merchant) throw new Error(`Merchant ${merchantId} not found`);

  const result = { created: 0, updated: 0, transactions: [] };
  const dummyResult = createSyncResult();
  dummyResult.merchantId = merchantId;

  await processOrder(order, merchant, dummyResult, false);

  result.created       = dummyResult.transactionsCreated;
  result.updated       = dummyResult.transactionsUpdated;
  result.transactions  = dummyResult._lastTransactions || [];

  return result;
}

/**
 * Run sync for ALL active merchants (used by cron job).
 * @param {Object} options - Same as syncMerchant options
 * @returns {Array} Array of SyncResult objects
 */
async function syncAllMerchants(options = {}) {
  const merchants = await Merchant.findAll({
    where: { isActive: true, accessToken: { [Op.ne]: null } },
    attributes: ['id', 'shopDomain'],
  });

  logger.info(`Shopify Sync: running for ${merchants.length} active merchants`);

  const results = [];
  for (const merchant of merchants) {
    try {
      const result = await syncMerchant(merchant.id, options);
      results.push(result);
    } catch (err) {
      logger.error(`Shopify Sync: unhandled error for merchant ${merchant.id}:`, err.message);
      results.push({ merchantId: merchant.id, error: err.message });
    }
    // Brief pause between merchants to avoid hammering Shopify
    await sleep(200);
  }

  return results;
}

// ── Batch Processing ──────────────────────────────────────────────────────────

async function processBatch(orders, merchant, result, dryRun) {
  for (const order of orders) {
    try {
      await processOrder(order, merchant, result, dryRun);
    } catch (err) {
      logger.error(`Shopify Sync: error processing order ${order.id}:`, err.message);
      result.errors.push(`Order ${order.id}: ${err.message}`);
    }
  }
}

async function processOrder(order, merchant, result, dryRun) {
  // Skip cancelled or unpaid orders
  if (order.financial_status !== 'paid' && order.financial_status !== 'partially_paid') {
    result.skipped++;
    return;
  }

  result.ordersProcessed++;

  // Map order to transaction(s)
  const txRecords = mapOrderToTransactions(order, merchant.id);

  for (const txData of txRecords) {
    if (!dryRun) {
      const { created, updated } = await upsertTransaction(txData);
      if (created) result.transactionsCreated++;
      if (updated) result.transactionsUpdated++;
    } else {
      result.transactionsCreated++;  // Count as would-be created in dry run
    }
  }

  // Process refunds attached to this order
  if (order.refunds && order.refunds.length > 0) {
    for (const refund of order.refunds) {
      const refundTx = mapRefundToTransaction(refund, order, merchant.id);
      if (refundTx) {
        if (!dryRun) {
          const { created, updated } = await upsertTransaction(refundTx);
          if (created || updated) result.refundsProcessed++;
        } else {
          result.refundsProcessed++;
        }
      }
    }
  }

  // Store last transactions for single-order processing
  result._lastTransactions = txRecords;
}

// ── Transaction Upsert ────────────────────────────────────────────────────────

/**
 * Insert or update a transaction record.
 * Uses externalId as the idempotency key.
 * @returns {{ created: boolean, updated: boolean, transaction: Object }}
 */
async function upsertTransaction(txData) {
  const existing = await Transaction.findOne({
    where: {
      merchantId: txData.merchantId,
      externalId: txData.externalId,
      source:     txData.source,
    },
  });

  if (existing) {
    // Update if amounts changed (e.g. order edited in Shopify)
    const changed = (
      existing.grossAmount !== txData.grossAmount ||
      existing.vatAmount   !== txData.vatAmount   ||
      existing.vatRate     !== txData.vatRate
    );
    if (changed) {
      await existing.update(txData);
      return { created: false, updated: true, transaction: existing };
    }
    return { created: false, updated: false, transaction: existing };
  }

  const transaction = await Transaction.create(txData);
  return { created: true, updated: false, transaction };
}

// ── Sync State Management ─────────────────────────────────────────────────────

async function getLastSyncDate(merchantId) {
  // Find the most recent Shopify transaction for this merchant
  const latest = await Transaction.findOne({
    where: { merchantId, source: 'shopify' },
    order: [['createdAt', 'DESC']],
    attributes: ['createdAt'],
  });
  if (!latest) return null;
  // Subtract 1 hour to catch any orders that arrived during the last sync
  const d = new Date(latest.createdAt);
  d.setHours(d.getHours() - 1);
  return d.toISOString();
}

async function updateLastSyncDate(merchantId) {
  await Merchant.update(
    { updatedAt: new Date() },
    { where: { id: merchantId } }
  );
}

function getDefaultSinceDate() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString();
}

// ── Audit Logging ─────────────────────────────────────────────────────────────

async function logAudit(merchantId, action, entityType, entityId, metadata) {
  try {
    await AuditLog.create({
      merchantId,
      action,
      entityType,
      entityId,
      actorType: 'system',
      metadata,
    });
  } catch (err) {
    logger.warn('Audit log write failed:', err.message);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  syncMerchant,
  syncAllMerchants,
  processSingleOrder,
};
