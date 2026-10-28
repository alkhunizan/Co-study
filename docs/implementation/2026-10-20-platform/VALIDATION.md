# Validation — 20 October 2026

> Historical implementation validation. The [later remediation receipt](../../viber/2026-10-20/remediation/RUN.md) records the current complete 99-test backend and 32-test browser runs.

The target Node version was verified as **v22.23.3**. Tests used temporary databases and fake media services, with external database credentials cleared. Evidence lives in this folder; temporary runtime files are under `evidence/tmp` and excluded from Git.

| Check | Result | Evidence |
|---|---|---|
| Complete Node 22 integration suite | 88 passed, 0 failed | `evidence/integration-node22.log` |
| Final platform HTTP/socket check | 1 passed, including five concurrent authenticated joins competing for four mesh seats | `evidence/platform-api-final.log` |
| Final existing join regressions | 4 passed: restart/password, mesh capacity/reconnect, protected preview, switching rooms | `evidence/join-regressions-final.log` |
| Final platform domain suite | 7 passed, including Riyadh rollover, caps and expired-circle restrictions | `evidence/platform-domain-final.log` |
| Final auth/foundation suite | 6 passed, including a new failed-write logout-retry regression | `evidence/foundations-final.log` |
| Existing browser suite on Node 22 | 25 passed | `evidence/browser-existing-node22.log` |
| New platform browser journey on Node 22 | 1 passed | `evidence/platform-browser-node22.log` |
| Syntax including changed HTML inline scripts | Passed | `evidence/syntax-node22.log`, `evidence/platform-syntax-final.log` |
| Typecheck | Passed | `evidence/typecheck-node22.log`, `evidence/typecheck-final.log` |
| Biome | No warnings or errors | `evidence/lint-final.log` |
| Dead-code scan | Passed | `evidence/deadcode.log` |
| Production dependency audit | 0 vulnerabilities | `evidence/audit-final.json` |

The final targeted runs are overlapping rechecks, not additional totals to add to the full suite. One new logout-retry regression was added after the full run: 89 unique integration tests were exercised across the recorded runs.

## Browser and visual coverage

The new journey signs up through the account UI, returns to VIP checkout, simulates decline and success, changes cancellation settings, creates a circle, shares and accepts an invitation, assigns a supervisor, schedules a session, checks attendance, starts/pauses/completes focus, enrolls an authenticator, saves recovery codes, bootstraps the owner, uses the video entry control, rejects removal of the last super admin, and verifies the legacy shared login is closed.

Language and theme controls were exercised and persisted across reloads. No uncaught page errors occurred. Document overflow checks and axe WCAG 2 A/AA and 2.1 AA scans passed on:

- 1440px English workspace, light.
- 900px Arabic VIP page, light.
- 390px Arabic circles, light.
- 390px English progress, dark.

All four full-page screenshots were opened and visually inspected. This is tested-screen evidence, not a blanket accessibility certification.

Existing browser coverage includes signup/login, account deletion, scheduled-room gates, room creation/join/passwords, chat/board synchronization, timer presets, camera privacy blur, provider shells, timeout recovery, language/theme persistence, reduced motion and admin controls.

## Storage and security coverage

- Persistent embedded database reopened successfully with saved account changes and VIP membership.
- Deleting an account did not allow the old JSON import to resurrect it.
- Backup restore rejected a corrupted checksum and a nonempty target; successful restore revoked old account cookies and omitted staff sessions.
- Concurrent startup against an occupied local database was rejected.
- OAuth provider fixtures checked state mismatch/replay, PKCE, verified identity linking, purpose-bound reauthentication and failed durable signup.
- Role tests covered self-promotion denial, target MFA requirements, OTP replay, single-use recovery codes and session revocation after role changes.
- Reward tests covered overlap, forged elapsed time, pause/disconnection, duplicate completion, Riyadh midnight and daily/session caps.

## Iterations retained in evidence

Earlier logs include a missing matching Playwright browser, a browser-test cookie setup error, a supervisor-route default-view bug, an invitation code display/copy issue, and a test attempting to change language only through storage during hash navigation. These were resolved before the successful browser run. The initial full integration failure was an expected public-field list needing the new `authProvider` field.

No real Google login, production video meeting, real checkout, managed PostgreSQL load test, production content parity or deployment was claimed. Those depend on the actual deployment configuration and the selected payment provider.
