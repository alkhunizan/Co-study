# Twenty implemented features and their verification

The selection and acceptance criteria were set before implementation in [PLAN.md](PLAN.md), informed by the [official-source research](RESEARCH.md). Final gate results and source provenance are in [VERIFY.md](VERIFY.md). All planning tools are available to signed-in free members; existing VIP circle-creation and history entitlements are preserved.

| ID | What a user can do | Main verification |
|---|---|---|
| F01 | Create, edit, finish, reopen and archive private tasks. | Browser lost-response-after-commit retry creates one task; another account cannot read/edit it. |
| F02 | Organize tasks by private project; archive a project while keeping its tasks and original session history. | Foreign project denied; archive detaches current tasks and preserves historical snapshots. |
| F03 | Keep up to twenty independently checked substeps. | Persisted check/uncheck; duplicate/oversized step input denied; stable retry identifiers. |
| F04 | View open, today, upcoming, overdue and completed tasks with due dates and priorities. | Real browser date/priority/filter/edit flow; server rejects invalid dates and enums. |
| F05 | Repeat a task daily, weekly or on Saudi workdays after completing it. | Exactly one successor across retry and reopen/recomplete; Friday/Saturday skipped. |
| F06 | Compare estimated effort with credited time from completed linked sessions. | Frozen-server two-minute ledger; fast client clock cannot manufacture actual effort or XP. |
| F07 | Explicitly attach a task to an own focus session, including a session started without a task. | Immutable link, conflicting/foreign link denied; reload retains the selected task. |
| F08 | Save named focus/short-break/long-break/cycle routines. | Browser create/reload/use; scoped archive support; invalid ranges and plans above 240 focus minutes denied. |
| F09 | Follow deliberate finite focus/break rounds with long breaks, pause and return. | Pure state-machine checks, real UI advance, ordinary/second-tab pause, mismatched-session Stop, and closed-page pause recovery. R09 test fails before the correction and passes after it. |
| F10 | Park a distracting thought, set it aside or convert it to a task. | Browser conversion; concurrent conversions return one task; foreign note denied. |
| F11 | Save a private outcome and note on a completed session; revisit it from the journal. | Own-completed-session checks, versioned edits and idempotent retry; note is searchable. |
| F12 | Choose optional daily/weekly focus targets. | Off by default, bounded values, persisted settings; Riyadh day and Sunday-start week; no penalty or reward from setting a target. |
| F13 | See 28 days, last-seven versus prior-seven totals and original-project allocation. | Server daily buckets, rollover, private scope and archived-project snapshots; real zeroes remain zero. |
| F14 | Search and page through the entitled session journal. | Date/state/project/text filters, timestamp-tie cursor pagination, 30/365-day windows and reordered-response regression. |
| F15 | Save accessible rooms and return to them from another account session. | Retry deduplication, correct room URL, current access recheck; removed membership hides private title/code/join action. |
| F16 | See upcoming sessions across current private circles in the device time zone. | Multi-user UI and membership removal; empty upcoming state and local zone are explicit. |
| F17 | Respond Going, Maybe or Not going. | Persisted self response; current-member going counts; leave/remove/cancel invalidate access and stale RSVP. |
| F18 | Download a private multi-session calendar file. | Authenticated ICS, UTC instants, UTF-8 octet folding, escaping, stable UIDs, declined exclusion and no bearer tokens; removal empties private events. |
| F19 | Opt into open-page reminders, dismiss them, and optionally allow browser notifications. | Checkbox persistence, reload dismissal, fresh membership/preference validation; a cached appointment generates neither banner nor notification after removal. Browser/OS permission and an open page are required. |
| F20 | Share HTTPS resources and notes within a private circle. | Current members read; owner/supervisor add/archive; member/foreign/unsafe-link writes denied; same-circle draft survives a language switch. |

See `tests/integration/study-tools.integration.test.js`, `study-routine.integration.test.js`, and `tests/smoke/study-tools.smoke.spec.js`. The full suite retains existing guest, room, media privacy, recovery, owner/supervisor/staff, billing and reward checks. No task checkbox, estimate, reflection, routine timer, target or RSVP grants credited time, XP, a subscription or staff authority.

Archiving hides stored items; account deletion removes private planning data from the active database. Shared resources can remain with an anonymized creator, and backups follow the existing retention boundary. The served bilingual privacy notice now describes these data types and browser-local guidance/dismissal storage.
