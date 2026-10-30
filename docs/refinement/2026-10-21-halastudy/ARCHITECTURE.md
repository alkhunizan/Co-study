# Halastudy architecture decisions

21 October 2026. Scope is the explicitly requested current checkout; the older continuity worktree is untouched.

## Product and information architecture

Halastudy helps a student begin, quietly work alongside others, save credible progress and return. Saudi/GCC students use Arabic first; English has the same capabilities. Durable account/room/platform records live in PostgreSQL-compatible storage, media belongs to a provider, and current presence lives in one server process. Payment, mail, Google and media providers are external trust boundaries.

Keep four ordinary destinations: Study, Progress, Groups and Account. Study is the starting/returning action; Progress explains validated activity; Groups contains private circles and invitations; Account links profile/history, security and membership. Assigned supervisor/staff tools remain permission-gated secondary destinations. Existing `/app`, `/study`, `/open`, `/room`, `/workspace`, `/account`, `/plans`, `/supervisor` and language routes remain available.

Compared options: a framework rewrite offers component ergonomics but imposes a new build/deploy pipeline and migration risk without a measured product benefit. A new SPA router risks invitation/deep-link regressions. Incremental vanilla modules preserve working URLs and the current deployment model with less maintenance for one owner. **Choose incremental vanilla modules and server-owned domain rules.** There is no frontend compilation command.

## Responsibilities and rollback

| Boundary | Responsibility | Refinement |
|---|---|---|
| Identity | Account store, live session epoch, bans, Google linking and recovery | Recheck captured identities across async initialization/provider exchange; guard compatibility SQL projection inside its transaction. |
| Authorization | HTTP policy and per-packet socket checks, resource membership, MFA and named staff roles | Preserve scoped rules; payment and badges confer no authority. |
| Entitlements/billing | Existing catalog and server-verified sandbox adapter | Preserve free access and USD 4.99/month VIP terms. No live adapter activation or pricing changes. |
| Focus/rewards | `services/platform/progress.js` owns time, daily splitting, caps, ledger and awards | Add a real seven-day activity projection; retain server credit/idempotency rules. |
| Focus client | `focus-client.js` owns serialized requests, monotonic display interpolation and current state | Reconcile tabs through invalidation-only BroadcastChannel and server reads; retain uncertain completion ID for replay/recovery. |
| Room presentation | Local Pomodoro countdown is distinct from acknowledged account credit | New `room-focus.js` renders identity recovery, credit, exact completion recap and retry; existing countdown/media stay intact. |
| Circles | Cohort transactions own membership, invitations, sessions and attendance | Same-member acceptance retries are idempotent; only owners revoke unused invitations. Fragment links preserve a bounded per-tab draft. |
| Copy and shared UI | Shared core owns theme/language/request behavior | Extract workspace copy into `platform-copy.js`; keep both languages together and avoid business rules in translations. |
| Media | Existing serialized video client, provider tokens, revocation journal and fail-closed blur | Retain working lifecycle protections; camera never affects study credit. Real provider/device acceptance stays external. |

Source changes are incremental and require no schema migration. Reverting the refinement commits restores prior presentation/client behavior while preserving existing account/session/ledger/circle records. Unknown invitation fields are not persisted to a new schema. No user history is deleted. Legacy/imported history remains readable and is explicitly distinguished from verified rewards. Peer presence no longer broadcasts the unused personal streak field.

Keep one Node 22 process. Transactional row/cohort locks support concurrent requests inside that deployment; they do not make process-local presence and caches safe across multiple application instances. Redis, service decomposition and paid infrastructure are deferred because no measured concurrency need justifies them.

## Privacy and product measurement

Invitation tokens live in a fragment and a 30-minute per-tab draft; acceptance still requires server authorization and server expiry. Cross-tab focus messages contain only invalidation, never identity, goals or history. Community uses current presence, existing shared goals and opt-in status sharing; no public feed, rankings, fabricated attendance or messaging was added.

Activation means a real room join followed by a focus start; an account's meaningful focus is at least one server-validated minute. Return means another eligible session on a later Riyadh day, with a seven-day observation window as a proposed metric. The existing optional local counters remain off by default, expire and never transmit. No retention/conversion uplift is claimed; measuring cohort retention would require approved privacy-conscious observation, not invented numbers.
