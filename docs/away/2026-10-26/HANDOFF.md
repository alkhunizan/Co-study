# Local branch handoff

Seven application fixes and one scheduling-fixture repair are preserved independently. Nothing was pushed, made into a remote PR, merged or deployed. Start with [the visual review](review.html) and [the verification matrix](VERIFICATION.md); a passing targeted check is not a green release gate.

## Where the work lives

- Original checkout and curated evidence: `E:/D-Backup/OS/Claude-Projects/body_doubling_live_cam/workspace/Co-study/docs/away/2026-10-26/`.
- Independent local repository: `C:/Users/alkhu/Documents/Codex/2026-10-26/halastudy-away/repository`.
- Other branch worktrees and complete raw test artifacts: `C:/Users/alkhu/Documents/Codex/2026-10-26/halastudy-away/worktrees/`.
- Common committed baseline: `c4d6c50553f55704b4d4a788db28b05fa983047a`. None of the branches includes the original checkout's pre-existing uncommitted edits.
- The baseline history bundle remains at `C:/Users/alkhu/Documents/Codex/2026-10-26/halastudy-away/archives/committed-baseline.bundle`; its size, prerequisite and hash are recorded in [baseline-manifest.json](handoff/baseline-manifest.json).
- [away-work.bundle](handoff/away-work.bundle) is incremental and requires that baseline. It is not a standalone clone. [branches.json](handoff/branches.json) records exact branch tips, application/test commits and SHA-256 hashes. [Bundle verification](handoff/bundle-verification.txt) and [bundle heads](handoff/bundle-heads.txt) are the archive receipts.
- Aggregate binary patches relative to the common baseline: [A00](handoff/patches/A00.patch), [A01](handoff/patches/A01.patch), [A02](handoff/patches/A02.patch), [A03](handoff/patches/A03.patch), [A04](handoff/patches/A04.patch), [A11](handoff/patches/A11.patch), [A12](handoff/patches/A12.patch), [A13](handoff/patches/A13.patch). Those patches include each branch's committed documentation; full raw browser videos and traces remain in the local worktrees.

## Review order and overlaps

All branch names begin `away/2026-10-26-1834-`.

| Suffix | Application/test commit | What to review | Integration consideration |
| --- | --- | --- | --- |
| A00 | a85fb87 | Future London daylight-saving transition fixture | Test-only; preserves real future-date validation. |
| A01 | 88ef3d2 | Checklist completion/identifier preservation and rejected-toggle rollback | Shares study-workspace.js with A04 and A11. |
| A02 | bc7f2ec | Failed focus action retry, queued Start/Pause and newer-session protection | Shares focus-client.js with A12. |
| A03 | eceecdd | Workspace response order, focus freshness and schedule selection retention | Shares platform.js with A13. |
| A04 | 7a1a11f | Accurate saved-versus-refreshed feedback, translation and obsolete-response handling | Includes A05 content correction; preserve A01/A11 behavior when combining. |
| A11 | 19c4c5b | Guided session survives failed task attachment | Retains the acknowledged session before the separate link operation. |
| A12 | 0a8b1a05 | Newly acknowledged session replaces an old completion retry | Failed new Start must still preserve the old retry. |
| A13 | 35cf9ba | Circle retry, draft preservation and feedback ownership | A03/A13 overlap in selected-room retention; retain one copy of that behavior. |

No combined branch has been assembled or tested. Integrate deliberately into a clean review branch after reconciling the original unfinished release work. Keep all 51 focused regression checks, then run the complete combined gates. Do not claim that the independent passing results prove the combined source.

## Reproduce a local check

The copied `scripts/` directory contains the launchers used during this run. Their runtime paths intentionally refer to the preserved local worktrees. They select Node22.23.3, clear child-process cloud/provider settings, use disposable local fixtures and block external browser requests. They do not load a copy of the original `.env`.

```powershell
& 'C:/Users/alkhu/Documents/Codex/2026-10-26/halastudy-away/scripts/run-check.ps1' -Runtime 'C:/Users/alkhu/Documents/Codex/2026-10-26/halastudy-away/worktrees/A11' -Label 'owner-guide-review' -TestFile 'tests/smoke/guide-recovery-away.smoke.spec.js' -Port '3666'
```

The example filename was checked against A11. The copies of the scripts in this package are records; the example invokes the preserved executable helper in the local isolation directory. Broad browser and integration suites should run serially; an earlier 100ms integration control showed intermittent timing failures. Existing raw failures are retained beside their isolated reruns, not replaced by them.

## Release work still held

- The existing body-parser production audit is red. Dependency upgrades are excluded by this away skill; no dependency was changed.
- The camera/privacy path is in the original dirty index.html. Preserve that unfinished work when investigating the recorded camera failure.
- A11 retains an unresolved integration-fixture JSON parse failure. The guard blocked its read-only follow-up inspection; the block was not bypassed.
- The guard denied reconnecting the isolated clone to GitHub. Its origin still points to the local baseline bundle. No remote PR exists. Exact denied actions are in [GUARD.md](GUARD.md).
- Hosted migration, backup/rollback, provider acceptance, actual device/media behavior and production font delivery remain unverified. Exactly two anonymous production GETs were used: home200 and app404.

The curated package excludes temporary data, node_modules, bulky traces/videos and generated HTML test reports. It includes command logs, JSON receipts, screenshots, patches and the incremental bundle. The package manifest hashes its included files; the raw local worktrees retain the omitted runtime artifacts.
