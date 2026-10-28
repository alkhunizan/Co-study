# Findings and correction ledger

All findings below concern local source or synthetic fixtures. Independent source reviews are retained under audit/; their line references/hashes describe the pre-correction candidate. Final acceptance results belong in VERIFY.md and the command ledger, not in these intermediate reports.

| ID | Finding / impact | Correction and evidence |
|---|---|---|
| R01 | Form reset cleared numeric defaults and selected the first priority. | Set defaultValue/defaultSelected when mounting fields. Browser creates a task/routine with defaults and checks estimate 25. |
| R02 | Task creation required scrolling past a long form. | Optional details collapse; the title and primary action stay simple. Actual-font mobile/desktop review captures the result. |
| R03 | Lost-response task retry changed generated checklist IDs and conflicted with the committed request. | Stable per-position IDs plus the original request key. The browser aborts the response after server commit, retries, and asserts one task. |
| R04 | Study errors/reminders lived in a hidden panel on other destinations. | Global status/reminder surface with announcements and retry, without replacing drafts. |
| R05 | Saved room/agenda links used an unsupported URL. | Reuse the established `/study?room=` join route. Browser asserts the saved href; standard room access remains enforced. |
| R06 | Reminder checkbox submitted an empty value, leaving opt-in false. | Native checkbox value is `on`; browser enables, receives and dismisses a real synthetic appointment reminder. |
| R07 | Marking a reminder delivered before dismissal could hide it after navigation. | Only dismissal persists; page delivery deduplicates independently. Browser reload after dismissal stays quiet. |
| FS-01 | Routine countdown continued after ordinary/other-tab focus pause. | Reconcile matching authoritative pause/resume/completion. Browser pauses with the ordinary control and from a second tab, then reloads. |
| FS-02 | Resource draft and retry key disappeared on language rerender. | Preserve same-circle, same-owner fields and key; clear after acknowledged save or scope change. Browser fills resource fields, switches to Arabic, verifies and saves them. |
| FS-03 | An active unlinked focus disabled task selection. | Disable only an immutable existing link; offer explicit Attach and retain it after reload. Browser exercises start-unlinked → attach → reload. |
| FS-04 | A mismatched routine blocked its own Stop action. | Stop can detach guidance while leaving a newer session untouched. Multi-tab test verifies the replacement session ID remains current. |
| FS-05 | New insights heading overwrote Account's optional-telemetry heading. | Use studyInsightsTitle; Account browser assertion checks the original privacy counter heading. |
| FS-06 | Shared-cookie account switch could reuse stale tab identity/drafts. | Expected-account header on study requests; reject mismatches before data access/mutation, refresh identity on focus, and reload safely. Browser changes the cookie account and verifies no cross-account draft is created. |
| FS-07 | A late background journal response could replace a newer search/cursor. | Request generations and query-edit cursor invalidation. Browser deliberately releases the older response last and retains the newer result. |
| FT-01 | Cached agenda could disclose a private title after membership/account revocation. | Before delivery, recheck authenticated agenda and preferences; invalid data clears the reminder. Server removal tests also verify agenda/calendar/resource denial. |
| FT-02 | Reopen/unresolve transitions could bypass active-item limits. | Enforce the same limits on transitions and bound total saved lists. Integration tests fill active lists and deny reopening until an item is archived. |
| FT-03 | Potential PostgreSQL user/room FK lock inversion between bookmarks and scheduling. | Bookmark takes room key-share before account lock. Real PostgreSQL test proves it waits on the room while the scheduling transaction can acquire its creator FK lock; then both complete. |
| R08 | Same-document navigation reused old circle membership after changes on another surface. | Refresh on Study/Circles navigation and planning entry; hide removed circle details. The community browser test now completes after fixture-created membership changes without forced page reloads. |
| R09 | A closed routine could consume paused time when another surface paused it before return. | Restore against the matching server pause timestamp before reconciling. A browser return with its clock an hour later must show Resume and remaining time. The counterfactual test fails before the fix; the six-case after run and final full CI pass. |
| QA01 | Browser language fixture overwrote every tested preference. | Set the initial preference only when absent. Matrix asserts actual html lang/dir/theme. |
| QA02 | Asynchronous resume was clock-advanced before acknowledgment. | Await visible Running/Pause state before advancing the controlled browser clock; assertions remain unchanged. |
| QA03 | Legacy camera canvas-track test failed once during the broad run. | Isolated rerun on identical source/browser settings passed. No camera code, assertions or coverage changed. The complete final CI rerun passed, including every previously unexecuted case; both records are retained. |

No confirmed critical/high source finding remains in the independent reviews. Source-inferred findings were treated as candidates until exercised or corrected with a focused test. No essential one of the selected twenty is deferred. Provider/device production acceptance remains a separate release boundary.
