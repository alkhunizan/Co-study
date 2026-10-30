begin;

-- The production project predates the baseline migration: its focus_sessions
-- and room_events tables record time in occurred_at and have no created_at,
-- which the baseline indexes and the focus-claim backfill rely on. Add
-- created_at from the existing occurred_at so the baseline applies unchanged.
-- On a fresh database neither table exists yet and this migration is a no-op.
do $migration$
declare
    target text;
begin
    foreach target in array array['focus_sessions', 'room_events'] loop
        if to_regclass(format('public.%I', target)) is not null
           and not exists (
               select 1 from information_schema.columns
               where table_schema = 'public' and table_name = target and column_name = 'created_at'
           ) then
            execute format('alter table public.%I add column created_at timestamptz', target);
            if exists (
                select 1 from information_schema.columns
                where table_schema = 'public' and table_name = target and column_name = 'occurred_at'
            ) then
                execute format('update public.%I set created_at = occurred_at', target);
            end if;
            execute format('update public.%I set created_at = now() where created_at is null', target);
            execute format(
                'alter table public.%I alter column created_at set default now(), alter column created_at set not null',
                target
            );
        end if;
    end loop;
end
$migration$;

commit;
