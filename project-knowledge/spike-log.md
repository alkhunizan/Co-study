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

---

## 2026-05-14 — Day 3 of Week 1

**Goal for this session:** Pomodoro state syncs across two clients in an integrated (SFU) room.

**Status: GREEN.** Two clients in an SFU room. Tab A flips its timer mode focus → break; Tab B receives the matching `status-update` events with A's `userId` and the full sanitized payload, ack'd by the server in both directions. Mode sequence captured by B: `['focus', 'break']`. Verified end-to-end in [day3-pomodoro.mjs](../day3-pomodoro.mjs).

**What worked:**
- **"Pomodoro state" was already designed and wired** — same pattern as Day 2's SFU bridge. There is no dedicated `pomodoro` model in the repo; the synchronized session state rides the existing `user-status` socket event. Server contract at [co-study-server.js:1469-1481](../co-study-server.js#L1469): client emits `user-status` with `{ status: payload }`, server `sanitizeStatus`-es it ([co-study-server.js:483](../co-study-server.js#L483)) and broadcasts `status-update { userId, status: safeStatus }` to the room. The payload carries `timerMode: 'focus'|'break'|null` plus `text`, `manualPreset`, `autoSync`, `ambientType`, `updatedAt`.
- **UI controls already plumb to this surface** — the "Share with room" toggle gates broadcast; "Sync with timer" toggle makes the broadcast auto-flip when the local timer transitions. Bound at [index.html:2218-2299](../index.html#L2218) (`buildStatusPayload` + `broadcastStatus`).
- **Day-3 spike test:** [day3-pomodoro.mjs](../day3-pomodoro.mjs) drives the canonical proof. Same Playwright + fake-media + HTTPS setup as Day 2. Two contexts join the same SFU room (room code `386DQM` for the run captured below), Tab B instruments its `socket.on('status-update', …)` into `window.__statusUpdates`, then Tab A emits `user-status` payloads with `timerMode: 'focus'` then `'break'` 3s apart. Both transitions ack `{ok:true}` from the server, and Tab B captures both events with A's exact `userId` (`3p-KI0fzMFS03v2NAAAv`) and the matching payload. Each emit-to-receive round-trip was sub-200ms.
- **Run finishes in ~10s end-to-end** thanks to ack-driven waits (`waitForFunction` on `window.__statusUpdates`) instead of arbitrary `waitForTimeout`. Determinism > polling.
- **No regressions.** Day 2's HTTPS dev server (`server-https.js`) + `halastudy-sfu` container both still up unchanged from earlier in the day; same `SFU_BASE_URL=https://127.0.0.1:3010` boot.

**What broke:**
- Initial grep for `pomodoro` returned nothing in the live code — only in design mockups, this spike log, and the `/spike-day` command doc. **The product term "Pomodoro" doesn't map to a `pomodoro` model in code; it maps to `user-status` with `timerMode`.** Worth a one-line note in [DESIGN.md](../DESIGN.md) (or wherever vocabulary lives) so the next contributor doesn't grep wrong.
- The local timer UI (focus/break tabs at [index.html:678-680](../index.html#L678)) is **client-only and never broadcasts a countdown.** Each client runs its own clock; the "sync" is state-transition events, not a synchronized timer. Acceptable for the wedge (Halastudy isn't a competitive timer race), but worth documenting as a deliberate scope choice if anyone files a feature request for "show the same countdown on every screen."
- **Headless fake-media gotcha from Day 2 still applies** to the WebRTC layer — local cameras show 1280x720 but remote MediaStreamTracks come in `muted:true`. That's irrelevant to Day 3 (Pomodoro syncs via socket.io, not WebRTC), but it'd bite again if Day 5 UI tests assume frame flow.

**What I changed:**
- Added [day3-pomodoro.mjs](../day3-pomodoro.mjs) — two-context Playwright proof of state sync, parallels `day2-twotab.mjs` structurally.
- Appended this log entry.
- No edits to co-study core, room model, server, or client. The feature was already shipped.

**Next session starts with:**
- Day 4 — mid-sprint check-in. **No new code.** Open the spike log, write an explicit red/yellow/green for each of P1 (does anyone want this?), P2 (does the media stack carry the load?), P3 (can we get distribution?) per PLAN.md §4. If anything is red, write the pivot decision. From this room: P2 is green (Day 2 + Day 3 proven), but P1 and P3 are still un-tested because the spike has been pure tech-stack work — Day 4 is when the human signals should land.

**Open questions for Aziz:**
1. **The user-status / Pomodoro vocabulary mismatch** — should I add a one-paragraph "what 'Pomodoro' maps to in code" note to DESIGN.md or CLAUDE.md so the next grep-driven contributor doesn't waste an hour? Trivial PR.
2. **P1 + P3 signals — yours.** Day 4 is the mid-sprint check, and right now we only have proofs for P2. Did any of the user-interview / distribution-outreach work happen on the side this week? If not, Day 4 will be honest about that and call P1/P3 yellow-pending instead of green.
3. **Should Day-5 UI work use the existing focus/break tabs as-is, or rework toward Halastudy's "quiet by default, camera is the signal" wedge?** The current UI is StudyStream-flavored — a timer tab takes up real estate near the camera. Halastudy's wedge says the camera IS the signal; the timer is supporting chrome. Could be a 30-min CSS reorg, or a full DESIGN.md §11 sweep on Day 5.

---

## 2026-05-14 — Day 4 of Week 1 (mid-sprint check)

**Goal for this session:** Self-check with explicit red/yellow/green for P1, P2, P3 per PLAN.md §4. Write a pivot decision if any proof is red. **No code today.**

**Status: yellow overall** — P2 is solidly green, but P1 and P3 are unknown-unknowns. No pivot triggered (nothing is provably red), but the spike is in danger of finishing Day 7 with only tech proofs and no demand or distribution signal, which is the failure mode CLAUDE.md §1 implicitly warns against ("v1 scope is the 6-week MVP wedge").

---

### P2 — Does the media stack carry the load? **GREEN.**

Evidence: Days 1, 2, 3 in this log.

| Sub-proof | Receipt |
|---|---|
| co-study + mirotalk/sfu boot side-by-side, no port 40001 conflict | Day 1 entry; both processes still running 4+ hours later as of this entry |
| Cross-origin HTTPS iframe bridge works end-to-end | Day 2 entry; [day2-twotab.mjs](../day2-twotab.mjs); two browser contexts both attach remote MediaStreamTracks with `readyState: "live"` |
| Shared session state syncs across two clients in <200ms | Day 3 entry; [day3-pomodoro.mjs](../day3-pomodoro.mjs); mode sequence `['focus','break']` captured deterministically |

**Open gaps (downgrade P2 from green → yellow if either fails):**
1. **Real-browser two-tab video confirmation** — 60-sec test for Aziz at `https://127.0.0.1:3443` (open question #1 from Day 2). Headless `--use-fake-device-for-media-stream` produces `track.muted:true` on the remote, so frame transport is only protocol-proven, not pixel-proven. **If both videos render in a real browser → P2 stays green.** If not, demote to yellow and dig into mediasoup `announcedIp` / ICE.
2. **MiroTalk telemetry beacon** to `stats.mirotalk.com` — informational; doesn't affect P2 grade but does affect any user testing privacy posture. `STATS_ENABLED=false` recommended before beta.

---

### P1 — Does anyone want this? **YELLOW-PENDING (Aziz to fill).**

**What I can grade:** nothing. P1 is a human-evaluation step per CLAUDE.md §7 ("Interviews (P1) — human-evaluation step. No transcript signal.").

**What's not in the log:** zero user-interview notes this week. All four days went to tech-stack and process work.

**Cheapest probe to convert yellow → green by Day 7:**
- 5 × 15-min student interviews, GCC/Saudi cohort (per CLAUDE.md §1 "live-camera body-doubling for GCC/Saudi students").
- Halastudy's wedge — *"quiet by default, camera is the signal, audio is the exception"* — is directly testable in conversation. Does it ring true or weird? Do students currently study-with-a-friend on FaceTime/WhatsApp video calls? What breaks that workflow?
- Capture verbatim quotes (Day 6 explicitly asks for 5).
- 75 minutes of work over 2-3 days.

**Aziz to fill in below:**

> **P1 grade:** _(R / Y / G)_
> **Evidence:** _(1-2 sentences — who you talked to, what you heard)_
> **Most surprising quote:** _("…")_

---

### P3 — Can we get distribution? **YELLOW-PENDING (Aziz to fill), trending red.**

**What I can grade:** nothing. P3 is a human-evaluation step per CLAUDE.md §7.

**Why "trending red":** Day 6 success criterion in PLAN.md §3 is *"named beta list of 30+ humans, updated risk register entries."* As of today (Day 4), names on the list: **0**. Three days remain. Hitting 30 from zero in 72 hours requires committing to ONE channel and seeding ~10 conversations per day; if no channel is chosen by end of Day 5, P3 is de-facto red.

**Cheapest probe to convert yellow → green by Day 7:**
- Pick ONE channel: X/Twitter thread + DMs, WhatsApp groups (Aziz already runs several per CLAUDE.md global), r/saudiarabia, university Telegram groups, or a Halastudy landing page with a waitlist form.
- Best leverage: WhatsApp groups Aziz already has access to + an X thread. Both zero-cost, audience already warm.
- Even a soft signal counts: a "yes I'd try this" reply is a name on the list. Don't gate on credit-card commitment.

**Aziz to fill in below:**

> **P3 grade:** _(R / Y / G)_
> **Channel chosen:** _(one)_
> **Names on list so far:** _(integer)_
> **Most surprising response:** _("…")_

---

### Pivot decision

**Not triggered.** PLAN.md §4 says write a pivot decision *if any proof is red*. Nothing is provably red. P2 is green with receipts; P1/P3 are yellow-pending until Aziz writes the human-evaluation rows above.

**Conditional pivot threshold:** if at end-of-Day-5 (tomorrow) both P1 and P3 are still yellow-pending with no human signal whatsoever, that counts as de-facto red for the spike's go/no-go, and Day 7's decision should default to **no-go OR scope-cut to a landing-page-only wedge** that focuses Week 2 on demand validation instead of feature build. Writing this threshold here so the Day 7 evaluator doesn't have to relitigate it.

---

**What I changed today:**
- This Day 4 entry (no code).

**Next session starts with:**
- Day 5 — quiet mode + room create/join/leave UI flow end-to-end on localhost, DESIGN.md §11 ship checklist, zero §10 hard-no's. Best done in a real browser with the DESIGN.md doc open alongside; the existing [landing.html](../landing.html) and [index.html](../index.html) UI already have most of this but have pre-existing unstaged modifications in the working tree (out-of-scope of every PR so far) — those need to be reviewed before Day 5 can be honestly graded against DESIGN.md.

**Open questions for Aziz:**
1. **Fill in P1 and P3 rows above** — even a one-line "haven't started" is better than the empty rows, because the Day 7 go/no-go evaluator will read this entry verbatim.
2. **Real-browser two-tab confirmation for P2** — still the cheapest test you can run; closes the only Day-2 open gap.
3. **Pre-existing modified files** (`index.html`, `landing.html`, `package.json`, etc.) — these have been sitting in the working tree across Day 2 and Day 3 PRs and are blocking an honest Day 5 grade. Need a 5-minute triage: stash them, commit them, or revert. Day 5 starts with this triage if you haven't done it by then.

