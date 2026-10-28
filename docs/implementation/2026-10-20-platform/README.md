# Halastudy platform upgrade

Implemented locally: one **VIP membership at USD 4.99/month**, a clearly labeled test checkout, member progress, private study circles, assigned supervisors, and named staff administration.

The interface follows the existing warm Arabic-first design, supports English, RTL and dark mode, and connects to the existing room timer and account navigation. Paid membership and administrative permissions are separate.

## Review the result

- [Desktop workspace](evidence/browser-results/platform.smoke-member-VIP--4bb09-ourneys-work-in-the-browser/desktop-en-home.png)
- [Arabic VIP page at 900px](evidence/browser-results/platform.smoke-member-VIP--4bb09-ourneys-work-in-the-browser/tablet-ar-vip.png)
- [Arabic study circles at 390px](evidence/browser-results/platform.smoke-member-VIP--4bb09-ourneys-work-in-the-browser/mobile-ar-circles.png)
- [English progress in dark mode at 390px](evidence/browser-results/platform.smoke-member-VIP--4bb09-ourneys-work-in-the-browser/mobile-en-progress-dark.png)

Run `npm run platform:preview`, then open `http://127.0.0.1:3470/app`. The launcher uses isolated test data and local operator credentials. Its background launch was blocked by automatic approval review, so this handoff does not claim an active preview server.

## What changed

| Area | Result |
|---|---|
| Members | Account workspace, room management, own progress and membership |
| VIP | Only paid tier; fixed USD 4.99/month; success/decline/cancel simulation; period-end cancellation |
| Circles | Three owner circles, twelve members each, single-use invitations, assigned supervisors, scheduled sessions and individual attendance |
| Gamification | Server-counted time, pause/resume, deduplicated XP, 240-point daily cap, Riyadh day boundaries and achievements |
| Staff | MFA/recovery codes, named roles, scoped controls, audit trail and last-super-admin safeguards |
| Persistence | SQL authority, one-time import, critical-write failures surfaced, concurrency guards, snapshot/restore drill |
| Safety | Revoked cookies/sockets, Google state/PKCE and reauthentication, protected room boundaries and concurrent capacity checks |

The complete Node 22 integration run passed 88 tests; final targeted rechecks include one additional logout-retry test. All 26 browser tests passed. See [validation evidence](VALIDATION.md).

## Production boundary

No deployment, real payment, remote database migration or off-site backup upload was performed. Real checkout still requires your chosen provider. Organization billing, worker processing and transactional-email recovery remain future integrations. See the [operations and migration guide](OPERATIONS.md) for exact boundaries, local owner setup and restore instructions.
