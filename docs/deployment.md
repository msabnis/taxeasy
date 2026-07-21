# TaxEasy Deployment Guide

## Platform: Railway

TaxEasy is deployed on Railway with automatic deployments from the main branch.

## Prerequisites

1. Railway account (https://railway.app)
2. GitHub repository connected to Railway
3. PostgreSQL plugin provisioned on Railway
4. Environment variables configured

## Environment Variables

Set these in Railway dashboard under your service > Variables:

    NODE_ENV=production
    PORT=3000
    DATABASE_URL=<auto-provided by Railway PostgreSQL plugin>
    SHOPIFY_API_KEY=<from Shopify Partner dashboard>
    SHOPIFY_API_SECRET=<from Shopify Partner dashboard>
    SHOPIFY_SCOPES=read_orders,read_products,read_customers
    SHOPIFY_APP_URL=https://<your-railway-domain>.up.railway.app
    HMRC_CLIENT_ID=<from HMRC Developer Hub>
    HMRC_CLIENT_SECRET=<from HMRC Developer Hub>
    HMRC_BASE_URL=https://api.service.hmrc.gov.uk
    HMRC_REDIRECT_URI=https://<domain>/api/hmrc/callback
    GOCARDLESS_SECRET_ID=<from GoCardless dashboard>
    GOCARDLESS_SECRET_KEY=<from GoCardless dashboard>
    COMPANIES_HOUSE_API_KEY=<from Companies House>
    SESSION_SECRET=<random 64-char string>

## Deployment Steps

### 1. Connect Repository
- Go to Railway Dashboard > New Project > Deploy from GitHub
- Select the msabnis/taxeasy repository
- Railway will auto-detect the Node.js project

### 2. Add PostgreSQL
- New Project > Add Plugin > PostgreSQL
- Railway auto-generates DATABASE_URL

### 3. Configure Build
- Build command: npm run install:all && npm run build
- Start command: npm start
- The railway.toml file handles this automatically

### 4. Run Migrations
- After first deploy, open Railway shell and run: npm run db:migrate

### 5. Shopify App Configuration
- In Shopify Partner Dashboard, set:
  - App URL: https://<domain>.up.railway.app
  - Allowed redirection URLs:
    - https://<domain>/api/shopify/auth/callback
    - https://<domain>/api/hmrc/callback

### 6. HMRC Production Credentials
- Apply for production at https://developer.service.hmrc.gov.uk
- Update HMRC_BASE_URL to https://api.service.hmrc.gov.uk

## Health Check

Railway monitors: GET /api/health
Expected response: { status: ok, version: 2.0.0 }

## Monitoring

- Railway provides built-in logging and metrics
- Application logs via Winston (structured JSON in production)

## Rollback

1. Go to Deployments tab in Railway
2. Click on a previous deployment
3. Click Redeploy

## Security Checklist

- All secrets in Railway env vars (never in code)
- HTTPS enforced (Railway handles TLS)
- Shopify webhook HMAC verification enabled
- HMRC fraud prevention headers on all MTD calls
- Session cookies: httpOnly, secure in production
- Database SSL enabled