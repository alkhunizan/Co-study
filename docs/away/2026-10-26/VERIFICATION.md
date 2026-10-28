# Independent local verification

Status: independent local verification is complete with the failures and reruns below retained. Nothing has been merged, pushed, published or deployed. These branches are independently based on committed baseline `c4d6c50553f55704b4d4a788db28b05fa983047a`; they do not include the original checkout's unfinished changes. A combined integration has not been tested.

| Item | Frozen application/test commit | Focused checks | Integration | Static checks | Full browser |
| --- | --- | --- | --- | --- | --- |
| A00 future DST fixture | a85fb87 | 1 pass | 169/169 | 4 pass | 78 pass, 1 camera failure, 1 font skip, 4 not run; isolated app suite 8/8 pass |
| A01 checklist preservation | 88ef3d2 | 4 pass | 169/169 | 4 pass | 86 pass, 1 known date failure, 1 font skip |
| A02 focus action retry | bc7f2ec | 8 pass | 168/169; separated failed-case rerun passes | 4 pass | 85 pass, 2 failures, 1 font skip, 4 not run; isolated app suite 8/8 pass |
| A03 workspace refresh order | eceecdd | 8 pass | 169/169 | 4 pass | 90 pass, 1 known date failure, 1 font skip |
| A04 truthful planner feedback | 7a1a11f | 8 pass | 169/169 | 4 pass | 85 pass, 2 failures, 1 font skip, 4 not run; isolated app suite 8/8 pass |
| A11 guided focus recovery | 19c4c5b | 4 pass | 168/169; recovery fixture unresolved | 4 pass | 81 pass, 2 failures, 1 font skip, 4 not run; isolated app suite 8/8 pass |
| A12 new-session completion | 0a8b1a05 | 6 pass | 169/169 | 4 pass | 88 pass, 1 known date failure, 1 font skip; camera group passed |
| A13 circle feedback recovery | 35cf9ba | 12 pass | 169/169 | 4 pass | 94 pass, 1 known date failure, 1 font skip; camera group passed |

The four static checks are syntax, TypeScript checking, Biome lint and Knip dead-code analysis. No frontend build script exists. All branches retain the existing production audit failure: one high-severity body-parser advisory, [GHSA-27r3-jxmh-p828](https://github.com/advisories/GHSA-27r3-jxmh-p828). The away backlog excludes dependency upgrades; no lockfile was changed to conceal that gate.

There are 51 focused browser checks across these branches, including the repaired existing DST test. Repeated baseline integration/browser suites are not separate unique coverage. Per-branch full browser failures from the old date fixture are retained; A00 verifies its correction independently and has not been cherry-picked into other branches to make their reports green.

## Unresolved and intermittent checks

- A02's final integration run failed the unchanged Supabase success-control request configured with a 100ms timeout. A solo process still overlapping other work also failed. With no other browser/integration batch active, the exact test passed unchanged, including its stalled-body AbortError assertion. This is an intermittent control, not a wholly green rerun. All artifacts are preserved. Diagnostic cold/warm timing is supporting evidence only.
- A11's final integration run failed `recovery.integration.test.js:89`: the helper's JSON.parse saw an incomplete input while obtaining its synthetic local message. The cause is unresolved. The subsequent read-only inspection was rejected by the away guard; neither that command nor an equivalent inspection was retried. See [guard decisions](GUARD.md).
- The camera case passed in the frozen full runs of A01, A03, A12 and A13. It failed in A00, A02, A04 and A11, leaving four serial cases unexecuted per affected run. After all broad suites stopped, each affected branch passed its original8-case app suite alone; all previously unexecuted cases now have passing evidence. Source manifests matched before/after every rerun. This is intermittent behavior with an unproven cause, not a claim that machine load has been diagnosed. No camera code, assertion or timeout changed. The original full-run failures remain in the table.
- A00's fixed DST case passed in its broad run. Its app-source baseline is unchanged. No branch received another branch's fix to manufacture a green full-run result; a single fully green combined broad run is not claimed.
- The camera pipeline is inline in `index.html` (including startBlurPipeline and camera toggling), one of the original pre-existing dirty files. A correction there must be integrated with that existing work; this run does not overwrite it or weaken its privacy assertions.
- External fonts were deliberately blocked in all browsers. The font-delivery test is skipped for that reason; screenshots prove fallback layout only. Real media/hardware, notification delivery, OAuth, recovery-mail/payment providers and hosted database acceptance remain unverified.

## Reproduction and source integrity

Use the saved `scripts/run-check.ps1` launcher with the recorded runtime, label and task. It uses Node22.23.3, clears application cloud/provider settings in its child process, does not copy a source `.env`, selects disposable local storage and blocks external browser requests. Each fixture owns its server lifecycle and a separate port. Command ledgers record the exact runtime, Git HEAD, Node version, exit code and elapsed time.

`run-browser-queue.ps1` runs each remaining frozen branch alone, refuses a `.env` file or dirty tracked source, and compares code/config/test manifests before and after each browser suite. Documentation-only commits may change the branch tip without changing the application/test manifest. The manifest filter is explicit in `capture-source.cjs`; it covers182 baseline or183 extended tracked code/config/test files, not a claim to hash every historical image or document.

## Integration and release boundary

A01, A04 and A11 touch separate parts of study-workspace.js. A02 and A12 both touch focus-client.js. A03 and A13 share same-circle selected-room retention; integration should retain one copy of that behavior. No combined branch, conflict resolution or combined acceptance is claimed.

For every branch, phase8 stops before rebase, push or deployment: the production dependency audit fails and the isolated origin cannot be reconnected under the current guard. No remote PR or CI run exists, no merge/deploy lock was taken, and no rollback was needed. This is a held release assessment, not an attempted release or a passing CI claim. There is no frontend build command to substitute for the missing hosted acceptance.

The original committed baseline is53 commits ahead of main44f062f4dede4d1beb5b5c0ec881057cb7549584, read from the existing origin. Integrating these branch deltas alone does not reconcile that larger unpublished release change. Hosted migration/backup and provider acceptance must be addressed before selecting a production candidate.

The original22 pre-existing edited tracked source files match their saved hashes. The isolated source includes no copied `.env`. Public production checks used exactly two anonymous GETs: home200 and `/app`404. No production browser, paid API, live data mutation or actual message was sent. The isolated origin remains its local bundle because reconnecting it was denied. Release also requires the existing hosted migration/provider gates. Final queue receipts are in the A01 evidence package as browser-queue.json and app-isolation.json.
