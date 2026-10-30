-- Forward-only account deletion and focus idempotency hardening. This stays in
-- a separate migration so databases that already applied the secure baseline
-- receive the same guards as a fresh installation.

begin;

-- Serialize every durable mutation for a user across processes. The lock key
-- is stable for the UUID and held until transaction end; hash collisions only
-- serialize unrelated users and cannot weaken the boundary.
create or replace function public.lock_account_mutation(p_user_id uuid)
returns void
language sql
security definer
set search_path = pg_catalog, public
as $function$
    select pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(p_user_id::text, 0)
    );
$function$;

revoke all on function public.lock_account_mutation(uuid)
    from public, anon, authenticated;

-- Every completion, including a zero-minute request at the daily cap, needs a
-- durable claim independent of the replaceable profile projection.
create table if not exists public.focus_completion_claims (
    user_id uuid not null references public.profiles(id) on delete cascade,
    completion_id text not null,
    accepted_minutes smallint not null,
    day_key date not null,
    created_at timestamptz not null default now(),
    primary key (user_id, completion_id),
    constraint focus_completion_claims_id_check check (
        completion_id = btrim(completion_id)
        and char_length(completion_id) between 8 and 128
    ),
    constraint focus_completion_claims_minutes_check check (
        accepted_minutes between 0 and 240
    )
);

-- Positive historical completions already have an authoritative event row.
insert into public.focus_completion_claims (
    user_id, completion_id, accepted_minutes, day_key, created_at
)
select user_id, completion_id, minutes, day_key, created_at
from public.focus_sessions
where completion_id is not null
on conflict (user_id, completion_id) do nothing;

-- Backfill capped zero-minute completions (and any positive entries missing an
-- event row) from the existing sanitized profile projection.
insert into public.focus_completion_claims (
    user_id, completion_id, accepted_minutes, day_key
)
select profile.id,
       completion.value ->> 'completionId',
       (completion.value ->> 'acceptedMinutes')::smallint,
       (completion.value ->> 'dayKey')::date
from public.profiles as profile
cross join lateral jsonb_array_elements(
    case
        when jsonb_typeof(profile.focus_stats -> 'completions') = 'array'
            then profile.focus_stats -> 'completions'
        else '[]'::jsonb
    end
) as completion(value)
where completion.value ->> 'completionId' ~ '^[A-Za-z0-9_-]{8,128}$'
  and completion.value ->> 'acceptedMinutes' ~ '^([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-3][0-9]|240)$'
  and completion.value ->> 'dayKey' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  and pg_catalog.pg_input_is_valid(completion.value ->> 'dayKey', 'date')
on conflict (user_id, completion_id) do nothing;

-- A tombstone is an authorization boundary, not just restore metadata. Even
-- if another process holds a stale in-memory profile, PostgreSQL must reject
-- its attempt to recreate or update the deleted account.
create or replace function public.reject_tombstoned_profile_write()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
    perform public.lock_account_mutation(new.id);
    if exists (
        select 1
        from public.deletion_tombstones
        where user_id = new.id
          and expires_at > pg_catalog.now()
    ) then
        raise exception 'profile is tombstoned';
    end if;
    return new;
end
$function$;

revoke all on function public.reject_tombstoned_profile_write()
    from public, anon, authenticated;

do $migration$
begin
    if not exists (
        select 1
        from pg_catalog.pg_trigger
        where tgrelid = 'public.profiles'::regclass
          and tgname = 'reject_tombstoned_profile_write'
          and not tgisinternal
    ) then
        create trigger reject_tombstoned_profile_write
        before insert or update on public.profiles
        for each row execute function public.reject_tombstoned_profile_write();
    end if;
end
$migration$;

-- The existing delete_profile_with_tombstone RPC writes this table before it
-- deletes the profile. Locking that write gives deletion the same ordering as
-- profile upserts and focus transactions without changing the stable RPC.
create or replace function public.lock_deletion_tombstone_write()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
    perform public.lock_account_mutation(new.user_id);
    return new;
end
$function$;

revoke all on function public.lock_deletion_tombstone_write()
    from public, anon, authenticated;

do $migration$
begin
    if not exists (
        select 1
        from pg_catalog.pg_trigger
        where tgrelid = 'public.deletion_tombstones'::regclass
          and tgname = 'lock_deletion_tombstone_write'
          and not tgisinternal
    ) then
        create trigger lock_deletion_tombstone_write
        before insert or update on public.deletion_tombstones
        for each row execute function public.lock_deletion_tombstone_write();
    end if;
end
$migration$;

-- Preserve the v1 function signature for older deployments, but claim a
-- positive-minute idempotency key before assigning aggregate state. A replay
-- therefore cannot overwrite a newer profile projection.
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
    inserted_rows integer;
    updated_rows integer;
begin
    if p_completion_id is null
       or p_completion_id <> btrim(p_completion_id)
       or char_length(p_completion_id) not between 8 and 128
       or p_minutes not between 0 and 240 then
        raise exception 'invalid focus completion';
    end if;

    perform public.lock_account_mutation(p_user_id);

    insert into public.focus_completion_claims (
        user_id, completion_id, accepted_minutes, day_key
    ) values (p_user_id, p_completion_id, p_minutes, p_day_key)
    on conflict (user_id, completion_id) do nothing;
    get diagnostics inserted_rows = row_count;
    if inserted_rows = 0 then
        return;
    end if;

    if p_minutes > 0 then
        insert into public.focus_sessions (user_id, minutes, day_key, completion_id)
        values (p_user_id, p_minutes, p_day_key, p_completion_id)
        on conflict (user_id, completion_id) where completion_id is not null do nothing;
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
end
$function$;

revoke all on function public.record_focus_completion(
    uuid, jsonb, integer, integer, date, text, integer, date
) from public, anon, authenticated;
grant execute on function public.record_focus_completion(
    uuid, jsonb, integer, integer, date, text, integer, date
) to service_role;

-- The v2 RPC reports whether the idempotency key was already claimed and
-- returns the canonical projection. The application can therefore reconcile
-- memory after a replay or an ambiguous network retry.
create or replace function public.record_focus_completion_v2(
    p_user_id uuid,
    p_focus_stats jsonb,
    p_current_streak integer,
    p_best_streak integer,
    p_last_active_day date,
    p_completion_id text,
    p_minutes integer,
    p_day_key date
) returns table (
    duplicate boolean,
    accepted_minutes integer,
    completion_day date,
    persisted_focus_stats jsonb,
    persisted_current_streak integer,
    persisted_best_streak integer,
    persisted_last_active_day date
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
    inserted_rows integer;
    updated_rows integer;
begin
    if p_completion_id is null
       or p_completion_id <> btrim(p_completion_id)
       or char_length(p_completion_id) not between 8 and 128
       or p_minutes not between 0 and 240 then
        raise exception 'invalid focus completion';
    end if;

    perform public.lock_account_mutation(p_user_id);

    insert into public.focus_completion_claims (
        user_id, completion_id, accepted_minutes, day_key
    ) values (p_user_id, p_completion_id, p_minutes, p_day_key)
    on conflict (user_id, completion_id) do nothing;
    get diagnostics inserted_rows = row_count;
    if inserted_rows = 0 then
        return query
        select true,
               claim.accepted_minutes::integer,
               claim.day_key,
               profile.focus_stats,
               profile.current_streak,
               profile.best_streak,
               profile.last_active_day
        from public.focus_completion_claims as claim
        join public.profiles as profile on profile.id = claim.user_id
        where claim.user_id = p_user_id
          and claim.completion_id = p_completion_id;
        return;
    end if;

    if p_minutes > 0 then
        insert into public.focus_sessions (user_id, minutes, day_key, completion_id)
        values (p_user_id, p_minutes, p_day_key, p_completion_id)
        on conflict (user_id, completion_id) where completion_id is not null do nothing;
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

    return query select false,
                        p_minutes,
                        p_day_key,
                        p_focus_stats,
                        p_current_streak,
                        p_best_streak,
                        p_last_active_day;
end
$function$;

revoke all on function public.record_focus_completion_v2(
    uuid, jsonb, integer, integer, date, text, integer, date
) from public, anon, authenticated;
grant execute on function public.record_focus_completion_v2(
    uuid, jsonb, integer, integer, date, text, integer, date
) to service_role;

alter table public.focus_completion_claims enable row level security;
alter table public.focus_completion_claims force row level security;
revoke all on table public.focus_completion_claims from public, anon, authenticated;
grant select, insert, update, delete on table public.focus_completion_claims to service_role;

commit;
