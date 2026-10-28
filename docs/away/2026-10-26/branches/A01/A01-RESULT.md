# A01 checklist reliability

Application/test commit: 88ef3d26c5fdb0463ce665cf2755138bfd30b179. Independent branch: away/2026-10-26-1834-A01.

Four real-browser checks failed before the correction and passed afterwards:
English at1440px and Arabic at390px each cover reordered/inserted/repeated checklist
labels, persisted completion after reload, and rejected checkbox updates followed
by successful retry. Source state is confirmed through the real local API.

Unchanged labels reuse their original IDs and completion states. New/renamed lines
start unchecked. New IDs derive from the retained form request key so a lost
response can be retried without changing the mutation payload. A failed checkbox
update returns to the last confirmed value. No schema, API permission or role change.

Evidence: evidence/a01-before.log, a01-after.log, a01-types.log, a01-final-*.
Representative Arabic mobile and English desktop screenshots were visually inspected.
No layout, theme, typography, icon or motion behavior was added; fallback-font screenshots
are identified as offline checks. Production-font delivery is not claimed.

## Scope review

Read the changed UI, shared request helper and its routes/study-planner one hop.
User text still uses textContent; server UUID/text/step/length/version and ownership
checks remain unchanged. All mutations stay behind existing account guards. The
checklist row's completed-task disabling is preserved. New IDs stay below the40-char
server cap. Duplicate labels are matched by occurrence order; a rename is a new step.
Existing lost-response retry is also exercised by F01-F14 browser coverage.
No new P0/P1 found in changed code. Live app route returns404; nothing released.

## Frozen verification

At88ef3d2, syntax/types/lint/deadcode and169 integration tests pass. The full browser
run finished with86 passes,1 external-font skip, and1 existing expired-DST-fixture
failure. All4 added checklist cases passed again, and both camera cases passed.
No newly introduced failure was observed. Source manifest55d96a81316183653bb0686a729b70a728f2f7ea0696a95e564e4edacd5bf0ae
covers183 tracked code/config/test files with clean tracked source and no.env.

The production audit remains a pre-existing failure (body-parser advisory). The
baseline DST test fixture is repaired separately in A00. HTML asset-version bump
must wait for the protected in-flight edits. This is local qualification, not a green
combined integration or release gate. Remote publication is held by the away guard.
