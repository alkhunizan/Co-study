# Halastudy platform architecture review

20 October 2026 · Local source review · Baseline commit `0e3d477`

**Halastudy has a useful MVP foundation, but its current structure is not ready for paid packages, delegated supervisors, multiple administrators, or competitive gamification.** Keep Express, Socket.IO, the Arabic-first interface, and the video provider abstraction. Evolve the application into a modular monolith with durable ownership, scoped permissions, transactional persistence, and independently managed package benefits and rewards.

This review covers the local checkout. It does not establish the deployed site's state or inspect the live Supabase schema. Existing blog edits and image assets were preserved. No application behavior, database, subscription, or deployment was changed.

Read the [target blueprint](BLUEPRINT.md) for the proposed product and technical structure and the [implementation plan](IMPLEMENTATION_PLAN.md) for the sequence and acceptance criteria.

## Current structure

| Area | Present implementation | Expansion readiness |
|---|---|---|
| Public site | Landing, room entry, lobby, blog, privacy, terms | Useful starting point; add package and help journeys when those services exist |
| Member experience | Profile, room history, focus totals, streaks, Google and password login | Needs identity lifecycle, durable ownership, trustworthy activity records |
| Rooms | Codes, passwords, chat, shared board, schedules, reports, video membership | Missing persisted owner and scoped host/supervisor relationships |
| Administration | Shared password, signed admin cookie, room controls, bans, reports, backups, errors | Founder operations only; no named staff or permission separation |
| Packages | Global configuration limits | No catalog, subscription lifecycle, entitlement or usage model found |
| Gamification | Focus minutes and daily streaks | Personal activity tracking; unsuitable as trusted reward evidence |
| Persistence | JSON rooms; JSON or Supabase user store; in-memory collections | Single-process design; requires transactional per-record persistence |
| Quality | Syntax, types, lint, dependency audit, integration and browser tests in CI | Valuable base; future permission, billing and concurrency cases are missing |

The central server has 2,787 lines and the room page 4,818 lines. File size alone is not a defect, but authorization, room lifecycle, persistence, and transport are currently intertwined. A new permission rule would otherwise need repeated edits across HTTP and socket handlers.

Existing strengths include signed session cookies, token-epoch checks for HTTP accounts, ban-triggered socket disconnection, origin/rate-limit controls, password-protected room previews, video membership checks, configurable video caps, a provider adapter, and real-server integration tests. Preserve these while changing the domain structure.

## Findings ranked by the next feature they block

“Blocker” below means a prerequisite for the named expansion, not a claim that the entire existing application is unusable.

### F01 Named staff and scoped authorization are absent

**Blocker before delegating administration.** [Admin routes](../../../services/admin/admin-routes.js), lines 14–16 and 44–88, issue and accept the same `admin` identity for all operators. The route-level gate gives that identity access to the entire console. There are no separate supervisor, moderator, billing, or super-admin policies, and no MFA path here.

Supabase carries `is_admin`, but the only application references found are serialization in [supabase-user-store.js](../../../supabase-user-store.js), lines 42 and 64. This field does not implement the console's authorization. Staff actions produce operational logs, but the shared principal cannot identify which person performed an action.

Use named accounts, scoped role assignments, MFA for staff, and durable audit events. Centralize permission checks and evaluate them on every HTTP request and socket mutation. This follows OWASP's guidance on least privilege, default denial, resource relationships, and server-side enforcement. [OWASP authorization](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html) · [OWASP MFA](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html)

### F02 Room ownership is history rather than authority

**Blocker before host controls or supervisor delegation.** The `create-room` handler in [co-study-server.js](../../../co-study-server.js), line 2122 onward, records `role: 'created'` in the creator's recent-room list. The room itself does not receive a durable owner ID. [room-store.js](../../../room-store.js), line 191 onward, does not persist owner or organization membership.

`myRooms` is capped at 12 entries and is a convenience list, so it cannot be the authorization source. Current board mutations require room participation but do not distinguish owner, host, supervisor, and member.

Persist room ownership and explicit membership roles. Preserve collaborative-board behavior as a room policy rather than silently replacing it with host-only editing. Legacy rooms with uncertain creators must remain unclaimed until ownership can be established; a nickname or supplied client ID is insufficient.

### F03 Packages have no domain model or enforcement boundary

**Blocker before selling differentiated access.** No implemented product catalog, plan version, billing account, subscription, entitlement grant, seat allocation, or usage ledger was found. Video policy limits are operational configuration, not customer benefits.

Introduce a versioned catalog and entitlement resolver. Keep feature access separate from role permissions and service capacity. Enforce access and reserve quota before creating rooms or issuing media tokens. Pricing and payment-provider choice remain business decisions. Stripe documents the product-to-feature entitlement pattern, but is used here as a design reference, not a selected payment provider. [Entitlements reference](https://docs.stripe.com/billing/entitlements?dashboard-or-api=api)

### F04 Focus activity is client asserted and totals can diverge

**Blocker before leaderboards, earned benefits, or reward redemption.** [Auth routes](../../../services/auth/auth-routes.js), lines 156–199, accept client-supplied minutes and imported history. Rate limits restrict request count, not elapsed study time. There is no completed-session ID, server timing proof, or duplicate-completion guard.

The synthetic [probe results](evidence/probe-results.json) confirm seven 240-minute submissions at one timestamp produce a 1,680-minute aggregate, while the day is capped at 1,440. Sanitizing the same record changes its total to 1,440. [user-store.js](../../../user-store.js), lines 102–135, increments the aggregate by requested minutes rather than the accepted daily delta. Pruning old days also leaves a different lifetime-total interpretation from reloading the sanitized rolling window.

Fix aggregate semantics immediately. Keep imported/personal history distinct from server-validated activity. Build rewards from deduplicated completed sessions, and describe “validated” as elapsed eligible activity, not proof of human concentration.

### F05 Supabase persistence still behaves like a whole-file store

**Blocker before multiple app processes or material account growth.** [supabase-user-store.js](../../../supabase-user-store.js), lines 90–138, hydrates users into memory and upserts the entire map after changes. [The client](../../../services/supabase/client.js), lines 72–75, uses a single unpaginated select. This creates write amplification and stale-writer risk; a server-side response cap could also leave hydration incomplete. The live database's row limit was not inspected.

Replace whole-map writes with per-record repositories and transactions. Page all bulk reads and migration jobs. Use database uniqueness for identities and idempotency. Protect counters and seat allocation with atomic operations. Do not enable additional PM2 workers while these mutable maps remain authoritative.

### F06 Database permissions and migrations are not reproducible here

**Blocker before organization data or staff access.** No SQL migration files were found in the inspected repository. The application expects profiles, focus events, room events, and dashboard views, but their constraints and policies cannot be established from this checkout.

The Supabase client explicitly authenticates with a service-role credential. Such credentials bypass row-level security; merely adding RLS policies would not constrain these requests. Keep the server authorization boundary and move routine queries to a least-privilege database role or a verified user-scoped database context. The current custom session token is not automatically a Supabase user JWT. [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)

Capture a reviewed schema baseline, then add versioned migrations, constraints, grants, RLS where applicable, and tenant-isolation tests. Treat live schema recovery as a separate read-only task before migration.

### F07 Deletion can acknowledge an uncommitted database change

**High-priority correctness fix.** Account deletion removes the user from memory, awaits `flushUsers()`, then returns success in [auth-routes.js](../../../services/auth/auth-routes.js), lines 214–233. The Supabase write queue catches failures and only logs them. The local fake-database probe confirms a failed deletion still resolves the flush promise.

Make critical writes propagate failure. Represent deletion as a durable workflow, revoke sessions promptly, and report completion only after the required deletion steps succeed. Review analytics, reports, provider records, and backup restoration behavior separately; deleting a profile alone does not demonstrate full erasure. No legal-compliance conclusion is made by this review.

### F08 Identity lifecycle differs across login and storage providers

**High priority before paid accounts.** [Google auth](../../../services/auth/google-routes.js), lines 153–167, creates Google-only users with a random internal password. Account deletion requires the user's password, so this flow cannot be completed by a user who only authenticates through Google. Fresh provider reauthentication is needed.

The shared user sanitizer omits `authProvider` and `googleSub`; the local probe confirms these fields are dropped. Supabase reattaches them, but file-store persistence does not preserve them. Password recovery and verified-email flows were not found in the auth router.

Use a separate identity record keyed by `(provider, subject)`, consistent across adapters. Define explicit account linking, recovery, reauthentication, and unlinking rules.

### F09 Session revocation needs a shared HTTP and socket contract

**Prerequisite for staff-role changes and account deletion.** HTTP resolves token epoch on each request. The socket attaches an account at handshake and later looks up its ID; it does not rerun the full session verification for each operation. Logout clears a cookie without revoking its token. Deletion does not explicitly disconnect sockets, while the admin ban path does.

This is a source-level lifecycle gap, not a claimed cross-account exploit. Since guest chat is allowed, decide explicitly when a former account becomes a guest and when a connection must close. Staff revocation must immediately stop privileged socket actions. Introduce revocable session IDs, a policy version, and consistent per-operation checks.

### F10 Supervisor attendance and moderation need durable records

**Blocker before supervised cohorts.** [schedule-utils.js](../../../schedule-utils.js), lines 210–265 and 372–496, tracks attendance by room occurrence, not by individual student. It cannot support a supervisor's per-member attendance report.

Reports are embedded in rooms and capped at 50 in [co-study-server.js](../../../co-study-server.js), line 2614 onward. Room deletion and report pruning therefore affect the case history. Move reports and moderation actions into a separate case store, with assignments, reasons, dispositions, and retention rules. Add per-user attendance keyed by occurrence and user.

### F11 Capacity and observability must grow with the business model

**Prerequisite for scaling or capacity promises.** [ecosystem.config.js](../../../ecosystem.config.js), line 5, correctly uses one instance. Rate limiters, room state, presence, and video session reservations are currently local to a process. Adding workers would require shared state and atomic global capacity enforcement, not just a Socket.IO adapter.

For multiple nodes, Socket.IO requires appropriate inter-server communication and session affinity when HTTP polling is enabled; WebSocket-only transport avoids that affinity requirement but loses polling fallback. [Socket.IO scaling](https://socket.io/docs/v4/using-multiple-nodes/)

Add metrics for admission failures, provider cost, persistence failures, entitlement decisions, webhook lag, reward rejection, and moderation workload. Choose capacity targets from measured concurrency and costs before promising larger rooms.

### F12 Documentation has drifted from the implementation

**Maintainability priority.** `CLAUDE.md` describes a read-only HTTP API and says CI lacks type/lint/dead-code gates. Current HTTP auth and media routes mutate state, and [.github/workflows/ci.yml](../../../.github/workflows/ci.yml) includes these gates. Older reports' test counts and credential status are historical.

Update architecture documentation as each module is extracted. Treat the executable route list, database migrations, and current CI as authoritative. Do not derive current launch status from older readiness reports.

## Validation

Local evidence is stored under [evidence](evidence/). Syntax and TypeScript checks passed. The three synthetic probes confirmed F04, F07, and the file-store portion of F08 without external services. Integration results and environment details are recorded in [VALIDATION.md](VALIDATION.md).

This is an architecture review, not a full live UX, accessibility, penetration, or production readiness audit. No billing integration, staff workflow, real camera session, live database policy, or deployed capacity was exercised.

## Recommended decision

Adopt the blueprint as the architectural direction. Address persistence and identity correctness first, then introduce durable ownership and permissions. Build package enforcement before checkout and validated session records before rewards. Ship supervised cohorts only after organization boundaries and per-member attendance pass isolation tests.
