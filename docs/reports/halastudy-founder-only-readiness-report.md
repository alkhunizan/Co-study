# Halastudy Founder-Only Readiness Report

_Generated after the terminal-automation + security-hardening pass. Date: 2026-07-03._

## Summary
- **Current readiness:** `LOCAL-TEST-GO` (hardened) — one short step from `FOUNDER-ONLY-GO`.
- **What changed:**
  - **P1 privacy leak fixed.** `GET /api/rooms/:roomId` no longer leaks protected-room state (messages, board, participants, schedule, video/session state) before a password-gated join. Fail-closed preview only.
  - **Cloudflare RealtimeKit terminal tooling added** (6 scripts): setup, smoke, doctor, cleanup, cost-check + shared helper. All CI-clean and runtime-verified.
  - **RealtimeKit CDN pinned** to `2.0.0` (was `@latest`).
  - Full `npm run test:ci` passes end-to-end (31 integration + 13 smoke, 0 vulnerabilities).
- **What remains blocked (for `FOUNDER-ONLY-GO`):**
  1. RealtimeKit credentials are not yet in a local `.env` (there is no `.env`, only `.env.example`).
  2. `npm run cloudflare:setup` and `npm run cloudflare:smoke` have **not been run against real Cloudflare** (no creds).
  3. `halastudy_student` preset is **not verified** on the real account.
  4. Two-browser camera test not performed (founder-run).

## Commands run
| Command | Result | Notes |
|---|---|---|
| `npm run test:integration` | PASS | 31/31 tests |
| `npm run check` | PASS (0) | node --check syntax, incl. 6 new scripts |
| `npm run typecheck` | PASS (0) | tsc `checkJs` over new scripts |
| `npm run lint` | PASS (0) | biome, 0 warnings after cleanup |
| `npm run deadcode` | PASS (0) | knip; new scripts wired as entries |
| `npm run audit:prod` | PASS | `found 0 vulnerabilities` |
| `npm run test:ci` | **PASS (exit 0)** | check+typecheck+lint+deadcode+audit+integration(31)+smoke(13) |
| `npm run test:smoke` | PASS | 13 passed (2.0m), Playwright |
| `git diff --check` | PASS | no whitespace errors |
| `node …/realtimekit-doctor.js` | exit 1 (expected) | env FAIL (no creds); local-safety + CDN all PASS |
| `node …/realtimekit-cost-check.js` | exit 0 | $288/mo projection, $212 headroom |
| `node …/realtimekit-{setup,smoke,cleanup}.js` | exit 1 (clean) | fail on missing creds, no crash, no secrets |
| `npm run cloudflare:setup` | **NOT RUN** | needs RealtimeKit creds in `.env` |
| `npm run cloudflare:smoke` | **NOT RUN** | needs RealtimeKit creds in `.env` |

## Cloudflare scripts
| Script | Exists? | Pass/Fail | Notes |
|---|---:|---|---|
| `scripts/cloudflare/realtimekit-common.js` | yes | PASS | env load (no dotenv dep), redact, cfFetch, requireEnv, base URLs, assertNoSecretsInText, reporter |
| `scripts/cloudflare/realtimekit-setup.js` | yes | PASS (runs) | verifies app + preset; create gated by `CLOUDFLARE_REALTIMEKIT_CREATE_APP` / `_CREATE_PRESET` |
| `scripts/cloudflare/realtimekit-smoke.js` | yes | PASS (runs) | meeting → participant → token (redacted) → mark INACTIVE; PARTIAL PASS on cleanup failure |
| `scripts/cloudflare/realtimekit-doctor.js` | yes | PASS (runs) | env + Cloudflare + local-safety + git hygiene + CDN pin |
| `scripts/cloudflare/realtimekit-cleanup.js` | yes | PASS (runs) | closes only `Halastudy Smoke Test` meetings; real rooms untouched |
| `scripts/cloudflare/realtimekit-cost-check.js` | yes | PASS (runs) | launch cost model + optional observed usage from `VIDEO_SESSION_LOG_FILE` |

package.json scripts added: `cloudflare:setup`, `cloudflare:smoke`, `cloudflare:doctor`, `cloudflare:cleanup`, `cloudflare:cost-check`, `cf:doctor`.

## Cloudflare setup/smoke
| Check | Pass/Fail/Not run | Notes |
|---|---|---|
| Env present (account/app/token) | **Not run** | no `.env` yet |
| Apps API reachable | Not run | needs creds |
| Configured app exists | Not run | needs creds |
| Temporary meeting created | Not run | smoke needs creds |
| Temporary participant + token | Not run | smoke needs creds |
| Meeting marked inactive | Not run | smoke needs creds |

> Scripts are built and verified to run; they cannot reach Cloudflare until creds are in `.env`. API path shapes mirror the app's own `services/video/realtimekit-provider.js` (`/accounts/{id}/realtime/kit/{app}/meetings`, Bearer auth, defensive `result`/`data` parsing). If a Cloudflare path/field differs during beta, the scripts fail **loud** with the redacted Cloudflare error rather than guessing.

## Preset verification
| Setting | Expected | Verified? | Notes |
|---|---|---|---|
| `halastudy_student` preset | exists on account | **NO — P0** | `cloudflare:setup`/`doctor` will verify once creds exist |
| `VIDEO_DEFAULT_PRESET_NAME` | `halastudy_student` | yes (in `.env.example`) | app default is `halastudy_student` |
| Preset applied to participants | via `preset_name` on participant create | code path present | `realtimekit-provider.js` sends `preset_name` |

**Recommendation:** create the preset manually in the Cloudflare dashboard (Realtime → RealtimeKit → Presets), named exactly `halastudy_student`. Auto-create stays gated behind `CLOUDFLARE_REALTIMEKIT_CREATE_PRESET=true` as an escape hatch.

## Protected-room security fix
| Check | Pass/Fail | Notes |
|---|---|---|
| Preview excludes messages | PASS | test asserts `undefined` |
| Preview excludes participant details | PASS | |
| Preview excludes board state | PASS | |
| Preview excludes schedule/private metadata | PASS | |
| Preview excludes `videoProviderMeetingId` | PASS | asserted even after a real meeting is created |
| Preview excludes video session state | PASS | no `videoProviderStatus`/`activeVideoParticipantCount` |
| Wrong password does not unlock details | PASS | ack carries no room; GET stays preview-only |
| Correct password join still works | PASS | full state via socket join ack |
| Public room behavior unchanged | PASS | flat full snapshot, no envelope |
| `video-token` requires verified membership | PASS | 403 `ROOM_NOT_JOINED` for non-member; 200 after join |

Implementation: [co-study-server.js](../../co-study-server.js) — new `roomPreview()` helper; `GET /api/rooms/:roomId` 404s missing rooms, returns `{ ok, room: { roomId, name, protected, status, participantCount, requiresPassword } }` for protected rooms, and the unchanged full snapshot for public rooms. The frontend never calls this endpoint (it loads state via the password-gated socket `join-room`), so no UI regression. 10 assertions across 4 new tests + 2 updated tests, all green.

## CDN version pinning
| Package | Version pinned | Evidence |
|---|---|---|
| `@cloudflare/realtimekit` | `2.0.0` | `npm view` latest; jsdelivr URL returns HTTP 200 |
| `@cloudflare/realtimekit-ui` | `2.0.0` | `npm view` latest; jsdelivr URL returns HTTP 200 |

[public/js/video/realtimekit-client.js](../../public/js/video/realtimekit-client.js) now uses a single `REALTIMEKIT_VERSION = '2.0.0'` constant with the required upgrade comment. `@latest` fully removed. **Caveat:** the pinned SDK still needs the two-browser camera test to confirm it initializes in a real browser (file paths verified reachable; runtime init not yet exercised here).

## Backend API safety
| Endpoint | Pass/Fail | Notes |
|---|---|---|
| `GET /api/rooms/:roomId` (protected) | PASS | preview only, fail-closed |
| `GET /api/rooms/:roomId` (public) | PASS | unchanged full snapshot |
| `POST /api/rooms/:roomId/video-token` | PASS | requires verified membership; token never logged |
| `GET /api/runtime-config` | PASS | exposes no Cloudflare credentials |
| Provider errors | PASS | existing test confirms no `fake-secret-token` in body/logs |

## Frontend manual camera test
| Step | Pass/Fail/Not tested | Notes |
|---|---|---|
| Two-browser same-machine (Chrome normal + incognito) | **NOT TESTED** | founder-run; requires real creds + running app |
| Both cameras visible | Not tested | |
| Mic off by default | Not tested | code enforces `micDefaultEnabled: false` |
| No recording / screenshare / provider chat | Not tested | disabled by policy + env flags |
| Capacity decreases on leave / no stale session | Not tested | integration tests cover the server side |
| `VIDEO_JOIN_DISABLED=true` blocks new joins | Not tested (server side PASS) | integration test asserts 503 before provider call |

## Capacity and cost guardrails
| Guardrail | Value | Verified? |
|---|---:|---|
| `MAX_GLOBAL_VIDEO_PARTICIPANTS` | 20 | yes (doctor PASS) |
| `MAX_ROOM_VIDEO_PARTICIPANTS` | 20 | yes (doctor PASS) |
| `MAX_ROOM_DURATION_MINUTES` | 180 | default in config |
| `VIDEO_RECORDING_ENABLED` | false | yes (doctor PASS; config throws if true) |
| `VIDEO_SCREENSHARE_ENABLED` | false | yes (doctor PASS) |
| `VIDEO_CHAT_ENABLED` | false | yes (doctor PASS) |
| Projected monthly cost @ 20 users | ~$288/mo | yes (cost-check) — $212 headroom vs $500 budget |

## Security findings
| Risk | Level | Fixed? | Notes |
|---|---|---:|---|
| Protected-room state readable before join | P1 | **YES** | fail-closed preview + 10 tests |
| RealtimeKit SDK loaded via `@latest` | Medium | **YES** | pinned to 2.0.0 |
| Cloudflare token / participant token exposure in scripts | — | Prevented | Bearer server-only, redact()/assertNoSecretsInText(), tokens never printed |
| `.env` committed / token in git | — | Guarded | doctor checks `.env` git-ignored + not tracked + no `cfat_` token in tracked files |
| Password hash exposure via API | — | Not present | API `roomSnapshot` never included `passwordHash` (only internal `buildRuntimeRoom`) |

## Go / No-Go
**LOCAL-TEST-GO** (hardened).

Rationale against the ladder:
- ❌ **FOUNDER-ONLY-GO** blocked: rules require `cloudflare:setup` + `cloudflare:smoke` to **pass**, and they have not been run (no creds in `.env`).
- ❌ **PRIVATE-BETA-GO** blocked: requires the real two-browser camera test to pass (not done). Protected-room leak requirement is now satisfied.
- ❌ **PUBLIC-GO** blocked: requires a 10–20 real-user test.

### Exact path to FOUNDER-ONLY-GO (minutes, founder-run)
1. `cp .env.example .env` and fill **only** `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_REALTIMEKIT_APP_ID`, `CLOUDFLARE_REALTIMEKIT_API_TOKEN` (RealtimeKit creds — different from the R2 token).
2. Create the `halastudy_student` preset in the Cloudflare dashboard.
3. `npm run cloudflare:setup` → expect `Overall: PASS`.
4. `npm run cloudflare:smoke` → expect `Overall: PASS`.
5. `npm run cloudflare:doctor` → expect `Overall: PASS`.
→ then **FOUNDER-ONLY-GO**.

### Then, to PRIVATE-BETA-GO
6. `npm start`, open `http://127.0.0.1:3000`, run the two-browser camera test (Chrome window + incognito). Confirm both cameras, mic off, no recording/screenshare/chat, capacity math, and the protected-room preview in the real UI.
