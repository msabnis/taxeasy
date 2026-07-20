/**
 * TaxEase UK — HMRC MTD API Client
 *
 * Low-level HTTP client for the HMRC Making Tax Digital API.
 * Handles:
 *   - Authentication (Bearer token injection)
 *   - Fraud prevention headers (mandatory on every request)
 *   - Retry logic (429 rate limiting, 5xx server errors)
 *   - HMRC-specific error parsing and mapping
 *   - Correlation ID tracking for support queries
 *
 * HMRC MTD API base URLs:
 *   Sandbox:    https://test-api.service.hmrc.gov.uk
 *   Production: https://api.service.hmrc.gov.uk
 *
 * Rate limits:
 *   VAT API: 100 requests per minute per VRN
 */

'use strict';

const axios  = require('axios');
const logger = require('../../utils/logger');
const { buildFraudHeaders, buildServerFraudHeaders } = require('./hmrcFraudHeaders');
const { getValidAccessToken } = require('./hmrcTokenManager');

const HMRC_BASE_URL = process.env.HMRC_BASE_URL || 'https://test-api.service.hmrc.gov.uk';
const MAX_RETRIES   = 3;

// ── HMRC Error Codes → Human-readable messages ────────────────────────────────
const HMRC_ERROR_MESSAGES = {
  'VRN_INVALID':                    'The VAT registration number (VRN) is invalid.',
  'INVALID_DATE_RANGE':             'The date range is invalid or too large.',
  'DATE_RANGE_TOO_LARGE':           'The date range must not exceed 366 days.',
  'NOT_FOUND':                      'No VAT obligations found for this period.',
  'INVALID_STATUS':                 'The status filter is invalid.',
  'PERIOD_KEY_INVALID':             'The period key is invalid.',
  'INVALID_REQUEST':                'The request body is invalid.',
  'DUPLICATE_SUBMISSION':           'A VAT return has already been submitted for this period.',
  'TAX_PERIOD_NOT_FOUND':           'The tax period was not found.',
  'INSOLVENT_TRADER':               'The trader is insolvent.',
  'AGENT_OR_CLIENT_NOT_AUTHORISED': 'The agent or client is not authorised.',
  'CLIENT_OR_AGENT_NOT_AUTHORISED': 'The client or agent is not authorised.',
  'FORBIDDEN':                      'Access denied. Check your OAuth scopes.',
  'INTERNAL_SERVER_ERROR':          'HMRC internal server error. Please try again later.',
  'SERVICE_UNAVAILABLE':            'HMRC service is temporarily unavailable.',
};

/**
 * Create an HMRC API client for a specific merchant.
 *
 * @param {string} merchantId - TaxEase merchant UUID
 * @param {Object} req        - Express request (for fraud headers); null for background jobs
 * @returns {Object} Client with VAT API methods
 */
function createHmrcClient(merchantId, req = null) {

  /**
   * Make an authenticated HMRC API request.
   * @param {string} method  - HTTP method
   * @param {string} path    - API path (e.g. '/organisations/vat/123456789/obligations')
   * @param {Object} data    - Request body (for POST)
   * @param {number} attempt - Retry attempt number
   */
  async function request(method, path, data = null, attempt = 1) {
    const accessToken = await getValidAccessToken(merchantId);
    const fraudHeaders = req
      ? buildFraudHeaders(req, merchantId)
      : buildServerFraudHeaders(merchantId);

    const config = {
      method,
      url:     `${HMRC_BASE_URL}${path}`,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        ...fraudHeaders,
      },
      timeout: 30000,
    };

    if (data) config.data = data;

    try {
      const response = await axios(config);

      // Log correlation ID for audit trail
      const correlationId = response.headers['x-correlationid'];
      if (correlationId) {
        logger.debug(`HMRC API: ${method} ${path} — correlationId: ${correlationId}`);
      }

      return { data: response.data, headers: response.headers, status: response.status };
    } catch (err) {
      return handleError(err, method, path, data, attempt, request);
    }
  }

  return {
    // ── VAT Obligations ───────────────────────────────────────────────────────

    /**
     * Retrieve VAT return obligations for a VRN.
     * Returns open (unfiled) and fulfilled (filed) obligations.
     *
     * @param {string} vrn    - VAT Registration Number, e.g. "123456789"
     * @param {string} from   - Start date 'YYYY-MM-DD'
     * @param {string} to     - End date 'YYYY-MM-DD'
     * @param {string} status - 'O' (open) | 'F' (fulfilled) | omit for all
     * @returns {Object} HMRC obligations response
     */
    async getObligations(vrn, from, to, status = 'O') {
      const params = new URLSearchParams({ from, to });
      if (status) params.append('status', status);
      const { data } = await request('GET', `/organisations/vat/${vrn}/obligations?${params}`);
      return data;
    },

    /**
     * Retrieve all open obligations (unfiled VAT returns).
     * @param {string} vrn
     * @returns {Array} Open obligation objects
     */
    async getOpenObligations(vrn) {
      const to   = new Date().toISOString().split('T')[0];
      const from = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const data = await this.getObligations(vrn, from, to, 'O');
      return data.obligations || [];
    },

    // ── VAT Returns ───────────────────────────────────────────────────────────

    /**
     * Submit a VAT return to HMRC.
     * @param {string} vrn     - VAT Registration Number
     * @param {Object} payload - 9-box VAT return payload (from formatForHmrc())
     * @returns {Object} HMRC submission receipt
     */
    async submitVatReturn(vrn, payload) {
      logger.info(`HMRC API: submitting VAT return for VRN ${vrn}, period ${payload.periodKey}`);
      const { data, headers } = await request('POST', `/organisations/vat/${vrn}/returns`, payload);
      return { ...data, correlationId: headers['x-correlationid'] };
    },

    /**
     * Retrieve a previously submitted VAT return.
     * @param {string} vrn       - VAT Registration Number
     * @param {string} periodKey - HMRC period key, e.g. "24AA"
     * @returns {Object} VAT return data
     */
    async getVatReturn(vrn, periodKey) {
      const { data } = await request('GET', `/organisations/vat/${vrn}/returns/${periodKey}`);
      return data;
    },

    // ── VAT Liabilities ───────────────────────────────────────────────────────

    /**
     * Retrieve VAT liabilities (amounts owed to HMRC).
     * @param {string} vrn
     * @param {string} from - 'YYYY-MM-DD'
     * @param {string} to   - 'YYYY-MM-DD'
     * @returns {Object} Liabilities response
     */
    async getLiabilities(vrn, from, to) {
      const params = new URLSearchParams({ from, to });
      const { data } = await request('GET', `/organisations/vat/${vrn}/liabilities?${params}`);
      return data;
    },

    // ── VAT Payments ──────────────────────────────────────────────────────────

    /**
     * Retrieve VAT payment history.
     * @param {string} vrn
     * @param {string} from - 'YYYY-MM-DD'
     * @param {string} to   - 'YYYY-MM-DD'
     * @returns {Object} Payments response
     */
    async getPayments(vrn, from, to) {
      const params = new URLSearchParams({ from, to });
      const { data } = await request('GET', `/organisations/vat/${vrn}/payments?${params}`);
      return data;
    },

    // ── Penalties & Interest ──────────────────────────────────────────────────

    /**
     * Retrieve financial penalties for late filing or payment.
     * @param {string} vrn
     * @param {string} from
     * @param {string} to
     * @returns {Object} Penalties response
     */
    async getPenalties(vrn, from, to) {
      const params = new URLSearchParams({ from, to });
      const { data } = await request('GET', `/organisations/vat/${vrn}/penalties/financial-penalties?${params}`);
      return data;
    },
  };
}

// ── Error Handling ────────────────────────────────────────────────────────────

async function handleError(err, method, path, data, attempt, retryFn) {
  const status  = err.response?.status;
  const body    = err.response?.data;
  const code    = body?.code || body?.errors?.[0]?.code;
  const message = HMRC_ERROR_MESSAGES[code] || body?.message || err.message;

  logger.error(`HMRC API error: ${method} ${path} — ${status} ${code}`, {
    status, code, message, attempt,
  });

  // ── Retry on 429 (rate limit) or 5xx ─────────────────────────────────────
  if (attempt < MAX_RETRIES && (status === 429 || status >= 500)) {
    const retryAfter = parseInt(err.response?.headers?.['retry-after'] || '2', 10);
    const delay      = status === 429 ? retryAfter * 1000 : Math.pow(2, attempt) * 1000;
    logger.warn(`HMRC API: retrying in ${delay}ms (attempt ${attempt}/${MAX_RETRIES})`);
    await sleep(delay);
    return retryFn(method, path, data, attempt + 1);
  }

  // ── Map to structured error ───────────────────────────────────────────────
  const error = new Error(message);
  error.hmrcCode    = code;
  error.hmrcStatus  = status;
  error.hmrcBody    = body;
  error.isDuplicate = code === 'DUPLICATE_SUBMISSION';
  error.isForbidden = status === 403;
  error.isNotFound  = status === 404;

  throw error;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { createHmrcClient };
