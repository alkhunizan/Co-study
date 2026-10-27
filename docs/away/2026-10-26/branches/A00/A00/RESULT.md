# A00 baseline fixture repair

The unmodified browser gate failed its timezone test because its fixed 24/25 October 2026 sessions are now in the past. Production correctly rejects past sessions. This is a clock-dependent test failure, not a request to loosen scheduling validation.

Acceptance before implementation:
- Select two future UTC instants on opposite sides of an actual Europe/London offset transition, within the existing 366-day scheduling window.
- Both Asia/Riyadh and Europe/London datetime-local entries persist exactly those instants and display the selected timezone.
- Keep all existing assertions; add a positive assertion that the pair crosses different London offsets.
- No application, auth, provider or schema changes.

Source/test commit:a85fb875bdcaec734a965cd79804b7c0472ce2ec. The date test failed before and passed after. All four static gates and169 integration cases pass. Production audit retains the existing body-parser high advisory.

The full frozen browser run passed the repaired DST case and78 cases overall, but hit the recurring privacy-blur failure in the unchanged app suite. Four following serial cases did not run; the external-font case was deliberately skipped offline. Source hashes matched before/after.

After all broad suites stopped, the original app suite passed8/8 alone in a00-app-isolated.log, including privacy blur and all four previously unexecuted cases. Source manifest a11e3e387f282d70e78526701547f6aaef577fcd354de8e5de6a9177c9f9b204 matched before/after. The camera result is intermittent; this run does not establish its cause. Both receipts are retained. No camera behavior, assertion or timeout was changed, and no single fully green broad rerun or production acceptance is claimed.
