# Readiness Task 1 handoff

## Work completed locally

Task 1 passed on branch `plan/site-wide-readiness-2026-10-18`, HEAD `e9412fd`.
Nothing was published or committed. Compatible dependencies are repaired and
the parser override floor is `^4.2.7`; four restore-test clock inputs are fixed.
The full quality gate passed: 223 unit and 201 integration tests, no skips.
Production and development audits report zero findings. A final clean install
preserved the lockfile byte-for-byte.

See [candidate evidence](../../docs/superpowers/plans/2026-10-18-task1-evidence.md)
for the baseline, versions, repair rationale, and local raw-log directory.

## Pending work

Tasks 2–10 remain open. No infrastructure, browser, real-provider, physical-device,
or deployment acceptance is implied by Task 1. Password recovery still requires
a bounded design and verified transactional email delivery.

The supplementary OS registry check failed on unrelated missing metadata,
external paths, and stale generated navigation. This project's links and
continuity item counts pass; no unrelated registry fixes were attempted.

## Decisions and deviations

Preserve the warm visual identity and all existing commits. The additional
`smol-toml` development advisory was repaired alongside the five production
packages. Keep production restore age/tombstone protections unchanged. Restore
tests now use their fixture's explicit date rather than the real clock.

The original checkout and blog/OG hashes remain unchanged. The tree deliberately
retains earlier uncommitted planning material plus this task's patches; do not
reset, stash, or overwrite it. Commit only when requested.

## Exact next step

Read Task 2 of `docs/superpowers/plans/2026-10-18-site-wide-readiness-plan.md` and
compare `docs/ROLLOUT-COMPATIBILITY.md` with the three migration files and current
startup, persistence, and backup/restore code before editing release guidance.

## Environment notes

Resolve operational paths from the current project root. Here X: maps to the
canonical OS share on AMD's E: drive. Git trust exceptions were command-scoped
to this worktree/share, not saved globally.

The machine defaults to Node 24. A checksum-verified portable Node 22.23.3 lives
under the local temporary directory `halastudy-node22`; `runtime-path.txt` there
contains its runtime directory. Prepend that directory to the current process
PATH and set `NODE_ENV=test` before rerunning npm checks. Do not assume the
temporary runtime survives a cleanup. npm 10 attempted to strip `libc` metadata
from unchanged optional packages; final lockfile preserves that metadata and
the original two-space indentation. The default `python` alias lacks a runtime;
the installed interpreter is selectable with `py -V:Astral/CPython3.11.16`.
