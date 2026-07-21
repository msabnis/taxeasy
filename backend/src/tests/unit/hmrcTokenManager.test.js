/**
 * TaxEase UK — HMRC Token Manager Unit Tests
 */

'use strict';

jest.mock('axios');
jest.mock('../../models', () => ({
  HmrcToken: {
    findOne:      jest.fn(),
    findByPk:     jest.fn(),
    findOrCreate: jest.fn(),
    update:       jest.fn(),
    create:       jest.fn(),
  },
  AuditLog: { create: jest.fn() },
}));

const { HmrcToken } = require('../../models');
const {
  buildAuthorizationUrl,
  getConnectionStatus,
} = require('../../services/hmrc/hmrcTokenManager');

// ── buildAuthorizationUrl ─────────────────────────────────────────────────────
describe('buildAuthorizationUrl', () => {
  beforeEach(() => {
    process.env.HMRC_BASE_URL     = 'https://test-api.service.hmrc.gov.uk';
    process.env.HMRC_CLIENT_ID    = 'test-client-id';
    process.env.HMRC_REDIRECT_URI = 'http://localhost:3001/auth/hmrc/callback';
  });

  test('builds correct authorization URL', () => {
    const url = buildAuthorizationUrl('merchant-123');
    expect(url).toContain('https://test-api.service.hmrc.gov.uk/oauth/authorize');
    expect(url).toContain('response_type=code');
    expect(url).toContain('client_id=test-client-id');
    expect(url).toContain('scope=read%3Avat');
    expect(url).toContain('state=merchant-123');
  });

  test('includes redirect_uri parameter', () => {
    const url = buildAuthorizationUrl('merchant-123');
    expect(url).toContain('redirect_uri=');
    // The redirect URI is URL-encoded in the query string
    expect(url).toContain('localhost');
  });

  test('uses merchantId as state parameter', () => {
    const url = buildAuthorizationUrl('my-merchant-uuid');
    expect(url).toContain('state=my-merchant-uuid');
  });

  test('includes both VAT scopes', () => {
    const url = buildAuthorizationUrl('merchant-123');
    expect(url).toContain('read%3Avat');
    expect(url).toContain('write%3Avat');
  });
});

// ── getConnectionStatus ───────────────────────────────────────────────────────
describe('getConnectionStatus', () => {
  test('returns not connected when no token exists', async () => {
    HmrcToken.findOne.mockResolvedValue(null);
    const status = await getConnectionStatus('merchant-123');
    expect(status.connected).toBe(false);
    expect(status.needsReauth).toBe(false);
  });

  test('returns connected when valid token exists', async () => {
    const futureDate = new Date(Date.now() + 3600 * 1000);
    HmrcToken.findOne.mockResolvedValue({
      accessToken:  'valid-token',
      refreshToken: 'refresh-token',
      expiresAt:    futureDate,
      scope:        'read:vat write:vat',
    });
    const status = await getConnectionStatus('merchant-123');
    expect(status.connected).toBe(true);
    expect(status.needsReauth).toBe(false);
    expect(status.hasRefreshToken).toBe(true);
  });

  test('needsReauth when token expired and no refresh token', async () => {
    const pastDate = new Date(Date.now() - 3600 * 1000);
    HmrcToken.findOne.mockResolvedValue({
      accessToken:  'expired-token',
      refreshToken: null,
      expiresAt:    pastDate,
      scope:        'read:vat',
    });
    const status = await getConnectionStatus('merchant-123');
    expect(status.connected).toBe(true);
    expect(status.needsReauth).toBe(true);
  });
});
