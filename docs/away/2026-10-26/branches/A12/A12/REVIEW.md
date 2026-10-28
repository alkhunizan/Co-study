# A-12 completion-target review

A lost completion response left the shared client remembering session S1. If the user deliberately started S2 before the next background reconciliation, Finish retried S1. In the real room, Finish first paused S2, then completed S1 again; S2 remained unfinished while the old saved recap appeared.

The client now retires the older pending completion only when Start succeeds and the server acknowledges a different session ID. The change is four added lines and one removed line in `public/js/focus-client.js`; no endpoint, schema, UI, copy, role or billing behavior changes. The same-session and failed-request branches preserve existing retry behavior.

## Evidence

- `../evidence/a12-before.log`: real browser failure on unchanged baseline source; S2 remains paused with no completed timestamp. Old-session Retry positive control passes.
- `../evidence/a12-before-results/`: failure screenshot, trace, video and server-state attachment in the browser report.
- `../evidence/a12-after.log`: six passing cases on final source, covering AR/EN at 390/1440, light/dark, keyboard Finish, 44px control, no horizontal overflow and no unexpected page errors.
- `../evidence/a12-after-results/`: eight explicit before/after screenshots; server-state attachments include old/new session IDs and exact completion request paths.
- `../evidence/a12-frozen-source-hashes.json`: final application/test byte hashes.
- `../evidence/a12-final-test-integration.log`: serialized full integration, 169/169 passed on unchanged final source.
- `../evidence/a12-final-browser.log`: final full browser, 88 passed, 1 unchanged expired-DST-fixture failure, 1 offline-font skip, 0 not run. All six new focus cases and the original camera/app group passed. The overall browser gate remains non-green.
- `../evidence/a12-final-browser-receipt.json`: central queue receipt, `sourceStable: true`, matching before/after manifest `6023194728a6635bd9be385ac7b26bc617409b3320c62204f6a9ca0eca6d4e8d`. Docs-only HEAD was `56add708`; app/test source stayed `0a8b1a05`.
- `../evidence/commands.ndjson`: command outcomes and runtime/commit identifiers. The after-targeted run predates its commit but used the same bytes recorded in the frozen commit.

Viewed the failing EN1440 screenshot, recovered AR390/light and EN390/dark recaps, and AR1440/dark final state. Mobile recaps remain fully readable; desktop retains the existing nested scrolling layout. Existing external fonts were blocked by the offline harness, so no font-provider acceptance is claimed. No CSS/HTML changed or design exceptions were introduced.

## Scoped import-hop review

Read-only callers: room focus actions, platform focus controls, and guided-routine controls. Read-only callees: shared bounded JSON requests, the existing focus router, and the progress service's idempotent completed-session branch. All use the same shared client and retain their existing API signatures.

| Concern | Review |
| --- | --- |
| Correct target | The browser records only S2's completion request after its acknowledged Start. Independent server state has no unfinished session. |
| Failed/lost responses | Clear happens after awaited Start success. The failed-Start control preserves S1 Retry. No timing assumption or new fallback mutation is introduced. |
| Duplicate credit | Existing completed endpoint returns the saved row without awarding again. Tests compare old saved rows, totals and request IDs; short browser sessions have zero XP. Passing full integration provides separate existing positive-duration ledger coverage. |
| Queue ordering | The decision occurs inside the existing serialized operation, before publishing the new session. No new queue, event or parallel request is added. |
| Authentication/ownership | No auth state, permissions, user lookup, session validation or database behavior changes. |
| Input/security | No new input, external URL, logging, provider call, secret, dynamic markup or runtime asset. |
| Integration | A12 is based on pristine c4d6c50 and leaves A02 frozen. The primary agent must combine and requalify patches; an isolated pass does not establish combined-source readiness. |

No further backlog refill was performed. Existing whole-project audit and release gates remain outside this bounded fix.

## Working-block record

Goal: qualify and fix the pending-completion/new-session target defect.

What worked: real before failure plus passing retry control; minimal acknowledged-session guard; all six focused after cases passed.

What broke: the baseline incorrectly retried S1 and left S2 paused. An early non-browser gate was stopped during check for the primary agent's integration scheduling; it is not counted as a completed gate.

What changed: one shared client and one distinct new browser suite, committed as `0a8b1a0`. Outputs stay in this dedicated A12 folder and its evidence paths.

Final local qualification: static checks and all 169 integration tests pass. Full browser records 88 pass / 1 existing DST failure / 1 offline-font skip / 0 not run; all six new focus cases pass. The existing production dependency advisory remains open. No further A12 app rerun is needed because the original app/camera group passed. Combining these independent patches and release acceptance remain with the primary run. No release actions, production requests, configuration changes or messages to external people were made.
