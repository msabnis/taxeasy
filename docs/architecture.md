# TaxEase UK — Technical Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Shopify App Store                         │
│                    (Merchant installs TaxEase)                   │
└─────────────────────────┬───────────────────────────────────────┘
                          │ OAuth 2.0
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                     TaxEase UK Backend                           │
│                   (Node.js 20.x + Express)                       │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  VAT Engine  │  │  Companies   │  │   Bank Integration   │  │
│  │  (9-box MTD) │  │  House Prep  │  │  (GoCardless PSD2)   │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘  │
│         │                 │                       │              │
│  ┌──────▼─────────────────▼───────────────────────▼──────────┐  │
│  │                   PostgreSQL Database                       │  │
│  │         (Merchants, Transactions, VAT Returns, Tokens)     │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────┬──────────────────┬──────────────────┬────────────────┘
           │                  │                  │
           ▼                  ▼                  ▼
    ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐
    │  HMRC MTD   │  │  Companies   │  │   GoCardless     │
    │  OAuth2 API │  │  House API   │  │   Open Banking   │
    └─────────────┘  └──────────────┘  └──────────────────┘
```

## API Integrations

### HMRC Making Tax Digital (MTD)
- **Base URL**: `https://api.service.hmrc.gov.uk`
- **Sandbox**: `https://test-api.service.hmrc.gov.uk`
- **Auth**: OAuth 2.0 with token refresh
- **Required Headers**: `Gov-Client-*` and `Gov-Vendor-*` fraud-prevention headers
- **Endpoints used**:
  - `GET /organisations/vat/{vrn}/obligations` — VAT return periods
  - `POST /organisations/vat/{vrn}/returns` — Submit VAT return
  - `GET /organisations/vat/{vrn}/returns/{periodKey}` — Retrieve submitted return

### GoCardless Open Banking (PSD2)
- **Base URL**: `https://bankaccountdata.gocardless.com/api/v2`
- **Sandbox**: `https://ob.sandbox.gocardless.com/api/v2`
- **Auth**: Secret ID + Secret Key → Bearer token
- **Re-auth**: Every 90 days (PSD2 requirement)
- **Endpoints used**:
  - `GET /institutions/?country=GB` — List UK banks
  - `POST /agreements/enduser/` — Create 90-day access agreement
  - `POST /requisitions/` — Generate bank authorisation link
  - `GET /accounts/{id}/transactions/` — Fetch transactions

### Shopify
- **Auth**: OAuth 2.0 per-shop access tokens
- **Webhooks**: orders/create, orders/paid, refunds/create
- **API version**: 2024-01

## Deployment

### Phase 1 — Railway (Launch)
- Auto-deploy from GitHub `main` branch
- Managed PostgreSQL (Railway add-on)
- Zero-config SSL
- Cost: £5–20/mo

### Phase 2 — AWS (Scale)
- EC2 (backend) + RDS PostgreSQL + CloudFront CDN
- Vercel for React frontend (edge network)
- Target: 99.99% uptime SLA
