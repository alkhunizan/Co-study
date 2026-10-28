# Halastudy surface and state trace

Date: 2026-10-21. Read-only source audit of the current shared checkout. Branch observed: `feat/2026-10-21-halastudy-refinement`; HEAD observed: `5b186bd`. The implementation agent owns browser reproduction, source changes, and final gates. No production/provider action, database mutation, broad test gate, or test-file write was performed in this audit.

## Route and journey inventory

| Surface | Current implementation and journey | Important states / boundary |
| --- | --- | --- |
| `/`, `/en` | Marketing shell with open/join actions and illustrative room preview. SEO rendering is server-owned in `services/seo/public-pages.js:23-53`; room actions remain guest accessible. | Server-rendered AR/EN canonical routes; light/dark preference shared by core. First CTA opens `/open`; join opens its join mode. Public preview must remain illustrative. |
| `/open`, `/open.html` | Create/join decision and form, password option, room lookup, optional scheduled room, create result, code/invite/calendar actions. `open.html:83-202`, `1514-1545`, `1580-1649`. | Guest instant creation; account gate for scheduling. Safe form draft in sessionStorage, excludes passwords (`469-505`); 8-second socket creation acknowledgement; lookup handles missing/full/unavailable conditions. |
| `/study`, `/workspace`, `/room`, `/index.html` | One in-room page (`co-study-server.js:2238-2240`): join overlay, optional camera, participants/status intentions, shared board, local countdown, chat, ambient audio, schedule. | Guest/member/room-owner differences; lookup/join/password/private circle/full/ended states; socket reconnect; media provider lifecycle. Local countdown and verified focus accounting are separate owners. |
| `/lobby`, `/lobby.html` | Public silent lobby with display-name gate, real socket presence, paginated tiles; account required to publish camera. `lobby.html:125-160`, `379-430`, `448-504`. | Guest viewer/member publisher; SDK failure falls back to socket presence. Pagehide/restore and media generation guards already exist. Retry path and dynamic camera/language state still have source-level gaps below. |
| `/account`, `/account.html` | Password signup/login or optional Google; profile/name/accent/bio; legacy focus history and room history; signout, email verification, reauthenticated deletion. | Signed-out tabs are keyboard operated (`499-519`). Auth unavailable has retry; stats and rooms unavailable differ from zero (`648-666`). Post-auth destination is currently unsafe for backslashes and not preserved through Google. |
| `/recover`, `/recovery.html` | Password recovery / email verification with honest delivery availability. `services/auth/recovery.js:36,61,69,76`. | Runtime explicitly gates configured local delivery; real recovery-mail acceptance remains external. No new verification wall for guest/free access. |
| `/app#home` | Member study dashboard: eligible recent room, next upcoming group session, today’s verified minutes, manageable rooms. `platform.html:46-57`; `services/platform/dashboard.js:4-36`. | Suggestions re-check `platform.canJoin`; absent and unavailable are separate. The source includes a four-destination navigation already. |
| `/app#progress` | Canonical verified focus controller, acknowledged recap, totals, achievements, recent history, VIP CSV export. `platform.html:59-75`; `public/js/platform.js:314-354,739-749`. | Active/paused/completed/abandoned state is server-owned. Failed completion is explicitly unconfirmed; recap is displayed only after acknowledgement. Camera/payment do not determine credit. |
| `/app#circles`, `/supervisor` | Private groups: create for VIP, accept one-use token, detail/members, assigned supervisor, schedule/attend/cancel, owner archive/member leave. `public/js/platform.js:384-446,754-787`. | Server membership/ownership gates independently protect each operation; ordinary attendance sees self; supervisors see group attendance. Departures and newly private room scoping revoke existing sockets. |
| `/app#account`, `/app#security` | Account choice hub, profile/history link, membership, security, optional on-device counters; TOTP/recovery codes and Google reauthentication. `platform.html:127-153`. | Staff verification lasts 15 minutes; bootstrap visible only if eligible and verified. No entitlement/badge-to-staff bridge. |
| `/plans` | One free offer and VIP US$4.99/month; simulator or DigetPay sandbox state, pending/unknown/review/failed outcome handling. `platform.html:104-125`; `public/js/platform.js:448-508,789-831`. | Public plan view can redirect through account; provider path and origin are allowlisted. Latest payment/return verification is server-derived. Real charges and automatic renewal are not authorized here. |
| `/app#staff` | MFA gate then permission-scoped operations, rooms, users, cases, subscriptions, unresolved payment review, named roles, audit, backup. `public/js/platform.js:575-651`. | Server checks account, MFA and exact permission. Super-admin is a named role; old shared-admin access retires once named staff exists. |
| Public support/content | `/contact`, `/en/contact`, `/blog`, `/en/blog`, two Arabic article URLs, `/privacy`, `/en/privacy`, `/terms`, `/en/terms`. `services/seo/public-pages.js:23-53`. | Explicit route allowlist, canonical/hreflang, server-rendered language, 404 handling. No blanket static repository exposure. |

Workspace navigation already uses native anchors, respects modified clicks, pushes browser state, restores Back/Forward/hash routes, sets title/current page, and moves focus to the new heading (`public/js/platform.js:689-735`). Preserve this rather than treating older navigation findings as still open.

## State and technical ownership

| Concern | Owner / data / contract |
| --- | --- |
| Common browser behavior | `public/js/halastudy-core.js`: preference migration, document language/theme, translations, 15-second abortable JSON requests, cached auth, shared unavailable/retry state. `ui.js` supplies toast/confirm/auth menu. Page-specific controllers still own forms and socket/media state. |
| Workspace UI | `platform.js` keeps `user`, platform `state`, `progress`, `dashboard`, `ownedRooms`, selected circle, billing order, recap and view. `refresh()` performs four HTTP reads atomically (`709-714`); view routing is page-local. Circle request sequence prevents stale detail results (`393-403`). |
| Authentication | Signed cookies/session epoch in auth services. `/api/auth/signup`, login/logout/me; `/api/me/profile`, legacy stats/import, room history, deletion. OAuth stores server-side nonce/purpose/user/verifier; fresh provider proof is required for Google deletion/security. |
| Platform domain | `services/platform/index.js` composes database, access, catalog/entitlements, billing, progress, cohorts. This is already a reasonable bounded backend; migrating framework is unsupported by the audited defects. |
| HTTP authorization | `/api/platform/catalog` is public; webhook is a separate callback boundary; remaining routes use `requireUser`, user synchronization and mutation limiting (`services/platform/routes.js:23-52`). Each staff handler invokes MFA and named permission. Cohort methods authorize resource membership under transaction/row lock. |
| Rooms / sockets | Factory `co-study-server.js` owns Express, socket membership/live presence and room lifecycle. `onClientEvent` wraps 14 client commands: create/join, chat, 5 board commands, camera, RTC offer/answer/ICE, status, report (`2358-2888`). Room join is the authority for access/password/capacity; packet-time checks prevent stale membership writes (`2334`). Live camera/presence/socket IDs stay in memory. |
| Media HTTP | `/api/rooms/:id/video-token`, heartbeat and leave (`co-study-server.js:1895,2129,2163`), coordinated through shared video client/provider adapter and revocations. Media tokens require real room membership; provider credentials stay server-side. |
| Verified focus | `focus-client.js` serializes actions and heartbeats every 15 seconds. `services/platform/progress.js` owns server clock, grace window, 240-minute session limit, daily ledger and idempotent XP. Workspace restores current session; in-room page does not yet restore it. |
| Legacy/manual progress | Account focusStats and streak are a different store/API from verified sessions (`services/auth/auth-routes.js:223-267`). Client-duration completion and max-per-day import remain accepted as history. They must be visibly distinguished from verified rewards. |
| Circles | Transactional cohorts/membership/invitations/schedules/attendance. Invitation tokens are hashed, one-use, 48 hours; owner VIP determines creation/capacity. The UI shows raw invitation token without a shareable link. Privacy scoping is persisted and current socket listeners are disconnected after scope changes (`routes.js:135-149`). |
| Persistence / concurrency | PGlite local or explicitly configured PostgreSQL (`services/platform/database.js`), SQL migrations and record-store adapter. PostgreSQL has dedicated process lease, transaction/query deadlines; PGlite uses directory lock. Single live app process is deliberate; no horizontal scaling implied. Auth/room legacy records are serialized into canonical platform store. |
| Commercial and staff separation | `catalog.js:1-10` fixes USD499 minor monthly VIP and free features. `access.js:6-13` has separate named permission matrix and 15-minute staff verification. Subscription, XP and achievement do not confer role assignment. |

## Prioritized improvement candidates

These are source-confirmed paths or explicitly marked browser candidates, not historical test results. The main agent should reproduce each on the isolated runtime and account for the finding after implementation.

### ST-01 — High: post-login destination can leave the origin

Evidence: `account.html:492-495` accepts a target if it starts `/` and does not start `//`. Backslashes are not rejected or URL-parsed. `location.assign(resolveNextUrl())` is used after password login/signup (`550,569`).

Reproduction: open local `/account?next=%2F%5Cexample.invalid`; complete synthetic password authentication. The accepted string is `/\example.invalid`, which the WHATWG URL parser resolves to `http://example.invalid/`. A local Node parser probe confirmed the acceptance predicate is `true` and resolved origin is external; browser redirect reproduction remains for the main agent. No external destination was contacted by the probe.

Acceptance: one shared same-origin return-target helper validates the parsed URL against the current origin, rejects backslashes/control characters and protocol-relative/absolute external targets, preserves valid local query/hash, and falls back usefully. Apply it consistently to password and OAuth continuation paths. Add targeted hostile-target and valid-deep-link regression cases.

### ST-02 — High: reloading a member room loses the local handle for a verified active session

Evidence: only workspace refresh calls `HalaFocus.restore(progress.current)` (`platform.js:712`). In-room `initAccountIntegration()` only loads identity (`index.html:3234-3259`). Reset calls `trackValidatedFocus('complete')` (`3579-3588`), but focus-client action returns its null `current` without a server request unless action is resume (`focus-client.js:22-25`).

Reproduction: sign in, join a room, start focus; reload before completion, then press Reset. Before pressing Start again, the browser has no current session handle, so reset cannot complete or report the still-open server session. Continue in workspace to inspect the current session. This is a source-level lifecycle candidate pending browser proof.

Acceptance: restore current verified session at member room boot; make continuing/pausing/finishing an interrupted session explicit; only show saved recap after acknowledged completion; keep local countdown independent and avoid granting elapsed disconnected time. Exercise reload, old tab, delayed heartbeat, zero-credit finish and interruption.

### ST-03 — High: returning lobby visitor cannot retry a rejected initial join

Evidence: lobby boot binds `name-go` and Enter only in the no-saved-name `else` (`lobby.html:521-531`). With a saved `halastudyDisplayName`, `enterLobby(saved)` runs without those bindings. `joinFailed()` later exposes name gate and hides lobby (`380-384`).

Reproduction: seed `halastudyDisplayName`, make initial socket connect fail or initial join return `ROOM_FULL`; restore availability and click the exposed entry button or press Enter. No listener was installed, so the retry is inert.

Acceptance: bind gate once for all paths; preserve displayed name; show a durable translated retry path for full/network/denied outcomes. Recover without clearing storage or reloading. Test fresh and returning visitors separately.

### ST-04 — High journey impact: Google authentication discards intended destination

Evidence: both Google links use static `/auth/google` (`account.html:188,217`). OAuth pending state stores purpose/user/verifier, no destination (`google-routes.js:77-81`); successful login/signup always redirects `/account?auth=google` (`194,222`). Callback scrub also removes all query parameters (`account.html:473`).

Reproduction: open `/account?next=%2Flobby` from lobby’s camera CTA or `/account?signup=1&next=%2Fopen.html%3Fschedule%3D1` from scheduled-room gate; complete Google fixture authentication. It lands on profile instead of lobby/schedule. The safe room draft itself is already preserved by open.html and should remain so.

Acceptance: validate local destination once, bind it to server-side OAuth nonce state, use it for successful auth and retry/failure recovery; preserve same-site path/query/hash and prevent ST-01 variants. Existing delete/security purpose destinations must retain priority.

### ST-05 — Medium/high trust: legacy history and verified progress look like the same numbers

Evidence: account `Your focus`, `Focus hours`, streak tiles (`account.html:233-246,328-331`) read `/api/me/stats` (`648-653`). That endpoint returns legacy/client-importable focusStats/streak (`auth-routes.js:223-267`); workspace Progress is a separate verified SQL ledger. In-room countdown completion submits both stores (`index.html:3195-3203`).

Reproduction: create a verified short/completed workspace session and visit Account, then import or complete legacy room minutes and compare Progress. Counts can differ even when both are labeled focus hours/progress.

Acceptance: show canonical verified progress prominently; label existing/imported history accurately and explain that it does not award XP. Preserve data and existing free access; do not silently merge manual minutes into reward eligibility.

### ST-06 — Medium: camera action and language state mislead in lobby

Evidence: `camera-cta` retains `data-lang="camGuest"` (`lobby.html:160`). Member render overwrites its text to `camReady` (`448-455`), but no language subscriber rerenders dynamic member/video state. `startPublishing()` toggles enable/disable (`465-468`) without updating button label/pressed state (`486-488`). Tile live/watching labels are also created dynamically (`357-360`).

Reproduction: join as signed-in fixture, enable camera; the same action still says Turn on my camera while it will turn it off. Switch language: shared translation reapplies guest sign-in text even though its click handler still publishes. Observe tile labels across the language change.

Acceptance: a single localized camera control derives from identity, loading/provider status and actual enabled video; use `aria-pressed`, honest on/off/unknown wording and language change rerender. On provider failure restore useful presence-only state. Guest view stays camera-off and welcoming.

### ST-07 — Medium product completion: group invitation handoff is a token-only dead end for newcomers

Evidence: group invite creation renders only `result.token` (`platform.js:762-769`; `platform.html:88-89`). Guest Circles shows generic sign-in (`showView:695-696`) and invitation input has no URL/draft restoration. No existing `invite` URL reader was found in platform.js.

Reproduction: owner creates invite and shares its screen/token with someone who has no account. Recipient must discover account creation, navigate back to Groups, and re-enter token manually. Existing room invitation deep links are separate and already supported.

Acceptance: preserve raw token option, add copyable same-origin group invitation link with one-use/48-hour/scope copy; retain it safely through login/signup and explicitly accept after identity is known. Never auto-publish group membership/attendance or expose private room details before acceptance.

## Historical reconciliation and preserved strengths

- `docs/architecture/2026-10-20-platform-review/REVIEW.md` predates implemented named staff/MFA, product catalog/entitlements, Google reauthentication, transactional platform storage and private circles. Those are present now and must not be rebuilt from the old absence findings.
- `docs/implementation/2026-10-20-deep-ux/REVIEW.md` describes four destinations, browser history/focus routing, guarded circle fetches, dashboard suggestions, safe drafts, trustworthy recap and optional local counters. The corresponding code exists. Its historical counts do not establish current test results.
- `docs/viber/2026-10-21/RUN.md` reports earlier local lobby/board/payment/release issues. `docs/hardening/2026-10-21/REVIEW.md:71` explicitly supersedes that batch’s local defects. The audited current code contains lobby shared media lifecycle, board cap, provider/review pagination and later database work; re-test current behavior rather than carrying stale open findings forward.
- Current workspace progress completion handles unconfirmed completion separately (`platform.js:742-749`); auth stats/rooms use unavailable states (`account.html:648-666`); these are retained strengths.
- Remaining real-provider camera/privacy, merchant sandbox, email delivery and hosted-operations acceptance need the main release verdict. This audit did not claim to validate them.

## Structure recommendation

Keep vanilla multi-page delivery and existing URL aliases. The existing backend domain services and shared browser core already provide useful seams; a framework migration would add migration risk without resolving the concrete failures above. Add a small common local-return contract, then give member room focus restoration/completion an explicit controller beside the shared focus client. Consolidate lobby identity/media/action rendering into one derived state function. Preserve account legacy history as clearly named historical data while treating platform progress as canonical reward state. Shared shells and centralized translations can follow these behavioral fixes without moving business authorization into the browser.

## Source fingerprints at audit end

These fingerprints distinguish the reviewed shared checkout from HEAD-only or previous-report evidence. Later implementation edits will intentionally supersede them.

| File | SHA-256 |
| --- | --- |
| `public/js/platform.js` | `3EC8C1A4FA33E4D4994116C7FBE9156C8C9824B707B80CBBC20488F369BB8233` |
| `platform.html` | `B87AE35589DB99A039BB25831B4E65C8B09E169FD06DC0E3020BCD819463DB56` |
| `account.html` | `F46E27CDF6C1C7FB0B5E3CDDCA9C01383A6C733027126190F49804196AAD2558` |
| `lobby.html` | `3E9B57E7B64DBD1404CF6AF27D2FC03469475EC712E0ABD30693DAEC3B65BCBD` |
| `open.html` | `E681C31377017F463C7735C3132AE7EB2CF91F44F61B6F133F391F5DF8826029` |
| `index.html` | `F5D7D3B6164516FDDD9B363B8F56E85CE02749A1DB0A3FAF56571D46C200C149` |
| `services/auth/google-routes.js` | `57421E74BB580E095286D1741AFE78B60A13803CFE6AEDDB41697936E913A92F` |
