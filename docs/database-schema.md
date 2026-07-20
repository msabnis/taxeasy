# TaxEase UK — Database Schema

## Entity Relationship Overview

```
Merchants (1)
  ├── HmrcTokens (many)          — HMRC OAuth2 tokens
  ├── BankAccounts (many)        — GoCardless Open Banking connections
  │     └── Transactions (many) — Bank feed transactions
  ├── Transactions (many)        — All financial transactions (Shopify + bank)
  ├── VatReturns (many)          — HMRC MTD VAT return records
  ├── CompaniesHouseFilings (many) — Annual accounts & confirmation statements
  ├── WebhookEvents (many)       — Shopify webhook audit log
  └── AuditLogs (many)           — Immutable compliance audit trail
```

## Tables

### Merchants
Core table. One row per Shopify store.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| shopDomain | STRING UNIQUE | e.g. my-store.myshopify.com |
| accessToken | TEXT | Shopify OAuth token |
| plan | ENUM | sole_trader \| small_business \| growth |
| planStatus | ENUM | trialing \| active \| cancelled \| past_due |
| vatNumber | STRING | UK VRN, e.g. GB123456789 |
| companyNumber | STRING | Companies House number |

### Transactions
Core financial ledger. All amounts stored in **pence** (integer).

| Column | Type | Notes |
|--------|------|-------|
| source | ENUM | shopify \| bank_feed \| csv_upload \| manual |
| type | ENUM | sale \| purchase \| refund \| transfer \| fee |
| grossAmount | INTEGER | Pence inc. VAT |
| netAmount | INTEGER | Pence ex. VAT |
| vatAmount | INTEGER | VAT portion in pence |
| vatRate | ENUM | standard \| reduced \| zero \| exempt |

### VatReturns
HMRC 9-box VAT return records. All box values in **pence**.

| Box | HMRC Description |
|-----|-----------------|
| box1 | VAT due on sales |
| box2 | VAT due on EC acquisitions (post-Brexit: 0) |
| box3 | Total VAT due (box1 + box2) |
| box4 | VAT reclaimed on purchases |
| box5 | Net VAT payable/reclaimable |
| box6 | Total sales ex-VAT |
| box7 | Total purchases ex-VAT |
| box8 | EC supplies ex-VAT (post-Brexit: 0) |
| box9 | EC acquisitions ex-VAT (post-Brexit: 0) |

## Migration Order

Migrations must run in this order (enforced by timestamp prefix):

1. `20260101000001` — Merchants
2. `20260101000002` — HmrcTokens (FK → Merchants)
3. `20260101000003` — BankAccounts (FK → Merchants)
4. `20260101000004` — Transactions (FK → Merchants, BankAccounts)
5. `20260101000005` — VatReturns (FK → Merchants)
6. `20260101000006` — CompaniesHouseFilings (FK → Merchants)
7. `20260101000007` — WebhookEvents (FK → Merchants)
8. `20260101000008` — AuditLogs (FK → Merchants)

## Running Migrations

```bash
# Apply all pending migrations
npm run migrate

# Check migration status
npm run migrate:status

# Undo last migration
npm run migrate:undo

# Seed development data
npm run seed
```
