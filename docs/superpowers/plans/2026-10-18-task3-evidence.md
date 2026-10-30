# Task 3 verification evidence

## Candidate and scope

Work is local and uncommitted on `plan/site-wide-readiness-2026-10-18`, HEAD
`e9412fd`, in `workspace/Co-study-release-plan`. Node 22.23.3 is selected from
the existing portable runtime. The original checkout, production, remotes,
credentials, and Task 1/2 repairs were not changed.

Task 3 covers landing, open, account, lobby, blog index, privacy, terms and 404.
The opt-in public shell shares destinations, active links, accessible mobile
navigation, language/theme controls, and footer help/legal links. Existing page
language/theme engines remain responsible for preferences. The landing's old
menu initializer was removed so each page has one shell initialization path.
Study-room navigation does not opt into the shell.

The landing statistics wrap within the viewport. Tile labels wrap, have space
above timers, and retain readable cards in the phone grid. Account tabs and
checkbox labels now provide 44px targets. No global overflow suppression was
added. Existing warm colors, typography, photography and bilingual copy remain.

Legal pages use the shared preferences and display the selected language first.
Both complete translations remain present with their own `lang` and `dir`.
Their entire `<main>` contents are byte-identical to the Task 2 snapshot,
including text, contacts and direct anchors.

## Reproduction and regression coverage

- Before CSS changes, real fonts reproduced 444px document width at a 390px
  viewport. The guarded Chromium desktop test failed at 437px. Mobile Chromium
  inflated `innerWidth`, so the regression also checks against the explicitly
  requested 390px width instead of trusting that expanded value.
- Ten initial consistency tests failed for missing navigation or legal pages
  ignoring saved English/dark preferences.
- A keyboard regression reproduced focus loss when switching layouts. The
  final handler captures the blur that can occur before a media-query event,
  then restores focus to the corresponding visible control. Enter, Escape,
  Tab exit, current-link state, menu targets and persisted preferences are tested.
  WebKit also exposed Tab leaving the page without a new `focusin`; a deferred
  check after Tab now closes the menu after focus has settled outside it. This
  is keyboard-only: Safari touch clicks need not focus their buttons.
- A separate tile regression failed on overlapping names/timers before the
  responsive grid and caption spacing repair.
- The guarded fixture still blocks external network requests. Windows WebKit
  reported an empty FontFaceSet as `loaded` while its `ready` promise remained
  pending. The regression now requires `loaded` status and awaits `ready` when
  faces actually exist. Real-font inspection remains separate and mandatory.
- The existing 404 language test now opens the phone menu before selecting a
  language. Its translation assertions remain intact.

## Browser inspection

The local inspection server uses sanitized test configuration and temporary
state. The real-font browser allows only loopback and Google's two font hosts;
other external requests are blocked. It performs no production operation.

The 160-configuration sweep covers eight pages × Arabic/English × light/dark ×
360, 390, 768, 1024 and 1440px. It recorded no document overflow, clipped
controls, undersized effective targets, preference mismatch or page exceptions.
Inline text links are excluded from the block-control target check; checkbox
targets are measured through their associated clickable labels.

After the final tile CSS change, another 20 landing configurations passed with
real fonts. Fourteen additional checks cover both languages at those five
widths plus 1099/1100px: no header-control or name/timer intersections. Screenshots
were visually inspected across the page types, languages, themes and widths,
including phone menus, tile rows, preview cards and the desktop breakpoint.

All 13 discovered local page/deep-link destinations returned 200. The separate
`/auth/google` endpoint returns 404 on this credential-free inspection server;
real OAuth remains a provider/configuration gate, not a local page-navigation
claim. No OAuth request was sent to a real provider.

## Automated checks

`npm run test:ci:quality` exited 0 on Node 22.23.3: syntax, static migration
contract, TypeScript, lint, dead-code check, production audit (zero findings),
223 unit tests and 201 integration tests passed; no unit/integration skips.
After the final handler change, syntax (154 sources), TypeScript and lint
(148 files) passed again; see `static-final.log`.

The landing and site-consistency suites passed **68/68**, no skips, across
Chromium desktop/mobile and WebKit desktop/mobile (`public-verified.log`,
exit 0). A separate final keyboard/layout regression run passed **4/4** across
the same projects (`keyboard-final.log`, exit 0). Browser engines were the
repository's Playwright Chromium 1248 and WebKit 2272 installations.

The broader 188-case smoke diagnostic started before the final tile test and
menu-handler repair. It recorded 177 passes, 3 WebKit-mobile failures from the
intermediate touch/blur handler, 2 existing mobile skips for the desktop-only
admin force-close table, and 6 unrun cases after the failure cap. Every failed
or unrun case belongs to the public-page suite and passed in the subsequent
68-case run. This is **not** a claim that a fresh full release-wide browser gate
passed; rerun that gate on the final readiness candidate in the later plan task.

The first quality run exposed two stale assertions in
`tests/unit/rollout-compatibility-contract.test.js`: Task 2 changed the deployment
wording and replaced the npm shorthand with an explicit environment-loading
Node invocation. The test now checks the revised migration → disable joins →
stop writer → install order and retains both required migration apply flags.
The runbook is unchanged. All other contract assertions remain; the focused
contract test passed after this alignment.

## Preservation and evidence locations

The session-start SHA-256 manifest and temporary source snapshot cover 326
candidate files. Comparison confirms Task 1's manifest, lockfile and restore
test, and Task 2's release/startup/recovery documents, are byte-identical.
Planning, TODO and continuity records receive additive Task 3 results.

Raw logs, scripts and screenshots are local ignored artifacts under
`output/readiness-task3-2026-10-18/`:

- `baseline-hashes.json`, `baseline-browser.json`, `overflow-desktop-red.log`,
  `consistency-red.log`, `resize-red.log`, `tile-red.log`.
- `sweep-final.json` / `.log` (160 configurations),
  `landing-fonts-final.json` / `.log` (20 final landing configurations),
  `boundaries-final.log` (14 font-loaded boundary/tile checks).
- `final-*.png`, `landing-final-*.png`, `tiles-*.png`, `preview-*.png`,
  `boundary-*.png` and phone-menu screenshots.
- `webkit-fonts-diagnosis.log`, `public-final.log` (WebKit blur regression),
  `public-verified.log`, `keyboard-final.log`, `smoke-full.log`,
  `quality-verified.log`, `static-final.log`, `preservation.json`.

## Limits and next task

This is local browser and test evidence, not deployment or real-device proof.
Task 2's Linux infrastructure evidence remains separate; it was not rerun for
these presentation changes. Docker already copies `public/js` and the
design-system CSS files. Later readiness work must rerun gates on its final
candidate and complete real-provider/device, staging migration, recovery and
deployed-SHA checks.

Task 4 remains next: replace simulated activity and reconcile landing/blog
claims. The counters, demo media claims, articles, account recovery and
production settings were not changed in Task 3.
