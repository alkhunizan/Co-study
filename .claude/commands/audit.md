# Halastudy Read-Only Security Audit

You are conducting a READ-ONLY security/correctness audit of the Halastudy codebase (`E:\Co-study`).

Halastudy is a live-camera body-doubling app for GCC/Saudi students.

## Hard constraints (non-negotiable)

- Audit READ-ONLY. Find and document issues — do NOT fix them.
- Do NOT write, edit, or delete any file.
- Do NOT touch `data/rooms.json`.
- Do NOT run deploy commands, PM2 commands, `npm start`, or `npm run https`.
- Do NOT run `npm run restore:rooms`. Do NOT run `npm run backup:rooms` unless explicitly approved in-session.
- Do NOT commit or push.
- Do NOT print secrets or `.env` values. Redact any token-like value you encounter.
- Do NOT run real Cloudflare setup/smoke if credentials are missing or if the command would create paid resources.

### Allowed commands

- `npm run check`
- `npm run typecheck`
- `npm run lint`
- `npm run deadcode`
- `npm run audit:prod`
- `npm run test:integration`
- `npm run test:smoke`
- `npm run test:ci`
- `git status` / `git diff` / `git log` / `git show` / `git blame`
- grep / search / read files
- `npm run cloudflare:doctor` only if it is safe and redacts secrets
- `npm run cloudflare:cost-check`

### Forbidden commands

- `npm start`
- `npm run https`
- `npm run restore:rooms`
- `npm run backup:rooms` (unless explicitly approved)
- PM2 / deploy commands
- any write/edit/delete command
- real Cloudflare setup/smoke if credentials are missing or if the command would create paid resources
- any command that prints `.env` values

## Architecture

- Node.js + Express
- Socket.IO
- Vanilla JS/HTML/CSS frontend, no build step
- File-backed persistence through `room-store.js`
- PBKDF2 room passwords
- Session cookie + origin guard + rate limiters
- RealtimeKit video MVP
- Legacy mesh video fallback
- Optional SFU iframe legacy path

## Your job

Find and document high-impact issues. Do not fix them.

Prioritize issues that:
- expose private rooms
- bypass room password/membership
- allow non-members to mutate room state
- leak secrets
- mint video tokens without authorization
- spend RealtimeKit money
- corrupt persisted data
- crash the single process
- cause data loss
- weaken Saudi/GCC privacy posture

Do not prioritize:
- naming/style nitpicks
- broad product opinions
- v2 feature requests
- theoretical attacks requiring filesystem access
- issues already fixed unless a regression exists

## 1. Room access control and privacy

Audit hardest:
- `co-study-server.js`
- `room-store.js`
- `GET /api/rooms/:roomId`
- `create-room`
- `join-room`
- `send-message`
- `board-*` events
- `camera-status`
- `user-status`

Check:
- Can a socket emit `send-message` without successful `join-room`?
- Can a socket mutate board state without being a room member?
- Can `camera-status`/`user-status` be sent for a room the socket did not join?
- Does `join-room` enforce the PBKDF2 password every time?
- Can the password check be skipped with an empty/absent password?
- Can a stale session/cookie replay unlock protected room state?
- Does `GET /api/rooms/:roomId` return only a safe preview for protected rooms before a verified join?
- Does the protected preview exclude messages, participant details, board state, schedules, video meeting IDs, provider metadata, owner/admin info, and password hash?
- Is password comparison constant-time?
- Is password failure rate-limited?

Protected-room leak — regression verification:
- Treat this as regression verification. The known issue was supposedly fixed.
- Confirm with tests AND code that it is actually fixed.

## 2. RealtimeKit token and video billing abuse

Audit:
- `POST /api/rooms/:roomId/video-token`
- `POST /api/rooms/:roomId/video-heartbeat`
- `POST /api/rooms/:roomId/video-leave`
- `services/video/realtimekit-provider.js`
- `services/video/video-session-registry.js`
- `public/js/video/video-client.js`
- `public/js/video/realtimekit-client.js`

Check:
- Can a non-member mint a video token for a room?
- Can an unauthenticated caller mint tokens by guessing `roomId`?
- Is membership checked immediately before token issuance?
- Are global and room caps checked before the provider call?
- Can concurrent joins race past the cap?
- Can a failed SDK load leave reserved capacity stuck?
- Can a user refresh/close tab and leave stale paid session state?
- Is heartbeat tied to `clientSessionId` and room membership?
- Is `video-leave` spoofable for another participant?
- Is the Cloudflare API key ever sent to the client?
- Are participant auth tokens logged?
- Are raw Cloudflare errors leaked?
- Are meeting IDs server-owned, not client-supplied?
- Are recording/screenshare/chat policies enforced in backend/app config?
- Does the code assume provider preset security without verification notes?

## 3. WebRTC mesh and legacy SFU signaling

Audit:
- `rtc-offer`
- `rtc-answer`
- `rtc-ice`
- mesh provider fallback
- SFU iframe logic
- runtime-config exposure

Check:
- Can a socket relay SDP/ICE to a socket in another room?
- Can the target socket ID be forged across rooms?
- Does the server verify the sender belongs to the room before forwarding?
- Does the server verify the target belongs to the same room?
- Can the client override mesh/sfu/realtimekit mode against room policy?
- Does `SFU_BASE_URL` expose secret material?
- Is the iframe sandbox/allow policy reasonable?

## 4. Input validation and XSS

Audit:
- sanitizers in `co-study-server.js`
- `room-store.js` sanitization on read/write
- `schedule-utils.js` normalization
- `index.html` rendering
- `open.html` rendering

Trace:
- chat message from socket → storage → DOM
- board task text from socket → storage → DOM
- room name from `create-room` → storage → DOM
- display name from `join-room` → DOM
- schedule text/time labels → DOM

Check:
- Is every socket payload sanitized before `roomStore`?
- Is data loaded from `data/rooms.json` re-sanitized?
- Are `innerHTML`/`insertAdjacentHTML`/template literals used with user content?
- Are message, board task, room name, and display name lengths bounded?
- Can giant payloads bloat `data/rooms.json`?

## 5. Rate limiting and single-process DoS

Audit:
- all mutating socket events
- all HTTP endpoints
- per-room/per-socket/per-IP limiters

Check limiters exist for:
- `create-room`
- `join-room`
- password-failure
- message
- board
- `camera-status`
- `user-status`
- `rtc-*`
- `video-token`
- `video-heartbeat`
- `video-leave`

Find:
- any mutation path without a limiter
- any path that can grow memory/disk unbounded
- unbounded room creation
- unbounded chat history
- unbounded board tasks
- unbounded schedules
- `data/rooms.json` growth risk
- write-debounce starvation risk

## 6. Persistence integrity and data loss

Audit `room-store.js`.

Check:
- Is the write atomic (temp file + rename)?
- What happens if the process crashes during the 250ms debounce?
- What happens if the JSON file is missing? empty? malformed? partially written?
- Legacy/tampered fields on load?
- Multiple Node processes writing the same file?
- PM2 cluster risk?
- Backups and restore safety?
- Does restore mutate production data, and is it guarded?

## 7. Current diff correctness

Run:
- `git status --short`
- `git diff`
- `git log --stat -15`

Audit recent changes in:
- `co-study-server.js`
- `room-store.js`
- `services/video/*`
- `public/js/video/*`
- `scripts/cloudflare/*`
- `tests/integration/server.integration.test.js`
- `package.json`
- `knip.json`

Look for:
- logic contradicting tests
- race conditions
- swallowed await/reject paths
- failed cleanup on error
- stale session math bugs
- new dead code allowed by knip config
- test gaps where a fake provider hides a real provider bug

## 8. Cloudflare scripts and config safety

Audit:
- `scripts/cloudflare/*`
- `package.json` scripts
- `.env.example`
- `.gitignore`
- `server-config.js`

Check:
- scripts redact secrets
- scripts fail closed
- `.env` is ignored
- no real tokens committed
- setup/smoke do not print participant tokens
- cleanup only closes smoke-test meetings
- cost-check does not call paid APIs
- doctor does not expose sensitive runtime config
- scripts handle missing credentials safely
- setup does not auto-create resources unless explicit env flags are set

## 9. RealtimeKit frontend stability

Audit:
- `public/js/video/realtimekit-client.js`
- `public/js/video/video-client.js`
- `index.html`
- `open.html`

Check:
- CDN versions are pinned, not `@latest`
- SDK load timeout exists
- SDK failure calls leave cleanup
- audio/mic is disabled by default
- there is no easy UI path to publish mic accidentally
- recording/screenshare/provider chat are hidden or disabled in UI
- Arabic error states are clear
- `pagehide`/`unload` cleanup is safe
- heartbeat stops on leave
- retry does not duplicate sessions

## 10. Schedule and attendance correctness

Audit `schedule-utils.js`.

Check:
- Riyadh timezone handling
- `once`/`daily`/`weekly`/`weekdays`
- Sunday–Thursday weekdays
- midnight boundaries
- `on_time`/`late`/`missed` windows
- streak counting
- late/missed overlap
- DST assumptions
- recurring occurrence edge cases

## 11. Secrets and runtime config

Grep for: `CLOUDFLARE`, `REALTIMEKIT`, `API_TOKEN`, `AUTH_TOKEN`, `SECRET`, `SESSION`, `SUPABASE`, `SFU`, `password`, `Authorization`, `Bearer`.

Check:
- no hardcoded secrets
- no tokens in docs
- no `.env` tracked
- runtime-config exposes only public values
- Cloudflare Account ID/App ID exposure is intentional or avoided
- participant token only returned by the `video-token` endpoint
- logs redact token-like values

## 12. RTL/bilingual/design spot check

Lowest priority. Only inspect recently touched video UI.

Check:
- Arabic/English consistency
- RTL layout
- physical left/right CSS where logical properties should be used
- hardcoded strings that break the language toggle
- confusing permission text
- second accent color violations if `DESIGN.md` exists

## Reporting format

Output one Markdown report only. Rank by severity first, then group by category.

For every finding include this block:

```
## [Severity] Short title

Category:
File/line:
Reachability:
Concrete scenario:
Impact:
Suggested fix direction:
Evidence:
```

Severity rules:
- **Critical**: unauthenticated secret leak, protected-room exposure, arbitrary paid video token minting, easily-reachable process crash/data corruption.
- **High**: non-member room mutation, video cap bypass, private data exposure, expensive RealtimeKit abuse, persistent XSS.
- **Medium**: bounded DoS, privacy leak with limited reach, config drift, weak cleanup, test gap around money/security.
- **Low**: minor correctness issue, low-risk UX/security hardening.

End the report with:

```
# Summary

## Critical findings
## High findings
## Medium findings
## Low findings
## False alarms checked
## Commands run
## Files inspected
## Recommended next fixes
## Go/No-Go opinion
```

Go/No-Go options: `NO-GO`, `LOCAL-TEST-GO`, `FOUNDER-ONLY-GO`, `PRIVATE-BETA-GO`, `PUBLIC-GO`.

Rules:
- No `FOUNDER-ONLY-GO` if setup/smoke still cannot be verified.
- No `PRIVATE-BETA-GO` if the real two-browser camera test has not passed.
- No `PUBLIC-GO` if the 10–20 real-user test has not passed.
