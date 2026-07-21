const { Pool } = require('pg');
const config = require('../config');
const logger = require('../utils/logger');

const pool = new Pool({
  connectionString: config.database.url,
  ssl: config.nodeEnv === 'production' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});

pool.on('error', (err) => {
  logger.error('Unexpected database error:', err);
});

const db = {
  query: (text, params) => pool.query(text, params),

  // Merchant operations
  async getMerchant(shopifyDomain) {
    const result = await pool.query(
      'SELECT * FROM merchants WHERE shopify_domain = $1',
      [shopifyDomain]
    );
    return result.rows[0];
  },

  async upsertMerchant(data) {
    const result = await pool.query(
      `INSERT INTO merchants (shopify_domain, shop_name, email, plan, shopify_token, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       ON CONFLICT (shopify_domain)
       DO UPDATE SET shop_name = $2, email = $3, plan = $4, shopify_token = $5, updated_at = NOW()
       RETURNING *`,
      [data.shopifyDomain, data.shopName, data.email, data.plan, data.shopifyToken]
    );
    return result.rows[0];
  },

  // Order operations
  async saveOrder(order) {
    const result = await pool.query(
      `INSERT INTO orders (shopify_order_id, merchant_id, order_number, total_price,
        currency, vat_category, status, ordered_at, raw_data, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
       ON CONFLICT (shopify_order_id) DO UPDATE SET
        total_price = $4, status = $7, raw_data = $9, updated_at = NOW()
       RETURNING *`,
      [order.id, order.merchantId, order.orderNumber, order.totalPrice,
       order.currency, order.vatCategory, order.status, order.orderedAt, JSON.stringify(order.raw)]
    );
    return result.rows[0];
  },

  async getOrdersForPeriod(merchantId, startDate, endDate) {
    const result = await pool.query(
      `SELECT * FROM orders
       WHERE merchant_id = $1 AND ordered_at BETWEEN $2 AND $3
       ORDER BY ordered_at DESC`,
      [merchantId, startDate, endDate]
    );
    return result.rows;
  },

  // HMRC token storage
  async saveHmrcTokens(merchantId, tokens) {
    const result = await pool.query(
      `INSERT INTO hmrc_tokens (merchant_id, access_token, refresh_token, expires_at, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (merchant_id)
       DO UPDATE SET access_token = $2, refresh_token = $3, expires_at = $4, updated_at = NOW()
       RETURNING *`,
      [merchantId, tokens.access_token, tokens.refresh_token,
       new Date(Date.now() + tokens.expires_in * 1000)]
    );
    return result.rows[0];
  },

  // VAT return records
  async saveVatReturn(data) {
    const result = await pool.query(
      `INSERT INTO vat_returns (merchant_id, period_key, period_start, period_end,
        box1, box2, box3, box4, box5, box6, box7, box8, box9,
        hmrc_receipt, status, submitted_at, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW(),NOW())
       RETURNING *`,
      [data.merchantId, data.periodKey, data.periodStart, data.periodEnd,
       data.box1, data.box2, data.box3, data.box4, data.box5,
       data.box6, data.box7, data.box8, data.box9,
       JSON.stringify(data.hmrcReceipt), data.status]
    );
    return result.rows[0];
  },

  close: () => pool.end()
};

module.exports = db;
