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
- Cloudflare RealtimeKit video rooms with server-issued participant tokens, plus legacy mesh fallback
- Live Socket.IO chat and room presence
- Pomodoro timer with daily focus tracking
- Shared room board, room status sharing, and ambient sounds
- Reusable scheduled rooms with Riyadh-based cadence, countdowns, calendar export, and WhatsApp-ready invites
- Disk-backed room persistence for chat history and board state
- TURN-ready runtime ICE config
- Launch guardrails: 20 global active video participants, 20 per room, mic off by default, recording off
- AI focus monitoring through the browser FaceDetector API
- Health/readiness endpoints, abuse controls, and manual room-state backup/restore

## Quick Start

### Local Development

```bash
git clone https://github.com/alkhunizan/Co-study.git
cd Co-study   # repo dir kept; product rebranded to Halastudy
npm install
npm start
```

Open `http://localhost:3000`.

### Local Secure-Context Testing

```bash
npm run https
```

Open `https://localhost:3443` and accept the local certificate warning. This entrypoint exists for browser APIs that require a secure context during local testing.

### Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for the production Nginx + PM2 setup.

### Verification

```bash
npm run check
npm run audit:prod
npm run test:integration
npm run test:smoke
npm run test:ci
```

`test:ci` matches the GitHub Actions quality gate for pushes and pull requests.

## Operator Commands

```bash
npm run backup:rooms
npm run restore:rooms -- /absolute/path/to/backup.json
npm run verify:deploy -- https://your-domain.com
```

Room restore is an offline operator action: stop the app first, restore the snapshot, then start the app and run `verify:deploy`.

## Stack

- Frontend: Vanilla JavaScript, HTML, CSS
- Backend: Node.js, Express, Socket.IO
- Realtime media: Cloudflare RealtimeKit by default, legacy WebRTC mesh fallback
- Security: PBKDF2 password hashing with timing-safe verification
- Local secure-context dev: Self-signed HTTPS via `selfsigned`
- Production transport: Nginx public HTTPS -> local HTTP app
- Production process manager: PM2

## Project Structure

```text
Co-study/
|-- landing.html
|-- index.html
|-- server.js
|-- server-https.js
|-- co-study-server.js
|-- room-store.js
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

- `PORT`: Local HTTP application port for `server.js`. Defaults to `3000`.
- `HTTPS_PORT`: Local HTTPS port for `server-https.js`. Defaults to `3443`.
- `TRUST_PROXY`: Set to `1` behind Nginx so Express trusts `X-Forwarded-*`. Defaults to `0`.
- `ALLOWED_ORIGINS`: Optional comma-separated allowlist of exact `http(s)://origin` values. If unset, the app allows same-origin browser traffic only.
- `ICE_SERVERS_JSON`: Optional JSON array of WebRTC ICE servers. If omitted or invalid, the app falls back to the built-in Google STUN servers.
- `MESH_PARTICIPANT_LIMIT`: Optional hard cap for mesh rooms. Defaults to `4`.
- `ROOM_STATE_FILE`: Optional JSON file path for persisted room state. Defaults to `./data/rooms.json`.
- `ROOM_STATE_BACKUP_DIR`: Optional directory for manual room-state backups. Defaults to `./data/backups`.
- `SFU_BASE_URL`: Optional absolute `http(s)` base URL for the SFU iframe integration.
- `VIDEO_PROVIDER`: Defaults to `realtimekit`. Set to `mesh` only for emergency fallback/testing.
- `VIDEO_JOIN_DISABLED`: Emergency kill switch. Set to `true` to reject new video tokens without stopping chat/rooms.
- `MAX_GLOBAL_VIDEO_PARTICIPANTS`: Hard global active-video cap. Defaults to `20`.
- `MAX_ROOM_VIDEO_PARTICIPANTS`: Hard room active-video cap. Defaults to `20`.
- `MAX_ROOM_DURATION_MINUTES`: Video provider meeting age limit. Expired idle meetings are recycled; active expired meetings reject new video tokens. Defaults to `180`.
- `VIDEO_RECORDING_ENABLED`: Must remain `false` for launch.
- `VIDEO_SCREENSHARE_ENABLED`: Defaults to `false`.
- `VIDEO_CHAT_ENABLED`: Defaults to `false`; use Halastudy chat instead of provider chat.
- `VIDEO_DEFAULT_PRESET_NAME`: RealtimeKit participant preset. Defaults to `halastudy_student`.
- `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_REALTIMEKIT_APP_ID`, `CLOUDFLARE_REALTIMEKIT_API_TOKEN`: Server-only RealtimeKit credentials.
- `PUBLIC_API_BASE_URL`: Reserved for a future Cloudflare Pages frontend split.

Scheduled-room notes:
- Scheduled rooms reuse the same room code instead of expiring as ad hoc rooms.
- Schedule cadence supports `once`, `daily`, `weekdays` (Saudi Sunday-Thursday), and `weekly`.
- Timer defaults and the starting board goal template are stored with the room schedule.
- Attendance is room-level only in this v1: on-time count, missed count, and current streak.

TURN example:

```json
[
  { "urls": ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
  { "urls": "turn:turn.example.com:3478", "username": "turn-user", "credential": "turn-password" }
]
```

WebRTC requires TURN credentials to be delivered to the browser at runtime. That is expected in this v1 setup.

RealtimeKit launch notes:
- The browser never receives the Cloudflare API token. The backend creates/reuses one RealtimeKit meeting per Halastudy room and returns only a client participant token.
- The token endpoint rejects the 21st active video participant before calling Cloudflare.
- Mic is off by default; recording, screenshare, and provider chat remain off for launch.
- The legacy mesh path remains available with `VIDEO_PROVIDER=mesh`; the iframe SFU path remains legacy-only behind `SFU_BASE_URL`.
- AI focus monitoring stays available in legacy mesh rooms only.

Launch cost guardrail:

```text
20 users x 4 hours/day x 60 minutes x 30 days = 144,000 participant-minutes/month
144,000 x $0.002 = $288/month
```

This stays under the $500 launch cap only while the 20-user global cap remains enforced and recording/screenshare/AI/transcription extras stay off.

Room persistence stores room metadata, protected-room password hashes, chat history, shared board state, and scheduled-room metadata/attendance on disk. Live presence, socket IDs, camera state, and other transient participant state remain memory-only.

This persistence layer is designed for a single app instance. Keep PM2 at one process, back up the state file, and do restores while the app is stopped.

## Manual Media QA

- RealtimeKit room joins with real Cloudflare credentials
- Camera starts available and mic stays off by default
- Recording, screenshare, and provider chat are not visible/enabled
- 20 active video participants allowed; 21st rejected before provider token creation
- `VIDEO_JOIN_DISABLED=true` blocks video token issuance without breaking chat/presence
- Password-protected rooms still require the room password before video token issuance
- Legacy mesh fallback with `VIDEO_PROVIDER=mesh`
- Disconnect and rejoin during an active room
- Mobile/network pass: iPhone Safari, Android Chrome, Saudi mobile data, weak Wi-Fi, and a 60-minute room test

## License

MIT

## Contributing

Issues and pull requests are welcome.
