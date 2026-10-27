# Halastudy UX implementation

Goal: complete T01-T16 from `docs/tester/PLAN-2026-10-20.md`, with a review after each phase.

Branch: `ux/2026-10-20-deep-enhancements`  
Starting HEAD: `c1a29dd33c9414767ca593325ff88a014b3806ea`

## Starting state

Pre-existing DigetPay changes and unrelated audit documents are preserved. `baseline/preexisting.patch`, file snapshots and `baseline/manifest.json` record the starting tracked changes. Existing untracked payment modules, migration and tests remain in place. No live services are used for write tests.

## Progress

| Phase | Tasks | Status | Review |
|---|---|---|---|
| 1 - Interaction repairs | T01-T05 | Complete locally | Passed; details below |
| 2 - Starting and room experience | T06-T11 | Complete locally | Passed; details below |
| 3 - Return, organization and polish | T12-T16 | Complete locally | Passed; details below |
| Final regression and handoff | all | Complete locally | All scoped scenarios verified |

## Checkpoint

All 16 tasks and the final regression/handoff are complete locally. See REVIEW.md and REVIEW.html for results and evidence. All outputs belong in this folder or the dedicated local runtime folder. Application edits remain reviewable in the current checkout. Deployment is outside this implementation run.

## Phase 1 review

- T01: Arabic/English join CTA matches the code-entry destination; deep links preserved.
- T02: closed join dialog uses hidden/inert state; focus is deliberate; failed joins reopen it; 40 Tab presses do not enter invisible fields.
- T03: feedback stores translation keys and view ownership; invitation errors translate and clear on navigation. Payment state rendering retained.
- T04: user navigation pushes history; Back/Forward and reload restore sections.
- T05: fixed language groups, room-mode radio semantics/keyboard behavior, auth-tab keyboard behavior, timer labels and action names, caption/selected-state contrast, table access and focus styling. Dark member-row backgrounds now use theme tokens.
- Syntax/type/lint checks passed. Browser evidence: `evidence/phase1-reviewed.json` recorded 14 passing scenarios including DigetPay configured/unconfigured UI, account, room handoff, full platform and four new UX tests. Two legacy test setup/assertions relied on opacity-only hiding and were corrected to assert real connected/inert behavior; two dark member-label contrast failures were corrected.
- Recheck `evidence/phase1-final.json`: all 3 affected tests passed, including the 20-state accessibility matrix with zero serious/critical findings. The comparison article remains an Arabic content route and was tested with both stored language preferences; English entry/room states were separately checked.
- Reviewed Arabic light and English dark room screenshots. The long room layout is deliberately addressed by T08 next.
- The baseline payment-service hashes still match. No provider calls, live writes, pushes or deployments.

## Phase 2 review

- T06/T09: first-screen primary action fits 390x664/844 in AR/EN. Hero content reserves space, has no random attendance ticker and passes 10-second lab stability checks in both motion settings. External fonts were blocked for this repeatable local lab; online font verification belongs to T15/final review.
- T07: scenes explicitly say illustrative preview; sample identities, live attendance/city counts and random-walk script removed. Real feature facts replace simulated social proof.
- T08: desktop room uses context/timer/chat columns; mobile starts with timer and session goal, with native expandable member/board/chat tools. Short desktop workspaces scroll their center column.
- T10: optional controls are disclosed; a bounded 30-minute per-tab draft survives signup, never stores passwords, clears on successful creation and rejects expiry.
- T11: denied/missing camera guidance translates, offers explicit retry/continue and keeps the timer usable without permission prompts. Optional-camera marketing now matches the product.
- Review: phase2-review.json records all 11 UX checks passing, including 20 accessibility states, draft/camera journeys, mobile layout and lab vitals. A legacy blur test exposed clipped camera controls; fixed the inherited transform and short-height clipping. phase2-recheck.json passes all 8 room smoke scenarios, including fake-device canvas blur teardown, SFU/RealtimeKit shells, password joins and shared tools. 27 original phase2 checks passed before the fix; the 4 remaining serial room scenarios were covered in the 8-test recheck.
- Reviewed current Arabic mobile entry/room and English desktop screenshots. No production writes or changes to payment services.

## Phase 3 review

- T12: four primary navigation destinations fit 390px. Security/VIP/staff access lives under Account, with deep links and permission/MFA protection retained. The dashboard queries only the current account, uses existing private-room membership checks, excludes deleted/unauthorized rooms and shows a safe empty state. Today sums server-credit day partitions from completed sessions in Asia/Riyadh; lifetime totals remain in Progress.
- T13: recap uses the acknowledged server result, separates elapsed time from credited minutes/XP and offers another session. Short completion shows zero minutes/points, failed completion stays unconfirmed with retry, and reload creates no additional completion. Credit rules are unchanged.
- T14: group schedule input displays the device IANA timezone; confirmations include localized time, GMT offset and IANA name. Room schedule input/confirmation explicitly names Asia/Riyadh and UTC+03:00. Browser round-trip checks passed in Riyadh/London before and after the DST boundary; formatter integration checks distinguish the repeated London hour. Calendar export verification is included in final room regression.
- T15: separate /privacy, /en/privacy, /terms, /en/terms routes use the same language-aware shell; legal paragraphs are preserved exactly and both languages remain reachable. Standalone footer/header targets are 44px. Shared-shell axe checks pass in both themes. Clean online probes loaded all used font families with no font failures or notices; earlier font notices did not reproduce, so CSP was not broadened.
- T16: optional, disabled-by-default on-device aggregate counters; strict allowlisted fields/enums, bounded memory/counts, seven-day expiry and revoke/reset. No provider/transport or external tracker. Source/payload tests reject sensitive/unknown data; actual join/focus/return event deduplication and blocked storage passed. Moderated study script and baseline limitations are in UX-EVIDENCE-CONTRACT.md. No participant research is claimed.
- Evidence: phase3-final.json passes the complete member/VIP/supervisor/staff journey; phase3-verified.json passes dashboard/recap/counters/legal checks; timezone-verified.json passes actual timezone round-trips; phase3-matrix.json passes 48 returning-user states with no serious/critical or target-size findings and no page overflow. online-final.json passes real-font layout checks at mobile/desktop with no failed font GETs or font/CSP notices.
- Reviewed Arabic mobile Account/Home, English dark tablet Progress/recap and desktop Home screenshots. All four static checks pass in static-verified.log. Full integration and smoke regression are the remaining final gate.

## Final review follow-ups

- Full integration: 130/130 passed in integration-verified.log. Earlier runs exposed two tests tied to the former combined legal-page/count behavior; those were updated to assert both real localized routes and 12 canonical pages, retaining content-preservation and reciprocal-link checks.
- Final online screenshots exposed a legal-shell CSS rule overriding responsive marketing navigation. Scoped those rules to the legal body class and added an explicit hidden-desktop-menu assertion on mobile. The existing standalone link sizing remains shared. These corrections await the final browser recheck.
- A no-JavaScript SEO smoke assertion still expected the previous hero wording. Updated its exact English/Arabic expected copy; language-route behavior and all accessibility checks are retained.
- Authoring scripts in this folder are historical, one-use records and must not be rerun. sync-runtime.cjs and checkpoint.py are the repeatable verification helpers.

- Shared schedule display now explicitly uses the Gregorian calendar in Arabic and English, matching datetime-local inputs. Room creation, in-room confirmations and group confirmations use the same formatter, IANA label and GMT offset; the stored instant/recurrence engine are unchanged.
- The broader no-JavaScript/public-page smoke then exposed moderate aria-allowed-attr findings: language anchors had acquired button-only aria-pressed. Core/marketing language controls now distinguish native links (aria-current, navigation) from buttons (aria-pressed). The public-page scan retains its all-violations assertion; a targeted recheck will supersede that failure.

## Final completion

- All 16 tasks implemented and verified; 3 phase reviews complete.
- Full integration: 130 passed. Affected integration recheck: 7 passed. Static syntax/type/lint/dead-code and Git whitespace checks passed.
- Full offline browser run: 52 passed, one public-page ARIA failure corrected, one online diagnostic intentionally skipped. All 9 focused rechecks passed afterward, including the all-violations public-page scan, both language-control types, mobile menu, shared/legal shell and 20-state public/room matrix. Separate final online-font scenario passed. All 54 unique browser scenarios now have passing evidence; original failures remain visible in their source reports.
- Final real-font AR/EN mobile/desktop lab: max CLS 0.0340154464; max LCP 848 ms; 0 failed font requests and 0 font/CSP notices. Reviewed refreshed screenshots.
- Final cumulative UX-only patch covers 33 files. All 189 synchronized source/config/test files match the runtime manifest. All 16 baseline/payment preservation checks pass.
- REVIEW.md contains the task matrix, results, reproduction notes and remaining release boundaries; REVIEW.html is the local screenshot gallery. verification-summary.json maps each scenario to its passing evidence.
- No merge, push, deployment, publication, provider charge, external analytics transfer or credit-rule change. Separate payment/provider acceptance, account-recovery delivery and production release gates remain outside this local UX completion.
