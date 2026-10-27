# A-12: Complete the newly started session after a lost completion response

Branch: `away/2026-10-26-1834-A12`, isolated pristine baseline `c4d6c50553f55704b4d4a788db28b05fa983047a`.

Scope: `public/js/focus-client.js`, one new distinct browser test file, and this dedicated output folder. A02 remains frozen. No auth, schema, dependencies, room HTML, workspace source or other pre-existing dirty work is included.

Acceptance checks, recorded before application edits:

1. Complete S1 with its response lost after commit, explicitly Start S2, then Finish: S2 is completed and server current is null.
2. Retry without starting another session still completes S1 idempotently and preserves credited time and points.
3. A failed new Start retains S1's pending completion so its Retry still works.
4. Recovery and final states work in Arabic/English at 390/1440px with light/dark samples, reachable controls, no horizontal overflow and no unexpected page errors.

Candidate: a pending completion ID survives a successful Start of a different session. The next completion is sent to the old session. Prior read-only VM evidence reproduced this on baseline and A02. A real room Finish also queues Pause, so browser qualification must determine the actual remaining server state.

All execution uses the shared credential-clearing Node 22 launcher, disposable loopback servers and offline browser configuration. Evidence goes to `../evidence/a12-*`. No production/provider requests or source `.env` access.

Before: `a12-before.log` confirms that after starting S2 and using Finish, the server still has S2 paused with `completed_at=null`. The room's Finish first pauses S2, then the stale pending completion targets S1. The old-completion Retry positive control passed. Real before screenshots and an independent server-state attachment are retained.

Implementation: only a successful server Start that acknowledges a different session ID clears the older pending completion. A failed Start or a successful Start returning the same session preserves the pending target.

After: all six targeted browser cases passed (`a12-after.log`). The four new-session cases cover EN1440/light, AR390/light, EN390/dark and AR1440/dark. Independent server queries confirm both sessions completed, no current session remains and the old completed record is unchanged. Both old-session Retry controls pass, including a rejected new Start. These short sessions award zero XP; the test compares unchanged saved credit and totals and does not claim positive-award duration coverage.

Frozen app/test commit: `0a8b1a05c386aa61d9ed66c54b93794255515b40`. SHA-256 hashes: `../evidence/a12-frozen-source-hashes.json`. The after run used these exact bytes before the commit. No later application/test edit has occurred.

The first non-browser gate was intentionally stopped during check, before integration, when the primary agent requested serialization. It is incomplete and not counted. The replacement static/audit run uses `a12-final-*`; integration was deferred until its assigned slot. Dependency installation retained two existing high advisories; no dependency changed.

Frozen-source static results: check, typecheck, lint and deadcode all pass. Lint retains four existing informational notices. Production audit fails on the existing body-parser high advisory `GHSA-27r3-jxmh-p828`. No dependency update was attempted.

Serialized full integration subsequently passed all 169 tests (`../evidence/a12-final-test-integration.log`, 197.9 seconds), including the unchanged 100ms Supabase control. It ran after the primary agent released the integration slot.

Final full-browser gate: the central `a12-final-browser` run finished with **88 passed, 1 failed, 1 offline-font skip, and 0 not run**. All six new focus completion cases passed. The sole failure is the unchanged expired-date DST fixture (`tests/smoke/ux-return.smoke.spec.js:118`); the original privacy-blur/camera and app serial group passed. The primary agent therefore excluded A12 from additional app isolation. No assertion or test deadline was weakened, and this browser gate remains non-green.

Source verification: the central queue records `sourceStable: true` with matching before/after manifest digest `6023194728a6635bd9be385ac7b26bc617409b3320c62204f6a9ca0eca6d4e8d`. Queue HEAD remained docs-only commit `56add7089eabef9764d7bc8209d07efada616ac3`; app/test bytes remain `0a8b1a05`. Evidence: `../evidence/a12-final-browser.log` and `../evidence/a12-final-browser-receipt.json`, the copied A12 entry from the primary run's `browser-queue.json`.

The earlier agent-owned browser/integration process trees had stopped when checked; `../evidence/a12-process-cleanup.json` records their PID/creation-time checks. The central browser run and its process cleanup belong to the primary agent. No unrelated process was stopped.
