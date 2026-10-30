# Task 2 readiness evidence

## Candidate and scope

Completed locally on 2026-10-18 in `workspace/Co-study-release-plan`, branch
`plan/site-wide-readiness-2026-10-18`, HEAD `e9412fd`. Changes remain uncommitted.
No publication, deployment, live database mutation, or history change occurred.
The original `workspace/Co-study` checkout was not modified.

Task 1's `package.json`, `package-lock.json` and
`tests/unit/backup-restore.test.js` match the SHA-256 hashes captured before this
task, byte for byte. Task 2 changes release documentation, version-label
consistency, and task/continuity records; application code and tests are unchanged.

## Documentation reconciliation

- Rollout lists all three SQL files in timestamp order, distinguishes static
  validation from disposable apply/reapply, stops the writer before replacing
  code, and loads the protected environment for offline operator commands.
- Startup guidance matches distinct 32-byte session keys, complete production
  Supabase/RealtimeKit configuration, service-user PM2, hydration/drain behavior,
  and state sidecars. Provider setup and real signed-event delivery remain
  separate from preset checks and forged-signature rejection.
- Backup guidance names all six datasets, tombstone-first restore ordering,
  current-row precedence, phased failure handling, and the 30-day safety window
  even for retained pins. Complete artifacts exclude runtime video sidecars and
  secrets; lost-host recovery still needs separate rehearsal.
- English/Arabic README and agent instructions reflect shared/extracted frontend
  code, HTTP mutations, the three CI groups and all four browser projects.
- `VERSION` now reads `1.2.0.0`, matching the existing changelog label and npm's
  `1.2.0` manifest/lock baseline. No new release number/tag was assigned. Health
  version is explicitly insufficient to prove a deployed source SHA.
- Generic moving-main update/old-tag rollback guidance was replaced. Bootstrap
  still clones/updates main and prints an incomplete minimum environment;
  deployment/launch docs explicitly identify those limits and direct operators
  to the full candidate requirements before starting.

Code reviewed includes `services/config/secrets.js`, `co-study-server.js`,
`server.js`, `server-config.js`, `services/video/realtimekit-webhook.js`,
`services/ops/backup-{artifact,service,restore}.js`, deployment wrappers,
`scripts/deploy-verifier.js`, migration verifiers and the three SQL migrations.

## Linux rehearsal

A disposable `node:22-bookworm` runner used Docker Desktop's Linux engine
29.8.2 via its socket. Runtime: Node 22.23.3, npm 10.9.9, ShellCheck 0.9.0,
Docker CLI 20.10.24 with `DOCKER_API_VERSION=1.44`. Dependencies/tools were
installed inside the disposable runner, not into the host OS.

The source archive contained 319 tracked **working-tree** files, including the
uncommitted Task 1 repairs. No `.env`, production credential, runtime state,
Windows `node_modules`, or Git directory was copied. Untracked planning material
was not needed by the gate. Tests received `NODE_ENV=test` and their generated
fixtures/fakes only. PostgreSQL had no network, no published port, and tmpfs data.

The first gate run failed at ShellCheck with SC1017: the Windows working copy's
four shell scripts use CRLF. `git ls-files --eol scripts/deploy` confirms their
index content is LF. Only the disposable copy's `.sh` files were converted to
LF to match a Linux checkout; no repository shell file or check was changed.
The complete gate then passed. The initial Windows tar export failed on tracked
filenames; Python tarfile exported the verified path inventory successfully.

| Check | Exit | Evidence |
|---|---:|---|
| `npm run test:ci:infra` | 0 | All four stages ran to completion |
| ShellCheck | 0 | All four deployment shell scripts |
| Disposable PostgreSQL | 0 | `postgres:16.4-alpine3.20`; 3 migrations, 2 passes; FORCE RLS/grants, focus/event idempotency, deletion/resurrection assertions |
| Docker verification | 0 | 19 layers and final filesystem inspected; 5 context secret canaries excluded; non-root user/config checks passed |
| Nginx verification | 0 | `nginx:1.27.5-alpine`; production template syntax successful in isolated container |
| `npm ci` in runner | 0 | 155 packages installed; zero audit findings |
| `npm run supabase:migrations:check` | 0 | Three files; combined normalized SQL SHA-256 `b84ef6ab35bc003d09d6385efc94f55f95a2666818d5e5dd7915d2552fd0429d` |
| Selected existing tests below | 0 | 86 passed, zero failures/skips |
| Documentation checks | 0 | 8 Markdown documents rendered; 25 local links resolve; one H1 per document; balanced fences |
| Task 1 hash comparison | 0 | Manifest, lock and restore test unchanged |
| `git diff --check` | 0 | No whitespace errors |

Final checks also validated 12 documentation/continuity files and 37 relative
links, with no unexpected source changes. The project continuity helper reported
no drift, one `Now` item, and three `Then` items. The runner and its disposable
data were removed after verification; only its empty bind-mount directory
remains in Docker's temporary filesystem. Existing containers were untouched.

Selected tests ran with `node --test` in Linux:

```text
tests/unit/backup-artifact.test.js
tests/unit/backup-service.test.js
tests/unit/backup-restore.test.js
tests/unit/backup-r2.test.js
tests/unit/supabase-migration.test.js
tests/unit/postgres-migration-runner.test.js
tests/unit/room-v2-migration.test.js
tests/unit/startup-hydration.test.js
tests/integration/backup-cli.integration.test.js
tests/integration/backup-r2-retention.integration.test.js
tests/integration/deploy-verifier.integration.test.js
tests/integration/room-migration-cli.integration.test.js
```

Raw logs, rendered HTML previews, and hash/check reports are preserved locally
under [output/readiness-task2-2026-10-18](../../../output/readiness-task2-2026-10-18/).
This ignored evidence directory is not part of a Git commit. The initial source
archive remains in the host temporary `halastudy-readiness-task2-20261018`
directory for local comparison; do not rely on temporary storage as a backup.

## Limits and next step

This proves the local Task 2 infrastructure and documented recovery contracts.
It does not prove live staging/production migration, real provider webhook
delivery, real-device camera behavior, complete lost-host recovery, or deployed
backend SHA. Nginx validation is syntax validation, not a TLS deployment.
Task 1's full quality result remains separate evidence; only the named 86 tests
were rerun here. No browser gate was run during Task 2.

Continue Task 3 with its failing English 390px landing-overflow browser
regression, preserving the warm identity and all uncommitted Task 1/2 work.
