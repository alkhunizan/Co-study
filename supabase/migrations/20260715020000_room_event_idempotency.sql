begin;

-- Room lifecycle delivery is backed by a durable local outbox. These nullable
-- additions let deployments upgrade without rewriting historical rows, while
-- event_id gives every retry one stable conflict target.
alter table public.room_events
    add column if not exists event_id uuid;
alter table public.room_events
    add column if not exists occurrence_id text;
alter table public.room_events
    add column if not exists lifecycle_epoch bigint;
alter table public.room_events
    add column if not exists occurred_at timestamptz;

create unique index if not exists room_events_event_id_uidx
    on public.room_events (event_id);
create index if not exists room_events_occurrence_idx
    on public.room_events (room_code, occurrence_id, occurred_at desc)
    where occurrence_id is not null;

do $migration$
begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'room_events_occurrence_id_check'
          and conrelid = 'public.room_events'::regclass
    ) then
        alter table public.room_events
            add constraint room_events_occurrence_id_check check (
                occurrence_id is null
                or occurrence_id ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
            );
    end if;

    if not exists (
        select 1 from pg_constraint
        where conname = 'room_events_lifecycle_epoch_check'
          and conrelid = 'public.room_events'::regclass
    ) then
        alter table public.room_events
            add constraint room_events_lifecycle_epoch_check check (
                lifecycle_epoch is null or lifecycle_epoch >= 0
            );
    end if;
end
$migration$;

commit;
