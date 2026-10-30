# Refinement diff: trust and asynchronous recovery review

Read-only review, 2026-10-21 (Asia/Riyadh). Base HEAD remained `5b186bd330fa459ca3787a413d374c62384d4435`; this review covers its changing local refinement diff. No app edits, probes, tests, production credentials or external actions were performed by this reviewer. The parent owns gated reproduction and final regression results. Findings were sent immediately so the parent could correct them while this review continued.

## Remaining security candidate handed to the parent

**DT-01 — OAuth password-account linking can retain a revoked captured identity.**

Status: source-supported, high-impact candidate. The parent has accepted it for a gated local regression and fix. It must not be represented as reproduced by this review.

`services/auth/google-routes.js:128-153` awaits provider token/profile exchange. Later, a login flow that links a Google subject to an existing password account authorizes linking using only `req.user?.id === user.id` (`:181-187`). That request object was attached before the asynchronous exchange; no live-map/epoch recheck follows the provider awaits. `setAuthCookie` then issues a new cookie after another asynchronous account flush (`:190-195`).

A logout/password reset during the exchange can revoke the original password cookie while leaving the captured request object available. Linking may then persist a new Google subject and mint an auth cookie using the now-incremented epoch. This matters especially for linking, which depends on an already-signed-in password account, rather than an independent fresh Google login to an already-linked subject.

The purpose-bound security/delete branch also checks its captured identity before provider exchange (`:122-123`) and issues reauthentication proof later (`:164-168`). These siblings should use a consistent current-identity policy. Existing-Google login checks banned before `flushUsers`, so deletion/ban while flush waits should also be considered before cookie issuance. Do not conflate legitimate independent Google sign-in with permission to link using a revoked password session.

Suggested local proof: start a password-account linking callback with a valid synthetic account session; gate the provider fixture exchange; perform logout/reset/deletion; release exchange. Require no new subject link, no usable cookie/proof, and no resurrection. Add a valid unchanged-session control. Gate `flushUsers` separately for an existing linked account and verify deletion/ban cannot produce a misleading successful auth response. Use synthetic provider data and no real Google traffic.

## Issues identified and corrected during this review

These are source-verified corrections, with runtime acceptance left to the parent.

| ID | Issue found | Latest source correction inspected | Required parent evidence |
| --- | --- | --- | --- |
| DT-02 | Raw-safe return paths such as `/..//example.invalid` can normalize to a `//` pathname, which becomes external when reinterpreted as a redirect. | `public/js/safe-return.js:8-10` now rejects normalized pathnames beginning `//`. `tests/integration/refinement-boundaries.integration.test.js:8-11` includes plain/encoded dot-segment variants. Raw backslashes/control characters remain rejected. | Run boundary tests and password/OAuth redirect controls on final code. |
| DT-03 | Removing platform router projection hydration broke the supported Supabase account backend, whose profile store does not create `halastudy.users`. Fresh accounts could fail focus user locks or SQL foreign keys. | `services/platform/routes.js:40-57` retains the compatibility bridge with live identity checks; `services/platform/index.js:39-49` wraps the upsert in a transaction with before/after `isCurrentUser` checks. Actual server wiring checks current object/epoch/ban (`co-study-server.js:872-873`). This central guard also covers remaining ensureUser callers. | Test valid projection creation with a non-record-store account fixture, and gated revoke/delete both before and during upsert. Confirm rollback leaves no resurrected user. |
| DT-04 | A lost completion response could leave the room unable to confirm its saved session; Retry only fetched the current open session. | `public/js/focus-client.js:8,26-30,40-43,51-59` now remembers the pending completion ID, retries that exact idempotent endpoint and can recover its completed row from history. `room-focus.js:72-79` retries pending completion and recognizes recovered completion for its recap. | Cover response lost after commit and failure before commit, followed by Retry and automatic reconciliation; exactly one ledger award/session. |
| DT-05 | A transient initial `/api/auth/me` failure left room module `member=false`; Retry could succeed reading progress yet render a guest permanently. | `public/js/room-focus.js:43-50` now refreshes identity when unknown before progress reconciliation. | One-shot local auth/me 503, then Retry; account controls and acknowledged progress must recover. |

## Invitation changes reviewed

The new `accept` branch (`services/platform/cohorts.js:48-73`) now checks accepted_by plus *current* membership before returning idempotent success. Foreign code replay and replay after leave/removal do not silently add membership. It returns before re-inserting a member or adding another join audit event. The service checks the circle is active before resolving the retry.

`revokeInvites` (`cohorts.js:75-81`) deletes only unused invitations, remains owner-only, and uses the same circle row lock as acceptance. Acceptance re-reads its invitation after acquiring that lock, so an invitation deleted while acceptance waited is rejected. The cleanup operation does not require current VIP status. This is the appropriate scope for an explicit revoke-all action; it does not disclose bearer codes or public member activity.

The current focused integration additions cover same-account acceptance retry, foreign/member revocation denial, an unused code rejected after revocation and replay after removal. A concurrent revoke-vs-accept test is useful if the parent's final applicable gate does not already cover it, but no defect in that lock order was found by this read-only review.

## Focus and room changes reviewed

- Cross-tab notifications contain only a `changed` hint, not personal progress, a session ID or identity. Authoritative state is re-fetched from authenticated HTTP. Current focus actions and internal reconciliation reads share a promise queue; start consults the server instead of trusting locally active cached state.
- Paused/no-session documents now reconcile while visible, and visibility/focus/channel events request reconciliation. Active sessions retain server-timed heartbeat credit and camera independence. No change to SQL reward deduplication, daily cap, pause exclusion or fixed Riyadh day grouping was found in this diff.
- The room module presents guest-local timer time separately from acknowledged account credit and only creates a success recap from a completed result. The parent corrected the two recovery gaps above during review. Its `halaroomfinish` event stops the local timer, while the shared focus queue orders the resulting pause before complete.
- Account now labels legacy/imported history explicitly, and the room's own streak badge reads trusted summary data. Existing privacy-minimization note: server room snapshots still contain unused legacy peer `streakCurrent` (`co-study-server.js:1188,2589` in the inspected version). No client consumer was found. This was sent to the parent as a small removable projection, not a new critical exploit.
- New readiness/shared-intention UI uses the existing joined-room status/board boundaries. `setStatusPreset` preserves the user's existing sharing preference; no automatic re-enable of hidden status was found. Shared goal rendering uses textContent.

## Final source fingerprints for this review

The parent's later OAuth fix or other corrections will intentionally change these. They establish which local candidate was actually read here, not final delivery parity.

| File | SHA-256 |
| --- | --- |
| public/js/safe-return.js | 7540b64ed5c0fe86be52987a020f70af3caea6133fdeba112cb7bc6f913d87dd |
| public/js/focus-client.js | 3023f868945d15a78b19572ac636a42b92e5088a8740d5f7dadd0b9e381e4a21 |
| public/js/room-focus.js | 921e01964a0c83e463557162b0e8777385df6cfdf3f4c90f1d50e189eb251d51 |
| services/platform/index.js | 0652844d1e14ff6e72ccaaaaf19bebbec4f7d354962bcd79f5aee92d40ae8474 |
| services/platform/routes.js | 4c7fd39ffa60cda1ef056f4b42849faf85e1a883b01bdf0b589f08c9d4478a1d |
| services/platform/cohorts.js | ef0e61cf737d2b2efe19a8e5f29f7107308ef3fb83ebdda62f60b42181130dc4 |
| services/auth/google-routes.js | 50ee10b4f1e951873958460a09d635d568a70ae7a3f95cdb69df3cad509ff7e9 |

No GO verdict is issued by this source-only sweep. Resolve/disprove DT-01 and attach the parent's final exact-source local test evidence before treating trust review as complete. The existing real-provider/device media acceptance boundary remains unchanged.
