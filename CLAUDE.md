# CLAUDE.md — Halastudy

> Auto-loaded by Claude Code at session start. Read once, then refer to DESIGN.md / PLAN.md as needed. Do not re-read each prompt.

---

## 1. Project identity

**Halastudy** — live-camera body-doubling for GCC/Saudi students. Quiet by default, camera is the signal, audio is the exception. This repo is the Arabic-bilingual fork of `co-study`. Owner: Aziz Al Khunizan (solo). Resolve the active worktree from project-root `STATUS.md` / `NEXT.md`; historical drive-letter paths are not operational instructions. Preserve the MVP scope; mass focus rooms, AI quizzes, Spotify integration and social feeds remain outside this readiness work.

---

## 2. Source-of-truth docs

Read in this order when context is needed:

1. **`CLAUDE.md`** (this file) — how we work
2. **`DESIGN.md`** — UI/visual contract (one accent, logical CSS only, RTL rules, §10 hard-no's, §11 ship checklist)
3. **[Site-wide readiness plan](docs/superpowers/plans/2026-10-18-site-wide-readiness-plan.md)** — current staged work; preserve uncommitted repairs and execute only the requested task
4. **`README.md` / `README_AR.md`** — public-facing project description, EN + AR
5. **`project-knowledge/`** — local decision pack and spike history. Release operations use `DEPLOYMENT.md`, `docs/ROLLOUT-COMPATIBILITY.md`, and `docs/BACKUP-RESTORE.md`.

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
- Conventional commits (`feat:`, `fix:`, `chore:`, `docs:`, `spike:`). Preserve the existing worktree/branch and dirty work. Commit only when requested; publishing, merging and deployment require explicit authorization. An authorized push targets `origin`, never `upstream`.
- Stuck after 2 attempts on the same approach? Stop, log what you tried, ask.
- Aziz's style: terse. Give ranked options, not open-ended questions. State assumptions in 1 line and proceed.

---

## 9. Health Stack

Use Node 22 and `NODE_ENV=test`, without production credentials. The manifest
and `.github/workflows/ci.yml` define three gate groups:

- typecheck (syntax): `npm run check` — `scripts/ci/check-syntax.js` runs `node --check` on every `.js`/`.mjs` source and on every inline `<script>` in `.html` pages (classic and module; JSON-LD is parsed as JSON; `text/babel` mock-ups are skipped), reporting HTML line numbers
- typecheck (types):  `npm run typecheck` — `tsc -p .` with `allowJs`/`checkJs`. Permissive (`strict: false`, `noImplicitAny: false`); JSDoc opt-in per function for the JSON-trust-boundary sanitizers (`sanitizeStatus`, `sanitizeMessage`, `sanitizeBoardTask`, `sanitizeRoom`, `normalizeSchedule`)
- lint:               `npm run lint` — `biome check .`. Scoped to JS author code only via `biome.json` includes (HTML/CSS/JSX/design-system mocks/`day*-*.mjs` spike scripts excluded). Auto-fix with `npm run lint:fix`
- deadcode:           `npm run deadcode` — `knip --no-progress` per `knip.json`
- audit:              `npm run audit:prod` — `npm audit --omit=dev`
- migration contracts: `npm run supabase:migrations:check` — static checks of all three ordered SQL files
- tests: `npm run test:unit` and `npm run test:integration` — Node tests; counts belong to dated evidence, not a permanent contract
- infrastructure: `npm run test:ci:infra` — ShellCheck, disposable PostgreSQL migration apply/reapply, Docker layers/final filesystem, and Nginx template validation; requires Linux/Docker and LF shell scripts
- browser: `npm run test:smoke` — Playwright Chromium/WebKit, each desktop/mobile

`test:ci:quality` runs syntax, migration contracts, types, warning-free lint,
deadcode, production audit, unit and integration tests. `test:ci` then runs
infrastructure and browser gates. CI runs these in separate jobs, with a
four-project browser matrix. Real-provider/device and recovery evidence remain
separate release gates even when CI passes.

---

## 10. Run & test commands

(§9 covers the quality gates; this is everything else.)

- `npm start` — HTTP app on `http://localhost:3000`
- `npm run https` — self-signed HTTPS on `:3443` — needed locally for secure-context browser APIs (camera/mic, FaceDetector)
- Single integration test: `node --test --test-name-pattern "<name>" tests/integration/server.integration.test.js`
- Single smoke test: `npm run test:smoke -- --project=chromium-desktop -g "<title>"`; omit the project option for all four projects. The harness uses isolated temporary state (`tests/helpers/test-env.js`).
- Operator scripts: `npm run backup:state`, `npm run restore:state -- <artifact>` (dry-run), `npm run restore:state -- <artifact> --apply --writer-stopped` (single writer must be stopped), `npm run verify:deploy -- <url>`
- Production operator commands must load the protected service environment. Prefer `scripts/deploy/backup.sh` and `restore.sh`; use `verify:deploy -- <url> --env-file /var/lib/halastudy/.env` as `halastudy`. Node does not automatically load `.env`.

---

## 11. Architecture

**No frontend build step.** Vanilla HTML/CSS/JavaScript pages use shared assets
under `public/js/` (including `halastudy-core.js` and `ui.js`) and
`design-system/`. In-room logic lives in `public/js/index-app.js` and
`public/js/video/`; some other pages still have inline scripts.
Arabic/RTL is the default; bilingual/theme consistency is a readiness task.

- `landing.html` ← `/` (marketing)
- `open.html` ← `/open` (room create/join)
- `index.html` ← `/study`, `/workspace`, `/room` (the in-room app)
- `account.html`, `lobby.html`, blog/article pages, legal pages, `404.html`, and the environment-gated admin page are additional surfaces

**Backend is one factory.** `server.js` (HTTP) and `server-https.js` (HTTPS via `selfsigned`) are thin wrappers around `createCoStudyServer(options)` in `co-study-server.js`, which holds the entire backend: Express app, Socket.IO server, security headers, origin guard, session cookie, per-concern sliding-window rate limiters (create/join/lookup/password-failure/chat/board), and room lifecycle. It returns `{ app, server, io, config, roomStore, rooms, listen, evaluateReadiness }` — integration tests construct real servers through this factory with temp state files rather than mocking.

**Both HTTP and Socket.IO mutate state.** HTTP handles account/authentication,
Google OAuth, admin operations, video lifecycle and signed provider webhooks.
Socket.IO handles create/join, chat, board, presence and development mesh relays.
Never assume an endpoint is read-only based on transport.

**Persistence** — sanitized room metadata, hashes, chat, board, schedule and
durable pending work live in `ROOM_STATE_FILE`; production accounts use
Supabase, with no local fallback. Video sessions and webhook acceptance have
sidecars derived from the room path. Live room presence remains memory-only.
Startup awaits hydration/drains before listening; persistence failures fail
closed. Keep one PM2 writer and retain the state directory across code changes.
Both distinct 32-byte session secrets and complete Supabase/RealtimeKit
configuration are required in production. See the deployment guide.

**Recovery** — the encrypted schema-v2 artifact has six datasets, including
deletion tombstones and focus claims. Restore filters deleted identities using
artifact and current tombstones, writes active protective tombstones first,
and rejects unsafe ages even for pins. Runtime video sidecars and secrets are
outside that artifact; preserve them and rehearse lost-host recovery separately.

**Scheduled rooms** — `schedule-utils.js` is pure functions: Riyadh-timezone cadence (`once`/`daily`/`weekdays` = Sun–Thu/`weekly`), occurrence math, attendance (`on_time`/`late`/`missed`, streaks). Good first place to look for any timer/schedule bug; it has no I/O.

**Media modes** — production uses provider-authoritative Cloudflare RealtimeKit and never falls back to mesh. Authenticated WebRTC mesh is development/test-only and requires both `VIDEO_PROVIDER=mesh` and `ENABLE_DEV_MESH=true`; its participant cap defaults to 4. The legacy iframe `sfu` mode exists only when `SFU_BASE_URL` is set. A room's stored mode is fixed at creation, and AI focus monitoring remains development-mesh-only.

---

_Last reviewed against candidate code: 2026-10-18._
