# TaxEasy

**Automated UK Tax Filing for Shopify Merchants**

TaxEasy connects to your Shopify store, automatically calculates your UK tax obligations (VAT, Self Assessment, Corporation Tax), and files directly with HMRC via Making Tax Digital (MTD).

## Features

- **Shopify Integration** - OAuth 2.0 connection, auto-sync orders and expenses
- **VAT Engine** - Real-time VAT calculation with flat rate, standard, and reduced rate support
- **Open Banking** - GoCardless PSD2 integration for automatic bank reconciliation
- **Companies House** - Annual accounts and confirmation statement filing
- **HMRC MTD** - Direct VAT return submission via Making Tax Digital API
- **Multi-tier Pricing** - Sole Trader (9 GBP/mo), Small Business (19 GBP/mo), Growth (35 GBP/mo)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js 20 + Express |
| Frontend | React 18 + Vite |
| Database | PostgreSQL |
| Auth | Shopify OAuth 2.0 |
| Tax API | HMRC MTD (OAuth2) |
| Banking | GoCardless PSD2 |
| Hosting | Railway |

## Getting Started

### Prerequisites
- Node.js 20+
- PostgreSQL 15+
- Shopify Partner account (for app development)
- HMRC Developer account (for MTD sandbox)

### Installation

    git clone https://github.com/msabnis/taxeasy.git
    cd taxeasy
    npm install
    cp .env.example .env
    npm run db:migrate
    npm run dev

## Project Structure

    taxeasy/
    +-- backend/          # Express API server
    +-- frontend/         # React merchant dashboard
    +-- database/         # SQL schema and migrations
    +-- docs/             # Architecture and deployment docs

## Deployment

Deployed on Railway with automatic deployments from main.

## License

Proprietary - All rights reserved.