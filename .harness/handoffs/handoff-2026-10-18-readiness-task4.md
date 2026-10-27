# Readiness Task 4 handoff

## Work completed locally

Task 4 is complete locally on `plan/site-wide-readiness-2026-10-18`, HEAD
`e9412fd`. Nothing was committed, stashed, pushed, merged or deployed. All
Task 1/2/3 work remains uncommitted and preserved. The original checkout at
`workspace/Co-study`, including its article edits and OG images, is unchanged.

Landing activity counts and LIVE badges are gone. The approved bilingual quiet
phrase and Room preview labels replace them; illustrative names/media remain
labelled and sample timers are frozen. The hero opens rooms or visits the lobby,
with camera/mic and guest/account boundaries explained before entry. Unsupported
activity, privacy and feature promises were corrected in both languages.

Compared and applied the original article patch as a separate diff. Candidate
article bases matched its bases; no whole old pages were copied over new work.
Retained editorial layouts, cross-links and inspected 1200×630 OG images, corrected
claims and FAQ schema, removed unverified dates/reading times, and enlarged
article brand/back/footer/FAQ targets to 44px. Articles remain Arabic; the English
index says so, and stored language preferences are preserved.

Node 22 quality passed: 223 unit and 201 integration tests, no skips, zero
production audit findings, syntax/types/lint/dead code/migrations clean.
Public browser suites passed 80/80 across Chromium/WebKit desktop/mobile;
final article refinement passed 8/8. Real-font inspection covered 80 page
combinations, then all 40 article combinations after target repairs. No measured
overflow, clipped controls, small block targets, tile collisions, page errors
or broken local links remain in those final configurations. Inline prose links
are excluded from the block-target measurement.

See [Task 4 evidence](../../docs/superpowers/plans/2026-10-18-task4-evidence.md).

## Pending work

Tasks 5–10 remain open. The full release-wide smoke/infrastructure gates,
real-provider/device and OAuth checks, designated-staging migration, lost-host
recovery and deployed-SHA proof are still required. Local public-page tests
do not close those gates. No account-recovery feature or backend/media code
was changed in Task 4.

## Decisions and preservation

- Keep the warm identity, Task 3 shared shell and responsive tile rules. Shared
  shell files, legal pages, study code, Task 1 dependencies/restore repairs and
  Task 2 recovery guidance are unchanged from this session's baseline.
- Instant rooms accept guests. Scheduling and lobby camera publishing require
  accounts. Mic defaults come from the production video policy; do not promise
  mesh-only blur/AI features for RealtimeKit.
- Original blog/OG source files are byte-identical to their saved hashes. The
  candidate copies of the two PNGs match the originals. Article FAQ schema must
  track visible answers when content changes.
- Retained third-party descriptions are narrow and link official sites. No
  traffic totals, assured occupancy or comparative privacy guarantees remain.
- Final hero entry copy uses the stronger secondary-text color for readability.
  The older unused community-stat CSS is retained; there is no rendered stats
  markup or activity simulation.

## Exact next step

Read Task 5 of `docs/superpowers/plans/2026-10-18-site-wide-readiness-plan.md`.
Walk the existing guest and signed-in create → invite → join → leave flows,
starting with their current smoke coverage, before changing working behavior.
Cover invalid/protected/full/expired rooms and failures without losing input.
Preserve every uncommitted repair and keep real-provider verification separate
from sanitized local tests.

## Environment notes

Resolve paths from the project root. X: maps to AMD's canonical E: OS share;
use command-scoped Git trust for the resolved worktree. Portable Node 22.23.3
is recorded in TEMP `halastudy-node22/runtime-path.txt`; host Node is unchanged.
The existing Playwright dependency provides Chromium and WebKit. Keep its
loopback-only smoke network guard and sanitized server helper intact.

Raw Task 4 logs, snapshots, scripts and screenshots are ignored under
`output/readiness-task4-2026-10-18/`. The 331-file session-start archive is in
TEMP `halastudy-readiness-task4-20261018/candidate-before-task4.tar`; it is
diagnostic material, not a durable backup. Task 4 used isolated ports 3463,
3467 and 3468. All its test servers were stopped after verification.

Preserve the Task 3 empty-FontFaceSet guard on Windows WebKit and the
keyboard-only deferred menu-close logic. Do not broaden that close logic to
all blur events; Safari touch interactions can lack focus transfer.

## Kickoff prompt

Continue readiness Task 5 on plan/site-wide-readiness-2026-10-18 at e9412fd.
Preserve all verified, uncommitted Task 1/2/3/4 work and read this handoff first.
Start by walking the current create/join/onboarding flows and existing tests;
keep the warm identity, shared shell and production RealtimeKit boundaries.
