const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');
const { AppError } = require('../middleware/errorHandler');

class BankingService {
  constructor() {
    this.client = axios.create({
      baseURL: config.gocardless.baseUrl,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });
  }

  getAuthHeaders() {
    return {
      Authorization: `Bearer ${this.getAccessToken()}`
    };
  }

  async getAccessToken() {
    try {
      const resp = await this.client.post('/api/v2/token/new/', {
        secret_id: config.gocardless.secretId,
        secret_key: config.gocardless.secretKey
      });
      return resp.data.access;
    } catch (error) {
      throw new AppError('GoCardless auth failed: ' + error.message, 502);
    }
  }

  async createRequisition(merchantId, institutionId) {
    try {
      const token = await this.getAccessToken();
      const resp = await this.client.post('/api/v2/requisitions/', {
        redirect: `${config.shopify.appUrl}/api/banking/callback`,
        institution_id: institutionId,
        reference: `taxeasy-${merchantId}`,
        user_language: 'EN'
      }, { headers: { Authorization: `Bearer ${token}` } });

      logger.info(`Bank requisition created for merchant: ${merchantId}`);
      return { id: resp.data.id, link: resp.data.link };
    } catch (error) {
      throw new AppError('Failed to create bank connection: ' + error.message, 502);
    }
  }

  async getInstitutions(country = 'GB') {
    try {
      const token = await this.getAccessToken();
      const resp = await this.client.get('/api/v2/institutions/', {
        params: { country },
        headers: { Authorization: `Bearer ${token}` }
      });
      return resp.data.map((inst) => ({
        id: inst.id,
        name: inst.name,
        logo: inst.logo,
        bic: inst.bic
      }));
    } catch (error) {
      throw new AppError('Failed to fetch institutions: ' + error.message, 502);
    }
  }

  async getAccounts(merchantId) {
    try {
      const token = await this.getAccessToken();
      // Fetch requisition for merchant, then get accounts
      const requisition = await this.getMerchantRequisition(merchantId);
      const accounts = [];

      for (const accountId of requisition.accounts || []) {
        const accResp = await this.client.get(`/api/v2/accounts/${accountId}/`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        accounts.push({
          id: accResp.data.id,
          iban: accResp.data.iban,
          currency: accResp.data.currency,
          name: accResp.data.name || 'Business Account',
          status: accResp.data.status
        });
      }
      return accounts;
    } catch (error) {
      throw new AppError('Failed to fetch accounts: ' + error.message, 502);
    }
  }

  async getTransactions(accountId, dateFrom, dateTo) {
    try {
      const token = await this.getAccessToken();
      const params = {};
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;

      const resp = await this.client.get(`/api/v2/accounts/${accountId}/transactions/`, {
        params,
        headers: { Authorization: `Bearer ${token}` }
      });
      return (resp.data.transactions?.booked || []).map((txn) => ({
        id: txn.transactionId,
        date: txn.bookingDate,
        amount: parseFloat(txn.transactionAmount?.amount || 0),
        currency: txn.transactionAmount?.currency,
        description: txn.remittanceInformationUnstructured || txn.additionalInformation || '',
        creditorName: txn.creditorName || '',
        debtorName: txn.debtorName || ''
      }));
    } catch (error) {
      throw new AppError('Failed to fetch transactions: ' + error.message, 502);
    }
  }

  async reconcileTransactions(merchantId, accountId, periodStart, periodEnd) {
    const transactions = await this.getTransactions(accountId, periodStart, periodEnd);
    // Match transactions against Shopify orders in database
    const matched = [];
    const unmatched = [];

    for (const txn of transactions) {
      // Simple matching logic - match by amount and date proximity
      const isMatched = false; // await db.findMatchingOrder(merchantId, txn)
      if (isMatched) {
        matched.push(txn);
      } else {
        unmatched.push(txn);
      }
    }

    return {
      totalTransactions: transactions.length,
      matched: matched.length,
      unmatched: unmatched.length,
      unmatchedTransactions: unmatched,
      periodStart,
      periodEnd
    };
  }

  async getMerchantRequisition(merchantId) {
    // Fetch from database
    return { accounts: [] };
  }
}

module.exports = new BankingService();
