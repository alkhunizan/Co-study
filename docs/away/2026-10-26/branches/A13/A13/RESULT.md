# A13: Circle refresh recovery and schedule feedback

Status: local qualification completed. All twelve A13 browser checks, final static checks and 169 integration tests pass. The full browser run records 94 passed, one known expired-date fixture failure and one external-font skip. The production dependency audit retains its existing advisory; this is not an all-green release gate.
Source/tests freeze: `35cf9ba885bae99b32cb41ad4bdf4b542c5a67fb`; final application change: `a4cdf2c4e401595ef5fdbd7df2f4af3bc351db81`.
Branch: `away/2026-10-26-1834-A13`, independently based on `c4d6c50`.

## Changes and acceptance

The circle panel now offers the existing localized core retry control when its detail refresh fails, including during translation. Retry keeps the mounted schedule form and selected room, and ignores obsolete circle failures. It uses the existing action wrapper to clear the old notice at retry initiation; its completion cannot erase newer feedback. Schedule saves capture their originating view so delayed success feedback cannot appear on Account. No A03 commit was imported; the three same-circle room-preservation lines necessarily overlap A03's independent correction.

The only application file changed is `public/js/platform.js`. Existing callers still receive current read errors; the added recovery UI does not suppress their error handling. The retry is inside the Circles panel and uses the existing localized message, native button, status role and 44px minimum hit target. No HTML, CSS, backend, authorization, billing, dependency, provider or configuration change was made.

| Acceptance | Before | After |
| --- | --- | --- |
| Failed detail refresh during translation offers localized retry and retains the draft. | No retry exists; the circle detail disappears silently. | Pass in AR/EN at both 390 and 1440px. |
| Repeated failure stays recoverable; successful retry preserves mounted form, chosen room, title and start time. | The first missing-retry assertion fails. | All four localized/width cases pass, including keyboard Enter and explicit recovery. |
| An older failure cannot replace the newly selected circle with recovery UI. | Positive control passes. | Pass. |
| Delayed schedule success stays off Account; same-view success remains localized and one actual session persists. | Account visibly displays `Saved.` after the held save response. | Pass in EN1440 and AR390, with independent server reads. |
| A normal View failure clears after successful Retry, while newer errors and another view remain protected. | Cross-review reproduction fails in EN1440/AR390: the global service-unavailable message remains beside loaded data. Both newer-feedback positive controls pass. | Both recoveries and newer-feedback controls pass. A separate rejected-retry-after-navigation control also passes; recovery remains available on Circles. |

[Acceptance recorded before edits](ACCEPTANCE.md). Unchanged-base provenance: [before-source.json](before-source.json). Frozen final source: [source-hashes.json](source-hashes.json).

## Evidence

- `../evidence/a13-before.log`: two expected failures and one passing obsolete-circle control, 58.5 seconds. The application was unmodified. Screenshots, trace and video remain under `a13-before-results/`.
- `../evidence/a13-after.log`: initial 7-case correction passed, no skips/flakes, 32.3 seconds. JSON: `a13-after-browser.json`; screenshots: `a13-after-results/`. The test bytes are identical in that initial before/after pair.
- `../evidence/a13-view-before.log`: the normal View follow-up reproduces two failures and retains two positive controls (1.2 minutes). Application source remains `20108c2`; [provenance](view-before-source.json). The only subsequent test-style edit in those four cases changes equivalent selector concatenation to a template literal.
- `../evidence/a13-final-targeted.log`: all 11 cases passed after the retry-wrapper correction, 40.3 seconds. `../evidence/a13-rejected-retry-control.log`: the added rejected-retry-after-navigation control passed, 13.3 seconds. This is twelve distinct passing focused checks across two runs, not a claimed single twelve-case run.
- `../evidence/a13-final-browser.log`: all twelve A13 cases also pass together within the final full run. Its complete result is 94 passed, 1 failed, 1 skipped, zero not-run cases (10.6 minutes; launcher 636.84 seconds, exit 1). All app/lobby camera cases and the following app cases passed; no separate A13 camera run was needed.
- The focused runs preceded the local source commit, so their launcher receipts name the base HEAD. `before-source.json` and `source-hashes.json` distinguish the actual tested application bytes; the latter identifies the frozen committed source.
- Fixture uses one synthetic owner, the local simulator to obtain its existing circle entitlement, two local rooms and two private circles. The browser exercises the real local API; controlled reads and a held successful POST create the failures. No real payment/provider or production request was made.
- [Owned server receipt](server.json). The final full run stopped fixture PID 18232. No remaining A13 Node process was observed afterward.

## Visual and source review

Inspected Arabic 390px retry/recovery, English 390px and 1440px retry, Arabic 1440px retry, the before English Account notice and the clean after Arabic 390px Account screenshot. The retry remains readable and reachable, RTL placement is correct, and the recovered form retains its chosen room and bilingual title. Browser assertions also check horizontal overflow. These are offline fallback-font screenshots, not proof of external font availability.

Also inspected the normal View follow-up's Arabic 390px before/after screenshots: before, a red service-unavailable status remains above successfully loaded circle data; after, that stale status is absent and the recovered controls and persisted sessions remain readable.

Reviewed the exact diff and flow-relevant one-hop code in `halastudy-core.js`, the mounted controls in `platform.html`, and the current circle request/view guards. No new endpoint, public data field, authorization bypass or unbounded request was introduced. The existing core request deadline and server access checks remain responsible for network and ownership enforcement.

Cross-review identified the normal View feedback gap; the additional browser failures and correction are retained above. The final callback uses the existing `work()` origin capture, which is already in the base source. The rejected-Retry control confirms it does not leak an error to Progress. Integration note: A03 and A13 both preserve the selected room for the same circle, so future integration must keep one copy of that behavior.

The parent's A11 guide correction was reviewed read-only against the base, including `storeRoutine`, reconciliation, `bindFocus`, the routine state machine and its four focused tests. No concrete issue was found: a successfully returned session and running guide are stored before task binding can reject; finalization persists and renders the actual state; a rejected Start leaves the ready guide unchanged.

Read-only review of the shared review page's earlier 17:23 UTC snapshot found stale pending counts and the earlier A13 source identifier. Its 15 unique local HTML references and links from all eight branch reports resolved. The current packaging helper's UTF-16 decoder/count parser and dynamic source identifier correctly read the runtime evidence; the parent will regenerate the snapshot after final receipts. No shared review/helper file was edited.

## Qualification and release boundaries

Final syntax, type checking, lint and dead-code checks passed on `35cf9ba`; the receipt labels begin `a13-final3-`. Lint reports four existing informational findings. Final integration passed 169/169 once on the final source, with no skips or cancellations (261.5 seconds); `../evidence/a13-final3-integration.log`. Its launcher names documentation descendant `59a3a5f`, whose application/test bytes remain those of `35cf9ba`. The earlier integration pass is retained as historical evidence, not substituted for this final run.

The full browser failure is the unchanged `ux-return.smoke.spec.js:118` fixture, whose October 24/25, 2026 dates are now past. A00 repairs that test independently; its change is not included here. The sole skip explicitly requires online fonts. The final production dependency audit exits 1 for the existing high-severity `body-parser` advisory GHSA-27r3-jxmh-p828; `../evidence/a13-final3-audit-prod.log`. Dependencies were not changed under the away constraints. No frontend build command exists. All browser loads are local and offline; hosted providers and real fonts are outside this qualification.

[Final source equality receipt](final-source-equality.json) independently recomputes and compares both captured manifests and every entry. All 183 files match before/after the full browser run, both tracked-source states are clean, both `.env` presence checks are false, and the application/test hashes match the frozen source. Exact manifest: `8b79c64da687c2b172ea2aea09c11ec95796790cbe1a572ad37db0032e69265d`. Both captures name documentation descendant `455f72d4e7d663076823b26e825e086e3abea7f3` of source freeze `35cf9ba`; `allChecksPass` is true.

Local commits only. No push, merge or deployment. The existing protected HTML script version and one-hour JS cache window remain a release integration concern, as in A03. The original working checkout and unrelated work were untouched.
