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
- Multi-user WebRTC video and live Socket.IO chat
- Pomodoro timer with daily focus tracking
- Shared room board, room status sharing, and ambient sounds
- Reusable scheduled rooms with Riyadh-based cadence, countdowns, calendar export, and WhatsApp-ready invites
- Disk-backed room persistence for chat history and board state
- TURN-ready runtime ICE config
- Managed media modes: mesh rooms for up to 4 people, plus iframe-based SFU rooms when `SFU_BASE_URL` is configured
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
- Realtime media: WebRTC
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

Managed media notes:
- `mesh` is the default room mode and is capped by `MESH_PARTICIPANT_LIMIT`.
- `sfu` rooms are only available when `SFU_BASE_URL` is configured.
- Rooms do not switch modes after creation.
- AI focus monitoring stays available in mesh rooms only.

Room persistence stores room metadata, protected-room password hashes, chat history, shared board state, and scheduled-room metadata/attendance on disk. Live presence, socket IDs, camera state, and other transient participant state remain memory-only.

This persistence layer is designed for a single app instance. Keep PM2 at one process, back up the state file, and do restores while the app is stopped.

## Manual Media QA

- 2-person mesh room with camera on both sides
- 4-person mesh room at the capacity limit
- 5th participant blocked from a full mesh room
- SFU room creation and embedded media load
- Password-protected rooms in both mesh and SFU modes
- Disconnect and rejoin during an active room
- TURN-assisted networks on restrictive connections
- Desktop Chrome, Android Chrome, and iPhone Safari

## License

MIT

## Contributing

Issues and pull requests are welcome.
