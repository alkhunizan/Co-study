# Gate tooling corrections

## ERR-20261023-001 — PowerShell diagnostic typo

Status: resolved. An extra closing parenthesis prevented a read-only baseline command
from parsing. Corrected before collecting baseline evidence; no repository mutation.

## ERR-20261023-002 — UNC provider prefix passed to .NET

Status: resolved. Get-Location.Path included a PowerShell provider prefix unsupported
by System.IO.WriteAllText. Use Set-Content -LiteralPath for these UNC helper writes.
The first attempt created the branch/directories but wrote no helpers; all five were
then copied successfully with terminating errors enabled.

## ERR-20261023-003 — Archive, encoding and diagnostic fixtures

Status: resolved. Git archive and UNC working tree differed only in line endings in205
files; parity now normalizes only these proven workspace differences while requiring
runtime byte hashes. Resolve-Path.ProviderPath is required for native Git -C on UNC.
Python read_text requires explicit UTF-8 for Arabic Node-written JSON. The first
camera selector, reminder HTTP verb/version and task-list probe route were corrected
from current code before their results were used. All failed diagnostics are retained.

## ERR-20261023-004 — Request-observer mount paths

Status: resolved conservatively. Express mutates req.url inside mounted routers.
The observer now records originalUrl; earlier observations are matched only through
actual mount projections with unique candidate IDs. Ambiguous observations are
excluded. Repeating an entire green suite solely to improve a receipt was avoided.

## ERR-20261023-005 — Final verification is not universal success

Status: recorded/open. Real-font rendering exposed an accessible-name mismatch that
the offline gate did not. Kept final source frozen under viber phase9, confirmed with
a temporary DOM positive control and retained NO-GO. The all-font diagnostic hit the
fixed external request cap; do not weaken its assertion or claim it passed.
