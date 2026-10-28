# Room focus retry review

A failed start or pause could leave the room timer and account session in different states. Retry fetched the current session but did not repeat the failed action. A successful background refresh also dismissed the warning even when the requested pause was still unapplied.

The room now remembers the failed action and its original session. Retry first reconciles with the server, then repeats the action only when it still applies. A successful read does not dismiss an unapplied action. When another surface has replaced the session, Retry adopts that state without pausing the newer session. The shared client checks the original session again inside its queue before a retried pause. It captures a failed request's target at the actual POST boundary, including a Pause queued before the first Start returns.

Completion keeps the existing idempotent endpoint behavior. An acknowledged completion followed by a failed summary refresh needs only another read; the saved mutation is not repeated. Later explicit actions supersede earlier failures.

## Evidence

- `../evidence/a02-before.log`: English start retry fails its independent server-state assertion; lost-completion positive control passes.
- `../evidence/a02-before-confirmed.log`: Arabic start retry leaves the server without a session; background refresh hides the unapplied-pause warning. Both fail on unchanged application source.
- `../evidence/a02-after.log`: first four focused browser cases pass after the change.
- `../evidence/a02-targeted-isolated.log`: first seven-case matrix, all passed.
- `../evidence/a02-final-*.log`: full gate on first app/test commit `3532171` (before the queued-target follow-up).
- `../evidence/a02-final2-browser.log`: final frozen-source full browser gate: 85 passed, 2 failed (existing privacy blur and expired DST fixture), 1 offline-font skip, 4 app serial cases not run. All eight new focus cases passed. These original results are preserved; the gate remains non-green.
- `../evidence/a02-final2-browser-receipt.json`: copied central queue receipt with `sourceStable: true` and matching manifest digest `a9bff54e58249995ad39e480d8583a0f10b29ba3f92cd42e3fab8ae87c7604c6`; frozen application/test source is `bc7f2ec`.
- `../evidence/a02-app-isolated.log`: later original app-suite isolation passed 8/8, including privacy blur and all four previously unrun cases. No assertions, deadlines, browser configuration or application source changed. Camera behavior is intermittent; cause unproven. This pass is supporting evidence, not a replacement broad green gate.
- `../evidence/a02-app-isolated-receipt.json` and the matching source-before/source-after JSON: copied isolation receipt and unchanged manifest `a9bff54e58249995ad39e480d8583a0f10b29ba3f92cd42e3fab8ae87c7604c6`, `sourceStable: true`, finished at 21:23:45 +03:00.
- `../evidence/a02-queued-before.log`: rapid Start/Pause independently leaves the session active after Retry.
- `../evidence/a02-queued-after.log`: expanded eight-case matrix after capturing the target inside the request queue, all passed.
- `../evidence/a02-qualified-*.log`: follow-up non-browser gate; see the unresolved audit/integration results in CHECKPOINT.md.
- `../evidence/a02-fixture-types.log`: passing typecheck after the test-only callback annotations.
- `../evidence/a02-frozen-*.log`: passing check, typecheck, lint and deadcode at final app/test commit `bc7f2ec`.
- `../evidence/a02-supabase-deadline-solo.log`: unchanged integration control failed again alone while other agent suites were active; no clean machine-idle timing conclusion is claimed.
- `../evidence/a02-deadline-separated.log`: unchanged deadline test passed 1/1 after active browser/integration batches ended (171.7ms including the intentionally stalled 100ms phase). The control's 100ms budget is intermittent; this is diagnostic support, not a new app defect or a replacement for the earlier 168/169 gate. Original failure logs remain intact.

The intermediate `a02-before-corrected` run used an incorrect test navigation expectation and is discarded. The first expanded matrix reached the signup rate limit because its cases shared one server; tests now use a disposable server per case. Neither artifact is counted as an application failure.

## Import-hop review

Changed: `public/js/room-focus.js`, `public/js/focus-client.js`, and one new browser test. Read-only callers: room HTML timer hooks, platform focus controls, and guided-routine controls. Read-only callees: shared bounded JSON requests, the platform router, and the progress service.

| Concern | Result |
| --- | --- |
| Error/success honesty | Confirmed by failed start/pause, background refresh and saved-completion cases. |
| Async ordering | Latest explicit action wins; Retry is disabled while running; queued pause retains its intended session. |
| Sibling behavior | Ordinary workspace/routine pause calls omit the optional session guard and keep their existing behavior. Completion retains its original pending-session retry. |
| Authentication/ownership | Existing server session and user-scoped progress queries are unchanged. No new endpoint, permission, role, database or billing behavior. |
| Validation/credit | Session IDs are still URL-encoded and server-owned. Retry does not manufacture elapsed time, XP or completed sessions. |
| Secrets/debug/mocks | No new production literals, logging, third-party calls, fake data or fallback permissions. Test fixtures use loopback servers and synthetic accounts. |
| Asset/import completeness | Both changed scripts are already served by the existing room/platform pages; no new runtime dependency or asset. |
| Visual checks | Existing controls/copy retained. Arabic/English at 390/1440px, light/dark examples, keyboard Retry, 44px retry target and overflow checks. External fonts blocked in these local tests; font-provider acceptance is not claimed. |

No open P0/P1 was found in this change's scoped review. Full-project production readiness remains separate: existing dependency audit, provider, migration and remote-publication gates are owned by the primary run.

## Boundaries

No production request, paid provider call, message, push, merge, deployment, configuration change or migration was made. The existing source checkout and its dirty files remain untouched. Evidence is local only.
