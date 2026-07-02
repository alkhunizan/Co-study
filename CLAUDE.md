# CLAUDE.md — Halastudy (e:\Co-study)

> Auto-loaded by Claude Code at session start. Read once, then refer to DESIGN.md / PLAN.md as needed. Do not re-read each prompt.

---

## 1. Project identity

**Halastudy** — live-camera body-doubling for GCC/Saudi students. Quiet by default, camera is the signal, audio is the exception. This repo (`e:\Co-study`) is the active fork — Arabic-bilingual, customized from upstream `co-study`. Owner: Aziz Al Khunizan (solo). v1 scope is the 6-week MVP wedge — **do not** build StudyStream-parity features (mass focus rooms, AI quiz, Spotify integration, social feed); those are v2 / post-Gate 2.

---

## 2. Source-of-truth docs

Read in this order when context is needed:

1. **`CLAUDE.md`** (this file) — how we work
2. **`DESIGN.md`** — UI/visual contract (one accent, logical CSS only, RTL rules, §10 hard-no's, §11 ship checklist)
3. **`PLAN.md`** — active sprint plan (when present; currently mirrored from `D:\Projects\body-doubling\PLAN.md`)
4. **`README.md` / `README_AR.md`** — public-facing project description, EN + AR
5. The body-doubling decision pack still lives at `D:\Projects\body-doubling\project-knowledge\` — port to `e:\Co-study\project-knowledge\` when convenient.

---

## 3. `/goal` — your discipline backstop

`/goal` is a built-in Claude Code feature. You set a completion condition, and after each turn a small fast model (Haiku by default) checks whether the condition holds. If not, Claude starts another turn instead of returning control. The goal clears automatically when met.

**Use `/goal` for substantial work with a verifiable end state**: a feature that compiles + passes specific tests, an integration that works between two services, a checklist that is fully ticked.

**The evaluator's blind spots** — important:
- It only judges what Claude has surfaced in the transcript. It does NOT run commands or read files independently.
- So write conditions that Claude's output can demonstrate. "Tests pass" works because Claude runs them and the result is in the transcript. "The code is clean" doesn't work — too vague.
- Default Haiku evaluator is fast but not infallible. For UI taste, security review, or anything subjective, don't use `/goal`.

**Status, clear, resume**:
- `/goal` (no args) → see active condition, turns spent, last evaluator reason.
- `/goal clear` → stop early.
- A goal active when a session ends is restored on `--resume` / `--continue` (turn count + token baseline reset).

---

## 4. Goal-phrasing recipes

Pick the closest template, fill in the brackets:

**Daily spike** (the common case):
```
/goal Day [N] complete per PLAN.md: [day-specific criterion] AND today's spike-log.md entry written using CLAUDE.md §6 template. Stop after 25 turns even if not met, and report what's blocking.
```

**Bug hunt**:
```
/goal Bug fixed: [stack trace / repro] no longer reproduces; a regression test exists; no other test files modified. `npm test` exits 0.
```

**Refactor**:
```
/goal Refactor done: every call site of [old name] migrated to [new name]; `git grep [old name]` returns zero hits; tests pass; net LOC delta ≤ +[X].
```

**UI work** (use this when touching `index.html`, `landing.html`, or any visual surface):
```
/goal [feature] works end-to-end on localhost AND every item in DESIGN.md §11 ship checklist confirmed in transcript AND zero items from DESIGN.md §10 hard-no's introduced. Stop after 25 turns.
```

---

## 5. `/spike-day` quick reference

`/spike-day <N>` (custom slash command in `.claude/commands/`) — picks Day N's success criterion from PLAN.md §3, sets the appropriate `/goal`, and starts the day's work. Use this instead of hand-writing a `/goal` every morning.

```
/spike-day 1   # boots co-study + mirotalksfu side-by-side on localhost
/spike-day 5   # quiet mode + room create/join flow, with DESIGN.md §11 checked
```

---

## 6. spike-log.md template

Append at the end of every working block to `project-knowledge/spike-log.md` (create if missing):

```markdown
## YYYY-MM-DD — Day N of Week N

**Goal for this session:** <1 line>

**What worked:**
- <bullet>

**What broke:**
- <bullet, with the actual error message>

**What I changed:**
- <files touched, commits made>

**Next session starts with:**
- <single concrete next action>

**Open questions for Aziz:**
- <ranked list, max 3>
```

---

## 7. When NOT to use `/goal`

The Haiku evaluator gets these wrong — don't waste turns:

- **Interviews** (P1) — human-evaluation step. No transcript signal.
- **Distribution outreach** (P3) — same.
- **Subjective UI taste** beyond DESIGN.md's checkable items — let Aziz judge.
- **Anything ambiguous** — if a senior engineer would say "depends," Haiku will too.
- **Anything destructive** that needs a human go/no-go (force-push, dropping data, deploying).

For these, work in normal mode and report when ready for review.

---

## 8. Working agreement (short version)

- Act on low-risk reversible tasks (read, build, test, draft). Ask before destructive ones (force-push, delete outside cwd, install system deps, touch MiroTalk core code → AGPL).
- Windows + PowerShell. `.ps1` not `.sh` for any scripts you generate.
- Append to `spike-log.md` at the end of every working block.
- Conventional commits (`feat:`, `fix:`, `chore:`, `docs:`, `spike:`). Branch names: `spike/<topic>`, `feat/<feature>`, `fix/<issue>`. Push to `origin`, never `upstream`.
- Stuck after 2 attempts on the same approach? Stop, log what you tried, ask.
- Aziz's style: terse. Give ranked options, not open-ended questions. State assumptions in 1 line and proceed.

---

## 9. Health Stack

Used by `/health` (gstack skill) and `npm run test:ci`. All five gates run in `test:ci`.

- typecheck (syntax): `npm run check` — `node --check` across 15 author files
- typecheck (types):  `npm run typecheck` — `tsc -p .` with `allowJs`/`checkJs`. Permissive (`strict: false`, `noImplicitAny: false`); JSDoc opt-in per function for the JSON-trust-boundary sanitizers (`sanitizeStatus`, `sanitizeMessage`, `sanitizeBoardTask`, `sanitizeRoom`, `normalizeSchedule`)
- lint:               `npm run lint` — `biome check .`. Scoped to JS author code only via `biome.json` includes (HTML/CSS/JSX/design-system mocks/`day*-*.mjs` spike scripts excluded). Auto-fix with `npm run lint:fix`
- deadcode:           `npm run deadcode` — `knip --no-progress` per `knip.json`
- audit:              `npm run audit:prod` — `npm audit --omit=dev`
- tests:              `npm run test:integration` (18) + `npm run test:smoke` (12) — Node `--test` + Playwright

Composite green target: full pipeline ≤ 60s on a warm cache.

---

## 10. Run & test commands

(§9 covers the quality gates; this is everything else.)

- `npm start` — HTTP app on `http://localhost:3000`
- `npm run https` — self-signed HTTPS on `:3443` — needed locally for secure-context browser APIs (camera/mic, FaceDetector)
- Single integration test: `node --test --test-name-pattern "<name>" tests/integration/server.integration.test.js`
- Single smoke test: `npx playwright test --config=playwright.config.js -g "<title>"` — chromium only, 1 worker; global setup boots the app on port 3460 with a temp state file (`tests/helpers/test-env.js`)
- Operator scripts: `npm run backup:rooms`, `npm run restore:rooms -- <path>` (app must be stopped), `npm run verify:deploy -- <url>`
- Gotcha: `.github/workflows/ci.yml` runs only check + audit + integration + smoke. The typecheck/lint/deadcode gates are in `test:ci` but not yet in the workflow — run `npm run test:ci` locally before pushing.

---

## 11. Architecture

**No build step.** Frontend is vanilla JS/HTML/CSS — three self-contained pages, each `lang="ar" dir="rtl"` by default with an EN toggle, sharing design tokens from `design-system/colors_and_type.css`:

- `landing.html` ← `/` (marketing)
- `open.html` ← `/open` (room create/join)
- `index.html` ← `/study`, `/workspace`, `/room` (the in-room app — one large file with inline JS/CSS; all client logic lives here)

**Backend is one factory.** `server.js` (HTTP) and `server-https.js` (HTTPS via `selfsigned`) are thin wrappers around `createCoStudyServer(options)` in `co-study-server.js`, which holds the entire backend: Express app, Socket.IO server, security headers, origin guard, session cookie, per-concern sliding-window rate limiters (create/join/lookup/password-failure/chat/board), and room lifecycle. It returns `{ app, server, io, config, roomStore, rooms, listen, evaluateReadiness }` — integration tests construct real servers through this factory with temp state files rather than mocking.

**HTTP is read-only; Socket.IO mutates.** REST endpoints are `/api/health`, `/api/ready`, `/api/runtime-config`, `/api/rooms/:roomId` only. All state changes flow through socket events: `create-room`, `join-room`, `send-message`, `board-*`, `camera-status`, `user-status`, and WebRTC signaling relays (`rtc-offer`/`rtc-answer`/`rtc-ice` — the server never touches media, it only forwards SDP/ICE between peers).

**Persistence** — `room-store.js` (`createRoomStore`) debounce-writes (250ms) to `data/rooms.json`. Persisted: room metadata, PBKDF2 password hashes, chat history, board state, schedule/attendance. Memory-only: presence, socket IDs, camera state. Sanitizers are injected into the store from `co-study-server.js` (the JSON file is a trust boundary — everything loaded from disk is re-sanitized). Single-instance by design: keep PM2 at one process.

**Scheduled rooms** — `schedule-utils.js` is pure functions: Riyadh-timezone cadence (`once`/`daily`/`weekdays` = Sun–Thu/`weekly`), occurrence math, attendance (`on_time`/`late`/`missed`, streaks). Good first place to look for any timer/schedule bug; it has no I/O.

**Media modes** — `mesh` (P2P WebRTC, capped at `MESH_PARTICIPANT_LIMIT`, default 4) vs `sfu` (iframe embed, only when `SFU_BASE_URL` is set). A room's mode is fixed at creation. AI focus monitoring is mesh-only.

---

_Last updated: 2026-06-10._
