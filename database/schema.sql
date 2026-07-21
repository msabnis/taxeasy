-- TaxEasy Database Schema
-- PostgreSQL 15+

-- Merchants table
CREATE TABLE IF NOT EXISTS merchants (
    id SERIAL PRIMARY KEY,
    shopify_domain VARCHAR(255) UNIQUE NOT NULL,
    shop_name VARCHAR(255),
    email VARCHAR(255),
    plan VARCHAR(50) DEFAULT 'sole-trader',
    shopify_token TEXT,
    hmrc_vrn VARCHAR(20),
    companies_house_number VARCHAR(20),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Orders synced from Shopify
CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    shopify_order_id BIGINT UNIQUE NOT NULL,
    merchant_id INTEGER REFERENCES merchants(id) ON DELETE CASCADE,
    order_number VARCHAR(50),
    total_price DECIMAL(12,2) NOT NULL DEFAULT 0,
    currency VARCHAR(3) DEFAULT 'GBP',
    vat_category VARCHAR(50) DEFAULT 'standard',
    vat_amount DECIMAL(12,2) DEFAULT 0,
    net_amount DECIMAL(12,2) DEFAULT 0,
    status VARCHAR(50) DEFAULT 'pending',
    ordered_at TIMESTAMP WITH TIME ZONE,
    raw_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- HMRC OAuth tokens
CREATE TABLE IF NOT EXISTS hmrc_tokens (
    id SERIAL PRIMARY KEY,
    merchant_id INTEGER UNIQUE REFERENCES merchants(id) ON DELETE CASCADE,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- VAT returns submitted to HMRC
CREATE TABLE IF NOT EXISTS vat_returns (
    id SERIAL PRIMARY KEY,
    merchant_id INTEGER REFERENCES merchants(id) ON DELETE CASCADE,
    period_key VARCHAR(10),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    box1 DECIMAL(12,2) DEFAULT 0,
    box2 DECIMAL(12,2) DEFAULT 0,
    box3 DECIMAL(12,2) DEFAULT 0,
    box4 DECIMAL(12,2) DEFAULT 0,
    box5 DECIMAL(12,2) DEFAULT 0,
    box6 DECIMAL(12,2) DEFAULT 0,
    box7 DECIMAL(12,2) DEFAULT 0,
    box8 DECIMAL(12,2) DEFAULT 0,
    box9 DECIMAL(12,2) DEFAULT 0,
    hmrc_receipt JSONB,
    status VARCHAR(50) DEFAULT 'draft',
    submitted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Bank accounts connected via GoCardless
CREATE TABLE IF NOT EXISTS bank_accounts (
    id SERIAL PRIMARY KEY,
    merchant_id INTEGER REFERENCES merchants(id) ON DELETE CASCADE,
    requisition_id VARCHAR(255),
    account_id VARCHAR(255),
    iban VARCHAR(50),
    bank_name VARCHAR(255),
    currency VARCHAR(3) DEFAULT 'GBP',
    status VARCHAR(50) DEFAULT 'active',
    connected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Bank transactions for reconciliation
CREATE TABLE IF NOT EXISTS bank_transactions (
    id SERIAL PRIMARY KEY,
    account_id INTEGER REFERENCES bank_accounts(id) ON DELETE CASCADE,
    transaction_id VARCHAR(255),
    booking_date DATE,
    amount DECIMAL(12,2),
    currency VARCHAR(3) DEFAULT 'GBP',
    description TEXT,
    creditor_name VARCHAR(255),
    debtor_name VARCHAR(255),
    matched_order_id INTEGER REFERENCES orders(id),
    reconciliation_status VARCHAR(50) DEFAULT 'unmatched',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Companies House filings
CREATE TABLE IF NOT EXISTS ch_filings (
    id SERIAL PRIMARY KEY,
    merchant_id INTEGER REFERENCES merchants(id) ON DELETE CASCADE,
    company_number VARCHAR(20) NOT NULL,
    filing_type VARCHAR(100) NOT NULL,
    reference VARCHAR(100),
    status VARCHAR(50) DEFAULT 'submitted',
    filing_data JSONB,
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_orders_merchant_period ON orders(merchant_id, ordered_at);
CREATE INDEX idx_orders_shopify_id ON orders(shopify_order_id);
CREATE INDEX idx_vat_returns_merchant ON vat_returns(merchant_id, period_end);
CREATE INDEX idx_bank_txn_account ON bank_transactions(account_id, booking_date);
CREATE INDEX idx_bank_txn_reconciliation ON bank_transactions(reconciliation_status);
