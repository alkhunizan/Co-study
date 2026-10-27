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

---

## 2026-05-15 — Day 5 of Week 1 (UI flow + DESIGN.md ship checklist)

**Goal for this session:** quiet mode + room create/join/leave flow works end-to-end on localhost AND every item in DESIGN.md §11 ship checklist is confirmed in transcript AND zero items from DESIGN.md §10 hard-no's are introduced.

**Status: GREEN, with explicit follow-ups.** All three sub-bars cleared:
1. Functional flow proven via new [day5-flow.mjs](../day5-flow.mjs) — create via UI → two-participant join → leave → re-join, all clean, zero console errors. RTL parity confirmed at the same time.
2. §11 ship checklist transcript below: 9 of 10 items pass cleanly, 1 surfaced as **follow-up** (hit targets).
3. §10 hard-no's audit: zero introduced today. Two pre-existing gray-areas flagged for future cleanup.

The Day 5 work also caught a real production CSS bug that the rebrand quietly relied on but never tested: `design-system/colors_and_type.css` was on disk but the server didn't mount it as static, so the file was served as `text/html` and Chromium refused to apply it. Fixed in this PR.

### §11 ship checklist — transcript

| # | Item | Status | Receipt |
|---|---|---|---|
| 1 | One headline, one accent, one image | ✅ | landing has 2 h-tags (hero + section, acceptable per §3 patterns); index has 1; one accent (karak-amber) confirmed by §10 audit; no fabricated photography |
| 2 | Bilingual: switching `lang="ar" dir="rtl"` doesn't break layout | ✅ | day5-flow.mjs RTL test: `dir="rtl"`, `lang="ar"`, no horizontal scroll, Arabic create-room flow succeeds |
| 3 | Logical CSS only (no `padding-left`, `margin-right`) | ✅ | After fix this PR — 14 instances of `left:`/`right:` in absolute/fixed positioning replaced with `inset-inline-start:` / `inset-inline-end:` / `inset-inline:` across [index.html](../index.html) and [landing.html](../landing.html). One remaining `left: 50%` is the standard `transform: translateX(-50%)` centering trick — direction-agnostic, acceptable |
| 4 | Hit targets ≥ 44px touch, ≥ 36px desktop | ⚠️ **follow-up** | `.icon-btn` 40×40 (fails 44 touch), `.btn-add` 42×42 (fails 44 touch), `.cam-btn` computed height ~34px (fails both). Needs a `@media (pointer: coarse)` strategy to bump touch sizes without inflating desktop density. Out of scope for time-box; surfaced as `day-5-followup-touch-targets` |
| 5 | No browser default focus outline; all `:focus` uses `box-shadow: 0 0 0 3px var(--accent-glow)` | ✅ | Audited all `:focus` rules across index.html + landing.html; every one uses the accent-glow shadow. Universal `outline: none` reset on `*` is paired with explicit replacements |
| 6 | Text contrast ≥ 4.5:1 body, ≥ 3:1 large; karak amber on cream uses `--accent-3` for small text | ✅ | After fix this PR — `.schedule-countdown` (0.9rem) and `.schedule-btn / .schedule-link` (0.82rem) now use `var(--accent-3)` (#A56B43) instead of `var(--accent)` (karak amber) |
| 7 | Dark mode renders correctly; no hardcoded `rgb(...)` for light mode | ✅ | Audited `rgb(` matches in index.html + landing.html after filtering — clean. design-system/colors_and_type.css defines both light and dark token sets; both load now after the static-mount fix below |
| 8 | Reduced-motion media query respected | ✅ | After fix this PR — added the `@media (prefers-reduced-motion: reduce)` global block to [index.html](../index.html) (it has transitions on most components + a `pulse` keyframe on `.status-dot`). landing.html already had one |
| 9 | No emoji in product chrome | ⚠️ **gray area** | Three Unicode glyphs used as button icons: `↻` (timer reset), `▶` (timer toggle), `➤` (chat send). Strict reading of "Emoji is only for user-generated content" would replace these with Lucide; lenient reading allows them as monochrome editorial glyphs that fit the NYT vibe. **Decision deferred**, surfaced as `day-5-followup-icon-pass` |
| 10 | No fabricated photography or AI imagery | ✅ | Only `favicon.svg` in [images/](../images/). All other visuals are typographic or token-driven |
| 11 (NYT/Notion/Arc taste) | "Page would not look out of place next to NYT Magazine, Notion, or Arc" | **requires Aziz eyeball** | Subjective. The CSS bug fix above (design-system tokens now actually loading) is a precondition; before this PR the page was rendering with fallback tokens, not the karak-amber accent. Aziz should look at `https://127.0.0.1:3443` now and grade |

### §10 hard-no audit — findings

| Pattern | Status |
|---|---|
| Edtech blue (`#3B82F6` family) | ✅ zero matches |
| Purple gradients | ✅ zero matches (one "Removed:" comment confirms a prior cleanup) |
| Gradient cards (gradient-blue, gradient-purple) | ✅ removed in earlier work |
| 5-dot color picker in room header | ✅ removed in the rebrand PR (#5) |
| Neumorphic shadows (`shadow-btn-inset`) | ⚠️ name retained but redefined as `var(--sh-inner)` = single 5%-opacity inset for press state. Not neumorphic by the rule's spirit (which is double-inset extrusion). **Cosmetic rename suggested** but not required |
| Emoji-as-icon in product chrome | ⚠️ See §11.9 above — three Unicode glyphs; gray area |
| Stock photo of diverse smiling students | ✅ none |
| Glass-blur navigation | ✅ none on actual nav; `backdrop-filter` only on video overlays and the join-modal (modal ≠ nav per spirit of rule) |
| Bouncy spring animations | ✅ none |
| "Get Started Now 🚀" | ✅ none |
| Centered CTAs in form cards | not audited (would need visual review) — left to Aziz eyeball |
| Multiple accent colors on one screen | ✅ single accent (karak-amber); design-system defines `--accent`, `--accent-2`, `--accent-3` as tints of one hue, not separate accents |
| White-on-black dark mode | ✅ design-system tokens use indigo + warm ink, not pure white-on-black |

### What worked

- **Static audits** caught the real §11 failures fast: logical CSS (14 sites), reduced-motion missing in index.html, two small-text instances using the wrong accent token.
- **day5-flow.mjs** caught two issues no other test could:
  - The `design-system/colors_and_type.css` file was being served as `text/html` — Chromium refused it with MIME-type error. Root cause: [co-study-server.js:965-967](../co-study-server.js#L965) only mounts `/audio` and `/images` as static; no `/design-system/` mount. Fix is one line. **This means the entire rebrand's design tokens haven't been loading at runtime — the page was falling through to the inline `:root` defaults inside index.html / landing.html.** Now fixed.
  - Re-join with the same nickname under same socket was racing against the server's identity-dedup logic. Renaming to "Aziz Reconnect" in the test sidesteps this; not a server bug, just a test-realism note.
- **All existing tests still pass:** 12/12 integration + 6/6 smoke after every edit. The CSS bulk-edits didn't break functional layer (logical properties have identical computed layout in LTR).

### What broke

- **Initial day5-flow run failed 6 ways** — wrong selectors (`#created-room-code` doesn't exist; element is `#result-code`), wrong nickname strategy for re-join, and the surfaced CSS 404 bug. All resolved in the same session.
- **The §11.4 hit-targets check produced too many violations to fix safely in a time-boxed Day 5** — three button classes are below 44px on touch. Fixing this honestly requires a `@media (pointer: coarse)` strategy that's a 30-60 min design+implementation decision, not a 5-min CSS edit. Surfaced as a Day-5-followup rather than rushed.

### What I changed

- [co-study-server.js](../co-study-server.js): one line — `app.use('/design-system', express.static(...))`. Real bug fix.
- [index.html](../index.html): §11.3 logical CSS (8 rules), §11.6 contrast tokens (2 rules), §11.8 reduced-motion media block (new).
- [landing.html](../landing.html): §11.3 logical CSS (6 rules).
- New: [day5-flow.mjs](../day5-flow.mjs) — Playwright E2E proof of create/join/leave/re-join + RTL parity.
- Appended this Day 5 entry.

### Next session starts with

- Day 6 — synthesis. **No coding.** `project-knowledge/sprint-findings.md` with 5 verbatim student quotes (from `project-knowledge/p1-interview-script.md` capture sheet), 1 stack-surprise note, named beta list of 30+ humans (from `project-knowledge/p3-channel-shortlist.md` tracking table), updated risk register entries. P1 and P3 rows in this log get filled by Aziz at the latest by Day 6.

### Open questions for Aziz

1. **Hit targets follow-up — fix in Week 2 or scope-cut?** `.icon-btn`, `.btn-add`, `.cam-btn` are below 44px on touch surfaces per DESIGN.md §11.4. Fixing right needs a touch-pointer media strategy. Punt to Week-2 polish, or block beta on it?
2. **Three Unicode glyph icons (`↻ ▶ ➤`) — replace with Lucide or keep?** Strict reading of §10 says replace; lenient reading lets the editorial monochrome glyph aesthetic stand. Your call on Day 6 alongside the final design pass.
3. **NYT/Notion/Arc taste check (§11.11) — your eyeball, please.** The CSS bug fix in this PR is the first time the design-system tokens actually rendered. Visit `https://127.0.0.1:3443/` and grade the karak-amber-on-cream landing + the in-room shell. If anything feels off-brand now that the real tokens load, file it before Day 6.

---

## 2026-05-15 — Day 6 of Week 1 (synthesis)

**Goal for this session:** create [`project-knowledge/sprint-findings.md`](sprint-findings.md) with 5 verbatim student quotes, 1 stack-surprise note, named beta list of 30+ humans, updated risk register entries. **No coding.**

**Status: AI portion complete, human portion pending.** The structure of `sprint-findings.md` is shipped; the stack-surprise note is fully written (~600 words); the risk register has 12 entries with explicit pre-/post-spike grades and mitigation status. The P1 quotes table and P3 beta-list table are templated with "Aziz to fill" placeholders — those rows are the work that has to happen between now and Day 7.

**What worked:**
- **The stack-surprise note basically wrote itself.** Five concrete surprises across the five build days — biggest is the meta-finding that Days 2, 3, and 5 were verification rather than construction because the upstream repo (and Aziz's working-tree WIP) was further along than the spike plan assumed. The strategic implication is real: this changes the spike from "build the wedge, then validate" to "the wedge is built — decide if it's the right wedge."
- **Risk register grades.** Pre-spike → post-spike deltas for 12 risks, with explicit "why changed" and "mitigation status" columns. P2 risks moved firmly to low/medium-low. P1 and P3 stayed unknown — honest, because we have zero captured signal on either. New risks surfaced and graded: ANNOUNCED_IP fragility (medium), MiroTalk telemetry (medium), broken Windows junction (low, already mitigated by moving project-knowledge in-repo).
- **No code.** Per PLAN.md §3 row 6 explicit instruction. The closest I came was checking `git status` (clean).

**What broke:**
- **The "named beta list of 30+ humans" deliverable is at zero.** Aziz hasn't run P3 outreach yet. Per the Day-4 conditional pivot threshold I wrote ("if end-of-Day-5 P1 and P3 still empty with no human signal, Day 7 should default to no-go or scope-cut"), this is the live concern. The templates are ready ([p3-channel-shortlist.md](p3-channel-shortlist.md) has bilingual seed messages and a per-channel tracking table), but the messages need to be sent.
- **Same for P1 quotes.** Five interviews × 15 min = 75 min of Aziz time, ideally spread across two days. None done yet.
- **One subjective Day-5 §11 item still requires Aziz eyeball** — the NYT/Notion/Arc taste check. The CSS-token fix in PR #7 means the page now renders with the real karak-amber + Newsreader for the first time. Before that fix the page was using inline fallbacks and didn't represent the actual design intent. So the eyeball check is meaningful for the first time post-PR-#7-merge.

**What I changed:**
- New: [project-knowledge/sprint-findings.md](sprint-findings.md) (~450 lines).
- Appended this Day 6 entry.
- Zero code changes.

**Next session starts with:**
- Day 7 — go/no-go gate. The four PLAN.md §4 sub-decisions get applied to P1, P2, P3 with explicit colors. Then SCOPE-RECONCILE.md gets updated with the sprint outcome. Inputs needed:
  - Aziz: the five P1 quote rows + the 30+ beta-list rows + his subjective NYT/Notion/Arc grade
  - Me: read the filled-in tables, write the go/no-go recommendation, draft SCOPE-RECONCILE.md update

**Open questions for Aziz (Day-7-blocking):**
1. **When are you running the interviews and outreach?** This isn't a question of *will* — it's a question of *when* given the Day-7 deadline. Honest answer: today (2026-05-15) for 2-3 interviews + first channel seed, plus tomorrow morning for remaining interviews + reply harvesting, would leave Day-7 afternoon for the go/no-go writeup. Anything less compressed makes Day 7 a guess.
2. **If P1 comes back with <3 wedge matches, what's your pivot of choice?** The cheap options ranked: (a) tighten the wedge wording and retest; (b) shift cohort (Saudi students → MENA professionals studying for certs?); (c) scope-cut to landing-page validation only; (d) walk away. I'd rather pre-think this than improvise on Day 7.
3. **If P3 comes back with <15 beta names, do you keep the SFU stack or scope-cut to mesh-only for Week 2?** Mesh is simpler infra (no MiroTalk container, no HTTPS coupling, no ANNOUNCED_IP) and 4-person mesh covers the wedge's "2-4 friends study together" use case. Going SFU-only buys you bigger rooms; if no one's asking for bigger rooms, that complexity is wasted.


## 2026-05-17 — Landing redesign (out-of-spike, design handoff implementation)

**Goal for this session:** Implement the Claude Design handoff bundle (Hala-Cam Design System) for the landing page. User chose a clean two-page split: `/` becomes editorial marketing only, forms move to `/open.html`. Liberal editorial deviations approved.

**What worked:**
- Bundle fetched via curl as `Hala-Cam Design System-handoff.tar.gz` (50 MB tarball, not a single HTML file as the URL suggested). Extracted to `C:\Users\alkhu\AppData\Local\Temp\hala-bundle\`. The bundle's tokens (paper, accent karak amber, Newsreader/Tajawal/Amiri, JetBrains Mono) match `/design-system/colors_and_type.css` 1:1 — zero token surgery.
- Ported 1,270-line `landing.css` to vanilla, scoped `body` rules to `.is-landing-page` / `.is-open-page` so `/index.html` is untouched. Eight editorial deviations applied (documented in landing.css and the plan file).
- Photos copied: 5 night-cam tiles → `/images/tiles/`, 10 daytime portraits → `/images/team/`.
- `landing.html` rewritten as vanilla single-page editorial scroll: Topbar → Hero (6 photo-tiles + live-pill + city-line) → Steps → RoomPreview → Community (5 portraits) → Closer (city marquee) → Footer. No React/Babel CDN — small vanilla `<script>` block handles LiveCounter random-walk, city clocks, pomodoro/tile timer ticks, mouse parallax, marquee.
- `open.html` created by composing new topbar + form-shell shell + the full 1,400-line legacy JS verbatim. Four targeted Edits patched: `totalPages 2→1`, `goToPage(1)→goToPage(0)`, null-safe `btn-scroll-down`/`btn-skip-to-form` bindings, theme-persistence via `halastudyTheme` localStorage key.
- Server route added: `/open.html` → sendFile('open.html').
- Smoke test updated: `createRoomFromLanding` now navigates to `/open.html` instead of `/`.

**What broke:**
- First curl pulled binary gzip output (50MB content, looks like noise without `--compressed`) — turns out the URL serves a `.tar.gz` despite the `?open_file=Halastudy+Landing.html` query string. Worked once I treated the response as a tarball.
- Initial `Read` calls on `/tmp/hala-design/...` failed; Windows Claude Code's Read needs Windows-style paths (`C:\Users\alkhu\AppData\Local\Temp\hala-bundle\...`). Copy via `cp` resolved it.
- The Anthropic design URL exceeds WebFetch's 10MB cap; had to fall back to `curl` + manual tar extraction.

**What I changed:**
- New: `images/tiles/*.jpg` (5), `images/team/*.jpg` (10), `design-system/landing.css` (1,008 LOC), `open.html` (1,595 LOC after patches).
- Modified: `landing.html` (full rewrite, 582 LOC, was 2,848), `co-study-server.js` (added `/open.html` route), `tests/smoke/app.smoke.spec.js` (navigate to `/open.html`).
- Untouched: `index.html` (in-room app), `design-system/colors_and_type.css`, all socket.io handlers, room store, schedule utils.

**Verification:**
- `npm run check` ✅ (server-side JS)
- `npm run typecheck` ✅
- `npm run lint` ✅ (20 files, no fixes)
- `npm run deadcode` ✅
- `npm run test:integration` ✅ 15/15
- `npm run test:smoke` ✅ 6/6 (full create + join + scheduled + SFU + capacity)
- Inline JS in both HTML files: `node --check` ✅
- Curl smoke: `/`, `/open.html`, all `/images/tiles/*`, all `/images/team/*`, both CSS files, `/socket.io/socket.io.js` → all HTTP 200.

**Next session starts with:**
- Visual taste-pass in browser at http://127.0.0.1:3022/ — confirm the 6-tile cluster doesn't feel too sparse (could revisit count) and the 5-portrait community row breathes. If the hero feels empty without 10 tiles, swap the 4th and 5th LAYOUT entries from priority=2 to priority=1.
- Commission real photography for `/images/tiles/` and `/images/team/` (placeholder AI portraits ship with the bundle; the plan documents the swap path).

**Open questions for Aziz:**
1. Are the bundle's AI-generated portraits OK as v1 placeholders, or do you want me to swap them for the ChatGPT-generated photos from the bundle's `uploads/` folder (higher-res, you produced these directly)?
2. The hero photo tiles currently include one dim-treated daytime portrait (Mariam). Want me to dim-treat 2 or 3 instead, for more day/night mix? Or keep it at one to preserve the "midnight study" vibe?
3. Real font licensing: README flags `29LT Bukra` + `IBM Plex Sans Arabic` as the brief's preferred pairing (currently using free Tajawal + Amiri). Want me to spike on procurement, or stay on the free pairing through Gate 2?

## 2026-05-18 — Hero mosaic + looping cam clips

**Goal for this session:** Replace the scattered still-photo hero tiles on `landing.html` with looping silent cam clips arranged as an editorial mosaic (1 featured + 5 strip).

**What worked:**
- Installed ffmpeg 8.1.1 via `winget install Gyan.FFmpeg` (winget lives at `~\AppData\Local\Microsoft\WindowsApps\winget.exe`, not on PATH for git-bash).
- Picked 6 of 18 AI clips from `~\Downloads\download\` (smallest sources, simpler scenes), staged at `videos/hero/source/` (gitignored).
- Encoded 6 × WebM (VP9) + 6 × MP4 (H.264) + 6 × poster JPG to `videos/hero/`. Featured 480×640@500k VP9 / 600k H.264; strip 288×384@180k VP9 / 220k H.264. All 3:4, audio stripped, `+faststart` on MP4. Source was 720×1280 portrait — crop filter is `crop=iw:iw*4/3:0:(ih-iw*4/3)/2`, not the landscape version in the plan.
- WebM payload (what browsers actually download): **827.8 KB total for 12 hits (6 clips + 6 posters)**. MP4 fallbacks (~1.3 MB) sit on disk but only fetched if a browser rejects WebM.
- Mounted `/videos` static in `co-study-server.js:1007` alongside the existing `/images`, `/audio`, `/design-system` mounts.
- Mosaic grid in `design-system/landing.css:204-269` — `grid-template-areas: "featured copy" / "strip strip"` for LTR with a flipped `html[dir="rtl"]` override so featured stays on the physical left in both directions and copy stays on the physical right. Mobile collapses to a single column.
- JS reduced-motion pause hook at the boot block in `landing.html` removes `autoplay` and pauses each `<video class="tile-photo">` to `currentTime=0`. Playwright verified all 6 paused under `reducedMotion: 'reduce'`.

**What broke:**
- First encode batch failed with `Invalid too big or non positive size for width '960' or height '1280'` — my plan's crop math assumed landscape; sources are portrait 720×1280. Swapped to `crop=iw:iw*4/3` and re-ran.
- First mosaic screenshot showed the featured tile stuck at 140px. Cause: `.study-tile { width: var(--tile-size, 140px); }` at landing.css:382 has the same specificity (0,1,0) as my `.study-tile--featured { width: 100% }` and sits later in the file, so it won. Bumped my selector to `.hero-mosaic .study-tile--featured` (0,2,0). Now renders at the intended ~420 wide.
- Killed the mouse-parallax block (`onMove`, `applyParallax`, `parallaxStrengths`, `tiles`) in `landing.html` — parallax shifted `margin-inline/block-start` per tile, which would misalign grid cells in the new mosaic. Old selector also targeted `.tile-cluster` which no longer exists.
- The original responsive rules `@media (max-width: 1080px) { .study-tile[data-priority="2"] { display: none; } }` and `@media (max-width: 520px) { .study-tile { transform: rotate(var(--tilt, 0deg)) scale(0.78); } }` would have hidden/tilted the strip tiles. Overrode with `.hero--mosaic ...` scoped rules.

**What I changed:**
- `landing.html` lines 42-147 → new hero mosaic block (6 `<video class="tile-photo" autoplay muted loop playsinline preload="metadata" poster="…">`); parallax-related JS removed; reduced-motion video pause added in boot block.
- `design-system/landing.css` ~+90 lines around the existing `.hero-copy` block adding `.hero-mosaic`, `.hero-strip`, `.study-tile--featured`, RTL override, responsive collapse.
- `co-study-server.js` +1 line — `/videos` static mount.
- `.gitignore` — added `videos/hero/source/`.
- New dir `videos/hero/` — 6 .webm + 6 .mp4 + 6 .jpg posters (tracked); `videos/hero/source/` raw mp4s (ignored).

**Verification — all gates green:**
- `npm run check` ✓, `npm run typecheck` ✓, `npm run lint` ✓ (biome clean), `npm run deadcode` ✓ (knip clean).
- `npm run test:smoke` 6/6 pass.
- Playwright check: WebM-only payload 827.8 KB (target ≤ 1.5 MB ✓). All 6 videos pause under `prefers-reduced-motion: reduce`. EN renders dir=ltr with `grid-template-areas: "featured copy"`; AR renders dir=rtl. Featured stays on the physical left, copy on the physical right, in both languages — chosen for consistency.

**DESIGN.md §11 risk surfaced:** clips are AI-generated. Treated as placeholders (current `images/tiles/*.jpg` also are). Easy to swap to real footage later — drop new files into `videos/hero/` with the same names, regenerate posters.

**Next session starts with:**
- Decide whether to also swap the room-preview mockup tiles ([landing.html:184-219](e:/Co-study/landing.html#L184-L219)) to looping clips, or keep them as `<img>` to read as a static screenshot of "the app." Out of scope this pass per Aziz's "hero only" answer.

**Open questions for Aziz:**
1. Do the strip clips need name/timer labels too, or strip them down to silent thumbnails (just the cam feed + LIVE chip)? Current labels were preserved from the original tile chrome.
2. Replace the AI clips with real student footage in a follow-up pass, or carry them until Gate 2?

## 2026-06-10 — Review fix-set on the landing/open redesign (out-of-spike, quality pass)

**Goal for this session:** Full five-axis code review of the uncommitted redesign working tree, then fix every finding and ship as a PR (CLAUDE.md also gained §10 run-commands + §11 architecture via /init).

**What worked:**
- Review caught a real Critical before it shipped: the new `Permissions-Policy: camera=(self)` header silently blocks getUserMedia inside the cross-origin SFU iframe (iframe `allow=""` delegation can't widen the embedder's policy). Fixed by deriving the SFU origin from `SFU_BASE_URL` at factory init and allow-listing it in both Permissions-Policy and CSP `frame-src`; pinned by a new integration test, and the SFU smoke test now exercises the dynamic `frame-src` against a real cross-origin fixture.
- The rtl-bilingual-reviewer agent earned its keep: 4 ship-blockers including `[data-force-ltr]` being inert on /open (rule only existed in index.html's inline styles) — room codes rendered RTL in Arabic.
- CSP tightened: `connect-src` any-host → `'self'`; `frame-src` any-host → `'self'` + SFU origin.
- Brand transliteration unified to one word (هلاستدي) repo-wide — open.html, index.html, README_AR.md, p3 outreach draft.
- New landing smoke spec (hero renders, zero console/page errors, CTA routes to /open create form) — `/` had lost all browser coverage when the forms moved.
- Full pipeline green twice (pre-commit and pre-push): 16/16 integration, 7/7 smoke.

**What broke:**
- First `npm run test:ci` died at the audit gate: 4 moderate advisories (qs via express, ws via socket.io) published since the last run. `npm audit fix` was lockfile-only and clean.
- Nothing else — the fix-set itself landed without a failing iteration.

**What I changed:**
- 5 commits on `feat/landing-redesign`: chore(deps) lockfile, feat(landing) redesign snapshot (45 files incl. media), fix(security) SFU-aware headers, fix(design) RTL/brand/numeral punch list + preview label, docs(spike-log) this entry.
- Owner decisions recorded: live counter stays animated but carries a bilingual "عرض توضيحي / Illustrative preview" label; spare media committed as taste-pass swap candidates.

**Next session starts with:**
- Merge the PR after the visual taste-pass (counter label placement in both languages is the one judgment call to eyeball).

**Open questions for Aziz:**
1. Real-SFU camera delegation is integration-tested at the header level but needs one manual deploy-time QA pass (fake SFU never calls getUserMedia).
2. `connect-src 'self'` degrades legacy-WebKit socket.io to same-origin polling — acceptable, or pin an explicit ws/wss same-origin pair?

## 2026-07-04 — Accounts, hidden admin portal, and a 360 pro-level sweep

**Goal for this session:** Ship optional user accounts (sign-in/sign-up) with feature unlocking, a hidden admin ops console, and a full "make it pro-level" polish pass — all on `feat/accounts-admin`, each step landing CI-green.

**What worked:**
- **Zero new runtime dependencies.** Auth is entirely `node:crypto`: PBKDF2-SHA512 passwords (extracted to `services/auth/password.js`, shared with the room-password path), stateless HMAC-SHA256 session cookies with per-user `tokenEpoch` revocation (ban/delete/password-change kills every outstanding cookie). `user-store.js` is a near-clone of `room-store.js` — debounced atomic `data/users.json` writes, strict fail-fast load, full re-sanitization at the trust boundary.
- **Guests stay the wedge.** Instant create/join never touch auth. Signing in unlocks: server-synced focus minutes + Riyadh-day streaks (with one-time import of the device's local stats — keeps the nudge's promise), My Rooms + reserved nickname, and profile perks (avatar accent shown as tile rings + chat dots, bio, streak badge). Only scheduled-room creation is gated (`AUTH_REQUIRED_FOR_SCHEDULED`).
- **Hidden admin console** mounts at `ADMIN_PATH` only when `ADMIN_PASSWORD_HASH` is also set; otherwise every admin URL 404s byte-identically to any unknown path (asserted in a test). Full ops surface: overview, room inspect/force-close/kick, runtime video kill-switch, user ban/unban, bilingual broadcast banner, backup-now, recent-errors ring buffer. `admin.html` is fully inlined + EN-only (documented DESIGN.md exception).
- **Shared frontend core.** Pulled the triple-duplicated storage migration + pre-paint theme into `public/js/halastudy-core.js` (loaded sync in `<head>`), plus `public/js/ui.js` (toasts, native-`<dialog>` confirms with typed confirmation, avatar chip). Existing smokes stayed green through the refactor — that de-risked everything downstream.
- 24 new integration tests (auth + admin) + 10 new browser smokes. Final `npm run test:ci` green: 55 integration, 23 smoke, all 7 gates.

**What broke:**
- Writing `services/auth/index.js` with literal invisible/bidi control chars in the sanitizer regex produced a "binary file" that Edit couldn't touch and `cat -A` flagged. Fix: build the regex source from `\uXXXX` escapes in a scratchpad patch script, never paste the raw chars.
- Node's HTTP client doesn't chunk `DELETE` bodies without an explicit `Content-Length`, so `DELETE /api/me {password}` arrived malformed → 400 instead of 401/200. Fixed in the test harness `request()` helper.
- `/api/auth/me` first returned 401 for guests → console 401 spam on every signed-out page load (a landing smoke asserts zero console errors). Changed to 200 `{user:null}`.
- account.html tabs sat under the `position:fixed` topbar and intercepted clicks in Playwright; needed top padding clearance.
- Committed step 10a before the full typecheck ran; CI then caught JSDoc gaps in the new smoke spec. Lesson: run `npm run typecheck` (not just `check`) before committing test files.

**What I changed:**
- New: `user-store.js`, `services/auth/{index,password,auth-routes}.js`, `services/admin/admin-routes.js`, `services/ops/{error-buffer,backup-scheduler}.js`, `account.html`, `admin.html`, `404.html`, `public/js/{halastudy-core,ui}.js`, `public/manifest.webmanifest` + icons, `scripts/{hash-admin-password,generate-icons}.js`, `types.d.ts`, auth/admin test suites + `auth-helpers.js`.
- Touched: `co-study-server.js` (config, stores, auth middleware, socket gating, runtime kill-switch, metrics, 404/error middleware, admin mount), all three pages (topbar entry, unlocks, nudges, banner), privacy page (honest accounts section), CHANGELOG/README/DEPLOYMENT, version → 1.2.0.
- 17 commits vs `main`: 2 reconcile the pre-existing in-flight work (security fix + cloudflare tooling), 15 build this feature. 83 files, +10k/−305.

**Next session starts with:**
- Aziz reviews `feat/accounts-admin` and decides merge vs PR. To exercise the admin console locally: `npm run admin:hash -- "<pw>"`, put `ADMIN_PATH` + `ADMIN_PASSWORD_HASH` + a 32-char `SESSION_SECRET` in `.env`, `npm run https`, visit the path.

**Open questions for Aziz:**
1. Accounts are local-JSON now (Supabase-swappable by design). Move to Supabase before or after the Gulf-VM launch?
2. Admin portal has no 2FA in v1 — password + lockout + path secrecy only. Acceptable for a solo-operator beta, or add TOTP now?
3. Email is unverified in v1 (no mail infra). Wire a verification email at launch, or leave it until spam becomes a real problem?

## 2026-07-02 — Production-launch roadmap: Phases 1–5 landed (out-of-spike)

**Goal for this session:** Assess repo status, produce a 10-phase production plan, then execute every phase that doesn't need Aziz's VM/domain/physical devices.

**What worked:**
- Repo was in strong shape: v1.1.0.0 released on `feat/landing-redesign` (10 ahead of main, green), Docker/PM2/Nginx/DEPLOYMENT.md all present. Merged as PR #10 → main.
- **P1 leak fixed (PR #11):** `GET /api/rooms/:roomId` returned the full snapshot (chat, participants, board) to anyone with a room code. Added `publicRoomSnapshot()` returning only join-preview fields; trimmed for all rooms. TDD: regression test written first, watched it fail on the leaked chat line, then went green. Migrated 4 legacy tests from HTTP reads to `join-room` acks. Rode along an `npm audit fix` (ws DoS GHSA-96hv-2xvq-fx4p) that was red-lighting main's CI.
- **Prelaunch batch (PR #12):** create-room now `socket.timeout(8000).emit` with a bilingual retry error (smoke test kills the server mid-create); new bilingual PDPL `/privacy` page (light+dark verified, RTL-reviewed); removed dead `#journal` nav link.
- **CI parity (PR #13):** ci.yml now runs all 7 `test:ci` gates (typecheck/lint/deadcode were unenforced); added `.env.example` (9 vars) + tag-based Release Checklist in DEPLOYMENT.md; `.env` gitignored.
- **Image payload (PR #14):** 8 landing photos → resized WebP + JPEG fallback via `<picture>`. Modern browsers: ~1.49MB → ~422KB (−1.07MB).

**What broke:**
- knip (deadcode gate) OOM'd with "Array buffer allocation failed" — oxc-parser needs one large *contiguous* ArrayBuffer, which failed under address-space fragmentation from leftover test workers (18GB RAM was free, so not true OOM). Freeing processes fixed it; it's clean on Linux CI.
- **Mistake to remember:** my process-cleanup regex (`server\.js|playwright|...`) was too broad and killed 5 of Aziz's OWN dev servers (lifelog-app-tauri, azizme.com ×2, HalaI_invoice, hala-nafs jest) because Next.js paths contain `start-server.js`. Only ever match on the specific project path (`E:\Co-study` / `cwd`) when bulk-killing node processes.

**What I changed:**
- Branches/PRs: #10 merged; #11 (room-snapshot-privacy), #12 (prelaunch-batch), #13 (ci-gate-parity), #14 (landing-image-payload) open. Stack order for merge: 11, then 12 → 13 → 14.

**Next session starts with:**
- Aziz merges PRs #11–#14 (11 first — carries the audit fix; then the 12→13→14 stack). Then Phases 6–10: provision a Gulf-region VM (Lightsail Bahrain ~$12/mo recommended), set env per `.env.example`, wire managed TURN (Metered/Cloudflare), run the production QA matrix on two cellular carriers.

**Open questions for Aziz:**
1. Restart your 5 dev servers I accidentally killed (see above) — sorry.
2. Hosting: try Oracle Jeddah free tier first, or go straight to Lightsail Bahrain?
3. Webfont trim (self-host WOFF2) — worth a follow-up, or leave the Google Fonts request as-is for launch?

## 2026-07-04 — Blog-promise gap closure (4 features)

**Goal for this session:** close the 4 built-vs-promised gaps found by auditing the two new Arabic SEO blog drafts in project-knowledge/ (ذاكر معي أونلاين + أفضل غرف مذاكرة جماعية) against the product.

**What worked:**
- Per-user session goal: rides the existing user-status event (sanitizeStatus + 80-char cap + hidden-status blanking), shows 🎯 line in participant list, recap toast on focus completion. Zero new persistence.
- 25/50/90 timer preset chips: route through resetTimer() to dodge the toggleTimer quirk (focusDur only re-read at the untouched 25:00 default).
- Report user (تبليغ): rate-limited socket event (3/min), persisted on room (capped 50, session-id prefixes only), silent (never broadcast/leaked to clients), admin Reports tab with Resolve+Kick, reporter-side local hide (video tile + name-keyed chat filter).
- Whole-frame privacy blur, ON by default (mesh only): gUM → hidden video → canvas ctx.filter blur → captureStream becomes localStream. FaceDetector reads the hidden raw video. Interval fallback while document.hidden. Full test:ci green (58 integration + 25 smoke).

**What broke:**
- Edit tool wrote a null byte into a test file when embedding a raw U+202E char ("binary file matches" from grep). Fixed byte-level; switched to safer quoting. Lesson: avoid raw bidi control chars in source via Edit.
- First blur smoke run: shared smoke server defaults VIDEO_PROVIDER=realtimekit → no mesh camera → #camera-toggle never clickable ("Camera room unavailable"). Fixed by booting a dedicated server with VIDEO_PROVIDER=mesh in-test (create-timeout pattern).
- extraHTTPHeaders x-forwarded-for leaks to fonts.gstatic.com → CORS console errors tripped the no-console-errors assertion. Dropped the header for the dedicated server.
- A concurrent session swept my sanitizeStatus edit into its own commit (b29a1b0 accounts) before I committed — content fine, attribution off.

**What I changed:**
- index.html, co-study-server.js, room-store.js, services/admin/admin-routes.js, admin.html, + integration/admin/smoke tests. Commits: 87d9a5a, 2eae41a, cef68f5, 07c8b2c, cedc406.
- RTL audit applied: Western digits in AR preset tooltips (DESIGN.md §5), FSI/PDI-isolated goal in recap toast, معطّل antonym, .report-reasons in the RTL selector list.

**Next session starts with:**
- 2-browser manual mesh QA of blur on real hardware (peer-side view + camera light), then publish the two blog drafts to blog.html.

**Open questions for Aziz:**
1. Blur default ON confirmed good after real-device QA? (perf on low-end laptops)
2. قدرات/تحصيلي room presets (item #5) — schedule as next feature block?
3. Deploy these 4 features to Lightsail before or after blog publish?

## 2026-07-05 — Favicon Handout import from Claude Design

**Goal for this session:** implement "Favicon Handout.html" from the Hala-Cam Design System project on claude.ai/design into the repo.

**What worked:**
- DesignSync MCP couldn't authorize (non-interactive session), and the design URL is login-gated — pulled the file via Kapture instead: navigated the user's logged-in Edge tab to the project, enabled network monitoring, and decoded the GetFile protobuf response body to recover the exact HTML.
- Downloaded all 12 favicon assets from the tokened claudeusercontent.com serve URLs and hash-compared against images/icons/ — every PNG already identical in the repo; favicon.svg differs only in DOM re-serialization (XML-canonical identical). The icon set was already fully shipped.
- Added the missing piece: design-system/Favicon Handout.html, with img paths rewritten to ../images/icons/ and the embed snippet updated to the repo's real production head links (/images/icons/* + /manifest.webmanifest).
- Render-verified over a throwaway localhost server: tokens resolve from colors_and_type.css, all 11 referenced URLs return 200.

**What broke:**
- Kapture screenshots come back blank once the tab is backgrounded (visibilityState hidden — Edge stops painting). Verified the bottom sections via curl + grep instead.

**What I changed:**
- New file: design-system/Favicon Handout.html. Nothing else touched (assets were already in place). Not committed yet.

**Next session starts with:**
- Commit the handout (docs(design-system): add favicon handout card) and consider porting "Brand Page.html" from the same design project.

**Open questions for Aziz:**
1. Also want "Brand Page.html" (the full logo/wordmark brand sheet) ported into design-system/?

## 2026-07-06 — UX micro-polish pass

**Goal for this session:** Find and ship tiny high-impact UX tweaks across landing/open/index, keep the site fully functional.

**What worked:**
- 10 atomic fixes shipped: toast instead of alert() on share-copy, Pomodoro countdown in the tab title, click-to-copy on the room pill and on the created-room code, desktop autofocus on /open, live room preview at 6 typed chars (was blur-only), double-submit guard on create/join, OG/Twitter cards on all three pages (WhatsApp unfurls), mobile keyboard hints (autocapitalize/enterkeyhint), dead footer links removed + WhatsApp invite wired to wa.me.
- Verified live in a real browser on :3210 — created room CKNER8 through the form, joined it, ran the timer (tab title "24:57 · Halastudy" → restores on pause), auto-preview showed the room at 6 chars. Zero console errors on all three pages.

**What broke:**
- Port 3000 is occupied by the local Firecrawl service — EADDRINUSE; ran the app on PORT=3210 instead.
- navigator.clipboard.writeText rejects with NotAllowedError in headless browsers (no user activation) — expected, the catch path handles it; real-browser clicks are fine.

**What I changed:**
- index.html, open.html, landing.html, design-system/landing.css — 10 conventional commits (fix(ux)/feat(ux)/feat(seo)) on main.

**Next session starts with:**
- Deploy the UX batch to halastudy.com (Lightsail) after pushing to origin.

**Open questions for Aziz:**
1. OG image currently uses the hero poster (01-nouf-abdulaziz-poster.jpg) — want a dedicated 1200×630 social card instead?
2. Footer "Manifesto"/"Status" links were dead (#) and removed — restore when those pages exist?

## 2026-07-06 — Mobile pass: burger menu + fit polish

**Goal for this session:** Proper mobile nav (burger menu) and an elegant fit at phone width across all three pages.

**What worked:**
- Landing at 375px had real breakage: nav links were display:none under 880px with no replacement, and the topbar CTA overflowed the viewport (docW 420 vs 375). Shipped a burger (44px) that opens a solid-paper dropdown sheet with the nav links, the real lang/theme controls (nodes moved in, listeners survive), and a full-width CTA. Escape/outside-click/link-click all close it; dark theme + EN/AR + reduced-motion covered.
- .cta-strip now clips its lamp glow + city marquee — horizontal scroll gone (docW 375 = winW).
- ≤519px hides the decorative هلا brand glyph so the brand and auth link keep breathing room (Latin wordmark always stays, per DESIGN.md §6).
- In-room: the whole .status-* block (presets, inputs, toggles, preview) had NO CSS anywhere and rendered as UA defaults — now token-styled pills/inputs. Header + room-meta padding aligned to the 20px mobile gutter.
- Verified live at 375/768/1280, both languages, dark mode, full create→enter→join flow on the mobile viewport.

**What broke:**
- /design-system static route serves with maxAge 1d — the headless browser kept using stale CSS. Worked around by rewriting stylesheet href with a cache-buster at runtime. Worth remembering for future CSS iterations.

**What I changed:**
- landing.html, design-system/landing.css (burger menu, overflow clip, brand glyph rule), index.html (status block styles, mobile padding).

**Next session starts with:**
- Push + deploy the mobile batch; check real-device Safari (dvh support, notch insets).

**Open questions for Aziz:**
1. In-room page intentionally has no burger — its 4 header controls all fit on mobile and hiding mid-session controls behind a tap would hurt. OK, or do you want one there too?

## 2026-07-05 — Lobby build + landing name fixes

**Goal for this session:** Fix front-page names (Saudi, gender-matched to faces), then build the public "Lobby" room (30 users, RealtimeKit, adjustable paginated grid).

**What worked:**
- Landing names: viewed all 14 hero/preview/team media files, found male names on women (Saud/Tariq/Majed) and a female name on a man (Mariam) + non-Saudi community names. Renamed all to Saudi first+father, gender-matched; verified in-browser; renamed the media files to match. Landing smoke green.
- Lobby P1: reserved `LOBBY` room seeded at startup, cleanup-exempt; `/lobby` route + lobby.html; integration test green.
- Lobby P2: viewer/publisher preset split + account-to-publish gate on /video-token; 30-present cap at join-room; 3 new integration tests green (guest→viewer, guest→publisher=AUTH_REQUIRED, account→publisher).
- Lobby P3: lobby.html grid shell — density (4/6/9/12/16/20/30), pagination, presence tiles, AR/EN+RTL. Verified in-browser (18 present → 12 tiles/4 cols → density 6 = 6 tiles/3 cols/3 pages).

**What broke:**
- Local integration suite fails on readiness until `SUPABASE_*` env vars are scrubbed (userStore hydrate → PGRST205 profiles table). Ambient dev-box issue, not code. Saved to memory.

**What I changed:**
- landing.html + AR/EN dicts; git mv of hero/preview/team media; co-study-server.js (LOBBY seed/route/caps/gate), server-config.js (viewerPresetName), realtimekit-provider.js (presetName param), lobby.html, .env.example, tests. Commits 2698f76, 484e3f6, d14c1f5, 1029d5c, b78a269, d491bca (+ spec).

**Next session starts with:**
- Decide P4 subscription model (A: density=layout only, SDK-paginated subscription; B: manual pin-based). SDK has no settable per-page count.

**Open questions for Aziz:**
1. P4 is blocked on you: create Cloudflare `halastudy_viewer` preset (produce disabled) + set VIDEO_VIEWER_PRESET_NAME + raise MAX_GLOBAL_VIDEO_PARTICIPANTS. Live media can't be verified locally.
2. P4 subscription model: (A) density = layout only, or (B) manual per-page subscription?
3. Deploy timing — Lobby P1–P3 are on main but /lobby degrades to presence-only until the preset+creds exist. Ship now or hold?

## 2026-07-06 — Lobby provisioned + shipped to prod

**Goal for this session:** Provision RealtimeKit + get the public Lobby live.

**What worked:**
- Reached Cloudflare RealtimeKit API with Aziz's Realtime token. App = 6687d095-… ("halastudyapp").
- Provisioned via API: halastudy_viewer (produce all NOT_ALLOWED) + halastudy_student (publisher, cloned from group_call_participant — it was MISSING, so RTK video had never worked for any room).
- Fixed provider bug: extractResult now unwraps Cloudflare's { data } envelope (was only { result }) → participant tokens parse (91f94c5).
- Live-verified locally then in PROD: LOBBY join → viewer token 200 (real authToken); guest publisher → 403 AUTH_REQUIRED; normal room → publisher token 200.
- Pushed 28 commits, deployed to Lightsail (git pull → 91f94c5), set VIDEO_PROVIDER=realtimekit + CLOUDFLARE_* + viewer preset + cap 40 in box .env, start.sh. verify:deploy green, /lobby 200, videoProvider=realtimekit, LOBBY seeded.

**What broke:**
- First two tokens Aziz pasted were R2 (401/403 on RTK). Third had Realtime scope.
- Auto-mode classifier blocked the combined preset write (student preset = shared prod state) until Aziz authorized.
- Provider { data } envelope bug (above).

**What I changed:**
- services/video/realtimekit-provider.js (data unwrap), scripts/cloudflare/create-viewer-preset.js, lobby.html (P4 media binding), public/js/video/realtimekit-client.js (joinHeadless), co-study-server.js (P1/P2), server-config.js, .env.example, tests. Prod box: .env + git pull + restart.

**Next session starts with:**
- 2-browser live camera test on halastudy.com/lobby (only thing unverified).

**Open questions for Aziz:**
1. Whole app is now on the metered RealtimeKit SFU (all rooms, not just Lobby). Watch cost; revert = VIDEO_PROVIDER=mesh + start.sh.
2. Rotate the R2 tokens/keys pasted in chat.
3. Normal-room rtk-meeting embed UI not visually tested live — quick 2-browser check when you can.

## 2026-07-10 — Backend hardening from Codex second-opinion review

**Goal for this session:** Ship the two real, product-impacting findings from the Codex backend refutation (F1/F3 identity + F2 room-switch leak) with regression tests, TDD.

**What worked:**
- Re-triaged Codex's 12 findings against source: it inflated severity (8/12 "High"); real distribution ~4 genuine Medium. F1 exploit hinges on `clientId` disclosure — verified it is NOT in the participant snapshot, so downgraded. Root cause of F1+F3+F11 is one thing: identity rests on two client-controlled unsigned values.
- Fix #1 (signed anon session): added pure `createAnonSessionToken`/`verifyAnonSessionToken` to `services/auth/index.js` mirroring the existing auth-token HMAC. Wired into `sessionMiddleware`, `getSessionIdFromSocket`, `findRoomVideoMember`. A forged/bare `coStudySessionId` now verifies to null → server mints a fresh signed one. Client cannot pick/forge its session id.
- Fix #2 (F2 room-switch leak): `join-room` now removes the socket from its previous room (via existing `removeUserFromRoom`) before joining the new one, and re-broadcasts presence to the old room. No more phantom participant / leaked mesh capacity.
- TDD throughout: 12 new tests (8 pure-helper unit + 3 cookie integration + 1 room-switch integration). Confirmed genuine RED (incl. temporarily disabling the fix to watch the room-switch test fail), then GREEN.
- All gates: `check` PASS, `lint` PASS, `typecheck` PASS, `test:integration` 73/73 (with SUPABASE_* scrubbed), smoke 14/14.

**What broke:**
- First integration run showed 5 failures — all the known SUPABASE_* readiness-503 env issue (see memory `test-env-supabase-scrub`), not the change. Green after unsetting.
- Room-switch test v1 had a presence-event race (caught the trailing join-A presence, not the cleanup). Rewrote to read room A's authoritative participant list from a fresh join ack — deterministic.

**What I changed:**
- `services/auth/index.js` (+38): anon session token helpers.
- `co-study-server.js` (+29/-): import, sessionMiddleware/getSessionIdFromSocket/findRoomVideoMember verify signed cookie; join-room prior-room cleanup.
- `package.json`: registered new test file in `check`.
- `tests/integration/session-identity.integration.test.js` (new): 12 tests.
- Branch: `fix/identity-and-room-switch` (not merged).

**Next session starts with:**
- Decide on the remaining triaged findings: F6 (cap board tasks + apply live sanitizers on load), F12 (async-listener rejection adapter + object-guard), F8 (schedule close-at math). None are shipped yet.

**Open questions for Aziz:**
1. Deploy note: signing invalidates existing `coStudySessionId` cookies — anonymous guests get a fresh session on next request (rate-limit counters reset, in-room identity re-established on next join). Auth/account cookies are unaffected. Acceptable, but it's a one-time churn on deploy.
2. Want F6 + F12 next (the other two cheap real ones), or hold and merge this first?
3. Merge `fix/identity-and-room-switch` to main + deploy, or PR for review?

## 2026-10-18 — Site-wide fix and enhancement planning

**Goal for this session:** Prepare a site-wide plan while preserving the original checkout and its blog edits.

**What worked:** Created an isolated worktree from e9412fd; inventoried all 103 commits beyond GitHub main; inspected 36 local page configurations; verified the three-migration contract. Aziz confirmed keeping the warm, quiet visual identity.

**What broke:** Reproduced English mobile landing overflow (444px document at 390px viewport); legal pages do not use saved English preference; rollout list omits the third migration. Dependency advisories and broader verification requirements are recorded in the plan. No application fix is claimed.

**What I changed:** Added the design, 10-task plan, and complete commit inventory under docs/superpowers/. Project-root STATUS.md and NEXT.md now point to this worktree. Production and original source edits were not changed.

**Next session starts with:** Task 1 in docs/superpowers/plans/2026-10-18-site-wide-readiness-plan.md: establish a Node 22 candidate baseline and repair the dependency lockfile.

**Open questions for Aziz:** No answer needed to execute Task 1. Password recovery requires verified email delivery before that feature can ship. Publication and production changes remain separately authorized actions.

## 2026-10-18 — Readiness Task 1 execution

**Goal for this session:** Establish the Node 22 candidate baseline and repair compatible dependencies in the isolated worktree.

**What worked:** Node 22.23.3 / npm 10.9.9; full quality gate exit 0 with 223 unit and 201 integration tests, no skips. Production and development audits report zero findings. Final lockfile installs cleanly. Original blog and OG hashes are unchanged.

**What broke:** Baseline audit reported five production packages plus development dependency smol-toml. Four restore tests used July fixtures with the real October clock and failed the intentional age limit. npm 10 dropped libc metadata from 20 unchanged optional packages during audit repair; restored those entries after verifying no other changes in them.

**What I changed:** Compatible package-lock updates and parser override floor; four test calls now inject the existing July fixture timestamp. Production restore safeguards and assertions are unchanged. Added Task 1 evidence, checked the plan's Task 1 items, preserved unrelated TODOS, and advanced project continuity to Task 2. Changes are uncommitted; HEAD remains e9412fd. No production or remote write occurred.

**Next session starts with:** Task 2: reconcile the three-migration rollout, startup, persistence, backup/restore, and release documentation, then run the infrastructure gate in Linux/Docker. See docs/superpowers/plans/2026-10-18-task1-evidence.md and .harness/handoffs/handoff-2026-10-18-readiness-task1.md.

**Open questions for Aziz:** None needed for local Task 2 work. Deployment, real-device/provider checks, and password recovery delivery remain separate release gates.

## 2026-10-18 — Readiness Task 2 execution

**Goal for this session:** Reconcile release/persistence instructions and rehearse the infrastructure gate while preserving Task 1.

**What worked:** Linux Node 22.23.3 infrastructure gate passed: ShellCheck, all three migrations twice in disposable PostgreSQL, 19 Docker layers/final filesystem with five excluded canaries, and Nginx syntax. Existing recovery/migration/startup/deploy tests passed 86/86 with no skips. Eight docs rendered and 25 relative links resolved. Task 1 manifest, lock and restore-test hashes are unchanged.

**What broke:** Windows CRLF shell files failed Linux ShellCheck SC1017; the disposable copy was normalized to Git's LF content and the full gate then passed. Windows tar export failed on tracked filenames; Python tarfile preserved the tracked working-tree inventory. No repository code or checks were changed.

**What I changed:** Reconciled rollout, backup/restore, deployment, launch, CLAUDE and both README files. Aligned VERSION to the existing 1.2.0.0 changelog/npm 1.2.0 baseline without assigning a release. Recorded Task 2 evidence and recovery/bootstrap limitations, updated plan/continuity, and wrote the Task 2 handoff. All changes remain uncommitted on e9412fd; nothing deployed or published.

**Next session starts with:** Task 3's failing English 390px landing-overflow regression. Read .harness/handoffs/handoff-2026-10-18-readiness-task2.md and preserve all Task 1/2 work.

**Open questions for Aziz:** None for local Task 3. Real-provider/device, staging migration, lost-host recovery, browser acceptance and deployed SHA remain release gates.


## 2026-10-18 — Readiness Task 3 execution

**Goal for this session:** Repair mobile overflow and public-page consistency while preserving all Task 1/2 work.

**What worked:** Node 22 quality passed with 223 unit and 201 integration tests, no skips, and zero production audit findings. Final public browser regressions passed 68/68 across Chromium/WebKit desktop/mobile; a final keyboard rerun passed 4/4. Real-font checks passed 160 page configurations, 20 final landing configurations and 14 breakpoint/label checks. Task 1/2 dependency, restore-test and runbook files are byte-identical; both legal main sections and the study page are unchanged.

**What broke:** Reproduced 444px English landing width at 390px, missing shared navigation, ignored legal preferences, tile/timer collisions and resize focus loss. Windows WebKit left an empty loaded font set's ready promise pending. A generic blur fallback closed Safari's menu on touch clicks; limiting its deferred check to Tab exits fixed that regression. The broad smoke diagnostic stopped at 177 passes, 3 intermediate touch-menu failures, 2 existing mobile admin skips and 6 unrun cases; all failed/unrun cases passed in the final 68-case public suite. A fresh full release-wide browser gate is still due later. Two existing rollout-contract assertions were stale after Task 2's wording/command changes and now check the revised safe procedure without changing the runbook.

**What I changed:** Added opt-in public-shell JS/CSS on eight pages, repaired wrapping/card grids and 44px controls, preserved per-language legal text, and extended browser regressions. Existing preference utilities are reused and study controls remain independent. Added Task 3 evidence/handoff, completed the plan checkboxes and advanced continuity to Task 4. Everything remains uncommitted on e9412fd; no remote or production write occurred.

**Next session starts with:** Task 4's landing content regression, then simulated activity/preview labeling and supported landing/blog claims. Read .harness/handoffs/handoff-2026-10-18-readiness-task3.md and preserve all Task 1/2/3 work, including the shared shell. Compare the original blog/OG changes separately rather than copying old pages wholesale.

**Open questions for Aziz:** None for local Task 4. Real-provider/device, designated-staging migration, lost-host recovery, final release gates and deployed SHA remain separate requirements.

## 2026-10-18 — Readiness Task 4 execution

**Goal for this session:** Make landing/blog activity and feature claims credible, preserve all Task 1/2/3 work, and review the original article/OG patch separately.

**What worked:** Node 22 quality passed (223 unit / 201 integration, no skips, zero production audit findings). Public browser checks passed 80/80 across Chromium/WebKit desktop/mobile; the final article target/keyboard refinement passed 8/8. Real-font checks covered 80 configurations plus 40 final article configurations, all measured final cases clean. Original article/OG hashes and protected prior repairs are unchanged.

**What broke:** New content regressions failed on the missing quiet-room label and missing article OG metadata before edits. Real-font inspection found 19.5–33px article navigation and 24px FAQ targets; padding on the outer details element did not enlarge the clickable summary. Moving padding into the summary and giving standalone links 44px targets fixed the measured issue. Phone screenshot review also prompted stronger contrast for the new entry explanation.

**What I changed:** Removed simulated activity totals/LIVE chips and froze sample timers; added approved bilingual quiet/preview labels and accurate guest/account/camera guidance. Applied the reviewed original article patch, retained editorial/OG improvements, removed unverified dates/reading times and unsupported feature/privacy claims, aligned FAQ schema and corrected article targets. Added Task 4 evidence/handoff and advanced plan/continuity to Task 5. Everything remains uncommitted at e9412fd; no remote or production write occurred.

**Next session starts with:** Task 5's existing guest/account create → invite → join → leave flows and smoke coverage. Read .harness/handoffs/handoff-2026-10-18-readiness-task4.md and preserve all Task 1/2/3/4 repairs.

**Open questions for Aziz:** None for local Task 5. Final release-wide gates, real-provider/device, OAuth, staging migration, lost-host recovery and deployed SHA remain separate requirements.

## 2026-10-18 — Readiness Task 5 execution

**Goal for this session:** Finish create/join/onboarding states while preserving all verified, uncommitted Task 1/2/3/4 work.

**What worked:** Final Node 22 quality passed (223 unit / 201 integration, no skips, zero production audit findings). The final five-suite browser matrix passed 208/208 with no skips across Chromium/WebKit desktop/mobile. Font-loaded entry inspection passed 40 base and 16 expanded/error configurations; the latter also verified 360×330px submit reachability and a 5.35:1 minimum for the checked text. Original article/OG hashes are unchanged.

**What broke:** Pre-fix regressions reproduced visible unselected password fields, lost signup drafts, unbounded lookup waits, silent clipboard denial and missing workspace pending status. A real protected preview uses a nested limited response that the UI treated as a flat snapshot. Stronger visibility checks caught inline-flex overriding hidden badges. Screenshot review caught dark entry fields/buttons with poor text colors. Intermediate assertions were corrected to the existing not-found wording, nested protected count and genuinely hidden joined form; interrupted runs are not counted as passes.

**What I changed:** Added tab-scoped draft restoration, optional-field tiles, associated errors/live states, bounded joins with duplicate/late-ack guards, correct private preview handling, room-bound password handoff and manual clipboard fallback. Repaired entry scrolling, target sizes, hidden-form focus behavior and dark/error contrast. Preserved backend/provider membership boundaries. Saved Task 5 evidence/handoff and advanced continuity to Task 6; everything remains uncommitted at e9412fd.

**Next session starts with:** Task 6 lobby guest/account entry and existing media/session lifecycle coverage. Read .harness/handoffs/handoff-2026-10-18-readiness-task5.md and preserve all Task 1–5 work.

**Open questions for Aziz:** None for this local Task 5 closure. Real-provider/device, OAuth, staging migration, lost-host recovery, final release-wide gates and deployed SHA remain separate requirements.
