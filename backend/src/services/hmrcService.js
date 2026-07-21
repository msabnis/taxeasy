const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');
const { HmrcError } = require('../middleware/errorHandler');
const { getConnectionHeaders } = require('../utils/fraudHeaders');

class HmrcService {
  constructor() {
    this.client = axios.create({
      baseURL: config.hmrc.baseUrl,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.hmrc.1.0+json'
      }
    });
  }

  getAuthorizationUrl(state) {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: config.hmrc.clientId,
      scope: 'read:vat write:vat',
      redirect_uri: config.hmrc.redirectUri,
      state: state || ''
    });
    return `${config.hmrc.baseUrl}/oauth/authorize?${params.toString()}`;
  }

  async exchangeCodeForTokens(code) {
    try {
      const resp = await this.client.post('/oauth/token', new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: config.hmrc.clientId,
        client_secret: config.hmrc.clientSecret,
        redirect_uri: config.hmrc.redirectUri
      }).toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });
      return resp.data;
    } catch (error) {
      throw new HmrcError('Token exchange failed: ' + error.message);
    }
  }

  async refreshTokens(refreshToken) {
    try {
      const resp = await this.client.post('/oauth/token', new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: config.hmrc.clientId,
        client_secret: config.hmrc.clientSecret
      }).toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });
      return resp.data;
    } catch (error) {
      throw new HmrcError('Token refresh failed: ' + error.message);
    }
  }

  async storeTokens(merchantId, tokens) {
    logger.info(`Storing HMRC tokens for merchant: ${merchantId}`);
    // Store in database with encryption
  }

  async getVatObligations(vrn, tokens, req) {
    try {
      const fraudHeaders = getConnectionHeaders(req || {});
      const resp = await this.client.get(
        `/organisations/vat/${vrn}/obligations`,
        { headers: { Authorization: `Bearer ${tokens.access_token}`, ...fraudHeaders } }
      );
      return resp.data;
    } catch (error) {
      throw new HmrcError('Failed to fetch VAT obligations: ' + error.message);
    }
  }

  async submitVatReturn(vrn, returnData, tokens, req) {
    try {
      const fraudHeaders = getConnectionHeaders(req || {});
      const resp = await this.client.post(
        `/organisations/vat/${vrn}/returns`,
        {
          periodKey: returnData.periodKey,
          vatDueSales: returnData.vatDueSales,
          vatDueAcquisitions: returnData.vatDueAcquisitions,
          totalVatDue: returnData.totalVatDue,
          vatReclaimedCurrPeriod: returnData.vatReclaimedCurrPeriod,
          netVatDue: returnData.netVatDue,
          totalValueSalesExVAT: returnData.totalValueSalesExVAT,
          totalValuePurchasesExVAT: returnData.totalValuePurchasesExVAT,
          totalValueGoodsSuppliedExVAT: returnData.totalValueGoodsSuppliedExVAT,
          totalAcquisitionsExVAT: returnData.totalAcquisitionsExVAT,
          finalised: true
        },
        { headers: { Authorization: `Bearer ${tokens.access_token}`, ...fraudHeaders } }
      );
      logger.info(`VAT return submitted for VRN: ${vrn}`);
      return resp.data;
    } catch (error) {
      throw new HmrcError('VAT return submission failed: ' + error.message);
    }
  }

  async getVatReturnDetails(vrn, periodKey, tokens, req) {
    try {
      const fraudHeaders = getConnectionHeaders(req || {});
      const resp = await this.client.get(
        `/organisations/vat/${vrn}/returns/${periodKey}`,
        { headers: { Authorization: `Bearer ${tokens.access_token}`, ...fraudHeaders } }
      );
      return resp.data;
    } catch (error) {
      throw new HmrcError('Failed to fetch VAT return: ' + error.message);
    }
  }
}

module.exports = new HmrcService();
