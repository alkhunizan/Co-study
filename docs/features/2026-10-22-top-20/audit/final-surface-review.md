# Independent final surface review

2026-10-22. Read-only review of the current feature candidate against base `3091b0e`: `study-workspace.js`, `study-routine.js`, `study-copy.js`, platform hooks and the new feature tests. No application edits, broad checks, browser probes or external actions. References describe review-time code; the primary agent is correcting and browser-testing the candidate concurrently.

## Concrete findings

### FS-01 — Routine countdown disagrees with ordinary focus controls and other tabs

`public/js/study-workspace.js:226-229` handles authoritative completion but not matching-session pause/resume. `renderGuide()` disables only the ordinary Start control (`149`); the existing Pause/Resume remains active in `public/js/platform.js:521-522`.

Trigger: begin a routine, then use the ordinary Pause button or pause from another tab. Server session becomes paused while guide status remains running and its countdown continues. Reload restores the saved running guide. The inverse occurs when generic Resume resumes a guide-paused session.

Minimal correction: synchronize matching routine guidance with authoritative active/paused states, including reconciliation after restore. Preserve actual remaining time when pausing and avoid counting paused wall time. The primary agent accepted this finding and is adding normal-control/second-tab browser cases. Current smoke tests use the guide’s own Pause only (`tests/smoke/study-tools.smoke.spec.js:51-55`).

### FS-02 — Same-circle resource draft is destroyed by language changes

`study-workspace.js:207` clears `resourcesRoot`; `211` rebuilds the resource form; `230` invokes the reload on language change. `platform.js:492` also reselects the circle, dispatching a transient null and a renewed circle at `204,212`.

Trigger: type resource title/URL/note, switch Arabic/English. The fields and request key disappear. A lost-after-commit resource submission followed by this rerender also loses the idempotency key for safe retry.

Minimal correction: preserve same-circle form values/request key across rerenders; clear only on acknowledged creation or intentional circle/identity change. The primary agent accepted this finding. Existing draft smoke checks only the task title (`study-tools.smoke.spec.js:126`).

### FS-03 — Cannot attach a task after starting an unlinked session

`study-workspace.js:152` deliberately allows the task selector while an active session has no link, and offers Attach. Its `halafocuschange` handler (`226`) instead disables the task selector for every active/paused session. Generic Start publishes that event, then `bindFocus()` returns without rendering when no task was preselected (`113`; platform Start hook `platform.js:520`).

Trigger: select no task, start ordinary focus, then choose a task to attach. Selector remains disabled and Attach hidden until another load.

Minimal correction: use one consistent enabled rule, keyed to the actual session/link. Browser regression: start unlinked, choose task, attach, reload and verify the exact persisted session link; linked sessions remain immutable.

### FS-04 — Stale routine cannot be stopped when the current session changed

`study-workspace.js:118` throws `routineChanged` before branching on the action, including `stop`. This prevents the Stop action (`133-135`) from detaching stale guidance while a different session is active, even though the message explicitly tells the user to stop the routine.

Trigger: one tab completes the routine’s session; another session starts while the first tab still has stale routine state. Stop throws rather than dismissing guidance.

Minimal correction: allow Stop to clear local routine state without pausing/completing a mismatched session. Regression must assert the unrelated active session is untouched.

### FS-05 — New insight title overwrites existing privacy-counter title

`public/js/study-copy.js:24,51` defines `insightsTitle` and merges it into the shared dictionaries (`61`). The same key already describes optional on-device counters in `platform-copy.js:210,230`, and Account still uses it in `platform.html:165`.

Result: Account’s optional local-counter heading becomes “The shape of your focus” / “ملامح تركيزك”, weakening the explanation of consent. The insight section at `study-workspace.js:171` is the new consumer.

Minimal correction: namespace the new title, keeping the existing account heading. Verify both headings in both languages after a toggle.

### FS-06 — Same-browser account switching can mix cached identity and newly fetched study data

Source-supported browser candidate: `study-workspace.js:201-203` reads only cached `HalaPlatform.context().user`, fetches using shared cookies, then checks results against that same cached identity. The platform’s `user` is set at boot, and the new module refreshes neither auth on tab focus nor auth-change events. Existing `HalaAuth` also caches its result until explicit refresh.

Trigger to verify: two tabs in one browser context; Tab A remains on the workspace for account A, Tab B signs out and signs in as B. A subsequent load in Tab A fetches B’s records using B’s cookies while its context/header/owner key still name A. Routine storage then uses the wrong owner key. Separate browser-context authorization tests do not exercise this case. This is a UI identity/cache issue, not a claimed server IDOR.

Minimal correction: refresh identity on account/tab changes; clear private mounted data/drafts and invalidate pending generations before rendering under a new identity. Verify no A/B task/reflection/routine state crosses the transition.

### FS-07 — Journal responses have no generation guard

`study-workspace.js:185` applies every completed request directly to `journal` and `next`. `load()` has a request generation check (`201-205`), and resource loading has one (`207-212`), but journal loading does not.

Concrete race to verify: delay initial/background journal read; submit a narrower search; deliver the newer result first and old response last. The old list/cursor can replace the searched result. More uses current form values with the existing cursor, so changing filters before More can also mix query/cursor state.

Minimal correction: guard response identity, reset cursor on query change and prevent stale append responses. A targeted delayed-response browser regression is sufficient.

## Preserved strengths and test limits

- The routine state machine is finite, requires deliberate phase transitions and contains no reward fields. Server reward accounting remains separate. The unit test covers serialization, pause, long-break selection and finite completion (`study-routine.integration.test.js:6-20`).
- Main planning forms stay mounted through data/language changes; new record creation has retained request IDs; version conflicts are explicit; reflection is private and bounded. The task/reflection/favorite/RSVP/resource happy paths and negative server ownership are covered in new test source. This review did not run those tests.
- Resource links are rendered through textContent and opened with `noopener noreferrer`; membership and write permissions remain server-owned. No public discovery of private groups was introduced by the inspected UI.
- The smoke matrix switches all five tabs for overflow (`study-tools.smoke.spec.js:122`), but screenshot `123` occurs after that inner loop, so those 16 matrix shots capture only Insights. Axe at `124` likewise sees the terminal tab. Parent visual/accessibility review should preserve representative Tasks, Routines, Library, Agenda and circle resource states separately, rather than calling the terminal-tab shots a full visual record.
- The primary agent owns corrections and final candidate verification. These findings must be closed against the corrected source; this read-only report does not declare the candidate complete.
