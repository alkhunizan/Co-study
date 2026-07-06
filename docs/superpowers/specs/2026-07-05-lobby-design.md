# The Lobby — design & implementation spec

_Date: 2026-07-05 · Owner: Aziz · Status: approved design, implementing_

## Context

Halastudy's v1 is 4-person private mesh rooms. The blog/positioning work (StudyStream-alternative wedge) exposed demand for a **public drop-in study hall** — one always-open room where students see live activity and body-double with strangers, the way StudyStream's big focus rooms work. This is the "Lobby": one reserved, always-available public room for up to 30 people.

It is explicitly a **v2-class feature** per CLAUDE.md (mass focus room). To protect the core product it ships as an **isolated `/lobby` surface** (new `lobby.html`) and does **not** touch the existing mesh room code in `index.html`.

## Approved decisions (from brainstorm)

1. **Media backend:** RealtimeKit SFU via the **core SDK** (`meeting` object, already loaded and prod's provider) driving our **own** paginated grid — not the `rtk-meeting` embed.
2. **Camera model:** watch-only allowed; mic off/disabled for everyone. "Up to 30" = up to 30 present.
3. **Entry / identity:** guest (display name) can **watch**; turning **camera on requires a signed-in account** (every live face is ban-able).
4. **Grid:** viewer-adjustable tiles-per-page; only the visible page's streams are subscribed (density = bandwidth).

## Architecture

Two axes already exist in the codebase: global `videoProvider` (`realtimekit`) and per-room `mediaMode` (`mesh`/`sfu`). The Lobby rides the existing RealtimeKit provider path; it is a normal room with a **fixed code `LOBBY`** plus new provisioning + a viewer/publisher preset split.

### Server (`co-study-server.js`, `server-config.js`, `services/video/realtimekit-provider.js`)

- **Reserved room:** seed a `LOBBY`-coded room at startup (mirror `ensureRoom`, `co-study-server.js:1219`), flagged `isLobby: true`, exempt from `scheduleRoomCleanup`/`deleteRoom` (`:1268`, `:1209`) so it never disappears. Its RealtimeKit meeting is still created **lazily** on first token request (`ensureRealtimeKitMeeting`, `:1380`) and recycled when idle (`refreshExpiredRoomMeetingIfIdle`, `:1424`) — cost only while occupied.
- **Viewer vs publisher preset:** thread a `role` param (`viewer` | `publisher`) through `POST /api/rooms/:roomId/video-token` (`:1702`) into `createParticipantToken` (`realtimekit-provider.js:148`), selecting `config.video.viewerPresetName` vs `defaultPresetName`. Today `role` is validated `=== 'student'` and discarded (`:1722`) — replace that.
- **Account gate:** add `resolveUserFromToken(cookies)` (`:961`) to the video-token route; a `publisher` token **requires `req.user`** (else `AUTH_REQUIRED`, mirroring scheduled-room gate `:2083`). Guests always get a `viewer` token. Cookie already flows (`video-client.js` uses `credentials:'include'`).
- **Capacity:** Lobby uses a per-room policy cap of **30** (`getDefaultRoomVideoPolicy`, `:992`); raise `MAX_GLOBAL_VIDEO_PARTICIPANTS` headroom in prod env. **Viewers do not consume a publisher slot** — capacity check (`:1758`) counts publishers; watchers are capped by a separate, higher present-count limit (30 present).
- **Membership gate:** keep `findRoomVideoMember` (`:1362`) — you still socket-join `LOBBY` before requesting a token.

### Client (`lobby.html` + reuse `public/js/video/*.js`)

- New `lobby.html`, served at `/lobby` (route beside `co-study-server.js:1964`). Reuses the framework-free globals `window.HalastudyVideoClient`, `HalastudyRealtimeKitClient`, `HalaCore`, `HalaAuth`, and the design-system CSS. It re-implements only the socket join + grid (no board/chat sidebar).
- **Custom grid:** read the core SDK `meeting` (attached to the element at `realtimekit-client.js:114`). Render our own tiles (mirror `.remote-tile` look, `index.html:440`, `:4478`) from `meeting.participants`. **Source-verify** the exact RealtimeKit v2 participant/pagination API during implementation (`setPerPageCount`/paginated participants/`videoTrack` subscribe) — do not assume method names.
- **Density control:** segmented control setting tiles-per-page → drives both CSS grid columns/rows and the SDK's per-page subscription count. Presets (desktop): 4 (2×2), 6 (3×2), 9 (3×3), **12 (4×3, default)**, 16 (4×4), 20 (5×4), 30 (6×5). Mobile default 4, max 2 columns. Overflow paginates (`‹ Page n/m ›`).
- **Presence tiles:** watchers and camera-off people render as avatar+name+status tiles in the same grid.
- **Publish toggle:** "Turn on camera" → if `HalaAuth.getUser()` is null, prompt sign-in; else request a `publisher` token and `meeting.self.enableVideo()`. Mic stays disabled.
- **Safety reuse:** report-user + local hide and admin kick already exist; surface the report affordance per tile.

## Phased implementation (each phase commits + tests)

- **P1 — Reserved room + route.** Seed `LOBBY`, cleanup-exempt; `/lobby` serves `lobby.html` (start as a placeholder page). Integration test: `LOBBY` room exists on boot, survives empty, `/lobby` 200.
- **P2 — Viewer/publisher preset + account gate.** Thread `role`, add `viewerPresetName` config, auth-gate publisher. Integration tests (fake fixture `tests/helpers/fake-realtimekit-fixture.js`): guest→viewer token ok; guest→publisher = `AUTH_REQUIRED`; account→publisher ok; capacity counts publishers only.
- **P3 — Lobby grid shell.** `lobby.html` join flow + custom grid + density control + pagination, rendering **presence tiles** (no live media yet). Verify in-browser (browse skill): density switches layout, pagination works, RTL/AR + EN.
- **P4 — RealtimeKit media binding.** Bind `meeting.participants` video tracks into tiles; selective subscription per visible page; publish toggle with account gate. Verify against SDK docs; live end-to-end needs creds (see Ops). **BLOCKED — see below.**

### P4 status: blocked on ops + one design decision (2026-07-05)

RealtimeKit web core SDK API confirmed from docs (developers.cloudflare.com/realtime/realtimekit/core):
- Remote media: `meeting.participants.joined` map; per-participant `meeting.participants.joined.on('videoUpdate', p => …)` with `p.videoEnabled` + `p.videoTrack` (a `MediaStreamTrack`) → attach to a tile `<video>` via `new MediaStream([p.videoTrack])`.
- Local publish: `meeting.self.enableVideo()` / `disableVideo()`, `disableAudio()` (mic stays off).
- Subscription set: `meeting.participants.active` = the currently-subscribed/displayed set. View modes via `meeting.participants.setViewMode('PAGINATED' | 'ACTIVE_GRID')`, page via `meeting.participants.setPage(n)`; events `pageChanged` / `viewModeChanged` `{viewMode, currentPage, pageCount}`.

**Constraint found:** the web SDK does **not** expose a settable per-page subscription count — `maxActiveParticipantsCount` is SDK-managed. So the design's "viewer's tiles-per-page == number of subscribed streams" is not directly achievable through PAGINATED mode.

**Decision needed before building P4:**
- **(A) Density = layout only (recommended, simplest):** keep the SDK in PAGINATED mode for automatic, bandwidth-bounded subscription of its own page size; the user's density control governs only the CSS grid layout of whatever is in `active`. Simplest and safe; density no longer changes bandwidth, only how big tiles are.
- **(B) Manual subscription of the visible set:** drive subscription myself (e.g. `pin()`/`unpin()` the visible page's participants, or a manual subscribe API if one exists) so tiles-per-page truly equals subscribed streams. More faithful to the original intent, more complex, and needs hands-on verification against a live meeting.

**Hard blockers (cannot be done or verified without Aziz):** the Cloudflare `halastudy_viewer` preset must exist and live Cloudflare creds must be present to init a meeting; there is no way to verify the media binding end-to-end locally (the fake fixture only mocks token issuance, not the SFU media plane). Writing the binding blind and shipping it unverified is out of scope.

## Ops handoff (Aziz — external, I can't do these)

1. **Create a second Cloudflare RealtimeKit preset** `halastudy_viewer` with **produce/publish disabled** (consume only). Extend `scripts/cloudflare/realtimekit-setup.js`. Set `VIDEO_VIEWER_PRESET_NAME=halastudy_viewer`.
2. **Prod env:** raise `MAX_GLOBAL_VIDEO_PARTICIPANTS` (headroom ≥ 30 + other rooms); confirm Cloudflare creds present.
3. **Cost:** metered per participant-minute incl. watchers; idle-when-empty is the guardrail. Add a usage cap later.

## Known follow-ups (not in v1 Lobby)

- Whole-frame **privacy blur is mesh-only**; not ported to the RealtimeKit publish path. Lobby v1 ships without it (RealtimeKit has native background blur to wire later).
- No auto-kick/threshold moderation (brigading risk); relies on report + admin kick.

## Out of scope

Exam-themed rooms, per-user goal persistence, touching the 4-person mesh rooms, mass-focus StudyStream-parity beyond this single Lobby.
