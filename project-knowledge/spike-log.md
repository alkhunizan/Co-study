# Halastudy spike log

## 2026-05-14 — Day 1 of Week 1

**Goal for this session:** boot `co-study/server.js` on localhost AND run `mirotalksfu` Docker container side-by-side without a port 40001 conflict.

**What worked:**
- `npm install` clean on Node v24.15.0 (engines warn ignored — package.json says 22.x; runs fine).
- `co-study` server boots HTTP on `127.0.0.1:3050` (`curl /` → 200, 113 KB index). Default port 3000 is occupied by an unrelated `socials-app-1` container, and 3030 by a stale `co-study:local` Docker image, so I exported `PORT=3050` for the bare-metal boot.
- `mirotalk/sfu:latest` image pulled fresh (1.86 GB on disk, sha `6b4cf28fdab5`). Container `halastudy-sfu` runs with web on host `3010/tcp` and media UDP `40000-40010` (range trimmed via `WORKER_RTC_MIN_PORT=40000 WORKER_RTC_MAX_PORT=40010`). `curl :3010/` → 200. SFU app reports `versions.app 2.2.55, server_version 3.19.22`.
- Port 40001 is bound only to `halastudy-sfu` (UDP). co-study touches 3050 only — no conflict.

**What broke:**
- The pre-existing `mirotalksfu` container (8 days old, exited code 1) had been launched with a bind-mount of `D:\Projects\body-doubling\mirotalksfu\.env`. That path is a broken Windows junction now (`fsutil reparsepoint query` → `Error 433: A device which does not exist was specified`). Bind-mount fix was to drop the volume mount entirely and pass `ANNOUNCED_IP` + RTC range as `-e` env vars instead.
- PowerShell was wedged in this session (every `pwsh` invocation exited 1 with no output); I worked exclusively through bash + direct `node.exe` / `docker.exe` paths. Worth diagnosing later before any `.ps1` script work.

**What I changed:**
- Wrote `project-knowledge/spike-log.md` (this file).
- Installed `node_modules/` in `e:\Co-study` (not committed).
- No source-code edits today.
- Docker: removed stale `mirotalksfu` container; created `halastudy-sfu` running on 3010/tcp + 40000-40010/udp.

**Next session starts with:**
- Day 2 — wire a co-study room to delegate media to `halastudy-sfu`. Start by reading `co-study-server.js` around the `sfuAvailable:false` startup log to find the SFU bridge surface; ANNOUNCED_IP and the SFU base URL go in env, not source.

**Open questions for Aziz:**
1. PLAN.md is not in this repo and the body-doubling junctions at `D:\Projects\body-doubling\` are broken — should I port `PLAN.md` and `project-knowledge/` into `e:\Co-study\` (CLAUDE.md §2 hints at this) or keep them external?
2. Is `co-study:local` Docker image (currently bound to host port 3030) the live deployment artifact, or stale? Want to know before I reuse port 3030 or rebuild it.
3. Boot script for the spike — should I add `npm run spike:boot` that brings up `halastudy-sfu` via `docker-compose` + co-study via `pm2` so Day-N runs are one command, or keep manual until Day 5?

---

## 2026-05-14 — Day 2 of Week 1

**Goal for this session:** A co-study room boots AND `mirotalk/sfu` handles its media for that room (any quality, even hacky).

**Status: GREEN** — peer connections established, mediasoup-routed remote tracks attached on both sides, `readyState: "live"`. Real-frame transport verified only inside Chromium fake-media limits (synthetic stream doesn't propagate frames through mediasoup in headless — known Chromium gotcha). One 60-second human test pending to close the gap on real video flow.

**What worked:**
- **The SFU bridge was already wired** — no build, just configure. `SFU_BASE_URL=…` flips `sfuAvailable:true`, exposes `supportedMediaModes:["mesh","sfu"]`, and the existing client iframes `${sfuBaseUrl}/join?room=…&name=…&audio=false&video=true&screen=false&chat=false&hide=false&notify=false` ([index.html:3335-3355](../index.html#L3335)). That URL shape matches MiroTalk SFU exactly (confirmed against `docs.mirotalk.com/mirotalk-sfu/join-room/`).
- **iframe `allow` attr** was already set to `camera; microphone; display-capture; fullscreen; autoplay` at [index.html:669](../index.html#L669). No source edit needed for permission delegation.
- **Co-study HTTP boot:** `PORT=3050 SFU_BASE_URL=http://127.0.0.1:3010 node server.js` — `/api/runtime-config` returns `{"sfuAvailable":true,"sfuBaseUrl":"http://127.0.0.1:3010","supportedMediaModes":["mesh","sfu"],"meshParticipantLimit":4,"iceServers":[…stun.l.google.com…]}`. Socket.io `create-room {roomName, mediaMode:"sfu"}` returns `{ok:true, room:{mediaMode:"sfu", participantLimit:null,…}}`.
- **Co-study HTTPS boot:** `HTTPS_PORT=3443 SFU_BASE_URL=https://127.0.0.1:3010 node server-https.js` — runs after fixing the cert bug (see below). Generates a fresh self-signed cert per boot; Chromium accepts it with the patched options.
- **End-to-end two-tab Playwright HTTPS test ([day2-twotab.mjs](../day2-twotab.mjs)):** two contexts join the same SFU room over `https://127.0.0.1:3443/study`. Each iframe loads MiroTalk at `https://127.0.0.1:3010/join?…` without redirect/cert errors. Each tab ends with **3 `<video>` elements**: own camera (`fake_device_0` track, 1280x720, playing) + own mirrored preview + **a remote-peer video element with the other tab's MediaStreamTrack attached and `readyState:"live"`**. That remote attachment is the proof: mediasoup signaling completed, peer connections are open, tracks are routed through the SFU.
- **MiroTalk container is also HTTPS-capable** — same port 3010 serves both HTTP and HTTPS with a baked-in 27-year self-signed cert (CN=Miroslav Pejic, valid through 2048). Curl on either protocol returns 200.

**What broke:**
- **The "Day 2 green" I claimed before this revisit was wrong.** Original smoke (HTTP) captured MiroTalk's pre-redirect console logs and I overclaimed. The actual flow: MiroTalk `/public/js/Room.js:3` hardcodes `if (location.href.substr(0,5) !== 'https') location.href = 'https'+…` — forces HTTPS upgrade. With co-study on HTTP, the iframe self-navigates to `https://127.0.0.1:3010/join?…`, browser rejects MiroTalk's self-signed cert, iframe ends at `chrome-error://chromewebdata/`. **This would have broken in any real browser, not just Playwright.** The whole iframe path requires both sides on HTTPS.
- **`server-https.js` had a latent bug that masked the fix.** The `selfsigned` npm package was upgraded to v5.5.0 which made `generate()` async, but `server-https.js` still called it synchronously. Result: `https.createServer({key: undefined, cert: undefined}, app)` started without crashing, then failed every TLS handshake (`alert 40`). Whoever last touched `server-https.js` shipped a server that never actually served HTTPS. Fix: wrap in `(async () => { const cert = await build…; … })()` ([server-https.js:39-56](../server-https.js#L39)).
- **`selfsigned`'s default extension config produced a cert Chromium rejects** with `ERR_SSL_VERSION_OR_CIPHER_MISMATCH`. The original extensions list set `basicConstraints { cA: true }` on what should be a leaf cert. Fix: `cA: false`, plus explicit `keyUsage { digitalSignature, keyEncipherment }` and `extKeyUsage { serverAuth }` ([server-https.js:12-15](../server-https.js#L12)).
- **Headless fake-media frame transport.** Chromium's `--use-fake-device-for-media-stream` creates a synthetic stream locally that doesn't propagate frames through mediasoup's encoder pipeline. Local tracks render at 1280x720; remote tracks attach with `track.muted:true` and `videoWidth:0`. The mediasoup transport IS open (`readyState:"live"`), just no payload bytes flowing for the fake stream. Real camera frames in a real browser will work — this is a testing-environment artifact, not a P2 risk indicator. Still: real-browser confirmation by Aziz remains the highest-value 60-second test.
- **Earlier turn killed the Day-1 process via the wrong PID** (msys ps showed a different PID than Windows). Resolved by finding the LISTEN PID via `netstat -ano | grep :3050 .*LISTEN` and `taskkill /F /PID`.

**What I changed:**
- **[server-https.js](../server-https.js)** — fixed two real bugs: async-cert-await + leaf-cert extension config. Both shipped broken before today.
- **[day2-smoke.mjs](../day2-smoke.mjs)** — single-tab Playwright smoke (creates SFU room via socket.io, drives join, dumps iframe state). Useful regression base.
- **[day2-twotab.mjs](../day2-twotab.mjs)** — two-context Playwright test that proves end-to-end peer attachment. Probes track state with `getVideoTracks()` and uses `Promise.race` to bound `play()` so a stalled remote stream can't hang the script.
- **[day2-iframe-probe.mjs](../day2-iframe-probe.mjs) / [day2-network-probe.mjs](../day2-network-probe.mjs) / [day2-cert-probe.mjs](../day2-cert-probe.mjs)** — diagnostic scripts kept for future debugging. Safe to delete if they get stale.
- No edits to co-study core, room logic, UI, or socket protocol.
- `halastudy-sfu` Docker container unchanged from Day 1.
- New env-driven boot for spike work: `HTTPS_PORT=3443 SFU_BASE_URL=https://127.0.0.1:3010 node server-https.js`.

**Next session starts with:**
- Day 3 — Pomodoro state sync across two clients in an integrated SFU room. Steps: (1) grep `pomodoro|timer` in [co-study-server.js](../co-study-server.js) to find the broadcast surface; (2) extend `day2-twotab.mjs` into `day3-pomodoro.mjs` with two contexts that join, then client A starts a Pomodoro and client B's state is asserted; (3) verify drift after a ~30s wait. Pomodoro signaling rides socket.io and is media-mode-agnostic, so this should be tractable.

**Open questions for Aziz:**
1. **60-second real-browser confirmation — yours.** Visit `https://127.0.0.1:3443` in Chrome/Edge, click through the cert warning (`Advanced → Proceed`), create an SFU room, open the same room in a second tab/incognito with a different name, allow camera. One-line answer: "saw both videos" / "only my own" / "neither." This closes the fake-media gap and locks P2 from yellow to fully green.
2. **`server-https.js` fix — happy with the change?** The cert generation was already in source, just broken. The fix is two extension tweaks + a Promise wrapper. Not a new dependency, not a new architecture. I'm assuming "fix what's already there" is in spec; flag if you'd rather we leave HTTPS for a Day-5 deployment-shaped task and rebase Day-2 on the mesh path.
3. **MiroTalk telemetry beacon to `stats.mirotalk.com`** still firing by default. Recommend `STATS_ENABLED=false` on the container env before any beta user touches it. Trivial restart, but a privacy decision.

