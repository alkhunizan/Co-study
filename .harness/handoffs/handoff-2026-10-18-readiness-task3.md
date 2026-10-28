# Readiness Task 3 handoff

## Work completed locally

Task 3 is complete locally on `plan/site-wide-readiness-2026-10-18`, HEAD
`e9412fd`. Nothing was committed, published or deployed. All Task 1/2 repairs
remain uncommitted and preserved; their dependency, restore-test and runbook
files are byte-identical to the session-start snapshot.

Repaired English landing overflow (444px → 390px with real fonts), overlapping
tile labels/timers, and phone card grids. Added opt-in `public/js/public-shell.js`
and `design-system/public-shell.css` to eight public pages for common navigation,
current links, mobile menus, language/theme controls and footer help/legal links.
Existing page preference engines are reused; the old landing menu initializer
was removed. Study controls remain separate. Legal `<main>` contents, including
both translations and contacts/anchors, are byte-identical.

Node 22 quality passed: 223 unit and 201 integration tests, no skips, production
audit zero findings, syntax/types/lint/dead code/static migration checks clean.
Final public browser regressions passed 68/68 across Chromium and WebKit,
desktop and mobile; final keyboard/layout rerun passed 4/4. Font-loaded sweeps
passed 160 page configurations plus 20 final landing configurations, with 14
additional breakpoint/label-intersection checks. Final static checks passed.
See [Task 3 evidence](../../docs/superpowers/plans/2026-10-18-task3-evidence.md).

## Pending work

Tasks 4–10 remain open. The broad smoke diagnostic was not a final green gate:
177 passed, 3 intermediate WebKit touch-menu failures, 2 existing mobile admin
skips and 6 unrun cases. The final 68-case public run covers and passes every
failed/unrun case, but the final release-wide browser gate must still run later.
Real-provider/device checks, designated-staging migration, lost-host recovery
and deployed backend SHA remain release requirements.

## Decisions and deviations

Keep the warm visual identity. No global overflow hiding was added. All work
intentionally remains uncommitted: do not stash, reset, switch the older checkout,
or commit without request. The original `workspace/Co-study` and its blog/OG
work remain untouched.

The guarded overflow test checks actual viewport width as well as document
width; mobile engines can inflate `innerWidth`. Windows WebKit can leave an
empty FontFaceSet's `ready` promise pending even when its status is `loaded`;
the test checks status and awaits `ready` only when faces exist. Real-font
inspection is separate; do not weaken the loopback-only test network guard.

Menu focus handling covers blur before media-query changes and Tab leaving the
page. The deferred exit check is keyboard-only because Safari touch clicks
need not focus buttons. Keep these regressions intact when changing the shell.

Aligned two stale assertions in `rollout-compatibility-contract.test.js` to
Task 2's revised stop-writer/install wording and explicit Node migration command.
The runbook itself and its safety requirements were not changed.

## Exact next step

Read Task 4 of `docs/superpowers/plans/2026-10-18-site-wide-readiness-plan.md`,
then add the content regression before removing simulated activity totals and
LIVE badges. Use the approved bilingual quiet-room phrase and preview labels.
Keep the shared shell and compare the original blog/OG patch separately; do
not copy whole old pages over these newer changes.

## Environment notes

Resolve paths from the project root. X: maps to AMD's canonical E: OS share.
Use command-scoped Git trust for the resolved worktree, never a global exception.
Portable Node 22 is still recorded in temporary
`halastudy-node22/runtime-path.txt`; host Node 24 was not changed. WebKit 2272
was installed using the repository's Playwright dependency. Raw logs/scripts
and screenshots are ignored under `output/readiness-task3-2026-10-18/`.
Use an isolated smoke port such as 3463 and the existing sanitized test helpers.
The 326-file baseline archive in TEMP is diagnostic material, not a durable backup.

## Kickoff prompt

Continue readiness Task 4 on plan/site-wide-readiness-2026-10-18 at e9412fd.
Preserve all verified, uncommitted Task 1/2/3 work and read this handoff first.
Start with the landing content regression, then remove simulated activity and
reconcile landing/blog claims while keeping the warm identity and shared shell.
