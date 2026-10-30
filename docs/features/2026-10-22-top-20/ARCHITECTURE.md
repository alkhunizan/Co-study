# Architecture decision: extend the existing study loop

The current app already has working identity, room, circle and server-owned focus boundaries. A framework migration would add build/deployment and state-migration work without solving the selected feature needs. Continuing inside the existing monolithic platform controller would make private planning and timer state harder to test. The chosen option is additive modules, preserving vanilla delivery and all existing URLs.

The four main destinations remain Study, Progress, Circles and Account. Study links to a secondary `/app#planner` workspace with Tasks, Routines, Saved places, My agenda, and Insights & journal. Progress keeps the focus action, with compact task/routine selection and optional reflection. Circle resources stay inside the selected private circle. Optional task details expand only when needed.

## Responsibilities and trust

- `study-planner.js` owns private projects, tasks/checklists/recurrence, estimates, distractions, routines, preferences, session context, reflections and read-only analysis. Requests lock the account, check ownership, apply active/total limits and use version checks. Creates use account-scoped idempotency keys; same-payload retries return the committed result. Completion creates one recurrence successor, even after a reopen/recomplete cycle.
- `study-community.js` owns favorites, personal agenda, RSVPs, ICS serialization and resource links. Current membership is checked for each request. Circle writes lock the circle first, matching membership management. Bookmark transactions take a room key-share lock before the account mutex, matching scheduling order. No link is fetched by the server.
- `study-routes.js` is mounted after the existing live account/epoch check and mutation limiter. Optional expected-account headers protect the browser from reusing a stale tab under changed shared cookies. All responses inherit no-store. Parameters are bound, and dynamic table names come from a fixed internal allowlist.
- `progress.js` remains the only source of credited time and rewards. Task completion, checkboxes, estimates, routine clocks, reflections, goals, RSVPs and payment state never grant time, XP or staff authority. Focus links are immutable session snapshots; archiving a project keeps current tasks and historical project names.
- `study-workspace.js` owns the secondary UI, stable form/request drafts, request generations and opt-in reminders. `study-routine.js` is a pure finite state machine. Its browser-local clock guides a user; the existing `focus-client.js` still reconciles real server sessions. Pause/resume follows matching server state. Break completion waits for the next deliberate action.

## Persistence and recovery

Migration 004 adds ten tables without rewriting existing account, focus or billing records. Composite foreign keys enforce same-owner task/project/session linkage. Account deletion cascades private study data; shared circle resources retain the resource with an anonymized creator, as existing circle history does. No private planner text enters presence or optional telemetry.

Backup v3 contains all new tables in foreign-key order. Restore validates checksum and exact versioned table sets, requires an empty database, restores transactionally and still accepts v1/v2. Restoring account payloads advances their token epoch as before. Embedded PGlite supports local single-process operation; hosted PostgreSQL still requires the existing explicit migration operation and runtime lease.

Planner reads are bounded: 200 open / 300 total unarchived tasks, 20 projects/routines, 100 unresolved / 150 total unarchived distractions, 50 bookmarks/resources. Archiving frees capacity. Journal pagination uses `(started_at,id)` and respects the existing free 30-day / VIP 365-day history entitlement. Insights use 28 Riyadh calendar days, including original project snapshots and unassigned sessions. Targets default off and are capped at 240/day and 1,680/week.

Reminders recheck current cookies, membership, cancellation and server opt-in before disclosing a session title. Only dismissal persists across navigation; delivery is deduplicated in the open page. Browser permission is optional. No service worker, push subscription, email, SMS, closed-page scheduling or provider configuration is implied.

## Rollback and external boundary

All work is local on `feat/2026-10-22-top-20`. The baseline is `3091b0eefd0461163a15861d7fd67ddeb868e739`, preserved in the source manifest and before screenshots. The new runtime has synthetic storage and no copied `.env`. Reverting source to the baseline leaves additive tables intact; retain a v3 backup before changing any future deployed data. An older binary cannot represent new study records in its old-format backup, so downgrade/export is an explicit operational step, not an automatic destructive migration.

No push, merge, deployment, hosted migration, real payment, external message, provider-dashboard change or paid service was performed. Existing free access and VIP USD 4.99/month, three owned circles and twelve members remain unchanged.
