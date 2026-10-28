# Acceptance and regression matrix

Status: **planned**. Historical results are linked as evidence; unchecked items
below are not new test passes. Record each result as PASS, FAIL, UNVERIFIED or N/A
with source SHA, environment, actor, exact action, actual result and evidence path.

## The six completed fixes must remain effective

| Finding | Required regression | Pass condition |
| --- | --- | --- |
| V3-01 Join/RTC | Hold room lookup/runtime responses, preserve draft, let deadline expire, retry against a valid/404 control | Request settles within configured bound; enabled action, useful error, no lost code/password; RTC readiness resolves safely |
| V3-02 Account errors | Persistence unavailable, unknown error and last-owner deletion denial in AR/EN | Localized useful message, retained draft, no raw error-key output or false success |
| V5-01 Supabase deadline | Send response headers, stall streamed body; complete a normal control | Body aborts at deadline; normal response works; queue remains recoverable |
| V5-02 Provider privacy | Synthetic private marker in non-2xx body/query; capture caller logs/errors | No marker, token, body or query secret; status remains usable |
| V5-03 Reminders | Fail one refresh, recover, revoke membership/opt-in during retry | Retry resumes, but fresh access/preferences precede every title/banner/notification |
| V8-01 Provider discovery | Config fails/stalls, Retry by keyboard, enabled and disabled provider controls | Retry visible/localized; provider appears only after successful enabled config; forms/safe return preserved |

Existing suite sources: `tests/integration/supabase-deadline.integration.test.js`,
`supabase-error-privacy.integration.test.js`, `foundations.integration.test.js`,
`tests/smoke/network-timeout.smoke.spec.js`, `account-errors.smoke.spec.js`,
`study-tools.smoke.spec.js`. Confirm exact current names before running.

## Twenty study features

For each row, use a real browser action and an independent server/storage assertion
where meaningful. Use users A/B, owner/member/removed-member and supervisor contexts.
No task, routine, target, reflection, RSVP or payment action may grant unearned time,
XP or staff access.

| ID | Positive journey | Failure, privacy and recovery control |
| --- | --- | --- |
| F01 Tasks | Create/edit/complete/reopen/archive; reload retains state | Foreign IDs denied; null/type/length/version/cap validation; lost committed response creates one task |
| F02 Projects | Assign tasks, archive project and retain tasks/history | Foreign project assignment denied; archived project detached from current tasks while original focus snapshot remains |
| F03 Checklists | Check/uncheck multiple steps, edit and reload | Twenty-step boundary, duplicate IDs and oversized text; creation retry retains stable IDs |
| F04 Planner | Today/upcoming/overdue/completed filters, priority and dates | Riyadh rollover, invalid date/enum, empty states and filters retained through navigation |
| F05 Recurrence | Daily/weekly/Saudi workday successor after completion | Retry/reopen/recomplete yields one successor; Friday/Saturday and week rollover correct |
| F06 Effort | Estimate compared with credited completed focus | Fast client clock, abandoned/uncredited session and manual history do not inflate actual effort/XP |
| F07 Focus link | Attach own task before/during eligible focus, then reload | Foreign/mismatched task/session denied; conflicting immutable link refused; active unlinked session remains attachable |
| F08 Saved routines | Save bounded routine, reload, select and archive | Foreign/invalid limits denied; archive/reopen quotas enforced; named draft survives language switch |
| F09 Guided rounds | Focus/short/long breaks, deliberate continuation, finite end | Pause/resume, duplicate tabs, closed-page pause, expired guide and mismatched-session Stop do not corrupt server focus |
| F10 Distractions | Park/resolve/unresolve/convert/reload | Concurrent/retried conversion creates one task; foreign note denied; caps enforced on reopening |
| F11 Reflection | Save/edit private outcome/note on a completed session | Active/foreign session denied; version conflict and lost response handled; no reward side effect |
| F12 Targets | Opt in/out, save daily/weekly targets | Bounds, conflict/retry, Riyadh day/Sunday week; setting/missing a target neither rewards nor penalizes |
| F13 Insights | 28-day and seven-day comparisons; original project allocation | Correct midnight buckets, archived project history, no cross-account totals; unavailable stays distinct from zero |
| F14 Journal | Search/filter/page entitled sessions | Tied timestamps, stale/reordered responses, date/state/project filters and free/VIP history windows |
| F15 Favorites | Save/search accessible room and return with correct URL | Dedup retry, deletion/removal/archival hide unavailable private title/code/action; cache keyed by account |
| F16 Agenda | Current-circle upcoming sessions in device timezone | Removed/left circle, canceled session, offline refresh and DST retain correct instants and useful retry |
| F17 RSVP | Going/Maybe/Declined persists; current-member counts | Foreign response denied; leave/remove/cancel invalidates RSVP; no claim of attendance from RSVP alone |
| F18 Calendar | Authenticated multi-session ICS import/download | UTC/escaping/UTF-8 folding/stable UID; decline/removal exclusion; no bearer token in exported file or URL |
| F19 Reminders | Explicit opt-in, due reminder, dismissal/reload and browser permission | Transient retry, fresh identity/membership/preferences, cancelled event and permission denial; open-page limitation explicit |
| F20 Resource shelf | Owner/supervisor add/archive; member reads HTTPS resources | Unsafe URL, nonmember/member write, revoked access and duplicate retry denied; same-circle draft survives translation |

Primary existing suites: `tests/integration/study-tools.integration.test.js`,
`study-routine.integration.test.js`, `circle-lifecycle.integration.test.js`,
`platform-api.integration.test.js`, `platform-storage.integration.test.js`, and
`tests/smoke/study-tools.smoke.spec.js`. Add only the cases these suites do not
already execute; preserve their current assertions.

## Core journeys and actors

| Journey | Required states and controls |
| --- | --- |
| First visitor/guest | AR default/EN switch; clear create/join action; valid/invalid/full/password room; intention; camera-off focus, break and end |
| Invitation | Shared code/deep link, account required only where intended, safe return, expired/revoked invitation, draft preserved without sensitive cross-room password leakage |
| Returning member | Recent/current eligible room, upcoming session, credible progress; account switching cannot reuse another user's private cached state |
| Circle owner | Invite, assign supervisor, schedule, remove, leave/archive where permitted; removed participants lose HTTP/socket/media/resource/calendar/reminder access |
| Supervisor | Only assigned circles/rooms/attendance; ordinary study navigation remains available; no staff grant via supervisor/VIP |
| Named staff | MFA and each permission enforced server-side; role change/revocation invalidates sessions; last super-admin protected; legacy shared admin retired after bootstrap |
| Recovery/deletion | Generic recovery response, real receipt on staging, one-use/expired tokens, concurrent reset, logout/revocation, reauth deletion and durable failure handling |
| Billing | Fixed offer, local simulator separated from provider sandbox; server-verified binding/refund/duplicates; no production charges or automatic renewal |

## Browser, accessibility and media matrix

- AR/EN × light/dark × 320/390/768/1440px for affected entry/account/room/member
  surfaces. Include text enlargement, reduced motion, mixed-direction codes/URLs,
  tab order, visible focus, Enter/Escape and announcement/error behavior.
- Real fonts: original diagnostic, branding-name rule, headings, contrast, geometry,
  no obstructed primary action, no unexpected horizontal overflow or hidden focusable
  dialog. Keep a separate font-outage/fallback run.
- Every affected brand/home variant: visible label included in computed accessible
  name; correct home target; descriptive localized action; decorative glyphs handled
  without duplicate/conflicting names. No axe exclusions to conceal V9-01.
- Media fixtures: denied/missing/busy camera, track replacement/device loss, blur
  processor failure, departure, reconnect and revocation. Failure must never silently
  publish raw/unblurred pixels. Remote-observer proof requires real devices on the
  designated authorized test app.
- Run camera suites without concurrent visual-batch browsers. Record expected
  injected non-2xx separately from unexpected console/network failures.

## Database, operations and release matrix

| Area | Required pass |
| --- | --- |
| PGlite/PG16 | All current migrations, scoped transactions, competing-runtime refusal, DB outage/lease loss/readiness/recovery |
| Snapshots | Current table set including ten study-tool tables and any new mail jobs; v1/v2/v3 compatibility or explicit version transition; corruption/nonempty target rejected |
| Restore | Empty authorized target, FK/row-count consistency, session/token invalidation, separate compatibility-account backup if applicable |
| Mail jobs | Encrypted bounded payload, valid recipient/token recheck before retry, TTL/attempt cap, restart recovery, no restored stale reset delivery |
| Configuration | One Node22 process; no production env in test runtime; correct HTTPS origin/cookies/CSP; readiness includes database |
| Live parity | Actual source/config/storage and public-content comparison; missing newer live work preserved; no assertion that old server is already on schema4 |
| HSTS | Active serving edge reconciled with template; HTTPS header and redirect verified; subdomain coverage accepted before enabling includeSubDomains on a new edge |
| Deploy/rollback | Exact approved artifact; current backup; explicit migration; compatible rollback rehearsed; no stale-JSON fallback |
| Production confirmation | Anonymous counted checks prove routes, source fingerprint, robots/sitemap/canonical/private noindex and health/readiness on the served artifact |

## Final result contract

Every case records actual evidence. The final receipt lists commands/exit codes,
source/manifest hashes, providers/devices, measured coverage and remaining gaps.
Previously passing counts are not carried forward as fresh results. A blocked check
remains UNVERIFIED; an intentional denial requires an intended positive control or
an explicit supported-state explanation. No test is skipped/weakened to declare GO.
