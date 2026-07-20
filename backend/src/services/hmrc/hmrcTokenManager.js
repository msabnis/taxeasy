/**
 * TaxEase UK — HMRC Token Manager
 *
 * Manages the full HMRC MTD OAuth2 token lifecycle:
 *   - Authorization URL generation (step 1 of OAuth flow)
 *   - Authorization code exchange for tokens (step 2)
 *   - Automatic token refresh (access tokens expire in ~4 hours)
 *   - Secure token storage in HmrcTokens table
 *   - Token retrieval with auto-refresh before expiry
 *
 * HMRC MTD OAuth2 endpoints:
 *   Sandbox:    https://test-api.service.hmrc.gov.uk/oauth/authorize
 *   Production: https://api.service.hmrc.gov.uk/oauth/authorize
 *
 * Required scopes for TaxEase UK:
 *   read:vat   — read VAT obligations and returns
 *   write:vat  — submit VAT returns
 */

'use strict';

const axios   = require('axios');
const { HmrcToken, AuditLog } = require('../../models');
const logger  = require('../../utils/logger');

const HMRC_BASE_URL    = process.env.HMRC_BASE_URL || 'https://test-api.service.hmrc.gov.uk';
const CLIENT_ID        = process.env.HMRC_CLIENT_ID;
const CLIENT_SECRET    = process.env.HMRC_CLIENT_SECRET;
const REDIRECT_URI     = process.env.HMRC_REDIRECT_URI;
const SCOPES           = 'read:vat write:vat';

// Refresh token 5 minutes before expiry to avoid race conditions
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

// ── Authorization URL ─────────────────────────────────────────────────────────

/**
 * Generate the HMRC authorization URL to redirect the merchant to.
 * @param {string} merchantId - Used as the OAuth state parameter
 * @returns {string} Authorization URL
 */
function buildAuthorizationUrl(merchantId) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id:     CLIENT_ID,
    scope:         SCOPES,
    redirect_uri:  REDIRECT_URI,
    state:         merchantId,
  });
  return `${HMRC_BASE_URL}/oauth/authorize?${params.toString()}`;
}

// ── Token Exchange ────────────────────────────────────────────────────────────

/**
 * Exchange an authorization code for access + refresh tokens.
 * Called after the merchant completes the HMRC OAuth consent screen.
 *
 * @param {string} code       - Authorization code from HMRC callback
 * @param {string} merchantId - TaxEase merchant UUID
 * @returns {Object} Stored HmrcToken record
 */
async function exchangeCodeForTokens(code, merchantId) {
  logger.info(`HMRC Token: exchanging authorization code for merchant ${merchantId}`);

  const response = await axios.post(
    `${HMRC_BASE_URL}/oauth/token`,
    new URLSearchParams({
      grant_type:   'authorization_code',
      client_id:    CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri:  REDIRECT_URI,
      code,
    }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  const tokenData = response.data;
  const stored    = await storeTokens(merchantId, tokenData);

  await logAudit(merchantId, 'hmrc.oauth.connected', { scope: tokenData.scope });
  logger.info(`HMRC Token: successfully connected merchant ${merchantId}`);

  return stored;
}

// ── Token Refresh ─────────────────────────────────────────────────────────────

/**
 * Refresh an expired (or near-expiry) access token using the refresh token.
 * @param {string} merchantId
 * @returns {Object} Updated HmrcToken record
 */
async function refreshAccessToken(merchantId) {
  logger.info(`HMRC Token: refreshing access token for merchant ${merchantId}`);

  const existing = await HmrcToken.findOne({ where: { merchantId } });
  if (!existing) throw new Error(`No HMRC token found for merchant ${merchantId}`);
  if (!existing.refreshToken) throw new Error('No refresh token available — merchant must re-authorise');

  try {
    const response = await axios.post(
      `${HMRC_BASE_URL}/oauth/token`,
      new URLSearchParams({
        grant_type:    'refresh_token',
        client_id:     CLIENT_ID,
        client_secret: CLIENT_SECRET,
        refresh_token: existing.refreshToken,
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const updated = await storeTokens(merchantId, response.data, existing.id);
    logger.info(`HMRC Token: refreshed successfully for merchant ${merchantId}`);
    return updated;
  } catch (err) {
    const status = err.response?.status;
    if (status === 401 || status === 400) {
      // Refresh token is invalid/expired — merchant must re-authorise
      await existing.update({ refreshToken: null });
      await logAudit(merchantId, 'hmrc.oauth.refresh_failed', { error: err.response?.data });
      throw new Error('HMRC refresh token expired — merchant must re-authorise via OAuth');
    }
    throw err;
  }
}

// ── Token Retrieval (with auto-refresh) ───────────────────────────────────────

/**
 * Get a valid access token for a merchant, refreshing automatically if needed.
 * This is the primary function used by all HMRC API calls.
 *
 * @param {string} merchantId
 * @returns {string} Valid access token
 */
async function getValidAccessToken(merchantId) {
  const token = await HmrcToken.findOne({ where: { merchantId } });

  if (!token) {
    throw new Error(`Merchant ${merchantId} has not connected their HMRC account`);
  }

  // Check if token needs refresh
  const expiresAt    = new Date(token.expiresAt);
  const refreshAfter = new Date(expiresAt.getTime() - REFRESH_BUFFER_MS);

  if (new Date() >= refreshAfter) {
    logger.debug(`HMRC Token: access token expiring soon, refreshing for merchant ${merchantId}`);
    const refreshed = await refreshAccessToken(merchantId);
    return refreshed.accessToken;
  }

  return token.accessToken;
}

/**
 * Check if a merchant has a valid HMRC connection.
 * @param {string} merchantId
 * @returns {{ connected: boolean, expiresAt: Date|null, needsReauth: boolean }}
 */
async function getConnectionStatus(merchantId) {
  const token = await HmrcToken.findOne({ where: { merchantId } });

  if (!token) {
    return { connected: false, expiresAt: null, needsReauth: false };
  }

  const hasRefreshToken = !!token.refreshToken;
  const expiresAt       = new Date(token.expiresAt);
  const isExpired       = new Date() >= expiresAt;
  const needsReauth     = isExpired && !hasRefreshToken;

  return {
    connected:    true,
    expiresAt,
    needsReauth,
    hasRefreshToken,
    scope: token.scope,
  };
}

/**
 * Revoke HMRC tokens for a merchant (on disconnect or uninstall).
 * @param {string} merchantId
 */
async function revokeTokens(merchantId) {
  const token = await HmrcToken.findOne({ where: { merchantId } });
  if (!token) return;

  try {
    // Attempt to revoke at HMRC (best-effort)
    await axios.post(
      `${HMRC_BASE_URL}/oauth/revoke`,
      new URLSearchParams({ token: token.accessToken }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
  } catch (err) {
    logger.warn(`HMRC Token: revocation request failed (non-critical): ${err.message}`);
  }

  await token.destroy();
  await logAudit(merchantId, 'hmrc.oauth.disconnected', {});
  logger.info(`HMRC Token: tokens revoked for merchant ${merchantId}`);
}

// ── Storage ───────────────────────────────────────────────────────────────────

async function storeTokens(merchantId, tokenData, existingId = null) {
  const expiresAt = new Date(Date.now() + (tokenData.expires_in || 14400) * 1000);

  const fields = {
    merchantId,
    accessToken:  tokenData.access_token,
    refreshToken: tokenData.refresh_token || null,
    tokenType:    tokenData.token_type    || 'Bearer',
    expiresAt,
    scope:        tokenData.scope         || SCOPES,
  };

  if (existingId) {
    await HmrcToken.update(fields, { where: { id: existingId } });
    return HmrcToken.findByPk(existingId);
  }

  // Upsert — one token record per merchant
  const [record] = await HmrcToken.findOrCreate({
    where:    { merchantId },
    defaults: fields,
  });

  if (record.accessToken !== fields.accessToken) {
    await record.update(fields);
  }

  return record;
}

async function logAudit(merchantId, action, metadata) {
  try {
    await AuditLog.create({ merchantId, action, actorType: 'system', metadata });
  } catch (err) {
    logger.warn('Audit log write failed:', err.message);
  }
}

module.exports = {
  buildAuthorizationUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  getValidAccessToken,
  getConnectionStatus,
  revokeTokens,
};
