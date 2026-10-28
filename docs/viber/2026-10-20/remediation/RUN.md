# Authorized dirty-file remediation

**Verdict: GO-CONDITIONAL for the local candidate.** All verified local blockers from the dirty-file review are fixed and committed. Production rollout remains conditional on the owner handoff below; no live readiness or real-payment claim is made.

User explicitly requested a long fix pass over the previously blocked dirty files. This supersedes the skill's dirty-file exclusion for the platform implementation; unrelated blog pages and `images/og/` remain excluded.

- Branch: `viber/2026-10-20`
- Implementation checkpoint: `14aa494` (56 related files). Previous review commits remain intact.
- Scope: local implementation and verification. No push, merge, production writes, provider changes or deployment.
- Product: free access plus one VIP offer, USD 4.99/month; local test checkout only.
- Evidence: `evidence/` in this folder. Local execution copy: `C:\Users\alkhu\AppData\Local\Temp\halastudy-viber-2026-10-20\candidate`.

## Map and boot

Resumed the completed nine-phase map in the parent folder. Read the current code and dirty inventory; checkpointed related implementation before remediation. Test helpers explicitly clear remote PostgreSQL/Supabase targets and use temporary files or PGlite memory databases. No `.env` was loaded. Node 22.23.3 is invoked directly.

## Trace, probes, sweep and fixes

- V9-01: shared socket boundary rejects null, arrays, primitives and extra arguments; optional acknowledgements are normalized; sync exceptions and rejected promises are contained. All 14 client handlers use it. Regression includes healthy valid create/join/chat/board controls after malformed packets.
- V3-01/V3-02: validate profile fields before mutation; serialize account edits; await durable writes; restore only affected fields after failure and persist the correction. Preserve unrelated history/token changes and never reinsert a deleted account. Independent review found a failed-delete rollback race; restoring the detached captured object fixes it.
- V3-03: bounded HTTP reads, strict JSON and auth response handling, retryable failed auth cache, unavailable/retry account states, all auth callers handle rejection. New browser tests exercise 503, malformed response, stalled fetch, stale cache failure and recovery.
- V3-04: archive owned circles and revoke invites within account deletion transaction; keep historical/private scope. Close affected runtime rooms after successful account deletion. Last-super-admin failure rolls everything back.
- R-01: private-room transition disconnects nonmembers synchronously using membership captured in the transaction, before fallible snapshot persistence. Real PGlite route test injects snapshot failure and checks receiver revocation.
- R-02: identical schedule retries under the cohort lock return the committed session, without duplicate audit. Changed content remains a distinct session.
- R-03: hide circle details while loading, ignore stale responses, capture mutation targets, discard stale attendance/invite results, invalidate pending archived-circle reloads.
- R-05: refresh connected account attendance once per minute, including early arrivals; the attendance writer no longer recreates deleted users and excludes archived circles.
- V7-01: bound PostgreSQL statements, lock waits, idle transactions and client query waits; discard connections on failed rollback; never replay an uncertain commit. Driver fault test only, not actual managed PostgreSQL validation.
- V6-02/R-04: HSTS in the deployment TLS example and conditional HTTPS bootstrap template; repeated bootstrap preserves existing Certbot configuration and writes a reviewable candidate.

## Verification history

Initial new regressions: 8/8 backend, 4/4 browser passed. Initial broad integration: 96/97; the execution copy omitted `videos/hero`, so its asset assertion returned 404. This is a candidate assembly error, not a passing check. The missing Chromium cache likewise prevented the first browser attempt; installed Chrome runs the browser checks. Final results will be appended after the complete candidate is checked.

Browser regression routes block non-loopback traffic. Broad browser runs also enable the Chromium host-resolver restriction for external names. No new production-site requests were made during remediation. Three official documentation pages were read: [node-postgres configuration](https://node-postgres.com/apis/client), [Nginx headers](https://nginx.org/en/docs/http/ngx_http_headers_module.html), [Nginx maps](https://nginx.org/en/docs/http/ngx_http_map_module.html).

The prior gate's production parity and provider/migration limitations remain release tasks. This run does not claim that the new site is live.

## Visitor and security verification

The original null-payload probe now returns `PAYLOAD_INVALID`, health remains 200, and no server exception is logged. Its valid create control also succeeds. The original profile partial-mutation probe no longer reproduces.

The repeated HTTP probe recorded 83 entries. All 40 anonymous protected-platform requests returned 401. A 20-request invalid-login burst returned ten 401s and ten 429s. Cross-account operations and malformed requests stayed denied; the browser probe recorded no page errors. These are local synthetic requests.

Reviewed five layouts: English desktop home (1440px), Arabic tablet VIP (900px), Arabic mobile circles (390px), English dark mobile progress (390px), and Arabic dark mobile auth failure (390px). Existing automated accessibility assertions pass on the four platform layouts. A separate steady-state check measured 15.09:1 retry-text contrast, a 52.5px control height and no overflow. The first auth-failure screenshot captured a theme transition; `mobile-ar-auth-unavailable-steady.png` is the steady-state evidence. This is not a whole-site accessibility certification.

## Local commit receipt

| Commit | Concern |
|---|---|
| `14aa494` | Preserve the authorized platform implementation as a reproducible checkpoint |
| `d504302` | V9-01: socket input and async failure boundary |
| `60d24f2` | V3-01/V3-02: atomic validation, durable account mutations and recovery races |
| `9bbefe0` | V3-04: owner deletion archives circles and closes runtime rooms |
| `65ae772` | R-01/R-02: immediate private-scope revocation and retry-safe schedules |
| `a8e42b6` | R-05: quiet connected-member attendance |
| `994e140` | V7-01: bounded database work and safe failed rollback disposal |
| `11d0f36` | V6-02/R-04: HSTS consistency and preserved Certbot configuration |
| `c91d40d` | V3-03: unavailable account reads, retries and bounded requests |
| `59f8c15` | R-03: circle selection/action consistency and browser regressions |
| `6319399` | V3-03 sibling: hide workspace actions until initial data loads |

Ten remediation commits plus the implementation checkpoint; the previous three review fixes remain in the branch. Unrelated dirty blog pages and `images/og/` were neither staged nor edited. Generated evidence is retained locally in its dedicated folder and excluded from Git.

## Coverage and limitations

- Nine of the original ten risk groups exercised locally (90%): password sessions, Google identity/reauthentication with a local fake provider, profile/deletion, socket/media authorization, circles/supervision/attendance, focus/XP, test billing/entitlements, MFA/named staff, backup/restore.
- Production release and actual external-provider operation remain partial/unverified. PostgreSQL fault tests use a mocked driver; they do not prove real lock/network behavior. Nginx and Docker are unavailable on this machine. Bootstrap shell syntax passes, but no image build or Nginx runtime validation is claimed.
- Runtime source comes from `git archive` of `63193999877ebaa12792834ed72fc791bc8c271c`, with the unchanged dependency lockfile. Archive provenance is recorded in `evidence/release-final-candidate.json`. Later documentation-only commits do not change this runtime source.
- Source review follows the original inventory and two independent reviewers' follow-ups. The original gate recorded 46 complete body reads among 160 scanned files; remediation complete-file counts were not tracked. No claim that every source file was read in full.
- No new production-site calls during remediation. Three official documentation pages were read, and npm's production audit contacted its registry. The first gate's uncounted CDN/font requests remain an inherited cap-accounting gap; this run does not retroactively claim aggregate compliance. New broad browser runs restrict external DNS; new browser regressions and probes additionally block non-loopback requests.
- No new persistent preview, push, merge, live migration, real charge, secret rotation or deployment. Memory files were not changed.

## Owner handoff before production

1. Recover current live content and data, dry-run migration on a copy, verify restore and the single-instance recovery procedure, then deploy the reviewed candidate. Preserve the separate blog/image work deliberately during release assembly.
2. Verify the actual PostgreSQL/hosting choice, Google callback, video/TURN and backup storage. Specifically prove that removal/ban/archival terminates provider media access as well as Socket.IO access; provider-side termination and replay were not tested against the real service.
3. Validate the reviewed Nginx configuration and confirm HSTS plus `/app`, `/plans`, `/supervisor` and protected API behavior on the real HTTPS domain.
4. Select and integrate a payment provider before enabling real purchases. Keep exactly VIP USD 4.99/month; do not migrate simulator subscriptions into live entitlements.

Watch in week one: storage/rollback failures and stale runtime locks; video-provider authentication/termination failures; staff MFA recovery or bootstrap lockouts.

Manual acceptance (at most five): two-device camera/reconnect; private-circle removal and owner deletion; super-admin MFA/recovery and denied member access; live-copy migration/restore; production checkout disabled until the provider is verified.

## Final decision and thoroughness receipt

Final runtime candidate: `63193999877ebaa12792834ed72fc791bc8c271c`, assembled directly from Git, including published media and excluding unrelated uncommitted content.

| Gate | Final result | Evidence |
|---|---|---|
| Syntax | Pass | `evidence/release-check.txt` |
| Types | Pass | `evidence/release-typecheck.txt` |
| Lint | Pass, 92 files, no warnings | `evidence/release-lint.txt` |
| Dead code | Pass | `evidence/release-deadcode.txt` |
| Production dependencies | 0 vulnerabilities; lockfile unchanged | `evidence/final-audit-prod.txt` |
| Complete integration suite | **99 passed, 0 failed/skipped/cancelled**, 217.5s | `evidence/release-integration.txt` |
| Complete browser suite | **32 passed, 0 failed**, installed Chrome, 7.5m | `evidence/release-browser.txt` |
| Original socket crash reproduction | Rejected payload, valid control succeeds, health stays 200 | `evidence/socket-boundary.json` |
| HTTP/security/visitor probe | 83 entries; 40/40 protected anonymous routes denied; rejected profile unchanged | `evidence/local-probes.json` and `probe-summary.json` |
| Bootstrap shell parser | Pass | `evidence/tooling.json` |

The first incomplete execution-copy failures and missing browser-cache failure remain in the evidence, followed by passing complete runs. They are not rewritten as successful attempts. The final test runs above are each complete green runs, not sums of reruns.

Coverage is 9/10 risk groups (90%) locally; actual production/provider operations are the remaining group. The primary profile, socket and circle fixes were independently reviewed; two further races were found, corrected and tested before this decision. Remaining open items are production parity/rollout, applying HTTPS configuration, and actual PostgreSQL/provider verification. Docker image execution remains unverified.

Confidence: high in the tested local behavior; medium for production until actual services and live-data migration are verified. The most likely review gap is real-provider media termination/replay behavior, which local fake-provider and mesh tests cannot establish.

No relevant memory registry entry was used and no memory files were updated. No unrelated process was terminated. The application test processes exited after verification; no persistent preview is claimed.
