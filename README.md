# Halastudy <span style="font-family:Newsreader,serif">هلا</span>

[Arabic Documentation](./README_AR.md) · [Design System](./design-system/README.md)

**Halastudy** (formerly Co-Study) is the warm, late-night study room of the Gulf — a body-doubling focus app where students drop in, camera on, mic off, and work alongside each other. Built Arabic-first with full RTL parity.

This release ships with:
- Arabic as the default UI with full RTL layout mirroring
- English as a secondary selectable UI
- Shared language preference via `coStudyLang` (key retained for backward compat)
- Logical CSS properties throughout so the layout auto-flips on language change
- The Halastudy design system (`/design-system/`) — karak-amber accent, Newsreader + Tajawal + Amiri typography, single-accent palette, Gulf night-sky dark mode

## Features

- Custom room names with shareable room codes
- Optional password protection with PBKDF2 hashing
- Optional accounts (email + password, no verification wall): synced focus minutes and day streaks, My Rooms with one-click rejoin, reserved nickname, avatar accent + bio. Instant rooms stay guest-open; scheduled rooms require an account
- Self-serve, reauthenticated delete-my-data flow on the account page (PDPL), with durable failure handling and session revocation; shared content/backups are explained in the privacy policy
- Member workspace at `/app`, private circles and assigned supervisors at `/supervisor`, and one VIP offer at `/plans`: USD 4.99/month
- DigetPay hosted checkout adapter for sandbox testing, with server-verified payments and refund reconciliation; production charges and automatic renewal remain disabled. [Setup and limits](docs/payments/2026-10-20-digetpay/IMPLEMENTATION.md)
- Named staff roles with authenticator MFA, recovery codes, audit events, moderation and operating controls; first-owner bootstrap retires shared-admin access
- Hidden admin ops console at an env-secret path: live overview, room inspect/force-close/kick, runtime video kill-switch, user ban/unban, site-wide broadcast banner, backup-now, recent errors
- Server-timed sessions, pause/resume, bounded heartbeat credit, deduplicated points and achievements
- Cloudflare RealtimeKit video rooms with server-issued participant tokens; mesh is local-development-only
- Live Socket.IO chat and room presence
- Pomodoro timer with daily focus tracking
- Shared room board, room status sharing, and ambient sounds
- Reusable scheduled rooms with Riyadh-based cadence, countdowns, calendar export, and WhatsApp-ready invites
- Transactional PostgreSQL-compatible account, room and platform storage; embedded PGlite for local development
- Legacy disk-backed room persistence for chat history and board state (non-platform mode)
- TURN-ready runtime ICE config; local-development mesh/ICE diagnostics (disabled in production)
- Launch guardrails: 20 global active video participants, 20 per room, mic off by default, recording off
- Development-mesh-only AI focus monitoring through the browser FaceDetector API
- Health/readiness/metrics endpoints, abuse controls, automated + manual state backup/restore, bilingual 404, and a PWA manifest

## Quick Start

### Local Development

Use Node 22. The app reads process environment and does not automatically load
`.env`; use explicit local values without production Supabase/provider secrets.

```bash
git clone https://github.com/alkhunizan/Co-study.git
cd Co-study   # repo dir kept; product rebranded to Halastudy
npm ci
npm start
```

Open `http://localhost:3000`.

For an isolated local platform review, run `npm run platform:preview` and open `http://127.0.0.1:3470/app`. See [platform operations and migration](docs/implementation/2026-10-20-platform/OPERATIONS.md) for test checkout, first-owner setup, storage, backups and remaining production integrations.

### Local Secure-Context Testing

```bash
npm run https
```

Open `https://localhost:3443` and accept the local certificate warning. This entrypoint exists for browser APIs that require a secure context during local testing.

### Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for the production Nginx + PM2 setup.

### Verification

```bash
NODE_ENV=test npm run test:ci:quality
NODE_ENV=test npm run test:ci:infra
npm run test:smoke
```

`test:ci` runs those three groups sequentially; GitHub Actions runs quality,
infrastructure and browser jobs separately. Infrastructure needs Linux/Docker,
tar and ShellCheck (or its Docker fallback), with LF shell scripts. It applies
all three migrations twice to disposable PostgreSQL and validates Docker/Nginx.
Playwright runs Chromium/WebKit on desktop/mobile; install its browsers first.
In PowerShell set `$env:NODE_ENV='test'` before the npm commands instead of the
Bash assignment prefix. Real-provider/device gates remain separate.

## Operator Commands

```bash
npm run backup:state
npm run restore:state -- /absolute/path/to/artifact.hsbackup
npm run restore:state -- /absolute/path/to/artifact.hsbackup --apply --writer-stopped
npm run platform:backup -- --directory /absolute/path/to/database --file /absolute/path/to/backups/platform.json
npm run platform:restore -- --directory /absolute/path/to/empty-database --file /absolute/path/to/backups/platform.json
npm run verify:deploy -- https://your-domain.com
```

Restore defaults to a checksum/schema/tombstone dry run. Applying is an offline
operator action: stop the single app writer first, supply both apply flags, then
start the app and run `verify:deploy`. See
[`docs/BACKUP-RESTORE.md`](docs/BACKUP-RESTORE.md).

Platform backup/restore also requires stopping the app. Platform restore targets
an empty database and invalidates previous sessions. The named-staff console and
scheduler can create snapshots while the app runs. `backup:rooms`/`restore:rooms`
apply only to the legacy JSON mode.

For production use the service-owned `scripts/deploy/backup.sh` and `restore.sh`
wrappers. Run `verify:deploy -- <url> --env-file /var/lib/halastudy/.env` as
`halastudy` after creating a fresh complete daily artifact. The six sources are
profiles, deletion tombstones, focus claims/sessions, room events and rooms.
Restore writes protective tombstones first and rejects unsafe ages even for
pins. Video runtime sidecars and secrets are outside the artifact.

## Stack

- Frontend: Vanilla JavaScript, HTML, CSS
- Backend: Node.js, Express, Socket.IO
- Realtime media: Cloudflare RealtimeKit in production, with explicit local-only WebRTC mesh testing
- Security: PBKDF2 password hashing with timing-safe verification
- Local secure-context dev: Self-signed HTTPS via `selfsigned`
- Production transport: Nginx public HTTPS -> local HTTP app
- Production process manager: PM2

## Project Structure

```text
Co-study/
|-- landing.html
|-- index.html
|-- open.html / account.html / lobby.html
|-- blog*.html / privacy.html / terms.html / 404.html / admin.html
|-- public/js/             # shared core/UI, index-app.js, video clients
|-- server.js
|-- server-https.js
|-- co-study-server.js
|-- room-store.js
|-- supabase-user-store.js
|-- services/              # auth, persistence, video, operations
|-- supabase/migrations/   # three additive SQL migrations
|-- schedule-utils.js
|-- scripts/
|-- tests/
|-- audio/
|-- images/
|-- data/
|-- DEPLOYMENT.md
|-- nginx.conf
|-- ecosystem.config.js
|-- README.md
`-- README_AR.md
```

## Configuration

Production requires both distinct random 32-byte `SESSION_SECRET` and
`ADMIN_SESSION_SECRET` values, complete `SUPABASE_URL` / service-role credentials,
and complete RealtimeKit configuration. There is no local-user fallback in
production. `start.sh` loads the protected service environment; startup awaits
persistence hydration/drains and provider reconciliation before listening.
See [deployment requirements](DEPLOYMENT.md) and the
[ordered rollout](docs/ROLLOUT-COMPATIBILITY.md) before starting the candidate.

- `PORT`: Local HTTP application port for `server.js`. Defaults to `3000`.
- `HTTPS_PORT`: Local HTTPS port for `server-https.js`. Defaults to `3443`.
- `TRUST_PROXY`: Set to `1` behind Nginx so Express trusts `X-Forwarded-*`. Defaults to `0`.
- `ALLOWED_ORIGINS`: Optional comma-separated allowlist of exact `http(s)://origin` values. If unset, the app allows same-origin browser traffic only.
- `ICE_SERVERS_JSON`: Development-only JSON array for explicit mesh tests. Never configure static TURN credentials in production.
- `MESH_PARTICIPANT_LIMIT`: Optional hard cap for mesh rooms. Defaults to `4`.
- `ENABLE_DEV_MESH`: Must be explicitly `true` together with `VIDEO_PROVIDER=mesh` in development/test. It is forbidden in production.
- `ROOM_STATE_FILE`: Optional JSON file path for persisted room state. Defaults to `./data/rooms.json`.
- `ROOM_STATE_BACKUP_DIR`: Backup artifact directory; default `./data/backups`. Use external service-owned state/backup paths in production, configure `BACKUP_ENCRYPTION_KEY`, and keep `BACKUP_INTERVAL_MINUTES=0` while the encrypted timer runs.
- `SFU_BASE_URL`: Optional absolute `http(s)` base URL for the SFU iframe integration.
- `VIDEO_PROVIDER`: Defaults to `realtimekit`. `mesh` requires `ENABLE_DEV_MESH=true` in development/test and is rejected in production.
- `VIDEO_JOIN_DISABLED`: Emergency kill switch. Set to `true` to reject new video tokens without stopping chat/rooms.
- `MAX_GLOBAL_VIDEO_PARTICIPANTS`: Hard global active-video cap. Defaults to `20` and cannot exceed `20`.
- `REALTIMEKIT_MONTHLY_COST_CAP_USD`: Monthly RealtimeKit cost cap used by `npm run cloudflare:cost-check`. Defaults to `500`.
- `MAX_ROOM_VIDEO_PARTICIPANTS`: Hard room active-video cap. Defaults to `20` and cannot exceed `20`.
- `MAX_ROOM_DURATION_MINUTES`: Video provider meeting age limit. Expired idle meetings are recycled; active expired meetings reject new video tokens. Defaults to `180`.
- `VIDEO_RECORDING_ENABLED`: Must remain `false` for launch.
- `VIDEO_SCREENSHARE_ENABLED`: Must remain `false`; startup rejects `true`.
- `VIDEO_CHAT_ENABLED`: Must remain `false`; use Halastudy chat instead of provider chat.
- `VIDEO_DEFAULT_PRESET_NAME`: RealtimeKit participant preset. Defaults to `halastudy_student`.
- `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_REALTIMEKIT_APP_ID`, `CLOUDFLARE_REALTIMEKIT_API_TOKEN`: Server-only RealtimeKit credentials.
- `CLOUDFLARE_REALTIMEKIT_WEBHOOK_PUBLIC_KEY_URL`: Optional verification-key endpoint override for isolated staging tests. Production defaults to Cloudflare's public key endpoint.
- `PUBLIC_API_BASE_URL`: Reserved for a future Cloudflare Pages frontend split.

RealtimeKit must deliver signed events to `POST /api/webhooks/realtimekit`. The
server verifies the exact raw body, deduplicates `rtk-uuid` deliveries for 24
hours, and treats provider join/left/meeting-ended events as authoritative for
video capacity. Browser heartbeat and leave calls are advisory only.

Scheduled-room notes:
- One-time rooms expire 30 minutes after their occurrence closes. Recurring rooms default to a 90-day horizon and may opt into at most 365 days.
- Schedule cadence supports `once`, `daily`, `weekdays` (Saudi Sunday-Thursday), and `weekly`.
- Timer defaults and the starting board goal template are stored with the room schedule.
- Only the authenticated room owner receives occurrence-keyed commitment credit; reconnects and other participants cannot alter the owner's streak.

Development mesh TURN example:

```bash
NODE_ENV=development VIDEO_PROVIDER=mesh ENABLE_DEV_MESH=true npm start
```

```json
[
  { "urls": ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
  { "urls": "turn:turn.example.com:3478", "username": "turn-user", "credential": "turn-password" }
]
```

Production media uses RealtimeKit and must not contain static TURN credentials.
For development mesh tests, use short-lived TURN credentials and rotate them
before expiry.

RealtimeKit launch notes:
- The browser never receives the Cloudflare API token. The backend creates/reuses one RealtimeKit meeting per Halastudy room and returns only a client participant token.
- The token endpoint rejects the 21st active video participant before calling Cloudflare.
- Mic is off by default; recording, screenshare, and provider chat remain off for launch.
- The legacy mesh path remains available only for authenticated sockets in development/test with both `VIDEO_PROVIDER=mesh` and `ENABLE_DEV_MESH=true`. Production rejects the flag/provider and never relays persisted legacy mesh signaling. The iframe SFU path remains legacy-only behind `SFU_BASE_URL`.
- AI focus monitoring stays available in legacy mesh rooms only.

Launch cost guardrail:

```text
20 users x 4 hours/day x 60 minutes x 30 days = 144,000 participant-minutes/month
144,000 x $0.002 = $288/month
```

This stays under the $500 launch cap only while the 20-user global cap remains enforced and recording/screenshare/AI/transcription extras stay off.

Run `npm run cloudflare:cost-check` from the deployed service environment. It
uses the durable video registry, webhook acceptance journal, and optional
`VIDEO_SESSION_LOG_FILE` locally; it never calls Cloudflare or requires provider
credentials. Occupancy and estimated USD use the same 70/85/100% bands. Exit 2
is an early notice/warning and exit 1 is a critical threshold or invalid local
evidence, which lets cron or the process monitor route alerts by severity.

Platform storage imports legacy JSON once into the `halastudy` SQL schema. In legacy (non-platform) mode, room persistence stores room metadata, protected-room password hashes, chat history, shared board state, and scheduled-room metadata/attendance on disk. Live presence, socket IDs, camera state, and other transient participant state remain memory-only. Supabase profile storage remains a compatibility path that needs its own account backup.

Durable video lifecycle and webhook acceptance are separate sidecars derived
from `ROOM_STATE_FILE`; preserve both across code deploys/rollbacks.

This persistence layer is designed for a single app instance. Keep PM2 at one process; runtime locks refuse concurrent instances. Back up the canonical database (or the state file in legacy mode) and do restores while the app is stopped. Disabling the platform after migration would read stale JSON and is not a safe rollback. See the [operations guide](docs/implementation/2026-10-20-platform/OPERATIONS.md).

`VERSION=1.2.0.0` is the historical display label corresponding to npm `1.2.0`.
Health reports the npm version; it is not evidence of the deployed Git SHA.
The next release number remains unassigned while readiness work continues.

## Manual Media QA

- RealtimeKit room joins with real Cloudflare credentials
- Camera starts available and mic stays off by default
- Recording, screenshare, and provider chat are not visible/enabled
- 20 active video participants allowed; 21st rejected before provider token creation
- `VIDEO_JOIN_DISABLED=true` blocks video token issuance without breaking chat/presence
- Password-protected rooms still require the room password before video token issuance
- Development-only authenticated mesh testing with `VIDEO_PROVIDER=mesh` and `ENABLE_DEV_MESH=true`
- Disconnect and rejoin during an active room
- Mobile/network pass: iPhone Safari, Android Chrome, Saudi mobile data, weak Wi-Fi, and a 60-minute room test

## License

MIT

## Contributing

Issues and pull requests are welcome.
