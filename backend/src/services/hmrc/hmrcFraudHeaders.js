/**
 * TaxEase UK — HMRC Fraud Prevention Headers
 *
 * HMRC's Making Tax Digital API requires a set of Gov-Client-* and
 * Gov-Vendor-* headers on EVERY API request. These are used for fraud
 * detection and are mandatory — requests without them will be rejected.
 *
 * Reference:
 *   https://developer.service.hmrc.gov.uk/guides/fraud-prevention/
 *
 * Header categories:
 *   Gov-Client-*  — Information about the end user's device/browser
 *   Gov-Vendor-*  — Information about the software vendor (TaxEase UK)
 *
 * For a web app via server (WEB_APP_VIA_SERVER connection method):
 *   - Client headers describe the merchant's browser
 *   - Vendor headers describe the TaxEase UK server
 */

'use strict';

const os      = require('os');
const crypto  = require('crypto');

const APP_VERSION = '1.0.0';
const APP_NAME    = 'TaxEase-UK';

/**
 * Build the complete set of HMRC fraud prevention headers.
 *
 * @param {Object} req         - Express request object (for client IP, user-agent)
 * @param {string} merchantId  - Used to generate a consistent device ID
 * @returns {Object} Headers object to merge into axios request
 */
function buildFraudHeaders(req, merchantId) {
  const clientIp      = getClientIp(req);
  const serverIp      = getServerIp();
  const deviceId      = generateDeviceId(merchantId);
  const userAgent     = req?.headers?.['user-agent'] || `${APP_NAME}/${APP_VERSION}`;
  const screenInfo    = parseScreenInfo(req?.headers?.['x-screen-info']);
  const windowSize    = parseWindowSize(req?.headers?.['x-window-size']);
  const timezone      = req?.headers?.['x-timezone'] || 'UTC+00:00';
  const localIps      = req?.headers?.['x-local-ips'] || clientIp;
  const doNotTrack    = req?.headers?.['dnt'] || '1';

  return {
    // ── Connection method ───────────────────────────────────────────────────
    'Gov-Client-Connection-Method': 'WEB_APP_VIA_SERVER',

    // ── Client device info ──────────────────────────────────────────────────
    'Gov-Client-Device-ID':         deviceId,
    'Gov-Client-User-IDs':          `os=${APP_NAME}`,
    'Gov-Client-Timezone':          timezone,
    'Gov-Client-Local-IPs':         localIps,
    'Gov-Client-Public-IP':         clientIp,
    'Gov-Client-Public-Port':       String(req?.socket?.remotePort || 443),

    // ── Client browser info ─────────────────────────────────────────────────
    'Gov-Client-Browser-JS-User-Agent': userAgent,
    'Gov-Client-Browser-Do-Not-Track':  doNotTrack,
    'Gov-Client-Browser-Plugins':       '',
    'Gov-Client-Screens':               screenInfo,
    'Gov-Client-Window-Size':           windowSize,

    // ── Vendor (TaxEase UK server) info ─────────────────────────────────────
    'Gov-Vendor-Version':           `${APP_NAME}=${APP_VERSION}`,
    'Gov-Vendor-License-IDs':       '',
    'Gov-Vendor-Public-IP':         serverIp,
    'Gov-Vendor-Forwarded':         buildForwardedHeader(clientIp, serverIp),

    // ── Standard API headers ────────────────────────────────────────────────
    'Accept':                       'application/vnd.hmrc.1.0+json',
    'Content-Type':                 'application/json',
  };
}

/**
 * Build fraud headers for server-to-server calls (no browser context).
 * Used for scheduled jobs and background sync operations.
 *
 * @param {string} merchantId
 * @returns {Object} Headers object
 */
function buildServerFraudHeaders(merchantId) {
  const serverIp = getServerIp();
  const deviceId = generateDeviceId(merchantId);

  return {
    'Gov-Client-Connection-Method':     'BATCH_PROCESS_DIRECT',
    'Gov-Client-Device-ID':             deviceId,
    'Gov-Client-User-IDs':              `os=${APP_NAME}`,
    'Gov-Client-Timezone':              'UTC+00:00',
    'Gov-Client-Local-IPs':             serverIp,
    'Gov-Client-Public-IP':             serverIp,
    'Gov-Client-Public-Port':           '443',
    'Gov-Client-Browser-JS-User-Agent': `${APP_NAME}/${APP_VERSION} (Node.js/${process.version})`,
    'Gov-Client-Browser-Do-Not-Track':  '1',
    'Gov-Client-Browser-Plugins':       '',
    'Gov-Client-Screens':               'width=1920&height=1080&scaling-factor=1&colour-depth=24',
    'Gov-Client-Window-Size':           'width=1280&height=720',
    'Gov-Vendor-Version':               `${APP_NAME}=${APP_VERSION}`,
    'Gov-Vendor-License-IDs':           '',
    'Gov-Vendor-Public-IP':             serverIp,
    'Gov-Vendor-Forwarded':             `by=${serverIp}&for=${serverIp}`,
    'Accept':                           'application/vnd.hmrc.1.0+json',
    'Content-Type':                     'application/json',
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getClientIp(req) {
  if (!req) return '127.0.0.1';
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.headers['x-real-ip'] ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    '127.0.0.1'
  );
}

function getServerIp() {
  try {
    const interfaces = os.networkInterfaces();
    for (const iface of Object.values(interfaces)) {
      for (const addr of iface) {
        if (addr.family === 'IPv4' && !addr.internal) return addr.address;
      }
    }
  } catch (_) {}
  return '127.0.0.1';
}

/**
 * Generate a stable device ID for a merchant.
 * HMRC uses this to track submissions from the same software instance.
 * Must be consistent across requests for the same merchant.
 */
function generateDeviceId(merchantId) {
  const seed = `${APP_NAME}-${merchantId}-${process.env.NODE_ENV || 'production'}`;
  return crypto.createHash('sha256').update(seed).digest('hex').substring(0, 36);
}

function parseScreenInfo(header) {
  return header || 'width=1920&height=1080&scaling-factor=1&colour-depth=24';
}

function parseWindowSize(header) {
  return header || 'width=1280&height=720';
}

function buildForwardedHeader(clientIp, serverIp) {
  return `by=${serverIp}&for=${clientIp}`;
}

module.exports = { buildFraudHeaders, buildServerFraudHeaders };
