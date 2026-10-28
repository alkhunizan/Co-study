# A11: retain guided focus after task-link failure

Refill source: existing F07/F09 acceptance for task-linked guided rounds and failure recovery. Baselinec4d6c50. Candidate score3/3/3. This is guidance only and cannot grant credited time.

Acceptance recorded before implementation:
1. When starting focus succeeds but task attachment fails, the guide retains that exact running session, shows a localized error and offers usable Pause/Stop instead of getting stuck at Begin.
2. Retrying attachment links the selected task to the original session exactly once; reload preserves the guide and task. No duplicate focus session or extra rewards are created.
3. The same recovery works at the next focus round after a break. Failure before focus starts leaves the guide ready for retry.
4. Cover English1440 and Arabic390 with server-state assertions and usable fallback-font screenshots.

## Local result

Application/test commit:19c4c5b. Three before cases failed with the server session active but the guide missing Pause; the failed-start positive control passed. All four after cases passed. Evidence: `../evidence/a11-before.log` and `../evidence/a11-after.log`.

The guide now retains its acknowledged session and running state before attempting the separate task link. The finally path stores and renders the resulting state even if a later step fails. Task attachment still uses the existing server checks and retry control. The two starts share this ordering, including the next round after a break.

Arabic390 error and English1440 recovered screenshots were visually inspected. Primary controls remain readable and on-screen with no horizontal overflow; the same account/session/task persists through retry, Pause and reload. These are offline fallback-font captures. Client clock advancement does not grant server credit, as the next-round case asserts.

All four static checks passed on the final source. Integration finished168/169; an existing recovery fixture failed in its local message JSON parser. The changed browser guide is not loaded by that fixture, but the failure's cause remains unresolved because the away guard rejected the read-only follow-up inspection; no equivalent read was attempted. Full browser finished81 pass,2 failures (privacy blur and expired date fixture),1 offline font skip,4 not run after the serial camera failure. All four guide cases passed again. Source manifest d7620e77ad1530b72e00155f9f1e0bb9defee4db13f89f93511e06ecb4e36700 matched before/after. Existing body-parser audit and release/remote holds remain.

After the broad queue stopped, the original app suite passed8/8 alone in a11-app-isolated.log. The camera case and all four previously unexecuted cases passed, with the same clean source manifest before/after. Both receipts remain. No camera code, assertion or timeout changed, and the cause of its intermittent result is not established. This passing browser follow-up does not resolve the separate integration-fixture failure.

Independent read-only review of the guide/state-machine diff and the four regression cases found no further concrete issue. This does not erase the unresolved full integration gate.

## Scope review

The changed orchestration never grants time or points. Focus start and attachment remain separate authenticated server operations. Session ID is retained only after start succeeds, and an attachment error propagates to existing localized feedback. Stop retains the existing current-session comparison. Source review covers study-routine, focus-client and the existing task-attachment route one hop. No new rendering of untrusted HTML, storage credential, permission, schema or provider change.
