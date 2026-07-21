const axios = require('axios');
const crypto = require('crypto');
const config = require('../config');
const logger = require('../utils/logger');
const { ShopifyError } = require('../middleware/errorHandler');

class ShopifyService {
  verifyHmac(query, secret) {
    const { hmac, ...rest } = query;
    const sortedParams = Object.keys(rest)
      .sort()
      .map((key) => `${key}=${rest[key]}`)
      .join('&');
    const computed = crypto
      .createHmac('sha256', secret)
      .update(sortedParams)
      .digest('hex');
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(hmac));
  }

  verifyWebhookHmac(body, hmac, secret) {
    const computed = crypto
      .createHmac('sha256', secret)
      .update(body)
      .digest('base64');
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(hmac));
  }

  async exchangeCodeForToken(shop, code) {
    try {
      const resp = await axios.post(`https://${shop}/admin/oauth/access_token`, {
        client_id: config.shopify.apiKey,
        client_secret: config.shopify.apiSecret,
        code
      });
      return resp.data.access_token;
    } catch (error) {
      throw new ShopifyError('Failed to exchange OAuth code: ' + error.message);
    }
  }

  async registerWebhooks(shop, accessToken) {
    const topics = ['orders/create', 'orders/updated', 'orders/delete', 'app/uninstalled'];
    const client = this.getClient(shop, accessToken);
    for (const topic of topics) {
      try {
        await client.post('/admin/api/2024-01/webhooks.json', {
          webhook: {
            topic,
            address: `${config.shopify.appUrl}/api/shopify/webhooks/${topic.replace('/', '-')}`,
            format: 'json'
          }
        });
        logger.info(`Webhook registered: ${topic} for ${shop}`);
      } catch (err) {
        logger.warn(`Webhook registration failed for ${topic}: ${err.message}`);
      }
    }
  }

  async handleWebhook(topic, data) {
    logger.info(`Processing webhook: ${topic}`);
    switch (topic) {
      case 'orders-create':
      case 'orders-updated':
        await this.syncOrder(data);
        break;
      case 'orders-delete':
        await this.removeOrder(data.id);
        break;
      case 'app-uninstalled':
        await this.handleUninstall(data);
        break;
      default:
        logger.warn(`Unhandled webhook topic: ${topic}`);
    }
  }

  async syncOrder(orderData) {
    logger.info(`Syncing order #${orderData.order_number} from ${orderData.customer?.email}`);
    // Store order in database for tax calculation
  }

  async removeOrder(orderId) {
    logger.info(`Removing order ${orderId}`);
  }

  async handleUninstall(data) {
    logger.info(`App uninstalled from ${data.myshopify_domain}`);
  }

  async verifyInstallation(shop) {
    // Check database for active installation
    return true;
  }

  getClient(shop, accessToken) {
    return axios.create({
      baseURL: `https://${shop}`,
      headers: { 'X-Shopify-Access-Token': accessToken }
    });
  }

  async fetchOrders(shop, accessToken, params = {}) {
    const client = this.getClient(shop, accessToken);
    const resp = await client.get('/admin/api/2024-01/orders.json', {
      params: { status: 'any', limit: 250, ...params }
    });
    return resp.data.orders;
  }
}

module.exports = new ShopifyService();
