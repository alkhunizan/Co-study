# Halastudy refinement review

Local technical verdict: **GO**. The prioritized refinement and strengthened complete gate pass. Production release remains **NO-GO** pending the external acceptance below.

[Open the app preview](http://127.0.0.1:3495/app) · [Browse real before/after images](REVIEW.html) · [Architecture](ARCHITECTURE.md) · [Journeys](JOURNEYS.md) · [Findings](FINDINGS.md) · [External acceptance](ACCEPTANCE.md)

## What changed for users

- Study now offers a clear room start or solo focus, with actual eligible return/upcoming information and fewer repeated empty cards. Four ordinary destinations stay consistent: Study, Progress, Groups and Account.
- Focus recovers across paused tabs, reload and interrupted requests. Completing a session shows acknowledged server credit; retry after a lost response confirms the same session. A camera remains optional and never changes credit.
- Private group links survive signup and navigation, retain a bounded draft, and handle acceptance retries without duplicate membership. Owners can revoke unused invitations without archiving the group.
- Shared goals, real companionship and optional readiness sit beside the room timer. Progress adds a ledger-backed week and small personal milestones, with welcoming copy after rest. Legacy/imported history stays explicitly separate.
- Password/OAuth destinations stay local, delayed requests reject stale identity, and lobby retry/camera labels reflect actual state. Narrow layouts, text enlargement, keyboard focus, contrast and room control hierarchy were corrected after browser inspection.

## Architecture and preserved boundaries

Keep the existing vanilla frontend and server-owned domain modules. A framework rewrite would add build/deployment and migration risk without a measured benefit for the current defects. Extracted workspace copy, a shared return policy and a room focus controller reduce coupling while preserving URLs, account data and bilingual behavior. No schema migration is needed.

Identity, permissions, entitlements, billing, focus/rewards, private circles and media remain separate responsibilities. Existing free access, one VIP offer at USD 4.99/month, sandbox-only payment behavior, transactional persistence, scoped sockets and fail-closed media protections are retained. Fifteen protected billing/catalog/database/media/migration/package files are unchanged. Keep one app process; process-local presence does not support arbitrary multi-instance scaling.

## Source and runtime

| Item | Exact value |
|---|---|
| Base | `5b186bd330fa459ca3787a413d374c62384d4435` on `fix/2026-10-21-hardening` |
| Local branch | `feat/2026-10-21-halastudy-refinement` |
| App implementation | `1d41e072b8198ce4623397aa059a6a698345602e` |
| Strengthened matrix test | `db7a424b5fb18c4784e0dc35ac790ebd50009455` |
| Tested source | [279-file manifest](evidence/candidate-source.json), SHA-256 `7aef40534fdf114fa8419fd1966cbce17041e0d8f33a30f1dc38711c26d3428e` |
| Runtime | Node 22.23.3, Chrome 155.0.8059.85; isolated PGlite or disposable PostgreSQL 16 |
| Preview | `http://127.0.0.1:3495/app`, isolated synthetic local data |
| Final test copy | `%LOCALAPPDATA%\Temp\halastudy-refinement-2026-10-21\candidate-final` |

The checkout and both runtimes match the manifest, with no copied workspace `.env`. Seven unrelated untracked documentation/report folders are preserved. The baseline independently passed 145 integration tests and supplied 15 before screenshots; historical counts are not current verification. [Source parity](evidence/final-parity.json) and [command/exit ledger](evidence/commands.ndjson) bind the final evidence.

## Verification

| Check | Result / evidence |
|---|---|
| Complete package gate | **Passed:** check, typecheck, lint, deadcode, production audit, **152 integration tests and 70 browser tests**; one online-font case deliberately runs separately. [Exact log](evidence/verified-ci-2.log). |
| Final source binding | Start/end manifest hashes match; all 279 files match checkout and both runtimes. [Parity](evidence/final-parity.json). |
| Real PostgreSQL resilience | One comprehensive outage/restore scenario passed; disposable cluster stopped. [Log](evidence/verified-postgres.log). |
| SEO | 12 canonical public pages, three social images, redirects, noindex and actual 404 passed. [Log](evidence/verified-seo-local.log). |
| Anonymous access | 18 status/header-only public/protected/file probes passed; zero production requests. [Results](evidence/visitor-probes.json). |
| Public/room visual sweep | **86 states passed**, including six enlarged-text cases; actual locale/theme asserted, zero overflow, serious/critical axe findings or page exceptions. [Results](evidence/extended-browser.json). |
| Member visual sweep | **64 views passed**, with actual UI language/theme changes and DOM assertions before each screenshot. No overflow, serious/critical axe findings or page exceptions. |
| Text enlargement | Six 200% text primary actions unobstructed, in view after scrolling and without overflow. [Results](evidence/zoom-actions.json). |
| Actual fonts | Ten supplementary render states passed with real font families and actual locale/theme assertions. [Results](evidence/online-visual.json). Separate existing font/layout diagnostic passed. [Log](evidence/verified-fonts-metrics.log). |
| Review artifact | All links and images pass real-browser loading at 390/1440px, with no overflow or page exceptions. [Results](evidence/artifact-qa.json). |

The suite covers guest/member/owner/supervisor/staff boundaries, account/recovery/deletion, private membership and invitation failures, forged credit, pause/resume/abandonment/replay/caps/Riyadh rollover, reconnect/reload/tabs, actual multi-user contexts, provider failures, denied cameras, blur failure, token renewal/revocation, persistence failure and restart/restore. No assertion was removed or weakened. Lint retains two existing informational template-literal suggestions and no errors. Fresh installation and production audit report zero vulnerabilities.

The visual matrix covers 320/390/768/1440px, Arabic/English and light/dark; six enlarged-text cases supplement it. Screenshots were inspected, including mobile Study before/after, Arabic room in dark mode, desktop room, tablet English Progress and narrow entry forms. The wider matrix blocks external assets to make failures reproducible; the separate online views show actual Tajawal/Amiri/Newsreader typography. Accounts, room codes and attendance are synthetic local fixtures. The Study comparison uses fresh-member states; other preview screenshots can contain earlier locally created test rooms. The 15 initial before views are from the base commit; enlarged-text before images document intermediate defects repaired during refinement.

Axe CSSOM requests blocked by the unchanged CSP and an expected font request canceled during intentional navigation are preserved separately in the supplementary font evidence. Actual font-face failures, page exceptions, overflow and serious/critical axe findings remain failing conditions. The standalone application font diagnostic runs without axe and without synthetic forwarded headers. The four measured landing visits recorded LCP 208–996 ms and CLS 0–0.0202; no font or CSP errors were reported. [Measurements and conditions](evidence/performance.json). Lab checks use headless Chrome on this Windows host without network/CPU throttling; cache and local load conditions vary. They establish local stability thresholds, not field performance or retention improvement.

The earlier screenshot helper changed preferences before hash-only navigation, leaving some labels wrong. Final captures assert actual document state. The unchanged app implementation already passed the first complete gate; the new full run passed the stronger test and replaced those screenshots. Other corrected execution attempts and superseded logs remain in [EXECUTION-NOTES.md](EXECUTION-NOTES.md).

## Preview and release status

- **Local:** implemented and verified, with two local code/test checkpoints and the dedicated review package.
- **Preview:** running on loopback with synthetic data only.
- **Merged:** no merge or push performed.
- **Production:** no deployment, data mutation or live verification performed. **Release NO-GO** pending the owner-controlled acceptance in [ACCEPTANCE.md](ACCEPTANCE.md).

If the preview stops, run this from the repository root against the already installed isolated runtime:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File docs/refinement/2026-10-21-halastudy/scripts/run.ps1 -Label review-preview -Preview
```

Real provider/physical-device media, Google consent/client configuration, delivered recovery mail, merchant acceptance and hosted restore/release remain open. No charge, external message, provider dashboard change, hosted migration, production probe, purchase, push, merge or deployment was made. Activation and return metrics are defined in ARCHITECTURE.md; no measured uplift is invented.
