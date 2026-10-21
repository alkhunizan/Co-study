# Hardening implementation — 21 October 2026

User requested all six recommended items and review after each fix. This is an explicitly authorized implementation pass, including sandbox billing and existing dirty files, rather than another limited automatic Viber repair pass. No production charging, provider-dashboard changes or deployment are included. Original work is preserved in `evidence/baseline.patch` and `baseline.json`.

Branch: `fix/2026-10-21-hardening`. Tests run from an isolated local snapshot without the workspace .env, with provider credentials scrubbed and external browser requests blocked. Product remains one VIP tier at USD 4.99/month. Evidence stays in this dedicated folder.

## Ordered work and review ledger

1. Shared lobby renewal, reconnect, role replacement and teardown — reviewed, focused tests pass.
2. Permanent privacy regression tests — reviewed, focused tests pass.
3. Shared-board ceiling and diagnostic redaction — reviewed, focused tests pass.
4. Sandbox reconciliation and controlled unresolved-order review — reviewed, focused tests pass.
5. Coherent committed release and clean-checkout verification — pending.
6. External-service acceptance preparation and available checks — pending; real service acceptance requires configured owner services.

Each entry will record regression evidence, code review, corrections and validation before the next fix. No passing mock test will be presented as real-provider acceptance.

## Fix 1 review - lobby lifecycle

Before: four new lifecycle tests failed because headless joins bypassed shared session management. After: 7/7 media lifecycle tests, 3/3 lobby browser tests, typecheck and targeted lint pass. Tests cover four renewal intervals (180 seconds), membership rejection, role replacement, pending SDK join followed by departure and immediate keepalive notification. Browser test verifies pagehide stops renewal and releases the SDK session.

Review corrections: start the leave HTTP request before waiting for SDK teardown; ignore stale heartbeat failures during replacement; ignore obsolete socket join callbacks; avoid blocking join on optional SDK pagination; cache the client ID when localStorage is unavailable. The first role-order assertion incorrectly demanded SDK teardown start before HTTP notification; corrected it to require both before the next token, with immediate HTTP notification explicitly asserted. Server token issuance was traced: it rechecks socket membership and active session after the external await, revoking late tokens. Provider calls in tests remain fakes. No visual layout changes.

## Fix 2 review - permanent privacy regressions

Four browser tests now run in the existing CI smoke glob: failed canvas capture, unsupported capture, source ending during preparation and blur enabled mid-call. Each verifies no preview/raw track survives, hidden processing video is removed, retry is available and raw video requires an explicit choice. Synthetic browser-generated MediaStreams avoid physical-camera/fake-driver flakiness; the existing normal fake-camera test remains unchanged. Replacing only the isolated runtime index with the original unsafe source makes the capture test fail at missing recovery feedback; restored final source passes all four in 23.5 seconds. Typecheck passes. Review corrected the test's blur preference key and replaced a forgiving toggle with an explicit off-state assertion.

## Fix 3a review - shared-board capacity

The real socket/restore regression failed before (101st task accepted) and passes after. At 99 tasks one add succeeds, the next rejects with BOARD_TASK_LIMIT; toggle/delete still work. A restored 101-task board remains intact and rejects growth until below 100. Only the add handler enforces the cap; restore never truncates. The browser test verifies rejected input stays in the draft and the message translates. Review caught a missing Arabic dictionary entry caused by shell encoding; corrected with a UTF-8 patch and reran the unchanged assertion successfully. Feedback now announces politely to screen readers. No layout/theme changes.

## Fix 3b review - diagnostic redaction

Regression fails on original DEBUG=true logging and passes after. Default console diagnostics are disabled; explicitly enabled diagnostics retain only allowlisted numeric/boolean fields, never raw candidate strings or ICE credentials. Direct WebRTC console errors now print error names rather than bodies. Reviewed all debug call sites for interpolated sensitive payloads. Capacity/diagnostic typecheck and targeted lint both pass.


## Fix 4a review - bounded payment queue

Regression reproduced twenty hints creating twenty jobs. The canonical job is now keyed by order, preserves retry counts and enforces a five-minute lookup cooldown. New hints arriving during verification remain pending; failures still consume the retry budget. Exhausted jobs cannot be reactivated by callbacks. Legacy per-hint records are retained as coalesced evidence. Existing transaction-binding test now explicitly asserts no entitlement during cooldown, advances its fake clock, then retains its original successful-verification assertion. No trust assertion was relaxed.

## Fix 4b review - delayed approvals

The A/B/C timeline reproduced a unique-index collision. Migration 003 keeps the one-open-checkout rule for creating/pending/unknown orders while permitting paid orders held for review. Checkout still blocks on unresolved review. A later subscription expiry cannot silently activate a review order: ordinary verification leaves it in review; explicit operator activation independently verifies provider data and remains idempotent. No order data is deleted by migration.

## Fix 4c review - controlled staff review

Added bounded, cursor-paginated unresolved orders and audited rechecks. Billing readers require MFA; rechecks/explicit reviewed-payment activation require MFA plus the existing super-admin-only staff.manage permission. No new grants or manual paid/price overrides. Unknown creation without a usable provider reference remains unresolved and requires merchant investigation. UI is bilingual and uses existing accessible form controls. A real HTTP/browser journey tests anonymous rejection, missing MFA, role-change session invalidation, read-only billing scope, invalid reason, successful verified activation and actor audit. Review corrected a text/UUID cursor type mismatch, renewed MFA after role changes in the harness, and refreshed subscription/audit lists after actions. Browser screenshots reviewed at 390px; no horizontal overflow. Payment integration suite: 18 passed; browser: 1 passed; targeted lint and typecheck pass. Fixtures only, no merchant calls.
