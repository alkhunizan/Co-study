# A-02: Room focus recovery

Source: the existing F07-F11 focus/routine acceptance contract and the release-plan failure-path matrix.
Branch: `away/2026-10-26-1834-A02`, baseline `c4d6c50`.

Acceptance checks set before implementation:

1. A failed room-session start can be retried; the server then has one active session and the room reports confirmed synchronization.
2. A failed room pause can be retried; the original session becomes paused and an unrelated newer session is not changed.
3. A lost completion response retries the original session once and shows a truthful saved recap, without creating another session or credit.
4. The failure and recovered states retain Arabic/English behavior at 390px and 1440px, with visible controls and no added horizontal overflow.

Candidate: the Retry handler replays completion only. It uses a read-only refresh for failed starts and pauses, so a successful GET can dismiss the warning without applying the intended action.

Execution uses Node 22, disposable local state and fake providers. No production requests or source `.env` access. Existing unrelated dirty files are excluded.

Historical gate: first seven targeted browser scenarios passed. The full gate on earlier app/test commit `35321717cba9a198d4720cb345ffeb790c26b33e` passed syntax, types, lint, dead-code and all 169 integration tests. Browser: 89 passed, 1 skipped (external fonts), and one existing past-date calendar-fixture failure. This predates the queued-Pause follow-up and is not final-source proof. Production dependency audit remained red with the pre-existing body-parser advisory.

Scoped follow-up: rapid Pause while the first Start response is delayed reproduced a missing target ID. `../evidence/a02-queued-before.log` shows Retry leaves the server active. The client now records the exact target inside its queue immediately before the POST and carries that target on rejection. It never infers the original target from a later current-session snapshot. All eight cases passed in `../evidence/a02-queued-after.log` on that final application source.

Frozen app/test HEAD: `bc7f2ec6f7f55cce923fe0258ae18e739d4c4728`. Application code was last changed by `a981929bec04b812aeda693aec68491eff14908d`; the final commit adds two test-only callback type annotations. File hashes are recorded in `../evidence/a02-qualified-source-hashes.json`. The type annotation correction passes typecheck.

Final frozen-source browser gate: the centrally executed `a02-final2-browser` run finished with **85 passed, 2 failed, 1 offline-font skip, and 4 app serial cases not run**. All eight new focus recovery cases passed. The failures are the existing privacy-blur case (`app.smoke.spec.js:318`) and expired DST fixture (`ux-return.smoke.spec.js:118`). These original counts remain unchanged; this gate is not green.

The queue receipt reports `sourceStable: true`, with the same before/after manifest digest `a9bff54e58249995ad39e480d8583a0f10b29ba3f92cd42e3fab8ae87c7604c6`. Queue HEAD stayed at docs-only commit `5ef988d73d126cb128fde32768e39ceaeed8c9bd`; app/test bytes remain the frozen `bc7f2ec` version. Evidence: `../evidence/a02-final2-browser.log` and the copied A02 entry `../evidence/a02-final2-browser-receipt.json` from the primary run's `browser-queue.json`.

Subsequent original app-suite isolation: `a02-app-isolated` finished at 21:23:45 +03:00 with **8 passed, 0 failed, 0 skipped, 0 not run**. The privacy-blur case passed, and all four cases that had not run after the broad serial failure executed and passed. No application, test assertion, deadline or browser configuration changed. Classify the camera result as intermittent with its cause unproven; the isolated pass neither erases the broad failure nor establishes a fully green browser gate. Evidence: `../evidence/a02-app-isolated.log`, the matching `a02-app-isolated-source-before.json` / `a02-app-isolated-source-after.json`, and `../evidence/a02-app-isolated-receipt.json`, copied from the primary `app-isolation.json`. The source manifest is again `a9bff54e58249995ad39e480d8583a0f10b29ba3f92cd42e3fab8ae87c7604c6`, with `sourceStable: true`.

Frozen-source check, typecheck, lint and deadcode were rerun at `bc7f2ec` and all passed (`../evidence/a02-frozen-*.log`). Lint retained the same four existing informational notices. No source changes followed these checks.

The follow-up non-browser gate (`a02-qualified`) passed check, lint and deadcode; its first typecheck caught the deferred test callback annotation and was corrected. Production audit still fails on the existing body-parser advisory. Integration was 168/169: the unchanged `supabase-deadline.integration.test.js` successful control exceeded its 100ms request budget. The exact test failed again alone while other agents' suites were running (`a02-supabase-deadline-solo.log`). The earlier gate passed all 169 tests. No assertions or deadlines were weakened.

Later disposition: the unchanged deadline case passed in a separated rerun after all active browser/integration batches ended (`../evidence/a02-deadline-separated.log`, 1/1 pass). Its test duration was 171.7ms including the intentionally stalled 100ms phase. The 100ms successful-control budget is intermittent; this evidence does not establish a new application defect. Preserve the 168/169 gate and both original failure artifacts. The separated pass and `local-deadline-timing.json` are diagnostic support only, not a replacement full green gate.

Before: English and Arabic start retry left the server without a session; a background refresh hid a failed pause. Completion lost-response positive control already passed. The incorrect-navigation harness run is discarded.

After: Retry recovers start/pause, keeps failure feedback until confirmed, adopts a newer session without mutating it, and preserves completion idempotency. Arabic/English 390/1440 screenshots, light/dark samples, keyboard activation, target sizing and overflow checks pass. Independent server queries confirm the session state.

Scope: two existing browser JS files and one new smoke suite. No API, schema, auth, billing, HTML or CSS change. Source `.env` was not copied. Browser/network fixtures use only local data.

The original recorded gate process trees have stopped (30 recorded entries, none with the same PID and creation time still active). `../evidence/a02-process-cleanup.json` records the check. No unrelated process was stopped.

Known release boundary: existing script URLs retain their version token and static JS is cached for one hour. Protected dirty HTML files cannot be revised in this run; asset-version/cache handling belongs to integration/release.

Requested read-only backlog refill found one separate pre-existing completion-target issue; see the historical BACKLOG-TRIAGE.md. It was subsequently qualified and fixed on the independent A12 branch, with app/test commit `0a8b1a05`. A02 does not include that patch, and combined-source acceptance is not claimed.
