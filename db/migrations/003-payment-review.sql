-- A paid order awaiting review is not an open checkout. Keep every paid
-- transaction recorded while retaining one creating/pending/unknown checkout.
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM halastudy.migrations WHERE version=3) THEN
        DROP INDEX IF EXISTS halastudy.digetpay_one_open_order;
        CREATE UNIQUE INDEX digetpay_one_open_order ON halastudy.digetpay_orders(user_id)
            WHERE status IN ('creating','pending','unknown');
        INSERT INTO halastudy.migrations(version) VALUES(3);
    END IF;
END $$;
