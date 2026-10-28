# Review and verification helpers

Run from the repository root. These scripts select Node 22.23.3, scrub service configuration, use synthetic loopback data and save evidence in the parent output folder. They never copy the workspace `.env`.

The existing preview is `http://127.0.0.1:3495/app`. If it is stopped, launch the already installed isolated candidate with:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File docs/refinement/2026-10-21-halastudy/scripts/run.ps1 -Label review-preview -Preview
```

Do not start a second preview against its live PGlite directory. A stale lock requires checking its recorded process and preserving evidence before recovery.

Useful repeatable checks:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File docs/refinement/2026-10-21-halastudy/scripts/verify-source.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File docs/refinement/2026-10-21-halastudy/scripts/run.ps1 -Label new-visitor-check -Script visitor-probe.cjs
```

Use unique labels; logs and browser result directories are named by label. `run.ps1 -Task test:ci -LocalArtifacts -SmokePort <unused-port>` runs the actual package gate against the disposable candidate. `-Runtime` selects the fresh `candidate-final` copy. `-Postgres` uses the existing disposable PostgreSQL resilience script. `-Online` permits networking; the font helper restricts browsing to loopback and Google font hosts and sends no synthetic forwarded headers to them.

`browser-review.cjs`, `extended-review.cjs`, `zoom-actions.cjs` and `font-screens.cjs` create synthetic rooms and capture real browser output. The matrix helpers assert actual document language/theme; changing only localStorage before hash navigation is insufficient. `fixture-auth.cjs` is a reusable local-only synthetic identity, never a production account.

`verify-artifacts.py` compares the final Playwright files with their local buffer using extended Windows paths. `finalize-review.py` requires a passing complete gate and source parity, copies the final 64 workspace images into the browsable screenshot folder, and generates REVIEW.html. `review-artifact.cjs` opens the gallery, decodes every image, checks file links and verifies 390/1440px rendering.

`sync-runtime.ps1` records source hashes while copying author code into a disposable runtime. The delivered manifest is frozen with its test logs; running synchronization after editing source creates a new candidate requiring verification. Its `-Baseline` option is for the original checkpoint only.

`extract-copy.py` and `version-assets.py` record one-time implementation operations. Do not rerun the extraction on the finished source. They are retained as execution provenance, not preview prerequisites.
