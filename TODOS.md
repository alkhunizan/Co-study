# TODOS

Working list for Halastudy. Grouped by component, P0 (urgent) → P4 (someday).
Completed items move to the bottom with the version that shipped them.

## Server

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
hero, topbar icon-button pill radius + 44px touch floor.

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
The platform layer, landing/blog refinements, contact page and study tools live
on `viber/2026-10-27` (archived as tags). A straight merge hits 32 conflicts that
are behavioural decisions (account storage, OAuth deletion, room persistence,
video lifecycle), so pieces must be ported one at a time onto hardened `main`.
Codex's half-finished merge attempt was snapshotted as
`archive/codex-full-expansion-2026-10-28/uncommitted`; it holds nothing beyond
`main` + `viber` except unresolved conflict markers.

### WebKit smoke projects are not installed on the Windows dev machine
**Priority:** P4
Only Chromium is installed locally, so `webkit-desktop` and `webkit-mobile` are
verified in CI only. `npx playwright install webkit` enables them locally; CI's
Linux run stays the source of truth because Windows WebKit timing and rendering
differ (the five-participant test was the slow one).

### Stale local worktrees and private refs
**Priority:** P4
`git worktree list` still holds the triage runtime (`triage/open-brs-2026-10-27`,
registered under a UNC path that `git worktree remove` rejects), Codex's
`integrate/full-expansion-2026-10-28` integration tree (archived, see above) and
the readiness tree with 53 uncommitted files. Invalid private
`refs/codex/turn-diffs/checkpoints/...` objects make `git fetch --all --prune`
fail. Clean up with `git worktree prune` after re-registering the paths, and
delete the broken private refs after confirming nothing needs them.

## Completed

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
