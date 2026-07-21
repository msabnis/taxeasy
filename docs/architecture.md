# TaxEasy Architecture

## System Overview

TaxEasy is a full-stack application that automates UK tax filing for Shopify merchants.

## Architecture

    Shopify Store (OAuth 2.0)
         |
         v
    TaxEasy Backend (Express/Node.js 20)
         |
    +----+----+----+----+
    |    |    |    |    |
    v    v    v    v    v
  HMRC  GoCard  Companies  PostgreSQL  React
  MTD   less    House      Database    Frontend

## Backend Layers

1. **Routes** - Express route handlers, request validation
2. **Services** - Business logic, external API integrations
3. **Models** - PostgreSQL data access layer
4. **Middleware** - Authentication, error handling, plan gating
5. **Utils** - Logger, HMRC fraud prevention headers

## Key Services

- **shopifyService** - OAuth flow, webhook handling, order sync
- **hmrcService** - MTD OAuth, VAT obligation fetching, return submission
- **taxCalculator** - Income Tax, NI, Corporation Tax calculations
- **vatEngine** - VAT rate classification, 9-box calculation, flat rate scheme
- **bankingService** - GoCardless PSD2 Open Banking integration
- **companiesHouseService** - Company lookup, CS and accounts filing

## Authentication Flow

1. Merchant installs app from Shopify App Store
2. Shopify redirects to /api/shopify/auth
3. OAuth code exchanged for access token
4. Session established with encrypted cookie
5. HMRC MTD uses separate OAuth2 flow for tax filing

## Frontend Pages

- **Dashboard** - Tax overview, upcoming deadlines, recent orders
- **VAT Returns** - Calculate and submit VAT via HMRC MTD
- **Bank Integration** - Open Banking connection and reconciliation
- **Companies House** - Company filings and compliance
- **Settings** - Plan management, integrations, account settings

## Database Tables

- merchants - Shopify merchant accounts
- orders - Synced Shopify orders with VAT classification
- hmrc_tokens - Encrypted HMRC OAuth tokens
- vat_returns - Submitted VAT return records
- bank_accounts - Connected bank accounts
- bank_transactions - Transactions for reconciliation
- ch_filings - Companies House filing records

## Security

- Shopify OAuth 2.0 with HMAC verification
- HMRC Fraud Prevention Headers on all MTD API calls
- Session-based auth with httpOnly cookies
- Helmet.js security headers
- Plan-based feature gating middleware
- SSL/TLS in production (Railway handles termination)

## Pricing Tiers

| Feature | Sole Trader (9 GBP) | Small Biz (19 GBP) | Growth (35 GBP) |
|---------|:---:|:---:|:---:|
| VAT Calculation and Filing | Yes | Yes | Yes |
| Self Assessment | Yes | Yes | Yes |
| Open Banking | - | Yes | Yes |
| Bank Reconciliation | - | Yes | Yes |
| Corporation Tax | - | Yes | Yes |
| Companies House Filing | - | - | Yes |
| Multi-entity | - | - | Yes |
| Accountant Export | - | - | Yes |