# Readiness Task 5 evidence

## Scope and state

Task 5 was executed locally on `plan/site-wide-readiness-2026-10-18`, HEAD
`e9412fd`, preserving uncommitted Tasks 1–4. Task 5 is complete locally with
the final checks below. Nothing was committed, stashed, pushed, merged or deployed.

The Task 4 handoff was read first. Before edits, all 335 tracked/untracked
candidate files were hashed and archived, excluding ignored runtime material.
Raw logs, screenshots, traces, scripts and baseline hashes are ignored under
`output/readiness-task5-2026-10-18/`. The archive is in TEMP
`halastudy-readiness-task5-20261018/candidate-before-task5.tar`; it is a local
session snapshot, not a durable backup.

## Observed failures and repairs

The initial open-page regressions reproduced four gaps: unselected password
fields remained visible; signup discarded the create draft; a stalled lookup
left joining pending indefinitely; and denied clipboard access silently failed.
A separate workspace regression reproduced the missing pending join state.
The pre-fix logs are `red.log` and `join-red.log`.

A later test against the real protected-room endpoint reproduced another defect
(`preview-red.log`): its limited `{ ok, room }` response was read as a full room
snapshot, losing the name and password requirement. The reader now understands
that contract, shows its password requirement, and does not invent provider,
capacity or schedule details omitted from the private preview. The server's
privacy boundary and response contract are unchanged.

Implemented within the existing forms:

- Optional password fields collapse until selected. Password/scheduling choices
  use full checkbox tiles and line icons. Selected create/join choices expose
  `aria-pressed`.
- Field errors have stable IDs, `aria-describedby` and `aria-invalid`; pending,
  success and error feedback uses live regions, including a workspace success
  announcement outside the hidden entry overlay. Input remains available for
  correction and retry. Successful creation moves focus to the entry action.
- Room lookups and workspace joins have eight-second deadlines. Duplicate
  submissions are ignored while pending. A timed-out workspace attempt is
  disconnected and its late acknowledgement cannot hide the retry form or
  establish a background membership. The existing create acknowledgement
  deadline is retained.
- The create/join draft stays in this tab's session storage through signup and
  refresh. It is ignored and removed after 30 minutes without an update, and
  cleared on successful creation. The scheduling account gate explains why
  an account is needed and returns to the preserved draft. Passwords are not
  added to invitation URLs or local storage.
- Room-password handoff is bound to the matching room code. Successful refresh
  retains the name/password handoff; another room cannot receive the stored
  password. The existing legacy handoff code remains a compatibility fallback.
- Room-code copy has a bilingual manual prompt when clipboard access is denied
  or unavailable. Invitations contain only the room code. Full, expired and
  not-yet-open rooms show actionable bilingual feedback.
- The workspace entry overlay scrolls at short viewport heights, uses 44px
  controls, and becomes genuinely hidden after entry, removing invisible form
  controls from keyboard/accessibility navigation. Page exit disconnects the
  room socket; a restored back-forward cached page reconnects through the same
  join path. Provider/membership authorization logic is preserved.
- Scoped entry styles repair dark input/button colors and error-text contrast.
  Existing shared public shell, landing content and article styles remain intact.

## Verification

Portable Node 22.23.3 was used; host Node was unchanged. Browser tests use the
existing sanitized server helpers and loopback-only network guard.

| Check | Result |
|---|---|
| Initial targeted Chromium browser run | 10/10 passed after the first repairs. |
| Complete affected Chromium suites | 31/31 passed, including existing chat/board/timer/fake-media lifecycle tests. `chromium.log`. |
| Final five-suite browser matrix | Exit 0, 208/208 passed, no skips: open, create-timeout, app, account and site-consistency across Chromium/WebKit desktop/mobile. `final-smoke.log`. |
| `npm run test:ci:quality` | Exit 0: 223 unit and 201 integration tests, no failures/skips, zero production audit findings; syntax, migrations, types, lint and dead code clean. `quality.log` and final-candidate `quality-final.log` both exit 0. |
| Final syntax/types/lint/diff checks | Syntax/types/lint pass in the final quality gate; documentation links and final diff checked at close. |
| Font-loaded base layout sweep | 40/40: open and workspace entry × Arabic/English × light/dark × 360, 390, 768, 1024, 1440px. No measured overflow, clipped controls, undersized entry targets, page errors or broken local links. `sweep.json`. |
| Final expanded/error-state inspection | 16/16 at 390/1440px, both languages/themes; optional password and account gate visible, field errors rendered. Every submit also reachable at 360×330px. Entered-input, action-label and error-text checks have minimum measured contrast 5.35:1. `states.json`, `states-final.log`; screenshots reviewed. |

The browser coverage includes real guest and account create → invite → join →
refresh → leave in both languages, actual protected-room lookup/password checks,
room-code direction, clipboard-denial prompts, signup return, expired drafts,
create/join duplicate suppression, retry after failed acknowledgements, stale
preview/late-ack rejection, 404/429/500 lookups and mesh capacity feedback.
Full/expired/not-yet-open workspace errors are injected at the acknowledgement
boundary to verify the UI; the existing integration suite separately checks
server lifecycle and capacity behavior. Provider shell entry is not real video
acceptance. The existing mesh-blur test deliberately launches its own fake-camera
Chromium instance in each project; it does not prove WebKit camera behavior.

Intermediate expanded runs exposed two test expectations that did not match the
existing contract: not-found wording and the protected response's nested count.
Those were corrected without weakening the server. A later account regression
expected the reserved-name hint to remain visually visible inside the already
joined overlay. With the overlay now correctly hidden, it checks the reserved
state plus successful entry and enabled chat instead. Interrupted diagnostic
runs are retained and are not counted as final passes. A stronger private-preview
visibility assertion caught `.room-preview-badge` overriding the native hidden
style; its explicit hidden rule and the workspace success announcement passed
all three focused Chromium checks before the final matrix (`preview-final.log`).

## Preservation and remaining gates

All 335 baseline files remain present. Nine product/test files were extended,
plus plan/TODO/spike-log records; new Task 5 evidence/handoff and project-root
STATUS/NEXT provide continuity. Every other baseline file is byte-identical.
No server, provider implementation,
dependencies, recovery/runbook files, original-checkout files or credentials were
changed by Task 5. Entry-page and shared helper extensions preserve earlier
repairs; the original article/OG source hashes are unchanged at close.

Tasks 6–10 remain. Short viewport checks emulate available keyboard space;
physical phone keyboard and real camera/provider behavior still need device QA.
These results do not replace final-candidate release-wide smoke/infrastructure,
OAuth, designated-staging migration, lost-host recovery or deployed-SHA proof.
No production release is authorized or implied by these local results.
