# Halastudy: twenty study tools

Implemented locally on feat/2026-10-22-top-20. Source checkpoints: 08cc33f (features) and 25fb696 (recovery/privacy corrections). All twenty features and the final local gate are complete: 167 integration tests, 76 offline browser cases plus the online font case, PostgreSQL resilience/restore and SEO passed. All 290 delivered source files match the preview runtime.

- [Browsable before/after review ? 46 real views](review.html)
- [All twenty features and acceptance evidence](FEATURES.md)
- [Architecture and trust boundaries](ARCHITECTURE.md)
- [Official-source product research](RESEARCH.md)
- [Journey and visual review](UX-REVIEW.md)
- [Findings and corrections](FINDINGS.md)
- [Verification](VERIFY.md)

Local preview: http://127.0.0.1:3510/app#planner. Sign in or create a synthetic local account. The planner is reached through Study -> Plan my study; focus selectors are in Progress, and the resource shelf is inside a private circle. Gallery examples use a synthetic circle owner and simulator VIP; they do not represent real people or paid transactions.

The isolated Node 22 runtime is %LOCALAPPDATA%/Temp/halastudy-top20-2026-10-22/candidate. It contains no copied .env. The preview binds loopback only. To launch it from this checkout when it is stopped:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File docs/features/2026-10-22-top-20/scripts/run.ps1 -Preview
```

All reports, research, scripts, manifests, logs and screenshots are inside this folder. App source and regression tests are in their established locations. No push, merge, deployment, hosted migration, provider-dashboard change, external message, purchase or real payment is authorized/performed by this work. Existing free access and VIP commercial terms remain unchanged.
