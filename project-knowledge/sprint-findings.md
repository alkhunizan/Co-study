# Sprint Findings — Halastudy Week 1 (Days 1–6)

> **Purpose:** Day 6 of the 6-week MVP wedge (PLAN.md §3 row 6). Synthesizes what we proved, what we didn't, and what we learned that wasn't in the plan. Day 7 go/no-go is graded against this document.

## TL;DR

- **P2 (tech stack):** ✅ GREEN. The co-study ↔ mirotalk/sfu iframe bridge works end-to-end over HTTPS, peer connections established between two browser contexts, Pomodoro-equivalent state syncs in <200ms over socket.io, UI flow create→join→leave→re-join verified, DESIGN.md §11 ship checklist 9-of-10. Six PRs merged, zero CI failures on main.
- **P1 (demand):** 🟡 YELLOW-PENDING. Five student interviews planned via [p1-interview-script.md](p1-interview-script.md); zero conducted as of this write-up. **Aziz to fill quotes table below.**
- **P3 (distribution):** 🟡 YELLOW-PENDING, trending red. Beta-list target is 30+ named humans; current count is **0**. Channel shortlist + bilingual seed templates ready in [p3-channel-shortlist.md](p3-channel-shortlist.md). **Aziz to fill list below.**
- **Stack surprises:** Biggest is meta — *the upstream repo was further along than the spike plan assumed.* Three of five build days were verification, not construction. See [§Stack surprise](#stack-surprise-note) below for the full unpacking.

---

## Five verbatim student quotes (P1)

**Aziz fills this section.** Source: capture sheet from running [p1-interview-script.md](p1-interview-script.md) on 5 GCC/Saudi students × 15 min each. Pull verbatim — don't paraphrase. Arabic quotes stay in Arabic; add English gloss only if the meaning isn't obvious to a non-Arabic Day-7 reviewer.

| # | Name / cohort | Verbatim quote (≤1 sentence) | Wedge match? | Beta? |
|---|---|---|---|---|
| 1 |   |   |   |   |
| 2 |   |   |   |   |
| 3 |   |   |   |   |
| 4 |   |   |   |   |
| 5 |   |   |   |   |

**Reading rubric (from p1-interview-script.md):**
- Wedge match = answered Q3 with "mostly silent, cameras on" or equivalent
- ≥3 wedge matches across 5 = P1 green
- 1–2 = yellow
- 0 = red, pivot the wedge

**Aziz: P1 final grade:** _( R / Y / G )_
**One-line synthesis of what you heard:** _________________________________

---

## Named beta list (P3)

**Aziz fills this section.** Source: outreach via [p3-channel-shortlist.md](p3-channel-shortlist.md) templates. Day-6 success bar per PLAN.md §3 row 6 is **30+ named humans**. Soft yes (WhatsApp reply, "أبي تجرب", "I'd try") counts. Don't gate on a sign-up form — name + handle is enough.

| # | Name | Handle (WA/X/IG) | Channel source | Cohort | Notes |
|---|---|---|---|---|---|
| 1 |   |   |   |   |   |
| 2 |   |   |   |   |   |
| 3 |   |   |   |   |   |
| 4 |   |   |   |   |   |
| 5 |   |   |   |   |   |
| 6 |   |   |   |   |   |
| 7 |   |   |   |   |   |
| 8 |   |   |   |   |   |
| 9 |   |   |   |   |   |
| 10 |   |   |   |   |   |
| 11–30+ | _(continue inline)_ |   |   |   |   |

**Aziz: P3 final grade:** _( R / Y / G )_
**Channel that worked best:** _________________________________
**Most surprising response (verbatim):** _________________________________

---

## Stack surprise note

**The single biggest surprise of Week 1: the upstream `co-study` repo (and its private WIP) was substantially further along than the spike plan assumed.**

Three of the five build days turned out to be **verification, not construction**:

- **Day 2** — the SFU bridge between co-study and `mirotalk/sfu` was already designed: `SFU_BASE_URL` env var, `sfuAvailable` runtime flag, iframe element with `allow="camera; microphone"`, the exact URL contract matching MiroTalk's `/join` endpoint, even a fake-SFU test fixture mirroring the contract. The "Day-2 work" was setting one env var and a Playwright test. The "hacky" license PLAN.md gave us went unspent.
- **Day 3** — "Pomodoro state syncs across two clients" was supposed to be the build day for synchronized session timers. Reality: there is no `pomodoro` model in the code. The synchronized state rides the existing `user-status` socket event with a `timerMode: 'focus' | 'break' | null` field. The server's `sanitizeStatus` + `status-update` broadcast handler was already complete. Day 3 was one Playwright test asserting B receives A's transitions.
- **Day 5** — the rebrand from Co-Study → Halastudy + the Halastudy design system was already mostly written in the working tree (Aziz had drafted it but never committed). Day 5 was committing it cleanly, auditing it against DESIGN.md §10/§11, and fixing the bugs that audit revealed.

**Why this matters strategically:**

The spike's hidden assumption was *"build the wedge, then validate it."* The actual position turns out to be *"the wedge is mostly built — validate it and decide if it's the right wedge."* That's a different question. It means the spike's real risk concentrates entirely on **P1 (does anyone want this?) and P3 (can we get distribution?)** — both of which Week 1 has zero captured signal on.

**Why this matters operationally:**

When build days collapse into verification days, the natural human move is to find more things to build. I caught myself doing this on Day 5 (audit + fix the §11 ship checklist) — defensible since DESIGN.md called for it, but the tug toward more building was visible. **Week 2 should harden the wedge with users, not the codebase.** Tag: "if you find yourself coding before Day 14, ask why."

**Secondary surprises worth recording:**

| Surprise | Why it matters |
|---|---|
| `server-https.js` had two latent bugs (async cert + cA:true) that meant the HTTPS dev entrypoint **never actually served HTTPS** before Day 2. Someone shipped `https.createServer({key: undefined, cert: undefined}, app)` without noticing. | Operational: prior development happened without running secure-context flows. Any prior dev work touching auth/cookies/MediaDevices may have been smoke-tested through a different mechanism. |
| `design-system/colors_and_type.css` was on disk after the rebrand but `co-study-server.js` only mounted `/audio` and `/images` as static. The CSS file was served as `text/html`, Chromium refused to apply it, and the rebrand's design tokens **never rendered at runtime** until Day 5's one-line static-mount fix. | Pages were silently falling through to the inline `:root` defaults inside index.html / landing.html. The karak-amber accent didn't actually show up until 2026-05-15. |
| MiroTalk's `Room.js:3` hardcodes `if (location.href.substr(0,5) !== 'https') location.href = 'https' + …` — forces HTTPS upgrade with no env switch. AGPL-3.0 prevents editing the file. | The iframe path requires both sides on HTTPS in production. Plain-HTTP co-study deployments cannot use MiroTalk. Day-5 deploy plan should set TLS on both before any beta. |
| In CI, smoke tests assumed English copy (`/requires a password/i`); the Arabic-default rebrand broke them. Fixed by setting `localStorage.halastudyLang = 'en'` in the smoke `addInitScript`. | Future i18n work needs both lang variants in CI, not just one. |

---

## Risk register — updates from Week 1

Below replaces / merges into the pre-spike risk register at `D:\Projects\body-doubling\project-knowledge\` (still on a broken Windows junction at the time of writing — see open question #1 in Day 1 spike log).

| ID | Risk | Pre-spike grade | Post-spike grade | Why changed | Mitigation status |
|---|---|---|---|---|---|
| R-P2-01 | WebRTC media stack cannot carry 2-person video over commodity infra | M-H | **🟢 LOW** | Day 2 + Day 5 PR proved cross-origin iframe + mediasoup peer connections work end-to-end over HTTPS. Two-tab Playwright captures remote MediaStreamTrack `readyState:"live"` on both sides. | Still owe: 60-sec real-browser two-tab video confirmation (Aziz) — see [p2-real-browser-test.md](p2-real-browser-test.md). Closes the headless-fake-media gap. |
| R-P2-02 | MiroTalk SFU integration requires fork / AGPL contagion | M | **🟢 LOW** | We call MiroTalk over the network as a black box (iframe URL handoff). Zero MiroTalk source modifications. AGPL-3.0 doesn't trigger on network-API use. | Document in DEPLOYMENT.md before Day 7 if go-decision. |
| R-P2-03 | Production HTTPS / mediasoup ANNOUNCED_IP fragility | unknown | **🟡 MEDIUM** | MiroTalk forces HTTPS via Room.js redirect. Container ships with self-signed cert for 2048. Production needs real cert + correct ANNOUNCED_IP for non-localhost peers. Currently using `ANNOUNCED_IP=127.0.0.1` which works for same-host only. | New mitigation: when deploying to prod, set ANNOUNCED_IP to the public IP and reverse-proxy MiroTalk behind nginx with a real cert. Capture as Week-2 day-1 task. |
| R-P1-01 | "Quiet by default, camera is the signal" wedge doesn't resonate with cohort | H | **🟡 UNKNOWN** | Zero P1 signals captured Week 1. Plan to convert via 5 interviews per [p1-interview-script.md](p1-interview-script.md). | Owner: Aziz. Deadline: Day 7 (go/no-go). |
| R-P1-02 | Cohort fit — GCC/Saudi students vs. broader Arabic-speaking diaspora | M | **🟡 UNKNOWN** | Interview script targets GCC/Saudi specifically; no signal yet. | Same as R-P1-01. |
| R-P3-01 | No working distribution channel | H | **🟡 UNKNOWN, trending red** | Beta target: 30+ names by Day 6. Current count: 0. Three channels ranked in [p3-channel-shortlist.md](p3-channel-shortlist.md) (WhatsApp first). | Owner: Aziz. If < 8 yeses by end of Day 5, switch primary channel. |
| R-P3-02 | Aziz is the only distribution operator (solo founder) | H | **H** | Unchanged by spike. CLAUDE.md §1 confirms solo founder. | Mitigation: keep distribution channels lightweight enough for one operator to sustain. Don't add channels requiring 2nd person. |
| R-OP-01 | Solo-founder bus factor on a 6-week MVP | H | **H** | Unchanged. | Capture decisions in `project-knowledge/` so future-Aziz / collaborator can recover context. **Status: this folder is now the source of truth — protect it.** |
| R-OP-02 | Pre-existing in-flight work sitting un-committed in the working tree | unknown | **L (resolved)** | At session start, working tree had a partial Halastudy rebrand + design-system assets + CLAUDE.md / DESIGN.md / Dockerfile / docker-compose all untracked. All landed across PRs #2, #5. Tree is now clean. | Going forward: commit-often discipline. If a chunk of work sits in the tree for >1 day, ship or stash. |
| R-OP-03 | `D:\Projects\body-doubling\` Windows junctions to `co-study/` and `mirotalksfu/` are broken | new finding | **L** | Discovered Day 1. Pre-spike `project-knowledge/` content still references those paths. | Already mitigated: `project-knowledge/` is now in-repo at `e:\Co-study\project-knowledge\`. Old path is reference-only. |
| R-LEGAL-01 | MiroTalk AGPL-3.0 contagion | M | **🟢 LOW** | Call MiroTalk over the network only, never modify their source, never bundle. | Add a one-paragraph note to DEPLOYMENT.md before any public release confirming the legal stance. |
| R-PRIV-01 | MiroTalk container phones home to `stats.mirotalk.com` by default | new finding | **🟡 MEDIUM** | Discovered Day 2; the `halastudy-sfu` container ships with `STATS_ENABLED=true`. Beta users' room metadata could be sent to a third party. | Set `STATS_ENABLED=false` on the container before any beta user touches it. Captured in Day-2 spike-log open question #3. |

---

## Day 7 go/no-go inputs (preview)

Day 7 decision should weigh:
- **P2:** GREEN with one operational follow-up (real-browser confirmation). Default: go.
- **P1:** depends entirely on the quotes table above. ≥3 wedge matches → go. 1–2 → conditional go with wedge-tightening. 0 → no-go, pivot, or scope-cut.
- **P3:** depends entirely on the beta list. ≥30 names → go. 15–29 → conditional go with Week-2 outreach push. <15 → scope-cut to landing-page validation.

**Stack surprise → strategic implication:** Build risk is materially lower than we thought, but that doesn't grade the wedge. Don't let "we shipped 6 PRs" substitute for "users want this." Day 7's go/no-go should *not* default to go just because the tech path was clean.

---

## What's not in this document

- Code-level walkthroughs (those live in the spike-log, per-day entries)
- The §11 hit-target follow-up + Unicode-glyph-icon follow-up from Day 5 (Week-2 polish)
- Production deploy plan (separate doc when go-decision lands)
- Pre-spike decisions (those were in `D:\Projects\body-doubling\project-knowledge\`, now stranded behind a broken junction — port when convenient)

## Pointers

- Per-day diary: [spike-log.md](spike-log.md)
- P1 interview script: [p1-interview-script.md](p1-interview-script.md)
- P3 channel shortlist: [p3-channel-shortlist.md](p3-channel-shortlist.md)
- P2 real-browser test: [p2-real-browser-test.md](p2-real-browser-test.md)
- Design system: [../design-system/](../design-system/)
- Design contract: [../DESIGN.md](../DESIGN.md)
