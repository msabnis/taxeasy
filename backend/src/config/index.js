const dotenv = require('dotenv');
dotenv.config();

const config = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  database: {
    url: process.env.DATABASE_URL
  },
  shopify: {
    apiKey: process.env.SHOPIFY_API_KEY,
    apiSecret: process.env.SHOPIFY_API_SECRET,
    scopes: (process.env.SHOPIFY_SCOPES || '').split(','),
    appUrl: process.env.SHOPIFY_APP_URL
  },
  hmrc: {
    clientId: process.env.HMRC_CLIENT_ID,
    clientSecret: process.env.HMRC_CLIENT_SECRET,
    baseUrl: process.env.HMRC_BASE_URL || 'https://test-api.service.hmrc.gov.uk',
    redirectUri: process.env.HMRC_REDIRECT_URI
  },
  gocardless: {
    secretId: process.env.GOCARDLESS_SECRET_ID,
    secretKey: process.env.GOCARDLESS_SECRET_KEY,
    baseUrl: process.env.GOCARDLESS_BASE_URL || 'https://bankaccountdata.gocardless.com'
  },
  companiesHouse: {
    apiKey: process.env.COMPANIES_HOUSE_API_KEY
  },
  session: {
    secret: process.env.SESSION_SECRET
  }
};

module.exports = config;
