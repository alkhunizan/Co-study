# Refinement findings and final dispositions

The implementation resolves all 14 selected findings. Priority reflects observed user impact. Initial source-only audits in `audit/` are snapshots; this ledger owns their final disposition. Exact final checks are linked from [REVIEW.md](REVIEW.md).

| ID | Priority / impact | Disposition and evidence |
|---|---|---|
| R01 | High: password return paths can resolve off-site. | **Fixed.** One password/OAuth return policy rejects hostile, encoded and normalized redirect variants while retaining valid paths/query/hash. Hostile-path corpus and real signup navigation pass. |
| R02 | High: captured platform identity can outlive deletion, revocation or ban. | **Fixed.** Reproduced three failures before repair in `evidence/before-identity-race.log`. Live identity checks surround initialization and transactional SQL compatibility projection. Negative cases and a valid compatibility account pass without resurrection. |
| R03 | High: paused tabs stop reconciling; room reload loses session control; a lost completion acknowledgement can hide the saved outcome. | **Fixed.** Serialized authoritative reads, tab invalidation, visible/focus/poll reconciliation, pending completion replay and exact recap. Real duplicate-tab, reload, failure-before-commit and response-lost-after-commit tests pass. |
| R04 | High: saved-name lobby retry is inert; camera labels can contradict actual publisher state. | **Fixed.** Always-bound retry, bounded density controls, actual camera/pressed state and language rendering. Browser retry, toggle, renewal and page-exit checks pass. |
| R05 | High: Google loses intended destination and stale actors can link after asynchronous exchange. | **Fixed locally.** State-bound safe return and current identity/epoch checks; fixture verifies state, PKCE, purpose, linking, replay, persistence failure and revoked linking. **Real Google acceptance remains external.** |
| R06 | Medium: client-reported legacy progress looks verified; unused personal streak is sent to peers. | **Fixed.** Preserved history is explicitly labeled, trusted room recap/streak uses server progress, and unused peer projection is removed. No manual/imported credit becomes reward eligibility. Integration assertions and actual Account/Progress views pass. |
| R07 | High: circle invitation handoff/retry/revocation is incomplete. | **Fixed.** Private fragment links, 30-minute per-tab draft including hash changes, signup continuation, same-current-member idempotency and owner-only unused-invite revocation. Lost response, foreign replay, removed-member replay, scope and persistence-failure checks pass. |
| R08 | Medium: native skip link loses focus to workspace routing. | **Fixed.** Main anchor remains native; keyboard Tab/Enter assertion passes within the final 64-state member matrix. |
| R09 | Medium: redundant empty cards obscure a member's next action. | **Fixed.** Compact Study start, solo focus, conditional actual return/session/owned sections and four clear destinations. Native links and unchanged Back/Forward and member-role browser journeys pass. Fresh-member before/after images are available in REVIEW.html. |
| R10 | Medium: progress lacks useful small next steps. | **Fixed.** Real seven-day ledger activity, quiet personal milestones and forgiving return copy. Frozen-clock tests retain deduplication, caps, pause exclusion, abandonment, replay and Riyadh rollover. No public ranking or payment/camera incentive. |
| R11 | Medium: shared goal/status is buried on mobile. | **Fixed.** Actual goal, honest companionship and opt-in readiness sit beside focus. Separate browser contexts verify one/two/one participants, shared text, hidden status and guest-local time. Zero presence remains connecting, never fabricated company. |
| R12 | Medium: local room Retry fails to restore unknown identity and identical status writes can over-announce. | **Fixed.** Retry refreshes identity; live regions change only when text changes. One-shot auth failure recovers without reload; browser/accessibility checks pass. No manual screen-reader claim is made. |
| R13 | Medium: narrow entry overflow, enlarged-text obstruction, incorrect language role, scrolling chat focus and semantic contrast failures. | **Fixed.** Reflow, document-flow mobile navigation, control semantics, chat focus, explicit hidden behavior and readable ink. 86-state sweep has zero overflow, serious/critical axe findings or page exceptions; six enlarged primary actions are unobstructed. |
| R14 | Medium: invalid/full room invitation offers no clear route back to selection. | **Fixed.** Useful full-room feedback and a keyboard-accessible room-selection link. Real invalid invitation exit and existing join/full-room handling pass. |

Dependencies were implemented in order: identity/privacy before invitation handoff; focus recovery before recap/progress; trustworthy accounting before milestones; existing shared room state before community presentation. The architecture requires no schema migration.

## Audit cross-reference

| Original source-review candidate | Final finding |
|---|---|
| ST-01 / DT-02 | R01 |
| TS-01 / DT-03 | R02 |
| ST-02 / TS-03 / DX-02 / DT-04 | R03 |
| ST-03 / ST-06 | R04 |
| ST-04 / DT-01 | R05 |
| ST-05 / TS-02 / unused peer streak note | R06 |
| ST-07 / TS-04 / TS-05 / DX-01 | R07 |
| DX-03 / DX-04 / DT-05 | R12 |

The late full-gate failures are also resolved: content CTAs no longer duplicate navigation hooks, and primary timer controls precede secondary settings so Start fits the existing desktop viewport assertion. No assertion was removed or weakened. Execution failures and superseded runs remain in [EXECUTION-NOTES.md](EXECUTION-NOTES.md) and the command ledger.

## Historical findings rechecked

**Disproved as current absence claims:** named staff/MFA, catalog/entitlements, server-timed ledger, transactional storage, private circle scoping, browser history, hidden dialog focus, bounded boards and fail-closed blur already existed. Current independent baseline integration passed 145 tests; the final gate reruns their coverage. Earlier counts are historical only. Preserve these protections rather than rebuild from stale audits.

## External blocks and explicit deferrals

- **Externally blocked acceptance:** real provider/physical devices, real Google, delivered recovery mail, merchant acceptance, hosted restore/migration and production release. See [ACCEPTANCE.md](ACCEPTANCE.md). The task forbids the required external mutations; fixtures do not establish acceptance.
- **Deferred expansion:** public feed, public rankings, circle competitions, new paid plans, framework rewrite, Redis and multiple instances. These do not close reproduced current-product defects and have no measured need. Existing private circles and supportive personal progress are the chosen scope.

No locally actionable essential finding is deferred to obtain a green verdict. No field retention, activation uplift or production readiness is inferred from local verification.
