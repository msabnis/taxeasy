/**
 * TaxEase UK — HMRC Fraud Prevention Headers Unit Tests
 */

'use strict';

const { buildFraudHeaders, buildServerFraudHeaders } = require('../../services/hmrc/hmrcFraudHeaders');

// Headers that must be present and non-empty
const REQUIRED_NON_EMPTY_HEADERS = [
  'Gov-Client-Connection-Method',
  'Gov-Client-Device-ID',
  'Gov-Client-User-IDs',
  'Gov-Client-Timezone',
  'Gov-Client-Local-IPs',
  'Gov-Client-Public-IP',
  'Gov-Client-Public-Port',
  'Gov-Client-Browser-JS-User-Agent',
  'Gov-Client-Browser-Do-Not-Track',
  'Gov-Client-Screens',
  'Gov-Client-Window-Size',
  'Gov-Vendor-Version',
  'Gov-Vendor-Public-IP',
  'Gov-Vendor-Forwarded',
];

// Headers that must be present but may be empty string (HMRC allows empty)
const REQUIRED_POSSIBLY_EMPTY_HEADERS = [
  'Gov-Client-Browser-Plugins',  // Empty string is valid — no plugins in server context
  'Gov-Vendor-License-IDs',      // Empty string is valid — no license IDs required
];

const ALL_REQUIRED_HEADERS = [...REQUIRED_NON_EMPTY_HEADERS, ...REQUIRED_POSSIBLY_EMPTY_HEADERS];

const mockReq = {
  headers: {
    'user-agent':      'Mozilla/5.0 (Test)',
    'x-forwarded-for': '1.2.3.4',
    'dnt':             '1',
  },
  socket:     { remoteAddress: '1.2.3.4', remotePort: 12345 },
  connection: { remoteAddress: '1.2.3.4' },
  ip: '1.2.3.4',
};

describe('buildFraudHeaders', () => {
  test('includes all required HMRC fraud prevention headers', () => {
    const headers = buildFraudHeaders(mockReq, 'merchant-123');
    for (const header of ALL_REQUIRED_HEADERS) {
      expect(headers).toHaveProperty(header);
      expect(headers[header]).toBeDefined();
      // All headers must be strings (some may be empty string)
      expect(typeof headers[header]).toBe('string');
    }
  });

  test('non-empty headers have actual values', () => {
    const headers = buildFraudHeaders(mockReq, 'merchant-123');
    for (const header of REQUIRED_NON_EMPTY_HEADERS) {
      expect(headers[header]).not.toBe('');
    }
  });

  test('connection method is WEB_APP_VIA_SERVER', () => {
    const headers = buildFraudHeaders(mockReq, 'merchant-123');
    expect(headers['Gov-Client-Connection-Method']).toBe('WEB_APP_VIA_SERVER');
  });

  test('device ID is consistent for same merchant', () => {
    const h1 = buildFraudHeaders(mockReq, 'merchant-abc');
    const h2 = buildFraudHeaders(mockReq, 'merchant-abc');
    expect(h1['Gov-Client-Device-ID']).toBe(h2['Gov-Client-Device-ID']);
  });

  test('device ID differs for different merchants', () => {
    const h1 = buildFraudHeaders(mockReq, 'merchant-aaa');
    const h2 = buildFraudHeaders(mockReq, 'merchant-bbb');
    expect(h1['Gov-Client-Device-ID']).not.toBe(h2['Gov-Client-Device-ID']);
  });

  test('client IP extracted from x-forwarded-for', () => {
    const headers = buildFraudHeaders(mockReq, 'merchant-123');
    expect(headers['Gov-Client-Public-IP']).toBe('1.2.3.4');
  });

  test('includes Accept and Content-Type headers', () => {
    const headers = buildFraudHeaders(mockReq, 'merchant-123');
    expect(headers['Accept']).toBe('application/vnd.hmrc.1.0+json');
    expect(headers['Content-Type']).toBe('application/json');
  });

  test('handles null req gracefully', () => {
    expect(() => buildFraudHeaders(null, 'merchant-123')).not.toThrow();
  });
});

describe('buildServerFraudHeaders', () => {
  test('includes all required headers', () => {
    const headers = buildServerFraudHeaders('merchant-123');
    for (const header of ALL_REQUIRED_HEADERS) {
      expect(headers).toHaveProperty(header);
      expect(headers[header]).toBeDefined();
    }
  });

  test('connection method is BATCH_PROCESS_DIRECT', () => {
    const headers = buildServerFraudHeaders('merchant-123');
    expect(headers['Gov-Client-Connection-Method']).toBe('BATCH_PROCESS_DIRECT');
  });

  test('vendor version includes app name and version', () => {
    const headers = buildServerFraudHeaders('merchant-123');
    expect(headers['Gov-Vendor-Version']).toContain('TaxEase-UK');
    expect(headers['Gov-Vendor-Version']).toContain('1.0.0');
  });
});
