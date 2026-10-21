CREATE TABLE IF NOT EXISTS halastudy.digetpay_orders (
    id text PRIMARY KEY,
    user_id text NOT NULL REFERENCES halastudy.users(id) ON DELETE CASCADE,
    mode text NOT NULL CHECK(mode = 'test'),
    status text NOT NULL CHECK(status IN ('creating','pending','unknown','completed','refunded','review','expired')),
    session_id text UNIQUE,
    transaction_id text UNIQUE,
    redirect_url text,
    amount_minor integer NOT NULL CHECK(amount_minor = 499),
    currency text NOT NULL CHECK(currency = 'USD'),
    subscription_id text REFERENCES halastudy.subscriptions(id) ON DELETE SET NULL,
    created_at bigint NOT NULL,
    expires_at bigint NOT NULL,
    checked_at bigint,
    next_check_at bigint NOT NULL,
    last_error text
);
CREATE UNIQUE INDEX IF NOT EXISTS digetpay_one_open_order
    ON halastudy.digetpay_orders(user_id) WHERE status IN ('creating','pending','unknown','review');
CREATE INDEX IF NOT EXISTS digetpay_due ON halastudy.digetpay_orders(next_check_at);
INSERT INTO halastudy.migrations(version) VALUES(2) ON CONFLICT DO NOTHING;
