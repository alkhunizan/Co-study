# Halastudy unpublished commit inventory

Inventory checked 2026-10-18. GitHub main `44f062f` to local main `e9412fd`.
103 commits; 177 changed files; 36,048 inserted and 6,174 deleted text lines.
These are Git counts, not a claim of completed line-by-line security review.

## Review groups

| Area | Changes to preserve | Candidate files |
|---|---|---|
| Identity | Signed sessions, socket membership, Google linking, deletion races | `services/auth/`, `co-study-server.js` |
| Video | Cancellation, webhook verification, durable capacity, lobby | `services/video/`, `public/js/video/`, `lobby.html` |
| Persistence | Atomic writes, startup hydration, event queue, three migrations | `room-store.js`, `supabase-user-store.js`, `supabase/migrations/` |
| Recovery | Encrypted backups, tombstones, pinned cutover artifacts | `services/ops/`, backup and restore scripts |
| Frontend | Timer recovery, stale-response handling, extracted runtime, offline cache | `public/js/index-app.js`, `public/js/service-worker.js`, `open.html` |
| Operations | Nginx, service account, containers, full test matrix | `scripts/deploy/`, `scripts/ci/`, `.github/workflows/ci.yml` |

Keep these as a connected candidate. Review and fix on top; do not blindly cherry-pick,
discard, or rewrite history. Every group needs behavioral verification.

## Commits

| # | Commit | Subject |
|---:|---|---|
| 1 | `0e3d477` | fix(security): sign anon session cookie + clean up prior room on switch |
| 2 | `9540661` | fix: enforce socket and room identity boundaries |
| 3 | `f708999` | fix: bind video sessions to room membership |
| 4 | `ee4bfd7` | test: isolate server processes from ambient credentials |
| 5 | `2228421` | fix: separate and validate production session secrets |
| 6 | `3a5d33b` | build: restrict container context and runtime user |
| 7 | `549e106` | fix(auth): support explicit password authentication methods |
| 8 | `cd5968a` | fix(auth): resolve Google sign-in by subject |
| 9 | `9e6247f` | test(auth): run identity regressions in CI |
| 10 | `cf4c2ca` | fix(video): serialize client media lifecycle |
| 11 | `94b9a6f` | fix(realtimekit): tear down failed and left meetings |
| 12 | `fcbb97f` | fix(lobby): share the bounded video lifecycle |
| 13 | `a99f80a` | fix(video): contain synchronous teardown failures |
| 14 | `276018c` | fix: bound runtime security registries |
| 15 | `a5001b9` | fix: make persistence initialization and mutations durable |
| 16 | `519f03f` | feat(supabase): add secure additive baseline migration |
| 17 | `e137752` | fix: make Supabase focus and deletion atomic |
| 18 | `c1b5d22` | fix(video): bind lifecycle to room membership |
| 19 | `8f0fbd3` | fix(video): forward socket membership to media |
| 20 | `f670c16` | fix(focus): identify completed timer requests |
| 21 | `d3c4213` | fix: bind production server to loopback |
| 22 | `d920773` | ops: run PM2 under dedicated service account |
| 23 | `96dde8a` | ops: verify hardened Nginx deployment |
| 24 | `1dce6e5` | chore: enforce warning-free lint |
| 25 | `19411f9` | fix: harden room lifecycle and schedules |
| 26 | `9369269` | fix: enforce RealtimeKit preset policies |
| 27 | `6456f26` | fix: harden realtimekit provider contract |
| 28 | `43c1b5a` | fix: preserve video teardown on page unload |
| 29 | `9313ede` | fix(video): make provider sessions authoritative and durable |
| 30 | `416ee02` | fix(auth): sign and consume OAuth state |
| 31 | `f83729b` | feat(auth): add explicit Google account linking |
| 32 | `e816d04` | fix(auth): reject normalized OAuth network paths |
| 33 | `d353452` | feat(auth): add Google deletion reauthentication |
| 34 | `c40bb70` | feat(ops): add read-only Supabase candidate audit |
| 35 | `e5618c1` | feat(ops): inventory local container image risk |
| 36 | `2d93258` | feat(ops): inventory legacy R2 user objects |
| 37 | `db776a4` | fix(ops): preserve incomplete Supabase audit evidence |
| 38 | `df96ca4` | feat: add authenticated encrypted backup artifacts |
| 39 | `e15631c` | feat: orchestrate tombstone-safe backup restores |
| 40 | `54158c0` | ops: add service-owned encrypted backup CLIs |
| 41 | `2847f5a` | docs: define encrypted backup recovery runbook |
| 42 | `a4726d0` | fix(timer): reconcile elapsed background time |
| 43 | `944aac0` | fix(rooms): ignore stale preview responses |
| 44 | `d84e5da` | fix(auth): invalidate stale session lookups |
| 45 | `d8cdbb6` | fix(admin): wire active panel refresh |
| 46 | `e92e465` | docs: align privacy policy with production providers |
| 47 | `ae786b6` | feat: add bounded offline asset cache |
| 48 | `e30f3e7` | refactor(frontend): extract workspace runtime and drop WAV sources |
| 49 | `e5c2afd` | refactor(frontend): move workspace runtime into checked asset |
| 50 | `0752b85` | fix(ops): make video cost alerts authoritative |
| 51 | `ce9b0c9` | ops: verify provider and backup deployment health |
| 52 | `5f14b0d` | fix(auth): cascade durable account deletion |
| 53 | `ae49cb0` | fix(ops): fail closed on firewall configuration |
| 54 | `9437ec3` | fix(backup): prevent tombstone-blind room restores |
| 55 | `c8b7c0c` | fix(server): bind membership and serialize room switches |
| 56 | `2bae448` | fix(timer): avoid unattended completion floods |
| 57 | `618918e` | fix(ops): authenticate backup deployment checks |
| 58 | `4c57668` | docs: align retention and production media contracts |
| 59 | `ff7b62d` | fix(mesh): recover disconnected peers safely |
| 60 | `8d06caf` | fix(cache): version corrected client and ambient assets |
| 61 | `76c3830` | ci: enforce full remediation validation matrix |
| 62 | `c112b6b` | fix(backup): require complete production snapshots |
| 63 | `a57a0da` | docs: require production persistence at launch |
| 64 | `f386e41` | test(socket): cover every malformed event and transport limit |
| 65 | `6399284` | fix(status): coarsen hidden activity timestamps |
| 66 | `719218b` | fix(secrets): require encoded random production keys |
| 67 | `ac6972e` | fix(auth): prevent deletion races and focus replays |
| 68 | `a975dc7` | fix(auth): defer provider cleanup after durable deletion |
| 69 | `76ac7d1` | ci: apply migrations in disposable postgres |
| 70 | `a82564e` | test(migrations): exercise durable database contracts |
| 71 | `5c22b45` | docs(secrets): document exact production key format |
| 72 | `72d0460` | test(video): bind persistence requests to membership identity |
| 73 | `5380a2e` | fix(rooms): gate v2 migration behind offline CLI |
| 74 | `85e52dc` | fix(socket): validate every request payload |
| 75 | `4c2ee09` | test(auth): keep deferred cleanup fixture within socket bounds |
| 76 | `d841948` | fix(video): let lifecycle invalidation win token races |
| 77 | `7fb7bf9` | feat(compat): retain safe rollout adapters |
| 78 | `e328222` | fix(startup): retry persistence hydration atomically |
| 79 | `8454dcd` | fix(rooms): fail closed on persistence errors |
| 80 | `5f9e0ec` | fix(auth): serialize Google subject sign-in |
| 81 | `2c19418` | fix(startup): discard partial webhook hydration |
| 82 | `13e7962` | test(ci): verify automatic syntax coverage |
| 83 | `7b4a532` | fix(video): release local media on provider teardown |
| 84 | `0c7ea67` | fix(video): gate mesh signaling behind authenticated dev mode |
| 85 | `6f043ba` | test(mesh): opt atomicity fixture into dev signaling |
| 86 | `f2d38c8` | docs(media): remove stale production mesh copy |
| 87 | `60d99c0` | fix(video): bound provider teardown waits |
| 88 | `3c066cb` | feat(persistence): queue room lifecycle events durably |
| 89 | `3886644` | fix(auth): revoke live identity after deletion write failure |
| 90 | `59731ab` | fix(video): cancel in-flight provider joins |
| 91 | `969cc79` | fix(socket): revoke logged-out and disconnected joins |
| 92 | `06c2252` | fix(auth): bind socket logout to account and session |
| 93 | `54f8435` | fix(backup): prevent deleted-account resurrection |
| 94 | `095c281` | fix(video): fail closed on uncertain identity revocation |
| 95 | `65b560a` | fix(video): bound cancelled lifecycle work |
| 96 | `7e609b3` | fix(video): finalize cancelled provider joins |
| 97 | `b492814` | fix(backup): fail closed before unsafe recovery mutations |
| 98 | `cdc9510` | fix(auth): bind user tokens to browser sessions |
| 99 | `5f51f1b` | test(video): cover delayed meeting closure race |
| 100 | `9c803ef` | test(browser): harden cross-engine smoke isolation |
| 101 | `165cd49` | fix(backup): pin cutover artifacts and gate R2 uploads |
| 102 | `b6e6963` | fix(rooms): make join compensation crash-safe |
| 103 | `e9412fd` | merge: land full staged remediation |

## Work outside this range

The original checkout has two modified blog articles and untracked `images/og/`.
They remain intact and need separate review. Historical linked-worktree registrations
must not be pruned or moved without reconciling their actual folders.

## Related

- [Site-wide plan](2026-10-18-site-wide-readiness-plan.md)
