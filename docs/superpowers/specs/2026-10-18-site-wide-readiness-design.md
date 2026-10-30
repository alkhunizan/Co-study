# Halastudy site-wide improvement design

## Outcome

Make the existing Halastudy product dependable and polished across its public pages,
accounts, lobby, study rooms, and administration. Aziz confirmed on 2026-10-18:
keep the warm, quiet identity and polish it. The requested deliverable is a fix
and enhancement plan; implementation and production rollout are separate steps.

## Approach

Use local main at `e9412fd` as the candidate baseline. Preserve the 103 commits
ahead of GitHub main `44f062f`; review their combined behavior and dependency
boundaries. These commits include security and persistence changes, not merely
visual improvements. Avoid selective cherry-picking without proving dependencies.

Three approaches were considered:

| Approach | Trade-off | Decision |
|---|---|---|
| Existing identity, reliability first, consistent polish | Preserves completed work and tackles observable defects | Recommended; matches Aziz's preference |
| Visual redesign first | Delays resolving deployment and security gaps | Excluded from this scope |
| Rebuild the frontend/framework | Adds migration and regression work without an established need | Excluded from this scope |

Keep vanilla HTML/CSS/JavaScript, Express, Socket.IO, RealtimeKit, and the existing
Supabase/backup architecture. Maintain one production writer. Preserve Arabic-first
behavior, English parity, paper/night themes, karak accent, and existing typefaces.

## Evidence and limits

The earlier checkout `0e3d477` passed 73 integration and 25 Chromium smoke tests
on this machine. Those results do not validate the newer candidate. Its 103-commit
delta changes 177 files. Node on this machine is 24.20.0; the project requires 22.x.

On the candidate, a read-only local browser sweep covered nine routes at 390px
and 1440px in Arabic and English: 36 page configurations. No page JavaScript
exceptions were recorded. This was page inspection with local test state, not a
complete journey, accessibility, performance, or real-provider certification.
Screenshots and JSON are under `output/site-review-2026-10-18/` (ignored runtime
evidence). The migration contract command passed and reported all three SQL files.

| Finding | Evidence | Required outcome |
|---|---|---|
| English landing overflows on a phone | At 390px, document width is 444px; `.community-stats` measures 424px | Responsive content without horizontal page scrolling |
| Legal pages ignore saved English preference | `/privacy` and `/terms` retain Arabic document language in both viewport sizes | Shared language/theme behavior while preserving both legal texts |
| Simulated activity appears live | `landing.html` starts at 17,264 and calls a random-walk counter | Clearly labeled demo content, no invented active-user totals |
| Navigation varies between sections | Landing has full navigation; account, blog, lobby, and legal pages expose different subsets | Consistent way to reach rooms, lobby, account, help, and home |
| Password recovery has no route/UI | Account form and auth routes contain no forgot/reset flow | Explicit account-help path now; secure self-service recovery before general password-account launch |
| Rollout inventory is incomplete | Runbook lists two migrations; verifier reports three | Runbook and migration checks agree on all three files |
| Guidance is stale | `CLAUDE.md` still describes three pages, inline room logic, and outdated CI | Instructions match actual routes, extracted JS, tests, and production media |

The legal pages deliberately contain both languages today; this is a consistency
improvement, not proof that English legal content is missing. No legal wording
changes are proposed. The scope does not certify legal compliance.

## Experience contract

- A first-time visitor understands silent shared study, camera expectations, and
  guest versus account access before entering a room. One primary action opens a
  room; a secondary action opens the lobby.
- Create/join preserves names, room codes, language, theme, and protected-room
  handoff. Loading, errors, retry, cancellation, and empty states have useful copy.
- The lobby distinguishes watching, publishing, connecting, unavailable video,
  full capacity, and an empty room. Never display a false connected state.
- The study room keeps timer, camera/mic, leave, and help reachable on a phone.
  Chat and tasks remain accessible without covering media controls. Reload,
  reconnection, background timer recovery, and leaving have predictable outcomes.
- Accounts communicate guest benefits and account benefits honestly. Sign-in,
  Google linking, logout, saved progress, and deletion give explicit feedback.
- Public navigation uses the same language/theme controls and destinations.
  In-room navigation remains compact so study controls remain immediately usable.
- Content and marketing promises match production RealtimeKit functionality.
  Mesh-only blur/focus features must not be advertised as generally available.
- Admin controls expose real state and actionable failures; destructive operations
  retain typed confirmation and authorization.

## Quality and release contract

Verify 360, 390, 768, 1024, and 1440px; Arabic/English; light/dark; keyboard focus;
reduced motion; Chrome and WebKit; loading, empty, error, success, and reconnect
states. Touch controls must meet the existing 44px design requirement. Preserve
visible focus and readable text. No fake user counts or unimplemented promises.

All existing candidate quality, infrastructure, and four browser-project gates
must pass with Node 22. Real RealtimeKit/OAuth and two-carrier camera checks use
designated test identities outside automated local tests. Provider credentials
never enter test processes. Publishing, migrations, and deployment require the
user's explicit authorization under root AGENTS.md.

## Boundaries

Keep billing, matching, social feeds, native apps, and a framework rewrite out of
this release. Preserve existing uncommitted blog edits and `images/og/` in the
original checkout. Add no new analytics vendor merely to assess five beta users.
Account-recovery delivery configuration is a named external dependency, not an
assumed working email service. Record unverified items explicitly.

## Related

- [Execution plan](../plans/2026-10-18-site-wide-readiness-plan.md)
- [Commit inventory](../plans/2026-10-18-commit-inventory.md)
