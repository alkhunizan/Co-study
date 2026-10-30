# TODOS

Working list for Halastudy. Grouped by component, P0 (urgent) → P4 (someday).
Completed items move to the bottom with the version that shipped them.

## Readiness candidate — 2026-10-18

### Repair vulnerable candidate dependencies
**Priority:** P0
Baseline at `e9412fd` on Node 22.23.3: production audit reports five affected
packages (`body-parser`, `engine.io`, `proxy-addr`, `qs`, `socket.io-parser`).
The full audit also reported development dependency `smol-toml`. Compatible
updates now clear the full audit (zero findings); the parser override floor is
`^4.2.7`. Fixed locally, unshipped. Evidence is recorded in
[Task 1 verification](docs/superpowers/plans/2026-10-18-task1-evidence.md).

### Restore tests depend on the wall clock
**Priority:** P1
Four `backup-restore.test.js` tests failed because their July artifact fixture
was evaluated against the October wall clock and correctly rejected as stale.
The tests now pass an explicit July restore timestamp; all 15 focused restore
tests and all 223 unit tests pass. Production retention/tombstone checks and
existing assertions are unchanged. Fixed locally, unshipped; the full quality
gate also passes with 201 integration tests, as recorded in the linked evidence.

### Public layout and navigation consistency
**Priority:** P1 — fixed locally, unshipped
Task 3 repaired the 390px English overflow, overlapping tile captions, shared
public navigation, legal language/theme preferences, phone-menu keyboard exits,
and undersized header/footer/account-tab/checkbox-label targets. Both legal
texts are preserved byte-for-byte. The final public regressions pass 68/68
across four browser projects; Node 22 quality passes 223 unit and 201 integration
tests. See [Task 3 evidence](docs/superpowers/plans/2026-10-18-task3-evidence.md).
The release-wide browser gate remains a later final-candidate requirement.

### Landing and article credibility

**Priority:** P1 — fixed locally, unshipped

Task 4's landing/blog content gate is complete locally, unshipped: simulated
activity and unsupported privacy/feature promises were removed, preview media
was labelled, and the reviewed original article/OG patch was integrated without
changing its source checkout. Public browser checks passed 80/80, final article
checks 8/8, and all 80 final font-loaded page combinations pass measured layout
and target checks. See [Task 4 evidence](docs/superpowers/plans/2026-10-18-task4-evidence.md).
Task 5 create/join/onboarding checks also passed locally; final release gates remain open.

### Create, join and onboarding recovery

**Priority:** P1 — fixed locally, unshipped

Task 5 repaired lost drafts, stalled joins, silent clipboard failures and the
protected-preview contract mismatch. Duplicate submits and late acknowledgements
are guarded; room passwords stay bound to their room. Field feedback, optional
controls, phone-height scrolling and dark entry colors are repaired. Final browser
checks passed 208/208 with no skips; quality passed 223 unit / 201 integration.
See [Task 5 evidence](docs/superpowers/plans/2026-10-18-task5-evidence.md).
Task 6 lobby/study journeys are next; real-provider/device gates remain open.

## Server

### Verify recovery beyond the six-dataset artifact before release
**Priority:** P0
Task 2 reconciled the runbooks and passed Linux infrastructure plus 86 existing
recovery/migration/startup/deploy tests. Live staging migration, real signed
webhook delivery, and lost-host recovery remain release gates. The encrypted
artifact excludes video-session/webhook sidecars and secrets; preserve them
through code rollback and rehearse their separate recovery. Pins still fail
safe restore at 30 days. Partial local diagnostic backups can replace a daily
artifact, so verify completeness rather than CLI exit alone. See
[Task 2 evidence](docs/superpowers/plans/2026-10-18-task2-evidence.md).

### Bootstrap is provisioning, not candidate deployment
**Priority:** P1
The current bootstrap script clones/updates GitHub main and prints abbreviated
environment/verification instructions. Task 2 deployment and launch docs now
call this out and supply the complete candidate procedure. Do not execute its
printed startup steps as a complete release checklist. Select the reviewed SHA,
load all required secrets, complete offline rollout and create a verified daily
backup before deploy verification. No bootstrap behavior was changed here.

### Deploy-time manual QA: real-SFU camera delegation
**Priority:** P1
The Permissions-Policy/CSP allow-listing is integration-tested at the header
level, but the fake SFU never calls getUserMedia. One manual pass against a
real cross-origin SFU at first deploy.

## Landing

### Re-encode team/tile photography
**Priority:** P2
8 referenced JPEGs are 1254–1536px / 130–247KB but render at ~200–480px. Resize
to ~2× display width and add WebP via `<picture>` — roughly 1.2MB saved on a
mobile-heavy market.

### Trim the webfont payload
**Priority:** P2
Both pages load 5 families / ~27 variants from Google Fonts. Audit used weights,
drop the rest, consider self-hosting the 3–4 critical WOFF2 files.

### Lazy socket.io connect on /open.html
**Priority:** P3
`io()` connects at parse time for every visitor; only the create flow needs it.
Connect on first submit and load the client script deferred.

### Design polish batch (DESIGN.md §3/§4 alignment)
**Priority:** P3
Lucide line icons for the ✦/➤ glyphs (with RTL mirroring), checkbox-tiles
instead of bare checkboxes, h2 heading level on /open, hover states off
non-interactive cards, `.form-card` max-width 560px, accent-count pass on the
hero, topbar icon-button pill radius + 44px touch floor (footer links in
`.footer`/`.legal-footer` are ~18px tall on every public page).

Task 3 completed the public topbar pill/44px floor, account-tab floor and
44px checkbox labels. The other polish items above remain open.

Task 3 resolution: the shared public Journal/المدونة destination is `/blog`.
This placeholder-navigation item is resolved locally; article/content work
continues in Task 4.

### Replace AI placeholder media with real members
**Priority:** P3
Tiles, portraits, and hero clips are AI placeholders behind an "Illustrative
preview" label; community copy still says "Real students". Swap in real footage
(same filenames) and drop the label when it lands.

## Ops console (admin)

### Billing and Team & Access sections
**Priority:** P3
The Ops workspace design has eight sections; `main` ships six. Billing and Team
& Access need the feature line's platform layer (SQL store, staff roles, MFA,
DigetPay), which `main` does not have — the console still signs in with the
single `ADMIN_PASSWORD_HASH`. Build them only together with a real backend; no
placeholder panels.

## Repository and tooling

### Feature line `viber/2026-10-27` is not on main
**Priority:** P2
The platform layer, landing/blog refinements and study tools live on
`viber/2026-10-27` (archived as tags); the contact page has been ported. On
2026-10-30 `main` was merged into the feature line (2f3f31b) and PR #35 became
mergeable, with every CI check passing on 8dc5a29 apart from the flaky WebKit
mobile items under "Workspace and browser smoke". Remaining: review and merge
PR #35 (still a draft).
Codex's half-finished merge attempt was snapshotted as
`archive/codex-full-expansion-2026-10-28/uncommitted`; it holds nothing beyond
`main` + `viber` except unresolved conflict markers.

### SEO layer for public pages (from the feature line)
**Priority:** P3
`services/seo/public-pages.js` on `viber/2026-10-27` adds `/en/*` routes,
canonical + hreflang pairs, ContactPage/Article JSON-LD and footer link
injection for every public page. `main` serves `/contact` with a single
bilingual page instead. Port it as its own change; the contact page already
has the content it would render.

### Site-wide readiness work exists only as an archive
**Priority:** P2
The 2026-10-18 "site-wide readiness" pass (shared `public-shell.js`/`.css`,
blog OG images, `site-consistency.smoke.spec.js`, edits across public pages;
53 files) was never committed. It is on neither `main` nor the feature line,
only in `archive/open-brs-2026-10-28/readiness-dirty-snapshot` (content
verified identical to the folder) and its uncommitted worktree at
`workspace/Co-study-release-plan`. Decide whether to port it or drop it; the
worktree stays until then.

### Leftover Codex review worktrees
**Priority:** P4
`output/open-brs-2026-10-27-admin-followup/runtime` and
`output/open-brs-2026-10-28/runtime` (branch `fix/repo-health-2026-10-28`) are
Codex's triage review trees with its reports. `E:` is the mapped share
`\\192.168.50.113\E`, so worktrees registered by UNC path can only be removed
after rewriting their `.git` link files to the `E:/` form (done for the
readiness tree). Three `refs/codex/*` refs remain but no longer break
`git fetch --all --prune`.

## Workspace and browser smoke

Diagnose WebKit failures from the CI Playwright artifact (`trace.zip`: network,
actions, DOM snapshots); local Windows WebKit is slower and renders fonts
differently, so it both fails tests CI passes and passes tests CI fails.

### Study workspace loading line shifts the tabs
**Priority:** P3
While it loads, the study workspace prepends a "Loading" status line (28px plus
24px of margin) above itself and removes it when done, moving the tabs about
52px. A tap during that shift can hit the wrong control; CI WebKit caught it in
study-tools:497 (the test now waits for loading to finish). Reserve the line's
space or overlay it.

### WebKit mobile LCP budget is borderline (known flake)
**Priority:** P3
`ux-journeys` "stable hero" measures LCP on emulated iPhone WebKit against a
soft 2.5s budget; PR #35 runs measured 2.55-3.09s and failed 4 of 6 runs
(2026-10-30). The online-fonts diagnostic in `ux-return` shares the budget. The
likely fix is "Trim the webfont payload" (preload or self-host the hero font).
The budget was deliberately not loosened.

### WebKit engine crashes on navigation in long smoke runs (known flake)
**Priority:** P3
"page.goto: WebKit encountered an internal error" hit `ux-return:21` and
`landing:85`, once each, in 25-34 minute single-worker WebKit runs. It is
engine-level and not reproducible from test code. If it keeps recurring, decide
whether CI should retry WebKit jobs.

### Cross-tab focus pause can miss the 10s window on WebKit (known flake)
**Priority:** P3
Once in `study-tools:497`, a pause made in a second tab did not reach the first
tab within 10s. `focus-client.js` relies on one BroadcastChannel message; its
fallback runs every 15s and, while a session is active, sends a heartbeat rather
than re-reading state. Reconciling on that heartbeat or a shorter fallback would
close the gap.

## Completed

- Contact page at `/contact` (bilingual, email/phone/WhatsApp, operator
  disclosure matching privacy.html) linked from every public footer.
  **Completed:** feat/contact-page (2026-10-28)
- WebKit runs locally on the Windows dev machine (`npx playwright install
  webkit`): full WebKit smoke 86 passed / 6 skipped. **Completed:** 2026-10-28
- Stale triage and Codex integration worktrees removed after verifying their
  archive tags; redundant branches deleted. **Completed:** 2026-10-28

- Syntax-check inline `<script>` blocks in HTML pages (`npm run check`); JSON-LD
  parsed as JSON. **Completed:** PR #27 (2026-10-28)
- Ops console rebuilt on `main` in five slices: append-only admin audit log with
  rotation (#21), required reasons for close/kick/ban/unban (#22), Ops workspace
  shell with AR/EN and deep links (#23), translated panels + Audit section (#25),
  DESIGN.md §6/§11 pass (#26). **Completed:** 2026-10-28
- Join button no longer submits natively before `index-app.js` attaches its
  handler (the "nickname cleared" smoke flake and a slow-network data-loss bug).
  **Completed:** PR #24 (2026-10-28)
- Hardened main released (#18), CI cancels superseded PR runs (#19),
  socket.io-parser override floor 4.2.7 (#20). **Completed:** 2026-10-28
- Rate limiters bounded (`maxEntries` + LRU eviction, expired-entry sweep).
  **Completed:** 276018c fix: bound runtime security registries
- `socket.timeout(8000)` on the /open create-room emit with a retryable error;
  dead `#journal` link dropped. **Completed:** 1569842 (2026-07-02)
- Gate /api/rooms/:roomId behind a trimmed public snapshot (roomId, name,
  requirePassword, mediaMode, counts, schedule) — chat history, participants,
  and board no longer readable over unauthenticated HTTP; asserts moved to
  join-room acks + regression test. **Completed:** fix/room-snapshot-privacy (2026-07-02)
- Landing/open split with review fix-set: SFU-aware security headers,
  protected-room password handoff, /open scroll restoration, room-code RTL fix,
  sanitizer hardening, storage-migration parity, IANA clocks, honesty label,
  cache headers, CSS-only design-system mount, HSTS. **Completed:** v1.1.0.0 (2026-06-10)
