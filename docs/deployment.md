# TaxEase UK — Deployment Guide

## Phase 1: Railway (Launch)

### Prerequisites
- Railway account at [railway.app](https://railway.app)
- GitHub repo connected

### Steps

1. **Install Railway CLI**
   ```bash
   npm install -g @railway/cli
   railway login
   ```

2. **Create new project**
   ```bash
   railway new
   ```

3. **Add PostgreSQL**
   - In Railway dashboard → Add Plugin → PostgreSQL
   - `DATABASE_URL` is auto-injected

4. **Set environment variables**
   ```bash
   railway variables set NODE_ENV=production
   railway variables set SHOPIFY_API_KEY=your_key
   railway variables set SHOPIFY_API_SECRET=your_secret
   railway variables set HMRC_CLIENT_ID=your_hmrc_id
   railway variables set HMRC_CLIENT_SECRET=your_hmrc_secret
   railway variables set GOCARDLESS_SECRET_ID=your_gc_id
   railway variables set GOCARDLESS_SECRET_KEY=your_gc_key
   railway variables set JWT_SECRET=your_jwt_secret
   railway variables set SESSION_SECRET=your_session_secret
   ```

5. **Deploy**
   ```bash
   railway up
   ```

6. **Run migrations**
   ```bash
   railway run npm run migrate
   ```

## Phase 2: AWS (Scale)

### Architecture
- **EC2** (t3.medium) — Node.js backend
- **RDS** (PostgreSQL 15, db.t3.micro → db.t3.small) — Database
- **CloudFront** — CDN for frontend assets
- **Vercel** — React frontend (edge network)
- **Route 53** — DNS management
- **ACM** — SSL certificates

### Key AWS Services
```
Route 53 → CloudFront → S3 (frontend)
                      → ALB → EC2 (backend) → RDS
```

## HMRC MTD Software Recognition

Before going live, apply for HMRC MTD software recognition:
1. Register at [developer.service.hmrc.gov.uk](https://developer.service.hmrc.gov.uk)
2. Create an application for MTD VAT
3. Complete the production credentials request
4. Timeline: 4–6 weeks

## Shopify App Store Submission

1. Create app in [Shopify Partners](https://partners.shopify.com)
2. Set up app listing (name, description, screenshots)
3. Submit for review (5–7 business days)
4. Target category: **Finances**
