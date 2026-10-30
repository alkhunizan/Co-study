# Halastudy site-wide fix and enhancement plan

> **For agentic workers:** Use the available `executing-plans` skill and implement
> task by task in the main thread. Preserve the existing commits. No automatic
> push, merge, deployment, database mutation, or history rewrite is authorized.

**Goal:** Prepare a verified Halastudy release with dependable study journeys,
consistent bilingual presentation, and the existing warm visual identity.

**Architecture:** Extend the existing vanilla frontend and Node service. Start
from local main `e9412fd`, preserving its authentication, persistence, video,
backup, and migration changes. Introduce narrowly shared UI behavior only where
it removes observed inconsistency; keep production media on RealtimeKit.

**Tech stack:** Node 22, Express, Socket.IO, HTML/CSS/JavaScript, RealtimeKit,
Supabase, Playwright, Biome, TypeScript checking, Docker validation, PM2/Nginx.

## Start here

Tasks 1–5 passed locally on 2026-10-18; continue with Task 6. See the
[Task 1](2026-10-18-task1-evidence.md), [Task 2](2026-10-18-task2-evidence.md),
[Task 3](2026-10-18-task3-evidence.md), [Task 4](2026-10-18-task4-evidence.md)
and [Task 5 evidence](2026-10-18-task5-evidence.md).
All work remains uncommitted on `e9412fd`. This is a staged program: foundation, public experience,
study journeys, operator readiness, then controlled release. A task is complete
only with its evidence; a passing local mock cannot close a real-provider gate.

The planning worktree is `workspace/Co-study-release-plan`, relative to the project
root, on `plan/site-wide-readiness-2026-10-18`. Original code and blog work remain
in `workspace/Co-study`. Derive paths from the current project root; historical
drive letters in exported files are not operational instructions.

## Baseline and decisions

- GitHub main: `44f062f` (confirmed with `git ls-remote origin refs/heads/main`).
- Original checkout: `0e3d477`, branch `fix/identity-and-room-switch`.
- Candidate: `e9412fd`, 103 commits ahead of GitHub, 177 changed files.
- Keep the identity and polish it: explicitly selected by Aziz on 2026-10-18.
- Original checkout has two modified blog articles and untracked `images/og/`.
  Task 4 reviewed that patch separately and integrated the applicable editorial
  work and images with corrected claims/metadata; original files remain intact.
- Candidate page sweep: 36 configurations, no recorded page exceptions; English
  phone overflow and legal-language inconsistency reproduced. Full candidate
  quality/infra/browser suites have not yet been run in this planning task.
- Earlier 73 integration / 25 smoke passes belong to the older checkout only.
- Candidate migration contract check passes for three SQL migrations.

See the [design](../specs/2026-10-18-site-wide-readiness-design.md) and
[complete commit inventory](2026-10-18-commit-inventory.md). Treat commit subjects
as an inventory, not independent proof that every claimed fix works.

## Task 1: Establish the candidate and repair dependencies — P0

**Files:** `package.json`, `package-lock.json`; existing tests under `tests/unit/`,
`tests/integration/`, and `tests/smoke/`. Record findings in `TODOS.md` without
removing unrelated entries.

- [x] Confirm branch, clean source state, candidate SHA, and original dirty-file
  inventory. Work only in the isolated tree. Use Node 22 before judging failures.
- [x] Run the existing baseline checks separately so audit failure does not hide
  unit or integration failures. Preserve exit codes and logs.

```powershell
node --version
git status --short
git log -1 --oneline
npm ci
npm run check
npm run supabase:migrations:check
npm run typecheck
npm run lint
npm run deadcode
npm run audit:prod
npm run test:unit
npm run test:integration
```

- [x] Update only affected dependencies within compatible ranges. First inspect
  `npm audit fix --dry-run`; then use `npm audit fix` without `--force`. Review the
  exact manifest/lock diff. Raise the existing `socket.io-parser` override floor
  from `^4.2.6` to `^4.2.7` if it still permits the vulnerable release.
- [x] Confirm installed transitive versions meet these minimum patched versions:

| Package | Candidate lock | Minimum fixed | Source |
|---|---:|---:|---|
| proxy-addr | 2.0.7 | 2.0.8 | [Advisory](https://github.com/advisories/GHSA-jqcg-44mw-7w3h) |
| engine.io | 6.6.9 | 6.6.10 | [Advisory](https://github.com/advisories/GHSA-2gc4-cqfq-p2gv) |
| socket.io-parser | 4.2.6 | 4.2.7 | [Advisory](https://github.com/advisories/GHSA-2m8v-j782-fhvr) |
| body-parser | 2.2.2 | 2.3.0 | [Advisory](https://github.com/advisories/GHSA-v422-hmwv-36x6) |
| qs | 6.15.2 | 6.16.0 | [Advisory](https://github.com/advisories/GHSA-4mjr-xmp4-gh2g) |

These advisories were checked on 2026-10-18. Re-run audit when executing; patched
minimums do not guarantee that no newer advisory exists. Package severity is not
proof of exploitability of this specific deployment.

```powershell
npm ls body-parser engine.io proxy-addr qs socket.io-parser --depth=4
npm run test:ci:quality
```

**Exit:** compatible lockfile, zero production audit findings, all candidate code
gates passing. Investigate failures before changes; add a regression only when a
behavioral defect is reproduced. Do not silence lint or weaken existing tests.

**Result, 2026-10-18:** passed on Node 22.23.3. Full audit: zero findings;
`test:ci:quality`: exit 0, 223 unit and 201 integration tests passed, no skips.
Four pre-existing restore-test failures were fixed by injecting the fixture's
clock, preserving production age/tombstone checks and all assertions. Dependency
and fixture changes are local and uncommitted; HEAD remains `e9412fd`.

## Task 2: Reconcile release instructions and persistence — P0

**Files:** `docs/ROLLOUT-COMPATIBILITY.md`, `docs/BACKUP-RESTORE.md`, `DEPLOYMENT.md`,
`LAUNCH.md`, `CLAUDE.md`, `README.md`, `README_AR.md`, `VERSION`, `CHANGELOG.md`;
validate against `scripts/verify-supabase-migrations.js`,
`scripts/ci/verify-postgres-migrations.js`, and `supabase/migrations/`.

- [x] Correct the rollout list to include all three files, in this order:
  `20260715000000_secure_baseline.sql`,
  `20260715010000_account_resurrection_focus_idempotency.sql`,
  `20260715020000_room_event_idempotency.sql`.
- [x] Reconcile startup/session-secret requirements, provider webhook setup,
  one-writer persistence, complete encrypted backups, and account-deletion
  tombstones against actual code. Retain all fail-closed behavior.
- [x] Replace obsolete three-page/inline-script/old-CI guidance. Reconcile
  `VERSION` (was 1.1.0.0), manifest 1.2.0, and changelog before assigning the
  release version. Never use a version string as proof of deployed source SHA.
- [x] Run `npm run test:ci:infra` on the documented Linux/Docker environment and
  preserve the migration, ShellCheck, container, and Nginx results. Use disposable
  databases; automated tests must not receive production credentials.

**Exit:** the documented sequence matches code, migrations apply in disposable
Postgres, and backup/restore tests preserve deleted-account protections.

**Result, 2026-10-18:** documentation reconciled; Linux Node 22.23.3 infrastructure
gate exit 0 (ShellCheck, all three migrations twice, 19 Docker layers/final
filesystem, Nginx). Selected recovery/migration/startup/deploy tests: 86 passed,
no skips. Windows CRLF shell scripts were normalized only in the disposable
copy to match Git's LF content. `VERSION=1.2.0.0` now matches the existing
changelog/npm baseline, without assigning a new release. Task 1 repairs remain
byte-for-byte unchanged. See [evidence and limits](2026-10-18-task2-evidence.md).

## Task 3: Fix mobile layout and establish page consistency — P1

**Files:** `design-system/landing.css`, `landing.html`, `public/js/halastudy-core.js`,
`public/js/ui.js`, `open.html`, `account.html`, `lobby.html`, `blog.html`,
`privacy.html`, `terms.html`, `404.html`; extend `tests/smoke/landing.smoke.spec.js`
and create `tests/smoke/site-consistency.smoke.spec.js` for cross-page contracts.

- [x] Add an English 390px overflow regression before changing CSS. Reproduce
  document width 444px. Inspect `.community-stats` and `.tile-name`; repair their
  wrapping/width constraints. Do not hide overflow globally to conceal clipped
  controls. Decorative clipped marquee children are not by themselves defects.
- [x] Use this behavior test, importing the existing guarded test fixture:

```javascript
const { test, expect } = require('../helpers/playwright-test');

test('English landing fits a phone viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => localStorage.setItem('halastudyLang', 'en'));
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => document.fonts.ready);
    const dimensions = await page.evaluate(() => ({
        content: document.documentElement.scrollWidth,
        viewport: innerWidth
    }));
    expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
});
```

The fixture blocks external fonts. Also repeat the screenshot check with fonts
loaded as in the recorded reproduction; a mocked-font pass alone is insufficient.

- [x] Make shared language/theme state apply on legal pages, retaining both texts
  in the document and correct per-language attributes. English selection yields
  `html[lang=en][dir=ltr]`; Arabic yields `html[lang=ar][dir=rtl]`. Preserve text,
  contacts, and direct anchors; this is presentation work, not a legal rewrite.
- [x] Align public navigation destinations, active-link state, mobile menu,
  language/theme controls, footer help and legal links. Use shared existing
  utilities; any new shell utility must have one initialization path per page.
  Keep study-room controls separate and reachable.
- [x] Manually inspect AR/EN, light/dark, keyboard, reduced motion, and five widths
  from the design spec. Fix focus traps, clipped labels, and 44px target failures.

**Exit:** no page overflow, no broken local navigation, persistent language/theme,
and screenshots confirm coherent pages without changing the brand.

**Execution — 2026-10-18:** Complete locally, uncommitted. Added the opt-in
public shell utility/CSS, retained the existing preference engines, preserved
legal text and study controls, and passed 68 public browser regressions across
four projects plus final keyboard checks. Real-font sweeps cover 160 page
configurations and 20 final landing configurations. Task 1/2 repairs remain
preserved. See [Task 3 evidence and gate limits](2026-10-18-task3-evidence.md).

## Task 4: Make the landing and blog credible and useful — P1

**Files:** `landing.html`, `design-system/landing.css`, `blog.html`,
`blog-best-study-rooms.html`, `blog-study-with-me.html`; existing landing smoke suite.

- [x] Remove the random-walk active-user counter and simulated community totals.
  Use the fixed bilingual phrase “A quiet room, ready when you are” /
  “غرفة هادئة، جاهزة وقت ما تحتاجها”. Label demonstration media “Room preview” /
  “معاينة الغرفة”; remove simulated LIVE badges. Real counts may be introduced
  later only from an appropriate public aggregate endpoint with an honest zero state.
- [x] Keep one primary room-opening action and a clear lobby action. Explain
  camera/mic expectations and the guest/account distinction before entry.
- [x] Audit every landing/blog feature claim against production RealtimeKit.
  Remove claims for mesh-only or unimplemented capabilities. Preserve illustrative
  labeling until real, approved member media replaces it.
- [x] Review the original uncommitted blog changes and OG assets as a separate
  patch. Integrate only after comparing to this candidate; do not copy whole old
  pages over newer changes. Verify article links, canonical/OG URLs, headings,
  image dimensions, and a working room CTA on each article.

**Exit:** no fabricated traction, no unsupported feature promises, and both
articles lead to a usable study action. This task does not invent new content claims.

**Execution — 2026-10-18:** Complete locally, uncommitted. Removed simulated
activity, labelled previews and clarified entry/account expectations in both
languages. Reviewed the original article patch/OG assets separately, corrected
unsupported claims and metadata, and repaired article tap targets. Quality
passed (223 unit / 201 integration), public browser checks passed 80/80, and
the final article rerun passed 8/8. Real-font sweeps verify all 80 final page
combinations. See [Task 4 evidence and limits](2026-10-18-task4-evidence.md).

## Task 5: Finish create, join, and onboarding states — P1

**Files:** `open.html`, `index.html`, `public/js/index-app.js`, `public/js/ui.js`;
tests: `open.smoke.spec.js`, `create-timeout.smoke.spec.js`, `app.smoke.spec.js`.

- [x] Walk guest and signed-in create → invite → join → leave. Cover valid and
  invalid codes, protected rooms, duplicate submit, room full, expired room,
  failed network acknowledgement, refresh, and retry without retyping.
- [x] Keep optional fields collapsed until chosen; use the existing checkbox-tile
  design and line icons. Put field errors beside inputs, retain values after
  errors, announce pending/success/error states, and keep submit reachable above
  the phone keyboard. Check behavior before editing working flows.
- [x] Verify room code direction, clipboard fallback, invitation links, name
  handoff, and protected-room password handoff in both languages.
- [x] Verify account-required scheduling explains why and returns the user to
  the intended flow after sign-in rather than losing their work.

**Exit:** every path ends in the intended room or an actionable error, never an
indefinitely disabled button. Extend existing tests only for uncovered failures.

**Local result:** completed 2026-10-18, uncommitted. Repaired protected preview
parsing, bounded join waits, duplicate submission, draft return/refresh, field
feedback, clipboard fallback, password scoping and entry accessibility. Final
five-suite browser matrix passed 208/208 across all four projects with no skips.
Final Node 22 quality passed 223 unit / 201 integration tests. Font-loaded entry
checks passed 40 base and 16 expanded/error configurations. See
[Task 5 evidence and limits](2026-10-18-task5-evidence.md).

## Task 6: Make lobby and study sessions dependable — P1

**Files:** `lobby.html`, `index.html`, `public/js/index-app.js`,
`public/js/video/video-client.js`, `public/js/video/realtimekit-client.js`;
existing lobby/video/timer integration, unit, and browser tests.

- [ ] Validate guest viewing versus account-required publishing; distinguish
  empty, connecting, connected, permission denied, device absent, provider
  unavailable, and room-full states. Provide retry or return actions for each.
- [ ] Keep camera/mic state truthful and mic off by default. Verify leaving,
  cancellation, rapid switching, reload, and disconnect stop old media and release
  capacity. Preserve membership-bound authorization and lifecycle fixes already
  present in the 103 commits.
- [ ] Keep timer and media controls reachable on phone; put chat/tasks/schedule
  behind accessible tabs or sheets only where needed. Preserve keyboard focus
  on close and unread/new-state feedback without layout jumps.
- [ ] Test a complete focus session: goal, timer, background/foreground, chat,
  shared task, report action, completion, saved account progress, and rejoin.
  Verify reconnect preserves one identity and avoids duplicate completion credit.
- [ ] Use existing fake-provider tests locally. Separately conduct two-device,
  two-carrier real camera QA and record what each peer sees. A provider token or
  rendered room shell alone does not satisfy real video acceptance.

**Exit:** complete study journey on desktop/mobile with explicit failure recovery;
no false connected state, leaked camera track, or duplicate focus credit.

## Task 7: Complete account and recovery experience — P1

**Files:** `account.html`, `services/auth/auth-routes.js`,
`services/auth/google-routes.js`, `services/auth/oauth-security.js`,
`services/auth/user-mutation-coordinator.js`, `user-store.js`,
`supabase-user-store.js`; existing account/auth/Google tests.

- [ ] Verify signup, password errors, Google cancellation/linking, logout in two
  tabs, session expiry, My Rooms, saved focus progress, and account deletion.
  Preserve session binding, Google-subject identity, and deletion tombstones.
- [ ] Add visible bilingual account-help access using the existing support email;
  never claim password reset email was sent when no reset mechanism exists.
- [ ] Treat self-service password recovery as a bounded feature before general
  password-account launch: uniform request response, rate-limited delivery,
  cryptographically random one-use token stored only as a hash, 15-minute expiry,
  atomic consumption, session revocation after reset, and a safe Google-only
  account path. It needs a separate detailed implementation slice and a verified
  transactional-email configuration; no such configuration was verified here.
- [ ] For that recovery slice, require tests for unknown email enumeration,
  expired/reused tokens, concurrent consumption, delivery failure, and logout
  of previous sessions. Prove delivery with a designated test account before
  exposing the feature. Do not bypass identity checks through support tooling.

**Exit:** existing account journeys verified; recovery is either actually proven
or explicitly retained as a launch blocker. A support link is not self-service recovery.

## Task 8: Performance, accessibility, and content completeness — P2

**Files:** shared styles/utilities and public HTML pages; images/video/audio only
where measured; `public/js/service-worker.js`; existing service-worker tests.

- [ ] Record mobile request weight and loading timings before optimization.
  Inspect font-family/weight requests, hero media, image sizing, and lazy loading.
  Load only used font weights and appropriately sized assets; preserve Arabic
  shaping and poster fallbacks. No blanket asset conversion without measurement.
- [ ] Verify service-worker version updates, offline messaging, and reconnection.
  Cached pages must not imply an offline live session is connected. Preserve the
  existing exclusion of private responses from cache.
- [ ] Check focus order, visible focus, accessible names, error announcements,
  contrast, reduced motion, 200% zoom, and touch targets on every surface.
  Include legal pages, 404, both articles, and admin, not just the landing page.
- [ ] Compare before/after measurements on the same browser/network profile and
  record improvement or explain regressions. Treat numeric performance targets
  as targets, not as measured results when no field data exists.

**Exit:** faster or justified equivalent loading; no inaccessible critical action;
no private caching or stale-client regression.

## Task 9: Operator readiness and complete release verification — P0 gate

**Files:** `admin.html`, `services/admin/admin-routes.js`, `scripts/verify-deploy.js`,
`scripts/deploy-verifier.js`, `docs/ROLLOUT-COMPATIBILITY.md`, `LAUNCH.md`.

- [ ] Verify room inspection, report resolution, kick/ban, typed-confirmation
  force-close, broadcast, video kill switch, provider/cost status, and backup
  freshness. Empty/error/loading states must distinguish no data from failed reads.
- [ ] Run candidate quality, infrastructure, and all four existing browser projects
  on Node 22. Install Chromium and WebKit through the documented Playwright command.

```powershell
npm run test:ci:quality
npm run test:ci:infra
npx playwright install chromium webkit
npm run test:smoke
git diff --check
```

- [ ] Record results by candidate SHA, environment, suite, and unresolved issue.
  Real-provider/physical-device checks remain separate rows with explicit results.
- [ ] Prepare a reviewable release packet: exact diff and SHA, changed behavior,
  all three migrations, verified encrypted rollback artifact procedure, required
  environment variable names, validation logs, screenshots, and rollback build.
  Preserve all 103 commits; publishing is a separate authorized action.
- [ ] Establish deployed backend SHA read-only on the authorized host before
  rollout. The earlier three frontend hash matches do not establish backend SHA.

**Exit:** a reviewable release candidate, not merely green HTTP health endpoints.

## Task 10: Authorized rollout and five-student pilot

**Files:** existing rollout/runbooks; `project-knowledge/sprint-findings.md`,
`project-knowledge/p3-channel-shortlist.md`; root `STATUS.md` / `NEXT.md`.

- [ ] Obtain explicit publishing/deployment/migration authorization for the exact
  candidate and runbook. Follow the corrected additive rollout, one-writer stop,
  complete backup, offline room migration, readiness, and video-enable sequence.
  Do not deploy the old checkout over the candidate.
- [ ] Preserve the required 24-hour observation and 14-day compatibility evidence.
  A rollback must use a verified compatible build, not restore caller-controlled
  identity authorization. No production cleanup follows implicitly from an audit.
- [ ] Run one study session with five real students after real-device QA passes.
  Record join completion, video reliability, session completion, confusion points,
  and whether they return within seven days. Obtain separate authorization before
  sending invitations; use existing channels, not an invented new analytics stack.
- [ ] Update continuity with actual deployed SHA and check results. Keep one
  concrete Now action and at most three Then actions. Commit only when requested;
  project commits precede any separate OS continuity commit.

**Exit:** verified deployment plus observed user evidence. Five participants are
a usability pilot, not proof of retention or market fit.

## Stop conditions and scope discipline

Stop dependent release work if a gate fails, production identity is unknown,
backup restoration cannot be proven, a migration cannot be rehearsed, or camera
QA fails. Continue independent local work and report the exact blocking evidence.
Do not manufacture a passing result by skipping a test or restoring insecure
compatibility. Keep new social, AI, payment, native-app, and matching features out.

This plan is complete as a site-wide roadmap. Task 1 has passed locally;
larger feature slices such as password recovery require their stated design and
delivery evidence before implementation. Later gates and deployment remain open;
the Task 1 evidence does not establish site-wide release readiness.
