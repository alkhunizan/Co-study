# Readiness Task 5 handoff

## Work completed locally

Task 5 is complete locally with final verification on
`plan/site-wide-readiness-2026-10-18`, HEAD `e9412fd`.
Nothing was committed, stashed, pushed, merged or deployed. The user explicitly
requires preserving the dirty tree; all Task 1/2/3/4 work is retained. The
original checkout at `workspace/Co-study` was not changed.

Create/join now retain drafts through signup and refresh, collapse optional
fields, associate errors with inputs, announce pending/success/error states,
prevent duplicate submissions, and recover from stalled lookups/joins.
Protected previews use the server's deliberately limited response correctly.
Room password handoff is bound to its room code. Copy failures offer a bilingual
manual prompt. Full, expired and not-yet-open room errors are actionable.

Entry controls remain reachable at reduced phone heights, meet the 44px target
floor, and render readable entered text/actions in dark mode. Successful joining
hides the entry form from keyboard/accessibility navigation. Page exit disconnects
the socket; cached-page restoration rejoins through the guarded path. Provider
implementation and membership authorization are unchanged.

Final Node 22 quality passed: 223 unit and 201 integration tests, no skips,
zero production audit findings, syntax/types/lint/dead code/migrations clean.
The final five-suite browser matrix passed 208/208 with no skips across
Chromium/WebKit desktop/mobile (`final-smoke.log`). The existing mesh-blur
case uses its own fake-camera Chromium, including in WebKit-labelled projects;
this does not prove WebKit camera behavior.
Font-loaded inspection passed 40 base configurations and 16 expanded/error
configurations. The latter also checks 360×330px submit reachability and scoped
text contrast, with a 5.35:1 measured minimum. Physical keyboards and real video
are separate device checks.

See [Task 5 evidence](../../docs/superpowers/plans/2026-10-18-task5-evidence.md).

## Pending work

Tasks 6–10 remain. Local mocks and room shells do not close real-provider,
two-device/two-carrier camera, OAuth, staging migration, lost-host recovery or
exact deployed-SHA gates. No account-recovery feature or backend contract was
changed in Task 5.

## Decisions and preservation

- Keep the warm identity, shared public shell and all prior uncommitted repairs.
  Task 5 adds scoped entry styles; shared shell files, landing/article content,
  dependencies, restore repairs, recovery guidance and original OG assets remain
  unchanged from the Task 4 snapshot.
- Protected previews are `{ ok, room }` with `protected`/`requiresPassword`.
  Ordinary snapshots are flat. Do not flatten the server's privacy boundary or
  infer missing media/capacity details. The hidden badges need an explicit CSS
  `[hidden]` rule because their normal display is inline-flex.
- The draft is tab-scoped session storage, ignored/removed after 30 minutes
  without an update and cleared after successful creation. Passwords never go
  into invitation URLs or local storage. `halastudyRoomPasswordCode` prevents
  reuse in another room; preserve the legacy room-code handoff fallback.
- Workspace join deadlines invalidate late acknowledgements and disconnect the
  abandoned socket. Preserve generation checks and authoritative membership
  tokens. RealtimeKit capacity is enforced by its existing provider/token path,
  not by treating a shell participant count as mesh capacity.
- The account rejoin regression now checks successful entry and enabled chat;
  the reserved-name hint belongs to the correctly hidden entry form afterward.
- Original article/OG sources still match the saved Task 4 hashes. Snapshot
  comparison confirms only nine intended product/test files extended, plus the
  planning/continuity records; all other baseline files are byte-identical.

## Exact next step

Read Task 6 of
`docs/superpowers/plans/2026-10-18-site-wide-readiness-plan.md`. Walk lobby guest
viewing versus account-required camera publishing and inspect the existing
lobby/video/timer tests before changing working behavior. Preserve provider
and membership lifecycle safeguards; record real-device evidence separately.

## Environment notes

Resolve paths from the project root. X: maps to AMD's canonical E: OS share.
Use command-scoped Git trust for the resolved worktree. Portable Node 22.23.3
is recorded in TEMP `halastudy-node22/runtime-path.txt`; host Node is unchanged.
Keep the sanitized test-server helpers and loopback-only smoke network guard.
Real-font inspection allowed only loopback and Google font hosts.

Raw Task 5 logs/scripts/screenshots are ignored under
`output/readiness-task5-2026-10-18/`. Its 335-file baseline archive is in TEMP
`halastudy-readiness-task5-20261018/candidate-before-task5.tar`, diagnostic
material rather than a durable backup. Test ports were 3463/3464/3467; all Task 5 test servers were stopped at close.
Preserve the Task 3 empty-FontFaceSet guard on Windows WebKit and keyboard-only
menu-close handling. Never reset/stash/clean or replace earlier dirty files.

## Kickoff prompt

Continue readiness Task 6 on plan/site-wide-readiness-2026-10-18 at e9412fd.
Preserve all verified, uncommitted Task 1/2/3/4/5 work and read this handoff first.
Start with lobby guest/account entry and the existing media/session lifecycle
coverage, keeping the warm identity, shared shell and RealtimeKit boundaries.
