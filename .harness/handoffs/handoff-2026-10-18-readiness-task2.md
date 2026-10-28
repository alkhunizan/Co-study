# Readiness Task 2 handoff

## Work completed locally

Task 2 passed on `plan/site-wide-readiness-2026-10-18`, HEAD `e9412fd`.
Nothing was committed or published. Task 1's manifest, lockfile and restore
test remain byte-for-byte unchanged. All pre-existing planning/spike work was
preserved; Task 2 appended its own evidence and continuity.

Reconciled rollout, deployment, backup/restore, launch, agent guidance and both
READMEs against code. `VERSION` is now `1.2.0.0`, aligning the historical
changelog with npm `1.2.0`; this assigns no new release and proves no deployed SHA.

Linux Node 22.23.3 `test:ci:infra` passed: ShellCheck, 3 SQL migrations applied
twice with security/deletion/idempotency assertions, 19 Docker layers/final
filesystem with 5 excluded canaries, and Nginx syntax. Selected recovery,
migration, startup and deploy tests passed 86/86, no skips. Task 1's earlier
full quality evidence remains separate; no browser suite ran here.

See [Task 2 evidence](../../docs/superpowers/plans/2026-10-18-task2-evidence.md)
and local raw logs/previews under `output/readiness-task2-2026-10-18/`.

## Pending work

Tasks 3–10 remain open. Real-provider/device checks, designated-staging migration,
lost-host recovery, browser gates and deployed backend SHA remain release
requirements. The six-dataset artifact excludes runtime video sidecars/secrets;
preserve them across code rollback. Pins still become unsafe to restore at
30 days. Bootstrap clones main and prints incomplete minimum-env guidance;
follow the reconciled deployment/rollout docs before startup.

## Decisions and deviations

Preserve the warm visual identity. All work intentionally remains uncommitted;
do not reset, stash, switch the older checkout, or commit without request.
No application code, runtime safeguard, shell script or test assertion was
changed in Task 2. The first Linux ShellCheck run failed because Windows checked
out CRLF shell files; Git stores LF. Normalize only the disposable test copy
when repeating this method. No check was weakened.

## Exact next step

Read Task 3 of `docs/superpowers/plans/2026-10-18-site-wide-readiness-plan.md`.
Reproduce the English landing overflow at 390px and add the specified failing
browser regression before editing CSS. Preserve the shared bilingual/theme
behavior and all Task 1/2 work.

## Environment notes

Resolve paths from the project root; X: maps to AMD's canonical E: OS share.
Use command-scoped Git trust for the resolved worktree, never a global exception.
Host Node is still 24; Task 1's portable Node 22 path may remain in the temporary
`halastudy-node22/runtime-path.txt`. The Task 2 Linux runner used a source copy,
not a source bind mount, and no production environment. Python is available
through `py -V:Astral/CPython3.11.16`. Temporary files are not durable backups.

## Kickoff prompt

Continue readiness Task 3 on plan/site-wide-readiness-2026-10-18 at e9412fd.
Preserve all verified, uncommitted Task 1 and Task 2 work. Read this handoff first,
then start the English 390px landing-overflow regression from the plan.
