# A03: Workspace refresh and schedule state

Status: implemented and verified locally; branch qualification completed with the existing dependency advisory and expired-date browser fixture still failing.
Source commit: `eceecddba8e089274a8c206fef0a406bfa3ee09a`.
Branch: `away/2026-10-26-1834-A03`.
Runtime source hashes: [source-hashes.json](source-hashes.json).

## What changed

`public/js/platform.js` now keeps asynchronous workspace results in the correct order and view. A delayed refresh cannot overwrite newer room data, show its failure on another page, or replace a focus state updated since that refresh began. Translating or refreshing the same circle retains the selected scheduling room; an unavailable selection becomes invalid instead of silently switching to another room.

The only application file changed is `public/js/platform.js`. There are no backend, schema, authorization, billing, dependency, styling or configuration changes. Test setup uses the existing local payment simulator solely to create a synthetic circle owner.

## Acceptance and evidence

| User-observable acceptance | Before | After |
| --- | --- | --- |
| A delayed Groups failure stays off Account; an active-view failure is localized and navigating back after recovery reloads data. | EN 1440 and AR 390 both display the stale failure on Account. | Pass in EN/AR at 390/1440 with light/dark coverage. |
| Newer refresh data survives a later older result; a superseded failure cannot replace a successful same-view retry. | Older room name replaces the newer room name. | Both controls pass. |
| Starting focus while a workspace read is pending retains the active focus UI and supports pause/complete. | UI changes to “Ready when you are” while the independent server read says active. | Active UI retained; real pause/complete pass. |
| Translating a schedule draft preserves its selected room and text through save. A vanished room requires an explicit valid selection. | Arabic switch silently selects the first room. | Draft preserved; missing-room native validation passes; independent server assertion confirms one session in the chosen room. |

- Original three failing cases: `../evidence/a03-before.log` and `a03-before-results/`.
- Focus and schedule failing cases: `../evidence/a03-nearby-before.log` and `a03-nearby-before-results/`.
- Final eight cases: `../evidence/a03-verified-targeted.log`, 8 passed in 44.5 seconds; screenshots and JSON under `a03-verified-targeted-results/` and `a03-verified-targeted-browser.json`.
- The intermediate six-case run passed five; case six hit the existing five-signups/IP fixture limit. The test fixture now uses distinct reserved synthetic proxy addresses. The production rate limiter is unchanged.
- The initial test typecheck found uninitialized deferred callback types. Corrected; subsequent typecheck passed.
- Server PID/stop receipt: [server.json](server.json). Only owned fixture processes are stopped. No production request was made.

## Visual and quick review

Visually inspected the final Arabic mobile recovery, English mobile dark error, Arabic desktop dark Account and Arabic mobile scheduling screenshots. Text stays readable, controls remain reachable, and the intended room and retained Arabic title are visible. The navigation cases also assert no horizontal overflow. Browsers are deliberately offline: these images verify the fallback-font state, not external font availability.

The exact application diff and flow-relevant regions of its one-hop dependencies were reviewed: `platform.html`, `halastudy-core.js`, `focus-client.js`, `study-workspace.js`, `platform-copy.js`, `platform.css` and the corresponding platform API handlers. Existing server authentication/ownership checks remain in force; there are no new endpoints, network destinations or public data fields. The core request helper still owns its 15-second deadline. Rendering uses existing text nodes and status announcements. No P0/P1 introduced by the changed lines was found.

Sibling checks: navigation errors capture their origin view; latest-success and latest-failure guards are paired; focus restoration respects later actions/heartbeats; same-circle draft retention does not carry a removed room into submission. The existing circle-detail request counter remains unchanged.

## Qualification and limitations

- Final syntax, typecheck, lint and dead-code checks passed. All 169 integration tests passed (270.5 seconds, no skips); `../evidence/a03-final-integration.log`.
- Full browser qualification: 90 passed, 1 skipped, 1 failed in 13.6 minutes; `../evidence/a03-final-browser.log` and `a03-final-browser-results/`. All eight A03 cases passed again. Both baseline camera cases and the broad responsive/accessibility matrices passed. The sole failure is the pre-existing `ux-return.smoke.spec.js:118` fixture expecting a session on October 24, 2026, which is now in the past. The skipped case explicitly requires online fonts. The runner exited 1; this is not an all-green release gate.
- The integration launcher was started before the source commit was created, so its command receipt names the baseline HEAD. The tested working-copy source is recorded by `source-hashes.json`; those hashes still match the frozen application and test files in `eceecdd`.
- No frontend build command exists in this vanilla HTML/JS project.
- The final production audit independently reports one existing high-severity `body-parser` advisory, GHSA-27r3-jxmh-p828, and exits 1. No dependency upgrade was attempted under the away constraints. Evidence: `../evidence/a03-final-audit-prod.log`.
- Local commit only. Remote publication is held because the away guard rejected the isolated clone remote change. No push, merge or deployment occurred.
- Existing uncommitted original-checkout files were not modified. Hosted providers, production data and font availability remain outside this local verification.
- Deployment freshness: the protected `platform.html` still uses the existing script version query and `/js` responses cache for one hour. Release integration should account for that cache window or reconcile the version query with the in-flight HTML work.

## Work log

2026-10-26: Reproduced asynchronous navigation/refresh failures, verified their cause, and made the bounded one-file correction. Additional focused checks reproduced and fixed lost focus presentation and schedule-room draft selection. Completed the coordinated branch gate and returned its exact results to the parent. The final full run used descendant documentation commit `c6a7140`; application and test source hashes remain those in `eceecdd`. The owned A03 fixture process, PID 10984, stopped and is no longer present.

## Independent parent-change review

Read A01 `88ef3d2` and A04 `2981761` separately without changing or combining their sources. A01's new checklist IDs remain stable across an identical retry and fit the server's 40-character limit. Server normalized-equality handling precedes version rejection, so an already-committed identical update can be acknowledged on retry. A04's platform-state snapshot is compatible with A03's successful-render event and prevents language-only renders from clearing planner feedback.

One concrete A04 issue was returned to the parent: an obsolete `load()` failure returns `false`, and the new form wrapper then overwrites a newer successful refresh's status with `studySavedRefreshFailed`. A controlled Node VM executed the exact unmodified `form()` and `load()` source from `2981761`: after newer success the message was `studySaved`; after releasing the older failure it became `studySavedRefreshFailed`, even though the guarded `failure()` callback ran zero times. [Proof JSON](reviews/a04-stale-feedback.json). The parent owns the reproduction/correction in A04; A03 application source remains unchanged.

The parent's subsequent working-tree correction was reviewed read-only against `2981761`. Its distinct obsolete sentinel reaches the form wrapper through the primary load, journal load, reflection and circle-resource paths; current failures retain their error outcome while stale success and failure are ignored. Both new overlap tests cover the opposing feedback directions. No further concrete issue was found in that correction. This is a source review, not a claim that A04's full gate has completed.
