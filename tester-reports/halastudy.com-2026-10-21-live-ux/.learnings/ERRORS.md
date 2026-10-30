# Audit tooling notes - 2026-10-21

- Git status on the mapped checkout rejected ownership. Read-only retry succeeded using command-scoped `safe.directory` for the resolved UNC repository. No global Git configuration changed.
- One broad ripgrep invocation produced noisy output through Windows native argument quoting. Follow-up queries use simple `-e` expressions, explicit files, and bounded match counts.
- An unnecessary escaped-newline expression was rejected by ripgrep. Removed it from the follow-up search.
- Expected stylesheet filenames were absent; the real landing stylesheet is `design-system/landing.css`. Use the paths actually linked by the document.

These are audit-tool issues, not website findings.

- The supplementary signup inspection initially searched for a button role, but the visible account switch uses `role=tab`. Retried only the unfinished account/blog inspections with the observed `#tab-signup` selector. Retained the first log; this selector miss is not a discoverability finding.
