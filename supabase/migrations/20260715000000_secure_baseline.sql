-- Hala Study server-owned Supabase baseline.
--
-- Apply with the Supabase migration runner only after reviewing the duplicate
-- email/Google-subject audit. The migration is additive and idempotent: it
-- creates missing objects, backfills the explicit password method, and never
-- deletes application data. Constraint/index failures intentionally stop the
-- transaction so conflicting production rows can be reviewed manually.

begin;

create table if not exists public.profiles (
    id uuid primary key,
    email text not null,
    password_hash text,
    password_enabled boolean not null default true,
    display_name text not null,
    avatar_color text not null default 'amber',
    bio text not null default '',
    banned boolean not null default false,
    token_epoch integer not null default 1,
    current_streak integer not null default 0,
    best_streak integer not null default 0,
    last_active_day date,
    focus_stats jsonb not null default '{"days":{},"totalFocusMinutes":0,"totalSessions":0}'::jsonb,
    my_rooms jsonb not null default '[]'::jsonb,
    is_admin boolean not null default false,
    auth_provider text not null default 'password',
    google_sub text,
    created_at timestamptz not null default now(),
    constraint profiles_token_epoch_check check (token_epoch > 0),
    constraint profiles_streak_check check (
        current_streak >= 0 and best_streak >= current_streak
    ),
    constraint profiles_auth_provider_check check (auth_provider in ('password', 'google')),
    constraint profiles_auth_method_check check (
        (password_enabled and password_hash is not null)
        or (not password_enabled and password_hash is null and google_sub is not null)
    )
);

-- Upgrade the pre-baseline profile table without rewriting valid password rows.
alter table public.profiles
    alter column password_hash drop not null;
alter table public.profiles
    add column if not exists password_enabled boolean;
alter table public.profiles
    add column if not exists google_sub text;

update public.profiles
set password_enabled = case
    when auth_provider = 'google' then false
    else password_hash is not null
end
where password_enabled is null;

-- Legacy Google-only profiles used an inaccessible synthetic password. The
-- stable Google subject is now their sole authentication method.
update public.profiles
set password_hash = null
where password_enabled = false
  and google_sub is not null;

alter table public.profiles
    alter column password_enabled set default true,
    alter column password_enabled set not null;

do $migration$
begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'profiles_auth_method_check'
          and conrelid = 'public.profiles'::regclass
    ) then
        alter table public.profiles
            add constraint profiles_auth_method_check check (
                (password_enabled and password_hash is not null)
                or (not password_enabled and password_hash is null and google_sub is not null)
            );
    end if;
end
$migration$;

create unique index if not exists profiles_normalized_email_uidx
    on public.profiles (lower(btrim(email)));
create unique index if not exists profiles_google_sub_uidx
    on public.profiles (google_sub)
    where google_sub is not null;

create table if not exists public.focus_sessions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profiles(id) on delete cascade,
    minutes smallint not null,
    day_key date not null,
    completion_id text,
    created_at timestamptz not null default now(),
    constraint focus_sessions_minutes_check check (minutes between 1 and 240),
    constraint focus_sessions_completion_id_check check (
        completion_id is null
        or (completion_id = btrim(completion_id) and char_length(completion_id) between 1 and 128)
    )
);

alter table public.focus_sessions
    add column if not exists completion_id text;

do $migration$
begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'focus_sessions_completion_id_check'
          and conrelid = 'public.focus_sessions'::regclass
    ) then
        alter table public.focus_sessions
            add constraint focus_sessions_completion_id_check check (
                completion_id is null
                or (completion_id = btrim(completion_id) and char_length(completion_id) between 1 and 128)
            );
    end if;
end
$migration$;

create unique index if not exists focus_sessions_completion_uidx
    on public.focus_sessions (user_id, completion_id)
    where completion_id is not null;
create index if not exists focus_sessions_user_created_idx
    on public.focus_sessions (user_id, created_at desc);
create index if not exists focus_sessions_day_idx
    on public.focus_sessions (day_key desc);

create table if not exists public.room_events (
    id uuid primary key default gen_random_uuid(),
    room_code text not null,
    user_id uuid references public.profiles(id) on delete set null,
    nickname text,
    event_type text not null,
    room_schema_version smallint,
    owner_user_id uuid references public.profiles(id) on delete set null,
    room_expires_at timestamptz,
    created_at timestamptz not null default now(),
    constraint room_events_room_code_check check (
        room_code = upper(btrim(room_code)) and char_length(room_code) between 1 and 12
    ),
    constraint room_events_event_type_check check (
        event_type = btrim(event_type) and char_length(event_type) between 1 and 40
    ),
    constraint room_events_schema_version_check check (
        room_schema_version is null or room_schema_version >= 1
    )
);

-- Rooms remain file-backed; these event columns preserve the v2 room schema,
-- authenticated owner, and expiry at each lifecycle boundary without creating
-- a second authoritative room store.
alter table public.room_events
    add column if not exists room_schema_version smallint;
alter table public.room_events
    add column if not exists owner_user_id uuid;
alter table public.room_events
    add column if not exists room_expires_at timestamptz;

do $migration$
begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'room_events_owner_user_id_fkey'
          and conrelid = 'public.room_events'::regclass
    ) then
        alter table public.room_events
            add constraint room_events_owner_user_id_fkey
            foreign key (owner_user_id) references public.profiles(id) on delete set null;
    end if;

    if not exists (
        select 1 from pg_constraint
        where conname = 'room_events_schema_version_check'
          and conrelid = 'public.room_events'::regclass
    ) then
        alter table public.room_events
            add constraint room_events_schema_version_check check (
                room_schema_version is null or room_schema_version >= 1
            );
    end if;
end
$migration$;

create index if not exists room_events_room_created_idx
    on public.room_events (room_code, created_at desc);
create index if not exists room_events_user_created_idx
    on public.room_events (user_id, created_at desc)
    where user_id is not null;
create index if not exists room_events_owner_created_idx
    on public.room_events (owner_user_id, created_at desc)
    where owner_user_id is not null;

create table if not exists public.deletion_tombstones (
    user_id uuid primary key,
    deleted_at timestamptz not null default now(),
    expires_at timestamptz not null default (now() + interval '30 days'),
    reason text not null default 'user_request',
    constraint deletion_tombstones_expiry_check check (expires_at > deleted_at),
    constraint deletion_tombstones_reason_check check (
        reason = btrim(reason) and char_length(reason) between 1 and 40
    )
);

create index if not exists deletion_tombstones_expiry_idx
    on public.deletion_tombstones (expires_at);

-- Immediate focus acknowledgement must update the aggregate and append its
-- idempotency event in one transaction. Replaying the same RPC is safe: the
-- profile projection is assigned the same values and the event conflicts on
-- (user_id, completion_id).
create or replace function public.record_focus_completion(
    p_user_id uuid,
    p_focus_stats jsonb,
    p_current_streak integer,
    p_best_streak integer,
    p_last_active_day date,
    p_completion_id text,
    p_minutes integer,
    p_day_key date
) returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
    updated_rows integer;
begin
    if p_completion_id is null
       or p_completion_id <> btrim(p_completion_id)
       or char_length(p_completion_id) not between 8 and 128
       or p_minutes not between 0 and 240 then
        raise exception 'invalid focus completion';
    end if;

    update public.profiles
    set focus_stats = p_focus_stats,
        current_streak = p_current_streak,
        best_streak = p_best_streak,
        last_active_day = p_last_active_day
    where id = p_user_id;
    get diagnostics updated_rows = row_count;
    if updated_rows <> 1 then
        raise exception 'profile not found';
    end if;

    if p_minutes > 0 then
        insert into public.focus_sessions (user_id, minutes, day_key, completion_id)
        values (p_user_id, p_minutes, p_day_key, p_completion_id)
        on conflict (user_id, completion_id) where completion_id is not null do nothing;
    end if;
end
$function$;

revoke all on function public.record_focus_completion(
    uuid, jsonb, integer, integer, date, text, integer, date
) from public, anon, authenticated;
grant execute on function public.record_focus_completion(
    uuid, jsonb, integer, integer, date, text, integer, date
) to service_role;

-- Tombstone and profile deletion are committed together, so no successful
-- response can be followed by account resurrection during restore.
create or replace function public.delete_profile_with_tombstone(
    p_user_id uuid,
    p_deleted_at timestamptz default now()
) returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
    insert into public.deletion_tombstones (user_id, deleted_at, expires_at, reason)
    values (p_user_id, p_deleted_at, p_deleted_at + interval '30 days', 'user_request')
    on conflict (user_id) do update
    set deleted_at = least(public.deletion_tombstones.deleted_at, excluded.deleted_at),
        expires_at = greatest(public.deletion_tombstones.expires_at, excluded.expires_at);

    delete from public.profiles where id = p_user_id;
end
$function$;

revoke all on function public.delete_profile_with_tombstone(uuid, timestamptz)
    from public, anon, authenticated;
grant execute on function public.delete_profile_with_tombstone(uuid, timestamptz)
    to service_role;

-- The Node server authenticates with the server-only service-role key. Public
-- API roles receive neither table grants nor RLS policies; FORCE RLS also keeps
-- accidental table-owner access from bypassing the intended boundary.
alter table public.profiles enable row level security;
alter table public.profiles force row level security;
revoke all on table public.profiles from public, anon, authenticated;
grant select, insert, update, delete on table public.profiles to service_role;

alter table public.focus_sessions enable row level security;
alter table public.focus_sessions force row level security;
revoke all on table public.focus_sessions from public, anon, authenticated;
grant select, insert, update, delete on table public.focus_sessions to service_role;

alter table public.room_events enable row level security;
alter table public.room_events force row level security;
revoke all on table public.room_events from public, anon, authenticated;
grant select, insert, update, delete on table public.room_events to service_role;

alter table public.deletion_tombstones enable row level security;
alter table public.deletion_tombstones force row level security;
revoke all on table public.deletion_tombstones from public, anon, authenticated;
grant select, insert, update, delete on table public.deletion_tombstones to service_role;

-- PostgreSQL views can otherwise execute with their owner's privileges and
-- bypass underlying RLS. Preserve existing dashboard views, but ensure they
-- remain a server-only surface. Dynamic SQL avoids referencing absent views.
do $migration$
begin
    if to_regclass('public.admin_overview') is not null then
        execute 'revoke all on table public.admin_overview from public, anon, authenticated';
        execute 'grant select on table public.admin_overview to service_role';
    end if;
    if to_regclass('public.daily_active') is not null then
        execute 'revoke all on table public.daily_active from public, anon, authenticated';
        execute 'grant select on table public.daily_active to service_role';
    end if;
    if to_regclass('public.user_stats') is not null then
        execute 'revoke all on table public.user_stats from public, anon, authenticated';
        execute 'grant select on table public.user_stats to service_role';
    end if;
end
$migration$;

commit;
