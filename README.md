# TaxEase UK 🇬🇧

> The Shopify-native financial app for UK sole traders and small businesses.

**Automates VAT filing, Companies House submissions, profit tracking, and bank reconciliation — all from within Shopify.**

---

## Features

- 🧾 **VAT Engine** — Auto-calculates 20%/5%/0% VAT on every Shopify order
- 📤 **HMRC MTD Filing** — Direct OAuth2 submission via Making Tax Digital API
- 🏛️ **Companies House** — Prepares micro-entity & small company annual accounts
- 🏦 **Open Banking** — GoCardless PSD2 integration for all major UK banks
- 📊 **P&L Dashboard** — Real-time profit & loss synced from Shopify
- 📁 **Statement Upload** — CSV/PDF bank statement parsing as fallback

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js 20.x + Express |
| Frontend | React 18 + Vite |
| Database | PostgreSQL |
| Auth | Shopify OAuth 2.0 |
| Tax API | HMRC MTD OAuth2 |
| Banking | GoCardless PSD2 (Open Banking) |
| Hosting | Railway → AWS/Vercel |

## Getting Started

### Prerequisites
- Node.js 20.x
- PostgreSQL 15+
- Shopify Partner account
- HMRC MTD developer credentials
- GoCardless account (Open Banking)

### Installation

```bash
# Clone the repo
git clone https://github.com/msabnis/taxeasy.git
cd taxeasy

# Install backend dependencies
cd backend && npm install

# Install frontend dependencies
cd ../frontend && npm install

# Set up environment variables
cp backend/.env.example backend/.env
# Edit backend/.env with your credentials

# Run database migrations
cd backend && npm run migrate

# Start development servers
npm run dev  # from root (runs both backend + frontend)
```

## Project Structure

```
taxeasy/
├── backend/              # Node.js API server
│   ├── src/
│   │   ├── routes/       # API route handlers
│   │   ├── services/     # Business logic (HMRC, Shopify, GoCardless)
│   │   ├── models/       # PostgreSQL models (Sequelize)
│   │   ├── middleware/   # Auth, error handling, logging
│   │   └── utils/        # Helpers, VAT calculator, formatters
│   ├── migrations/       # Database migrations
│   └── tests/            # Unit & integration tests
├── frontend/             # React + Vite app
│   ├── src/
│   │   ├── components/   # Reusable UI components
│   │   ├── pages/        # Page-level components
│   │   ├── hooks/        # Custom React hooks
│   │   └── services/     # API client
│   └── public/
├── docs/                 # Architecture & API documentation
└── railway.toml          # Railway deployment config
```

## Deployment

### Phase 1 — Railway (Launch)
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and deploy
railway login
railway up
```

### Phase 2 — AWS / Vercel (Scale)
See `docs/deployment.md` for AWS EC2 + RDS + CloudFront setup.

## Compliance

- ✅ HMRC Making Tax Digital (MTD) compliant
- ✅ PSD2 / Open Banking compliant
- ✅ Companies House software filing compatible
- ✅ GDPR compliant data handling

## Pricing

| Plan | Price | Target |
|------|-------|--------|
| Sole Trader | £9/mo | Freelancers & self-employed |
| Small Business | £19/mo | Limited companies |
| Growth | £35/mo | Scaling businesses |

## Licence

Proprietary — All rights reserved © 2026 TaxEase UK Ltd
