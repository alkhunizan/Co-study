CREATE SCHEMA IF NOT EXISTS halastudy;
REVOKE ALL ON SCHEMA halastudy FROM PUBLIC;

CREATE TABLE IF NOT EXISTS halastudy.migrations (
    version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS halastudy.users (
    id text PRIMARY KEY, display_name text NOT NULL, created_at bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS halastudy.store_metadata (
    key text PRIMARY KEY, value text NOT NULL
);
CREATE TABLE IF NOT EXISTS halastudy.accounts (
    id text PRIMARY KEY REFERENCES halastudy.users(id) ON DELETE CASCADE,
    email text NOT NULL UNIQUE, google_subject text UNIQUE,
    payload jsonb NOT NULL, revision integer NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS halastudy.room_records (
    id text PRIMARY KEY, payload jsonb NOT NULL, revision integer NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS halastudy.mfa (
    user_id text PRIMARY KEY REFERENCES halastudy.users(id) ON DELETE CASCADE,
    encrypted_secret text NOT NULL, enabled boolean NOT NULL DEFAULT false,
    last_counter bigint NOT NULL DEFAULT -1, recovery_hashes jsonb NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS halastudy.staff_sessions (
    token_hash text PRIMARY KEY, user_id text NOT NULL REFERENCES halastudy.users(id) ON DELETE CASCADE,
    account_session_hash text NOT NULL, expires_at bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS halastudy.organizations (
    id text PRIMARY KEY, name text NOT NULL, created_by text REFERENCES halastudy.users(id) ON DELETE SET NULL,
    created_at bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS halastudy.organization_members (
    organization_id text NOT NULL REFERENCES halastudy.organizations(id) ON DELETE CASCADE,
    user_id text NOT NULL REFERENCES halastudy.users(id) ON DELETE CASCADE,
    role text NOT NULL CHECK (role IN ('admin','billing','member')),
    PRIMARY KEY (organization_id, user_id)
);
CREATE TABLE IF NOT EXISTS halastudy.role_assignments (
    id text PRIMARY KEY, user_id text NOT NULL REFERENCES halastudy.users(id) ON DELETE CASCADE,
    role text NOT NULL CHECK (role IN ('super_admin','admin','moderator','support','billing_operator')),
    granted_by text REFERENCES halastudy.users(id) ON DELETE SET NULL, created_at bigint NOT NULL,
    expires_at bigint, UNIQUE (user_id, role)
);
CREATE TABLE IF NOT EXISTS halastudy.cohorts (
    id text PRIMARY KEY, name text NOT NULL,
    owner_id text REFERENCES halastudy.users(id) ON DELETE SET NULL,
    organization_id text REFERENCES halastudy.organizations(id),
    created_at bigint NOT NULL, archived boolean NOT NULL DEFAULT false,
    UNIQUE (id, organization_id)
);
CREATE TABLE IF NOT EXISTS halastudy.cohort_members (
    cohort_id text NOT NULL REFERENCES halastudy.cohorts(id) ON DELETE CASCADE,
    user_id text NOT NULL REFERENCES halastudy.users(id) ON DELETE CASCADE,
    role text NOT NULL CHECK (role IN ('member','supervisor')),
    joined_at bigint NOT NULL, PRIMARY KEY (cohort_id, user_id)
);
CREATE TABLE IF NOT EXISTS halastudy.invitations (
    token_hash text PRIMARY KEY, cohort_id text NOT NULL REFERENCES halastudy.cohorts(id) ON DELETE CASCADE,
    created_by text REFERENCES halastudy.users(id) ON DELETE SET NULL,
    expires_at bigint NOT NULL, accepted_by text REFERENCES halastudy.users(id) ON DELETE SET NULL,
    accepted_at bigint
);
CREATE TABLE IF NOT EXISTS halastudy.rooms (
    id text PRIMARY KEY, owner_id text REFERENCES halastudy.users(id) ON DELETE SET NULL,
    cohort_id text REFERENCES halastudy.cohorts(id) ON DELETE SET NULL,
    created_at bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS halastudy.room_hosts (
    room_id text NOT NULL REFERENCES halastudy.rooms(id) ON DELETE CASCADE,
    user_id text NOT NULL REFERENCES halastudy.users(id) ON DELETE CASCADE,
    PRIMARY KEY (room_id, user_id)
);
CREATE TABLE IF NOT EXISTS halastudy.scheduled_sessions (
    id text PRIMARY KEY, cohort_id text NOT NULL REFERENCES halastudy.cohorts(id) ON DELETE CASCADE,
    room_id text NOT NULL REFERENCES halastudy.rooms(id) ON DELETE CASCADE,
    title text NOT NULL, starts_at bigint NOT NULL, duration_minutes integer NOT NULL CHECK(duration_minutes BETWEEN 5 AND 240),
    created_by text REFERENCES halastudy.users(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS halastudy.attendance (
    session_id text NOT NULL REFERENCES halastudy.scheduled_sessions(id) ON DELETE CASCADE,
    user_id text NOT NULL REFERENCES halastudy.users(id) ON DELETE CASCADE,
    first_joined_at bigint NOT NULL, last_seen_at bigint NOT NULL,
    PRIMARY KEY (session_id, user_id)
);
CREATE TABLE IF NOT EXISTS halastudy.subscriptions (
    id text PRIMARY KEY, user_id text NOT NULL REFERENCES halastudy.users(id) ON DELETE CASCADE,
    plan text NOT NULL CHECK (plan = 'vip'), mode text NOT NULL CHECK (mode IN ('test','live')),
    provider text NOT NULL, provider_reference text UNIQUE,
    status text NOT NULL CHECK(status IN ('pending','active','past_due','canceled','expired')),
    amount_minor integer NOT NULL CHECK(amount_minor = 499), currency text NOT NULL CHECK(currency = 'USD'),
    period_start bigint NOT NULL, period_end bigint NOT NULL,
    cancel_at_period_end boolean NOT NULL DEFAULT false, created_at bigint NOT NULL,
    CHECK(period_end > period_start)
);
CREATE UNIQUE INDEX IF NOT EXISTS subscription_one_current
    ON halastudy.subscriptions(user_id, mode) WHERE status IN ('active','past_due','pending');
CREATE TABLE IF NOT EXISTS halastudy.checkout_sessions (
    id text PRIMARY KEY, user_id text NOT NULL REFERENCES halastudy.users(id) ON DELETE CASCADE,
    token_hash text NOT NULL, status text NOT NULL CHECK(status IN ('pending','completed','canceled','expired')),
    expires_at bigint NOT NULL, subscription_id text REFERENCES halastudy.subscriptions(id),
    created_at bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS halastudy.focus_sessions (
    id text PRIMARY KEY, user_id text NOT NULL REFERENCES halastudy.users(id) ON DELETE CASCADE,
    state text NOT NULL CHECK(state IN ('active','paused','completed','abandoned')),
    started_at bigint NOT NULL, last_seen_at bigint NOT NULL, completed_at bigint,
    credited_ms bigint NOT NULL DEFAULT 0 CHECK(credited_ms >= 0), daily_ms jsonb NOT NULL DEFAULT '{}',
    xp integer NOT NULL DEFAULT 0 CHECK(xp >= 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS focus_one_open
    ON halastudy.focus_sessions(user_id) WHERE state IN ('active','paused');
CREATE TABLE IF NOT EXISTS halastudy.xp_ledger (
    id text PRIMARY KEY, user_id text NOT NULL REFERENCES halastudy.users(id) ON DELETE CASCADE,
    session_id text NOT NULL REFERENCES halastudy.focus_sessions(id) ON DELETE CASCADE,
    day_key text NOT NULL, rule_version integer NOT NULL, xp integer NOT NULL CHECK(xp >= 0),
    created_at bigint NOT NULL, UNIQUE (session_id, day_key, rule_version)
);
CREATE TABLE IF NOT EXISTS halastudy.achievements (
    user_id text NOT NULL REFERENCES halastudy.users(id) ON DELETE CASCADE,
    achievement_key text NOT NULL, awarded_at bigint NOT NULL,
    PRIMARY KEY (user_id, achievement_key)
);
CREATE TABLE IF NOT EXISTS halastudy.cases (
    id text PRIMARY KEY, room_id text, reporter_id text REFERENCES halastudy.users(id) ON DELETE SET NULL,
    target_id text REFERENCES halastudy.users(id) ON DELETE SET NULL, reason text NOT NULL, detail text NOT NULL,
    status text NOT NULL CHECK(status IN ('open','investigating','resolved','dismissed')),
    assigned_to text REFERENCES halastudy.users(id) ON DELETE SET NULL,
    disposition text, created_at bigint NOT NULL, resolved_at bigint
);
CREATE TABLE IF NOT EXISTS halastudy.audit_events (
    id text PRIMARY KEY, actor_id text, action text NOT NULL, resource_id text,
    outcome text NOT NULL, detail jsonb NOT NULL DEFAULT '{}', created_at bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS halastudy.outbox (
    id text PRIMARY KEY, kind text NOT NULL, payload jsonb NOT NULL,
    status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','completed','failed')),
    attempts integer NOT NULL DEFAULT 0, available_at bigint NOT NULL, last_error text,
    created_at bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS focus_user_time ON halastudy.focus_sessions(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS xp_user_day ON halastudy.xp_ledger(user_id, day_key);
CREATE INDEX IF NOT EXISTS cohort_user ON halastudy.cohort_members(user_id, cohort_id);
CREATE INDEX IF NOT EXISTS cases_status ON halastudy.cases(status, created_at);
CREATE INDEX IF NOT EXISTS audit_created ON halastudy.audit_events(created_at DESC);
INSERT INTO halastudy.migrations(version) VALUES(1) ON CONFLICT DO NOTHING;
