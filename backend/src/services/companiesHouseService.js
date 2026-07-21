const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');
const { AppError } = require('../middleware/errorHandler');

class CompaniesHouseService {
  constructor() {
    this.client = axios.create({
      baseURL: 'https://api.company-information.service.gov.uk',
      auth: {
        username: config.companiesHouse.apiKey || '',
        password: ''
      }
    });
  }

  async searchCompany(query) {
    try {
      const resp = await this.client.get('/search/companies', {
        params: { q: query, items_per_page: 10 }
      });
      return (resp.data.items || []).map((item) => ({
        companyNumber: item.company_number,
        name: item.title,
        status: item.company_status,
        type: item.company_type,
        address: item.address_snippet,
        incorporatedOn: item.date_of_creation
      }));
    } catch (error) {
      throw new AppError('Companies House search failed: ' + error.message, 502);
    }
  }

  async getCompanyProfile(companyNumber) {
    try {
      const resp = await this.client.get(`/company/${companyNumber}`);
      const d = resp.data;
      return {
        companyNumber: d.company_number,
        name: d.company_name,
        status: d.company_status,
        type: d.type,
        incorporatedOn: d.date_of_creation,
        registeredAddress: d.registered_office_address,
        sicCodes: d.sic_codes || [],
        accounts: {
          nextDue: d.accounts?.next_due,
          lastFiled: d.accounts?.last_accounts?.made_up_to,
          overdue: d.accounts?.overdue
        },
        confirmationStatement: {
          nextDue: d.confirmation_statement?.next_due,
          lastFiled: d.confirmation_statement?.last_made_up_to,
          overdue: d.confirmation_statement?.overdue
        }
      };
    } catch (error) {
      throw new AppError('Failed to fetch company profile: ' + error.message, 502);
    }
  }

  async fileConfirmationStatement(companyNumber, merchantId) {
    logger.info(`Filing confirmation statement for ${companyNumber} by merchant ${merchantId}`);
    // In production, this would use the Companies House Filing API
    return {
      companyNumber,
      filingType: 'confirmation-statement',
      status: 'submitted',
      submittedAt: new Date().toISOString(),
      reference: `CS-${Date.now()}`
    };
  }

  async fileAnnualAccounts(companyNumber, merchantId, accountsData) {
    logger.info(`Filing annual accounts for ${companyNumber} by merchant ${merchantId}`);
    // Validate accounts data
    if (!accountsData.balanceSheet || !accountsData.profitAndLoss) {
      throw new AppError('Accounts data must include balance sheet and P&L', 400);
    }
    return {
      companyNumber,
      filingType: 'annual-accounts',
      status: 'submitted',
      submittedAt: new Date().toISOString(),
      reference: `AA-${Date.now()}`,
      periodStart: accountsData.periodStart,
      periodEnd: accountsData.periodEnd
    };
  }

  async getFilingHistory(companyNumber) {
    try {
      const resp = await this.client.get(`/company/${companyNumber}/filing-history`, {
        params: { items_per_page: 25 }
      });
      return (resp.data.items || []).map((item) => ({
        type: item.type,
        description: item.description,
        date: item.date,
        transactionId: item.transaction_id,
        pages: item.pages
      }));
    } catch (error) {
      throw new AppError('Failed to fetch filing history: ' + error.message, 502);
    }
  }
}

module.exports = new CompaniesHouseService();
