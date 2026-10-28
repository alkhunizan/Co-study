# A04: truthful planner feedback (includes A05 translation)

Source: existing F01-F20 failure-path and bilingual acceptance contract.
Acceptance before implementation: successful mutations followed by failed refresh explicitly say saved but not refreshed; retry fetches one saved record; failed mutation retains the draft and translates with AR/EN switching; successful read-only journal search does not announce a save. Cover 1440px English and 390px Arabic, including empty results and local 503.

No payment, authentication, schema, or HTML changes. Existing draft/retry semantics and server scope remain intact.

## Local result

Application/test commits:2981761 (truthful bilingual feedback),7a1a11f (superseded-result propagation). Baselinec4d6c50.

- Six initial browser cases failed before the change for the expected feedback/translation defects. All six passed after the snapshot-aware language correction.
- Cross-review found that a discarded old load could still overwrite newer feedback through its form callback. The recorded exact-source VM demonstration is `../evidence/a04-stale-before.json`.
- Two real-server race cases now cover an older failure after newer success and older success after newer failure. Both assert that the task and project were stored once. The full focused suite passed8/8 in `../evidence/a04-stale-after.log`.
- The form wrapper distinguishes successful refresh, failed refresh, and an obsolete response. The same obsolete result propagates through journal and resource refreshes.
- Representative Arabic390 partial-save and1440 retained-draft/error screenshots were visually inspected. These use blocked external fonts and prove fallback layout only.
- Initial2981761 static checks and169 integrations passed. Final7a1a11f also passed all4 static gates and169 integrations. The full browser run finished85 pass,2 failures (privacy blur and past-date fixture),1 offline font skip,4 app cases not run after the serial camera failure. All8 new planner cases passed again; source manifests matched. Existing body-parser production audit remains FAIL. No production release or remote PR.
- Independent read-only review confirmed the sentinel is respected by the form callback and both primary/journal/resource refresh stages, including reflection propagation. No further issue found in this scoped correction.

After the broad queue ended, the original app suite passed8/8 alone in a04-app-isolated.log. Privacy blur and all four previously unexecuted cases passed; manifest1725dea00f96338555109c2c40d67dff77b73d528ad7ad3f17e64c7efb56c461 remained unchanged. Both the original failure and passing isolated receipt are retained. The camera result is intermittent, with its cause unproven; no camera implementation, assertion or timeout was changed.
