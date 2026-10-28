# Halastudy architecture implementation plan

Proposed sequence · 20 October 2026

The review and design are complete artifacts. The implementation below remains future work. Deliver small vertical changes against the existing application and keep each stage independently verifiable.

## Stage 0 Correctness and a reproducible baseline

Address F04, F07, F08 and document F09 behavior before commercial expansion.

- Fix accepted-minute aggregation and separate lifetime totals from rolling daily history.
- Make critical persistence failures reject; keep background retry behavior explicit.
- Add Google reauthentication for deletion and consistent provider identity persistence.
- Define logout, deletion, ban and role-change behavior for existing sockets and tokens.
- Recover the actual database schema read-only and add a reviewed migration baseline. Do not invent a schema over a live database.
- Update stale architecture documentation and verify the configured Node 22 CI environment.

**Acceptance:** Same-day caps survive reload; retries do not inflate completed-session totals once session IDs are added; failed deletion never returns “completed”; Google users can reauthenticate; both storage adapters retain identity fields; deleted/revoked sessions cannot perform account or privileged socket actions; database baseline can create a test environment.

**Migration/rollback:** Back up current state, preserve pre-migration aggregates for reconciliation, and exercise failure recovery on synthetic data. Do not deploy new account-deletion semantics without verifying restore behavior.

## Stage 1 Durable ownership and named authorization

Address F01 and F02. Introduce `identity`, `authorization`, room ownership, scoped memberships and audit services behind current routes.

- Define a small permission catalog and one policy evaluator used by HTTP and sockets.
- Add named staff identities with MFA and controlled bootstrap of the first super admin.
- Persist owners for newly created member rooms and explicit host assignments.
- Leave existing rooms unclaimed when creator evidence is insufficient. Provide an audited claim/transfer flow.
- Add revocable sessions and immediate permission-change invalidation.
- Move critical staff actions to named, audited identities; retire the shared admin path after a tested transition.

**Acceptance:** A member cannot self-promote; host A cannot manage room B; organization roles cannot create platform roles; ordinary admins cannot grant super admin; revoked staff lose HTTP and socket authority immediately; last-super-admin protection and recovery work; every privileged mutation has a named actor and outcome.

**Migration/rollback:** Expand schema first, backfill only verifiable relationships, shadow-evaluate policies while preserving current restrictions, then enable enforcement. Rollback must preserve restrictive permissions and newly written ownership; never restore a weaker shared login as an automatic fallback.

## Stage 2 Transactional persistence and organization boundaries

Address F05, F06 and F10.

- Replace whole-user-map upserts with per-record repositories and database transactions.
- Move authoritative room and membership state to Postgres.
- Implement organizations, invitations, cohorts, supervisor assignments and per-user attendance.
- Extract moderation cases from disposable room records.
- Add outbox jobs for reliable provider and analytics work.
- Apply least-privilege database access and test RLS where used.

**Acceptance:** Two simultaneous updates do not lose data; duplicate email/provider IDs fail at the database; paginated imports cover all records; no cross-organization read/write succeeds by changing IDs; deleting a room preserves required case history; failed workers retry without duplicate actions; clean install and upgrade migrations pass.

**Migration/rollback:** Use expand/backfill/verify/cutover. Compare counts and checksums, shadow-read new records, and reconcile differences before changing the source of truth. Keep the previous store read-only for rollback evidence; avoid uncontrolled dual writers. Test rollback against the new data shape.

## Stage 3 Package access before payment collection

Address F03 without publishing prices or removing existing free access.

- Add versioned plans, features, quota definitions, entitlement grants and usage reservations.
- Seed an explicit free baseline preserving existing user behavior.
- Define personal versus organization billing ownership and seat assignment.
- Add read-only capability/usage responses for UI display.
- Enforce feature access and quotas in room creation, scheduling, exports and media admission.
- Keep the payment provider disabled; use internal test grants.

**Acceptance:** Unknown features deny; grants expire; one person belonging to two organizations cannot pool benefits; simultaneous requests cannot exceed a room/seat/global limit; manual grants cannot create staff authority; operational kill switches override paid benefits; free users retain current functionality.

**Migration/rollback:** New entitlement tables are additive. Roll back paid-feature rollout, retaining the free baseline and operational caps. Never make a resolver failure grant unlimited access.

## Stage 4 One complete paid offer

Launch only one package initially after provider and commercial terms are selected.

- Integrate checkout, customer portal/invoices as appropriate, verified webhooks and reconciliation.
- Model activation, renewal, payment failure, cancellation, refunds, upgrades and downgrades.
- Add Arabic/English package, billing, usage, renewal and error screens.
- Track actual video and service usage to compare costs with the offer.

**Acceptance:** Forged checkout returns cannot grant access; invalid signatures fail; repeated and reordered webhooks do not duplicate benefits or resurrect canceled subscriptions; incomplete processing is retried from a durable receipt; period-end cancellation and grace rules behave as published; refunds and manual corrections are audited.

**Migration/rollback:** Separate UI rollout from entitlement enforcement. Stop new sales independently from honoring existing paid access. Reconcile provider state before re-enabling event processing.

## Stage 5 Credible focus sessions and personal rewards

Complete F04 before introducing competitive rewards.

- Create server-tracked sessions, pause/heartbeat intervals, deduplicated completion and nonoverlapping counted time.
- Keep imported/manual history separate from reward eligibility.
- Add reward rules, XP ledger, achievements and correction entries.
- Introduce private progress first, then optional cohort challenges.

**Acceptance:** Two tabs cannot double counted time; repeated completion/replayed jobs award once; clock tampering and arbitrary minute submissions cannot create validated rewards; midnight/timezone boundaries are deterministic; interrupted sessions use the agreed grace rule; camera-off sessions remain eligible; account deletion reaches associated personal activity records.

**Migration/rollback:** Tag legacy history by source. Do not retroactively label it verified. Disable new rewards independently from study sessions. Keep append-only correction records rather than mutating historical awards.

## Stage 6 Supervised product and measured scale

- Build assigned-cohort dashboards, session planning, attendance, member invitations and case escalation.
- Add organization billing and reporting only with the corresponding permissions.
- Model human supervisor availability/assignment if supervised time is sold; a software entitlement alone does not provide staffing.
- Expand infrastructure only after transactional state and distributed reservations are ready.

**Acceptance:** Supervisors only see assigned members and allowed history; attendance is individual and occurrence-specific; removing an assignment revokes access immediately; joining as an observer is visible; paid seats are allocated atomically; load tests cover reconnect storms and provider failures; restore drills recover durable state and reconcile jobs.

## Required test matrix

| Area | Essential negative or failure case |
|---|---|
| Identity | Deleted account, stolen old token, failed reauthentication, duplicate provider subject |
| Authorization | Member self-promotion, host in another room, supervisor in another cohort, admin granting super admin |
| Database isolation | Cross-organization foreign key and resource-ID substitution |
| Persistence | Write failure, partial migration, concurrent updates, incomplete bulk-read page |
| Billing | Invalid signature, duplicate/out-of-order event, delayed cancellation, refund reconciliation |
| Entitlements | Expired grant, unavailable resolver, double seat allocation, quota race, wrong organization context |
| Gamification | Replay, two-tab overlap, imported history, daily cap, rollover, duplicate worker delivery |
| Moderation | Unassigned case access, private evidence export, room deletion during open case |
| Experience | Arabic/English parity, keyboard-only navigation, mobile billing and supervisor views |
| Operations | Worker retry, failed provider token creation, stale capacity lease, restore and session revocation |

## Decisions to make when the relevant stage starts

| Decision | Recommended starting assumption |
|---|---|
| First commercial customer | Individual Plus first; supervised cohorts after permissions and attendance |
| Pricing and quotas | Set from measured usage and service costs; no numbers promised in this review |
| Supervisor meaning | Assigned study facilitator, separate from platform moderator |
| Competitive features | Private progress first; cohort challenges opt-in |
| Organization sponsorship | Benefits apply in the sponsoring organization's context through an assigned seat |
| Existing rooms | Preserve behavior; do not infer ownership from nicknames or room codes |
| Auth implementation | Evaluate a managed identity provider against account migration needs before building recovery/MFA from scratch |

These decisions do not block the immediate correctness work or the permission and ownership design.
