CREATE TABLE IF NOT EXISTS halastudy.study_projects (
    id text PRIMARY KEY, user_id text NOT NULL REFERENCES halastudy.users(id) ON DELETE CASCADE,
    name text NOT NULL, archived boolean NOT NULL DEFAULT false, version integer NOT NULL DEFAULT 1,
    mutation_key text NOT NULL, request_hash text NOT NULL, created_at bigint NOT NULL,
    UNIQUE(user_id,id), UNIQUE(user_id,mutation_key)
);
CREATE TABLE IF NOT EXISTS halastudy.study_tasks (
    id text PRIMARY KEY, user_id text NOT NULL REFERENCES halastudy.users(id) ON DELETE CASCADE,
    project_id text, title text NOT NULL, note text NOT NULL DEFAULT '',
    priority text NOT NULL CHECK(priority IN ('low','normal','high')), due_date text,
    recurrence text NOT NULL CHECK(recurrence IN ('none','daily','workdays','weekly')),
    estimate_minutes integer NOT NULL CHECK(estimate_minutes BETWEEN 1 AND 240),
    steps jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(steps)='array' AND jsonb_array_length(steps)<=20),
    completed boolean NOT NULL DEFAULT false, completed_at bigint, archived boolean NOT NULL DEFAULT false,
    version integer NOT NULL DEFAULT 1, mutation_key text NOT NULL, request_hash text NOT NULL, created_at bigint NOT NULL,
    UNIQUE(user_id,id), UNIQUE(user_id,mutation_key),
    FOREIGN KEY(user_id,project_id) REFERENCES halastudy.study_projects(user_id,id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS focus_owner_id ON halastudy.focus_sessions(user_id,id);
CREATE TABLE IF NOT EXISTS halastudy.study_focus_links (
    session_id text PRIMARY KEY, user_id text NOT NULL REFERENCES halastudy.users(id) ON DELETE CASCADE,
    task_id text NOT NULL, project_id text, task_title text NOT NULL, project_name text,
    FOREIGN KEY(user_id,session_id) REFERENCES halastudy.focus_sessions(user_id,id) ON DELETE CASCADE,
    FOREIGN KEY(user_id,task_id) REFERENCES halastudy.study_tasks(user_id,id) ON DELETE CASCADE,
    FOREIGN KEY(user_id,project_id) REFERENCES halastudy.study_projects(user_id,id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS halastudy.study_distractions (
    id text PRIMARY KEY, user_id text NOT NULL REFERENCES halastudy.users(id) ON DELETE CASCADE,
    text text NOT NULL, resolved boolean NOT NULL DEFAULT false, archived boolean NOT NULL DEFAULT false,
    version integer NOT NULL DEFAULT 1, mutation_key text NOT NULL, request_hash text NOT NULL, created_at bigint NOT NULL,
    UNIQUE(user_id,mutation_key)
);
CREATE TABLE IF NOT EXISTS halastudy.study_routines (
    id text PRIMARY KEY, user_id text NOT NULL REFERENCES halastudy.users(id) ON DELETE CASCADE,
    name text NOT NULL, focus_minutes integer NOT NULL CHECK(focus_minutes BETWEEN 5 AND 120),
    break_minutes integer NOT NULL CHECK(break_minutes BETWEEN 1 AND 30),
    long_break_minutes integer NOT NULL CHECK(long_break_minutes BETWEEN 5 AND 60),
    cycles integer NOT NULL CHECK(cycles BETWEEN 1 AND 8), long_every integer NOT NULL CHECK(long_every BETWEEN 2 AND 8),
    archived boolean NOT NULL DEFAULT false, version integer NOT NULL DEFAULT 1,
    mutation_key text NOT NULL, request_hash text NOT NULL, created_at bigint NOT NULL,
    CHECK(focus_minutes*cycles<=240), UNIQUE(user_id,mutation_key)
);
CREATE TABLE IF NOT EXISTS halastudy.study_preferences (
    user_id text PRIMARY KEY REFERENCES halastudy.users(id) ON DELETE CASCADE,
    daily_target integer NOT NULL DEFAULT 0 CHECK(daily_target BETWEEN 0 AND 240),
    weekly_target integer NOT NULL DEFAULT 0 CHECK(weekly_target BETWEEN 0 AND 1680),
    reminders boolean NOT NULL DEFAULT false, reminder_minutes integer NOT NULL DEFAULT 5 CHECK(reminder_minutes IN (1,5,10,15)),
    version integer NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS halastudy.study_reflections (
    session_id text PRIMARY KEY, user_id text NOT NULL REFERENCES halastudy.users(id) ON DELETE CASCADE,
    outcome text NOT NULL CHECK(outcome IN ('done','partial','continue')), note text NOT NULL,
    version integer NOT NULL DEFAULT 1, updated_at bigint NOT NULL,
    FOREIGN KEY(user_id,session_id) REFERENCES halastudy.focus_sessions(user_id,id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS halastudy.study_bookmarks (
    id text PRIMARY KEY, user_id text NOT NULL REFERENCES halastudy.users(id) ON DELETE CASCADE,
    room_id text NOT NULL REFERENCES halastudy.rooms(id) ON DELETE CASCADE, created_at bigint NOT NULL,
    UNIQUE(user_id,room_id)
);
CREATE TABLE IF NOT EXISTS halastudy.study_rsvps (
    session_id text NOT NULL REFERENCES halastudy.scheduled_sessions(id) ON DELETE CASCADE,
    user_id text NOT NULL REFERENCES halastudy.users(id) ON DELETE CASCADE,
    status text NOT NULL CHECK(status IN ('going','maybe','declined')), updated_at bigint NOT NULL,
    PRIMARY KEY(session_id,user_id)
);
CREATE TABLE IF NOT EXISTS halastudy.study_resources (
    id text PRIMARY KEY, cohort_id text NOT NULL REFERENCES halastudy.cohorts(id) ON DELETE CASCADE,
    created_by text REFERENCES halastudy.users(id) ON DELETE SET NULL,
    title text NOT NULL, url text NOT NULL, note text NOT NULL, archived boolean NOT NULL DEFAULT false,
    mutation_key text NOT NULL, request_hash text NOT NULL, created_at bigint NOT NULL,
    UNIQUE(cohort_id,mutation_key)
);
CREATE INDEX IF NOT EXISTS study_tasks_owner ON halastudy.study_tasks(user_id,archived,completed,due_date);
CREATE INDEX IF NOT EXISTS study_links_owner ON halastudy.study_focus_links(user_id,task_id);
CREATE INDEX IF NOT EXISTS study_resources_circle ON halastudy.study_resources(cohort_id,archived);
INSERT INTO halastudy.migrations(version) VALUES(4) ON CONFLICT DO NOTHING;
