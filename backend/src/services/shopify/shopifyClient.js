/**
 * TaxEase UK — Shopify API Client
 *
 * Handles all communication with the Shopify Admin REST API.
 * Implements pagination, rate limiting, and retry logic.
 *
 * Shopify rate limits:
 *   REST API: 2 requests/second (leaky bucket, 40 burst)
 *   GraphQL: 50 cost units/second
 *
 * We use REST for order fetching (simpler pagination).
 */

'use strict';

const axios  = require('axios');
const logger = require('../../utils/logger');

const SHOPIFY_API_VERSION = '2024-01';
const MAX_RETRIES         = 3;
const RETRY_DELAY_MS      = 1000;
const PAGE_SIZE           = 250;  // Shopify max per page

/**
 * Create a Shopify API client for a specific merchant.
 * @param {string} shopDomain  - e.g. "my-store.myshopify.com"
 * @param {string} accessToken - Shopify OAuth access token
 * @returns {Object} client with methods
 */
function createShopifyClient(shopDomain, accessToken) {
  const baseURL = `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}`;
  const client  = axios.create({
    baseURL,
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json',
    },
    timeout: 30000,
  });

  // ── Retry interceptor ─────────────────────────────────────────────────────
  client.interceptors.response.use(null, async (error) => {
    const config = error.config;
    config._retryCount = config._retryCount || 0;

    // Retry on 429 (rate limit) or 5xx (server error)
    const shouldRetry = (
      config._retryCount < MAX_RETRIES &&
      (error.response?.status === 429 || (error.response?.status >= 500))
    );

    if (!shouldRetry) return Promise.reject(error);

    config._retryCount++;
    const delay = error.response?.status === 429
      ? parseInt(error.response.headers['retry-after'] || '2', 10) * 1000
      : RETRY_DELAY_MS * config._retryCount;

    logger.warn(`Shopify API retry ${config._retryCount}/${MAX_RETRIES} after ${delay}ms — ${config.url}`);
    await sleep(delay);
    return client(config);
  });

  return {
    /**
     * Fetch a single page of orders.
     * @param {Object} params - Query params (status, created_at_min, limit, page_info)
     * @returns {{ orders: Array, nextPageInfo: string|null }}
     */
    async getOrdersPage(params = {}) {
      const response = await client.get('/orders.json', {
        params: {
          limit:            PAGE_SIZE,
          status:           'any',
          financial_status: 'paid',
          ...params,
        },
      });

      // Extract cursor-based pagination link
      const linkHeader  = response.headers['link'] || '';
      const nextPageInfo = extractNextPageInfo(linkHeader);

      return {
        orders:       response.data.orders || [],
        nextPageInfo,
      };
    },

    /**
     * Fetch ALL orders since a given date, handling pagination automatically.
     * @param {string} sinceDate - ISO date string 'YYYY-MM-DD' or full ISO timestamp
     * @param {Function} onBatch - Callback called with each batch of orders
     * @returns {number} Total orders fetched
     */
    async getAllOrdersSince(sinceDate, onBatch) {
      let totalFetched = 0;
      let pageInfo     = null;
      let isFirstPage  = true;

      logger.info(`Shopify: fetching all orders since ${sinceDate}`);

      do {
        const params = pageInfo
          ? { page_info: pageInfo }                          // Cursor pagination
          : { created_at_min: sinceDate, order: 'created_at asc' }; // First page

        const { orders, nextPageInfo } = await this.getOrdersPage(params);

        if (orders.length > 0) {
          await onBatch(orders);
          totalFetched += orders.length;
          logger.debug(`Shopify: fetched ${orders.length} orders (total: ${totalFetched})`);
        }

        pageInfo    = nextPageInfo;
        isFirstPage = false;

        // Respect rate limit between pages
        if (pageInfo) await sleep(500);

      } while (pageInfo);

      logger.info(`Shopify: completed — ${totalFetched} orders fetched`);
      return totalFetched;
    },

    /**
     * Fetch a single order by ID.
     * @param {string|number} orderId
     * @returns {Object} Shopify order
     */
    async getOrder(orderId) {
      const response = await client.get(`/orders/${orderId}.json`);
      return response.data.order;
    },

    /**
     * Fetch refunds for an order.
     * @param {string|number} orderId
     * @returns {Array} Refund objects
     */
    async getOrderRefunds(orderId) {
      const response = await client.get(`/orders/${orderId}/refunds.json`);
      return response.data.refunds || [];
    },

    /**
     * Fetch shop metadata (currency, timezone, etc.)
     * @returns {Object} Shop object
     */
    async getShop() {
      const response = await client.get('/shop.json');
      return response.data.shop;
    },

    /**
     * Verify the access token is still valid.
     * @returns {boolean}
     */
    async verifyToken() {
      try {
        await client.get('/shop.json');
        return true;
      } catch (err) {
        return false;
      }
    },
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Extract the next page_info cursor from Shopify's Link header.
 * Format: <https://...?page_info=xxx>; rel="next"
 */
function extractNextPageInfo(linkHeader) {
  if (!linkHeader) return null;
  const match = linkHeader.match(/<[^>]*[?&]page_info=([^&>]+)[^>]*>;\s*rel="next"/);
  return match ? match[1] : null;
}

module.exports = { createShopifyClient };
