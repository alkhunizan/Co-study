# Local runner issues

## ERR-20261020-V01 — Windows runner and network checkout

Logged: 2026-10-20. Priority: medium. Status: resolved for this run. Area: tests/infra.

Observed: unsigned PowerShell script refused; native Git `--output=(...)` parsed incorrectly; `npm.cmd` selected its adjacent Node 24 executable despite `npm exec` selecting Node 22 for a separate command. PowerShell native stderr also terminated the first harness on an engine warning.

Resolution: process-only `powershell.exe -ExecutionPolicy Bypass`, separate native argument, explicit cached Node 22 executable invoking npm CLI, and exit-code-based native command handling. No global execution policy, Node installation, or Git configuration was changed.

The network checkout took four minutes for a clean install and the real PostgreSQL test exceeded 90 seconds. The unchanged PostgreSQL test passed in 31.7 seconds on an isolated local-disk candidate. Preserve both receipts; do not label the failed first run as a pass.

## ERR-20261020-V02 — Audit harness and Git metadata

Logged: 2026-10-20. Priority: low. Status: resolved/limited. Area: tests/config.

Observed: first HTTP adapter probe ran before its candidate overlay existed; first socket probe reused the same nickname for two different users and correctly received a denial. Both fixtures were corrected without changing application behavior.

`git log --all` encountered an existing invalid Codex checkpoint ref; the scoped branches/remotes/tags scan succeeded. The unavailable optional `gh` CLI was replaced with one counted anonymous repository metadata request. Full checkpoint history remains unverified.

Local commit initially lacked author identity. Existing project commits identify the author as `Codex <codex@localhost>`; subsequent commits use that same identity through command-scoped Git options only.
