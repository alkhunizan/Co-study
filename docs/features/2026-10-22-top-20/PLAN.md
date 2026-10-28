# Twenty features — implementation plan

Current baseline: 3091b0eefd0461163a15861d7fd67ddeb868e739, branch feat/2026-10-22-top-20. Existing unrelated untracked work is preserved. Outputs stay here; source/tests stay in their established locations. Local implementation only: no provider/dashboard changes, live messages/payments, production data, push, merge or deployment. Existing free access and VIP commercial terms stay unchanged.

Model: Halastudy is a bilingual web app for focused study with quiet company.
Audience: Saudi/GCC students, with guests, members, private circles, supervisors and named staff.
Data/trust: server-owned accounts/permissions/focus ledger in PostgreSQL-compatible storage; process-local presence; optional external media/Google/mail/payment providers remain acceptance boundaries.

## Chosen twenty

| ID | Addition | Acceptance |
|---|---|---|
| F01 | Private task inbox | Create/edit/complete/archive persists; user B cannot access user A data; request retries deduplicate. |
| F02 | Projects | Organize tasks by private project; archive preserves tasks; foreign project references fail. |
| F03 | Subtask checklists | Bounded steps persist and toggle independently without granting focus credit. |
| F04 | Today/upcoming planner | Due dates and priorities support Today, upcoming, overdue and completed views with honest empty states. |
| F05 | Recurring tasks | Daily, Saudi workdays and weekly recurrence creates exactly one next task on completion. |
| F06 | Effort estimates versus actual | Task estimates compare with linked server-credited time, never client timer claims. |
| F07 | Task-linked focus | Explicit task selection binds the actual own session once; cross-account or conflicting attachment fails. |
| F08 | Saved focus routines | Named work/short-break/long-break/cycle settings persist across account sessions. |
| F09 | Guided Pomodoro cycles | Finite work/break sequence, long breaks, pause, reload and deliberate continuation work without fabricating server credit. |
| F10 | Distraction parking lot | Quick private capture, resolve and convert to a task; conversion retries are idempotent. |
| F11 | Post-session reflection | Outcome/note attach only to an own completed session; edits persist; no rewards from ratings. |
| F12 | Daily/weekly targets | Bounded optional targets use validated completed focus, Riyadh day and Sunday-start week; rest is welcomed. |
| F13 | Deeper focus insights | 28-day activity, weekly comparison and project allocation use actual owned sessions, with unavailable distinct from zero. |
| F14 | Searchable focus journal | Date/state/task/project search and paging respect history entitlements and ownership. |
| F15 | Favorite rooms | Save actual accessible rooms across devices; removed/ended/private-ineligible rooms reveal no stale title or join action. |
| F16 | Personal agenda | Upcoming sessions across current private circles show local timezone, eligibility and useful room links. |
| F17 | Session RSVPs | Going/maybe/declined persists; current-member counts only; leaving/removal/cancellation invalidates access. |
| F18 | Personal calendar export | Authenticated multi-session ICS download escapes content, includes no bearer tokens and respects current membership. |
| F19 | Opt-in reminders | Account preference plus in-app/browser reminder while open, no outbound messaging or closed-browser promise; dismiss deduplicates. |
| F20 | Circle resource shelf | Owner/supervisor manages bounded HTTPS links/notes; only current members read; unsafe URLs and foreign writes fail. |

Research: Focusmate features/favorites/calendar/quiet modes; Focus To-Do private tasks/projects/subtasks/recurrence/history; Flow Club intentions/session agendas/calendar/check-ins; Caveday guided work/break/check-out; Study Together quiet timed rooms. Primary-source metadata are in research/. Ranking and adaptation are product judgments, not a market-share claim. Existing room boards, timer presets, seven-day strip, readiness, recurring room schedules and individual ICS links are not counted again.

## Architecture and verification

Add one private study domain and a modular workspace controller/copy file; keep primary navigation at four destinations. Add version-4 additive schema, version-3 backups with v1/v2 restore compatibility and deletion cascades. Reuse live identity/permission checks, parameterized SQL, user/cohort lock order and authoritative focus accounting. Private content never enters public room presence, telemetry or rewards.

Implement in slices: persistence/private planning; focus/routines/reflection/insights; favorites/agenda/RSVP/calendar/resources/reminders; bilingual presentation and recovery; full gate and browser review. Use Node 22 in a fresh isolated runtime without .env. Tests cover actual document language/theme, failure/retry, duplicate requests, cross-account scope, member removal, migration/backup restore and old journeys. All twenty require implementation and evidence; no essential feature is a placeholder.
