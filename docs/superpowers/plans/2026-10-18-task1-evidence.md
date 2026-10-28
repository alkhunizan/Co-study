# Task 1 candidate evidence

## Candidate and scope

Executed on 2026-10-18 in the canonical isolated worktree
`workspace/Co-study-release-plan`, branch `plan/site-wide-readiness-2026-10-18`.
Base HEAD: `e9412fd`; changes in this report are uncommitted. No publication,
deployment, production mutation, merge, or history rewrite was performed.

Runtime: Windows x64, Node 22.23.3, npm 10.9.9. The portable Node archive was
downloaded from nodejs.org and checked against its published SHA-256 checksum.
The machine-wide Node 24 installation was not changed. Tests used `NODE_ENV=test`;
the existing integration harness restricts child environment and provider URLs.

The source baseline was clean except for existing planning documents and the
planning entry in `project-knowledge/spike-log.md`. The original checkout remains
at `0e3d477` with two modified blog articles and untracked `images/og/`.

## Baseline

Commands ran separately so audit failure could not mask test results.

| Command | Exit | Result |
|---|---:|---|
| `npm ci` | 0 | Installed original lock; six affected packages in full audit |
| `npm run check` | 0 | 152 JavaScript sources |
| `npm run supabase:migrations:check` | 0 | Three SQL migration contracts |
| `npm run typecheck` | 0 | Passed |
| `npm run lint` | 0 | 146 files, no fixes or warnings |
| `npm run deadcode` | 0 | Passed |
| `npm run audit:prod` | 1 | Five affected production packages |
| `npm run test:unit` | 1 | 219 passed, four failed, 223 total |
| `npm run test:integration` | 0 | 201 passed, no skips |

## Repairs and review

Inspected `npm audit fix --dry-run --json`, then ran `npm audit fix` without
`--force`. Direct dependency ranges remain unchanged. Raised the parser override
floor to `^4.2.7`.

| Package | Before | After |
|---|---|---|
| body-parser | 2.2.2 | 2.3.0 |
| engine.io | 6.6.9 | 6.6.11 |
| proxy-addr | 2.0.7 | 2.0.8 |
| qs | 6.15.2 | 6.16.1 |
| socket.io-parser | 4.2.6 | 4.2.7 |
| smol-toml (development, through Knip) | 1.6.1 | 1.9.1 |

Associated transitive updates: `type-is` 2.1.0, `side-channel` 1.1.1,
`es-object-atoms` 1.1.2, `hasown` 2.0.4, and two nested `content-type` 2.1.0
entries. npm 10 also removed `libc` metadata from 20 unchanged optional packages;
those entries were restored after checking that no other field had changed.
Original two-space lockfile indentation was preserved. No optional platform
package was removed.

The four unit failures came from `backup-restore.test.js`: July backup fixtures
used the real October clock, crossing the intentional 30-day safety boundary.
Each affected call now supplies the same explicit July timestamp already used
elsewhere in the file. All 15 focused restore tests passed after the correction.
No production restore logic, retention limit, tombstone protection, or assertion
was relaxed. No new behavioral test was needed for this fixture-only repair.

## Final verification

The patched `npm ci` and full `npm audit --json` passed; the latter reports zero
findings across production and development dependencies. The combined
`npm run test:ci:quality` passed with exit 0: syntax, migration contracts,
typecheck, lint, dead-code analysis, production audit, 223 unit tests, and 201
integration tests. Both suites report zero failures, cancellations, and skips.
The original blog and OG file hashes also match their initial inventory.

After restoring optional-platform metadata, another `npm ci` passed and left
the final lockfile hash unchanged; installed dependency inventory and full audit
also passed. `git diff --check` passed. Project continuity/evidence links resolve,
and `NEXT.md` has exactly one Now item and three Then items.

The supplementary OS-wide registry check exited 1: unrelated projects have
missing `PROJECT.md` files, inaccessible external canonical paths, or invalid
continuity fields, and generated README/INDEX navigation is stale. No finding
named this project. This broader navigation issue is outside Task 1; no registry
regeneration or unrelated project edits were performed. The default Python alias
had no runtime; the check ran with installed `py -V:Astral/CPython3.11.16`.

Raw logs, exit-code summaries, dependency inventory, original manifest hashes,
and reviewed lockfile diff are retained under
`output/readiness-task1-2026-10-18/` (ignored local evidence).

## Remaining work

Task 2 begins with reconciling all three migrations, startup/persistence,
backup/restore, and release instructions against the implementation. Linux/Docker
infrastructure checks, all four browser projects, real-provider/device evidence,
password recovery delivery, and release authorization remain open. Task 1 does
not establish site-wide release readiness.
