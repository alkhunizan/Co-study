# Verified findings and disposition

| ID | Severity | Finding / before evidence | Correction / after evidence | State |
| --- | --- | --- | --- | --- |
| V3-01 | P1 | Unbounded room lookup traps Join; stalled RTC config never releases readiness. `before-network-corrected.json`. | Native 15s deadlines cover both raw entry fetches and study RTC fetch. Draft preserved, retry 404 positive control; `after-network-corrected.json` 2 passed. Commit b022186. | FIXED locally |
| V3-02 | P2 | Account persistence errors render untranslated error keys in AR/EN. `before-account-errors.json`. | Useful persistence/last-owner messages and unknown-error fallback; both languages preserve draft. `after-recovery-browser.json`/`after-provider-retry.json`. Commit b3bf055. | FIXED locally |
| V5-01 | P1 | Compatibility Supabase body stall outlives advertised deadline. `before-supabase-deadline.log`, outcome still-pending. | Timer encloses body read; successful control and abort case pass. `after-supabase-deadline.log`. Commit fe98184. | FIXED locally |
| V5-02 | P1 privacy | Raw Supabase error body reaches Error.message/log callers. `before-supabase-body-redaction.log`, synthetic private marker. | Status retained, response body/query omitted from diagnostic. `after-supabase-private-errors.log` 8 passed. Commit 983c7b0. | FIXED locally; deployment required for any configured hosted compatibility path |
| V5-03 | P1 | One reminder refresh failure clears all candidates, preventing retry. `before-reminder-valid-fixture.json`. | Transient candidate retained; fresh scope and preference check still precedes title, auth change clears state. Complete study browser suite passed in `after-recovery-browser.json`. Commit 1a12d3f. | FIXED locally |
| V8-01 | P1 auth recovery | Failed provider discovery silently hides sole Google entry with no retry, AR/EN. `before-provider-retry.json`. | Bounded shared request, explicit localized retry, reveal only after successful config. `after-provider-retry.json` 4 passed. Commit 5015826. | FIXED locally |
| V6-01 | INFO release boundary | Live site has none of the candidate's app/study routes; ready response lacks database check. `visitor.json` requests 11,13,14,16,18. | No deployment or hosted migration permitted. Review and deploy exact candidate only after external acceptance. | OWNER / unverified deployment |
| V6-02 | P2 | Live HTTPS responses lack HSTS; local Nginx template already has it. `visitor.json` request1. | Owner must reconcile active TLS proxy with reviewed template and verify header after applying. | OWNER |
| V9-01 | P2 accessibility | Final real-font desktop account review exposes `.brand` accessible-name/visible-label mismatch in both languages/themes; current label is `Halastudy home`. `axe-*-1440.json`, `label-control.json`. | Temporary browser-only label including visible text passes the exact rule; delivered source remains unchanged. Viber phase9 requires new findings to remain open and a new gate to fix/reverify. | OPEN; next gate |

Final verifier gap: `final-font-diagnostic` was attempted with unchanged assertions
and failed because uncached font faces were blocked at the fixed30-request total
(18 site +12 public font GETs). All12 allowed font responses were200 and cached.
Twenty populated views confirm their used body fonts loaded; the separate all-font
diagnostic is **UNVERIFIED under the request cap**, not a demonstrated font-server bug.
No extra request was made to force a green result. `page-has-heading-one` is an axe
best-practice observation on the existing account template, recorded separately from
the serious label rule. It is not counted as an additional critical/high defect.

Do not treat a local fix as a claim about production. The candidate has not been pushed,
merged or deployed. Production acceptance is separate from the local functional gate.
Agent hypotheses dropped after upstream/context review: 10 trace +19 sweep entries/
families, plus seven independent follow-on hypotheses. Counts are candidate families,
not invented individual bugs. Full receipt will distinguish them from executed checks.
