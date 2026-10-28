# Execution tooling observations

## ERR-20261023-001 command-scoped network repository trust

Status: resolved. Initial Git calls refused the mapped UNC repository. All later
Git calls use its exact invocation-scoped safe.directory; global trust is unchanged.
PowerShell does not expand wildcard arguments passed to rg; use rg -g patterns.
The stylesheet inventory, rather than an assumed tokens.css filename, supplies the
real token CSS path. No application behavior or original test assertion changed.
