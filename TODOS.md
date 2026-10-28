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

### Ack timeout on /open create-room emit
**Priority:** P2
`socket.emit('create-room', payload, cb)` has no timeout — a server restart
mid-create leaves the button on "Creating…" forever. Use
`socket.timeout(8000).emit(...)` and surface a retry.

### Rate-limiter memory growth under key rotation
**Priority:** P3
`SlidingWindowRateLimiter.entries` prunes a key only when that key is checked
again; rotating IPv6 sources accumulate entries for the process lifetime. Add a
periodic sweep.

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
hero, topbar icon-button pill radius + 44px touch floor.

Task 3 completed the public topbar pill/44px floor, account-tab floor and
44px checkbox labels. The other polish items above remain open.

### Journal nav link has no destination yet
**Priority:** P3
`#journal` anchors nothing. Kept deliberately (Aziz) — build the section or
point the link somewhere real before launch.

Task 3 resolution: the shared public Journal/المدونة destination is `/blog`.
This placeholder-navigation item is resolved locally; article/content work
continues in Task 4.

### Replace AI placeholder media with real members
**Priority:** P3
Tiles, portraits, and hero clips are AI placeholders behind an "Illustrative
preview" label; community copy still says "Real students". Swap in real footage
(same filenames) and drop the label when it lands.

## Completed

- Gate /api/rooms/:roomId behind a trimmed public snapshot (roomId, name,
  requirePassword, mediaMode, counts, schedule) — chat history, participants,
  and board no longer readable over unauthenticated HTTP; asserts moved to
  join-room acks + regression test. **Completed:** fix/room-snapshot-privacy (2026-07-02)
- Landing/open split with review fix-set: SFU-aware security headers,
  protected-room password handoff, /open scroll restoration, room-code RTL fix,
  sanitizer hardening, storage-migration parity, IANA clocks, honesty label,
  cache headers, CSS-only design-system mount, HSTS. **Completed:** v1.1.0.0 (2026-06-10)
