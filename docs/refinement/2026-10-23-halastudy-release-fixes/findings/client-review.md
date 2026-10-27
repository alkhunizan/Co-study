# Client, presentation and disclosure source review

Reviewed 2026-10-23 against checkpoint `c4d6c50553f55704b4d4a788db28b05fa983047a` and the current shared working tree. This is source review evidence, not executed route, browser, device or provider acceptance. No app source was edited by this reviewer. No tests, browsers, external/provider requests, commits or writes outside this findings folder were performed.

All 30 assigned files were read to EOF, including every CSS, HTML, copy and executable section of `index.html` and `open.html`. Truncated command output was reread in smaller ranges. The account heading/branding delta made concurrently by the parent was also read with `git diff -- account.html`. Current file digests and line ranges are in [client-review.json](client-review.json). They describe the working-tree observation when that manifest was written; later parent fixes require delta review. Finding references below use checkpoint line numbers so they remain locatable after insertions.

## Full-read ledger

| Coverage ID | File | Actual read ranges | Depth / source result |
| --- | --- | --- | --- |
| F037 | `services/seo/public-pages.js` | 1–195 | Full; routing, metadata, locale rendering, legal shell, source attribution |
| F045 | `public/js/focus-client.js` | 1–82 | Full; serialized focus actions, reconciliation, retry/completion credit |
| F047 | `public/js/legal-shell.js` | 1–4 | Full; theme binding |
| F048 | `public/js/marketing-copy.js` | 1–247 | Full; AR/EN public claims and illustration labels |
| F049 | `public/js/platform-copy.js` | 1–296 | Full; billing, staff, progress, privacy and failure copy |
| F050 | `public/js/platform.js` | 1–350, 351–699 | Full; account context, circles, staff, checkout, error surfaces |
| F052 | `public/js/room-focus.js` | 1–87 | Full; acknowledged account credit and room recap |
| F054 | `public/js/schedule-display.js` | 1–12 | Full; timezone-visible dates |
| F055 | `public/js/study-copy.js` | 1–185, 186–361 | Full; AR/EN study tool promises and constraints |
| F056 | `public/js/study-routine.js` | 1–60 | Full; local guidance state machine, no credit authority |
| F057 | `public/js/study-workspace.js` | 1–420, 421–840, 841–1254 | Full; identity pins, drafts, resources, reminders, routines, journal |
| F058 | `public/js/ui.js` | 1–284 | Full; CSS, toast, modal, auth chip |
| F059 | `public/js/ux-insights.js` | 1–69 | Full; consent, schema, TTL, bounded local aggregate counts |
| F060 | `public/js/video/realtimekit-client.js` | 1–181 | Full; script loading, ordinary/headless joins and teardown |
| F061 | `public/js/video/video-client.js` | 1–142 | Full; token/heartbeat/leave sequencing and late join cleanup |
| F062 | `404.html` | 1–92 | Full; CSS, navigation, AR/EN copy |
| F063 | `account.html` | 1–280, 281–530, 531–764; parent delta to 767 | Full baseline plus observed delta; authentication, account mutation, deletion |
| F064 | `admin.html` | 1–250, 251–490, 491–692 | Full; legacy operator UI, every request and action |
| F065 | `blog-best-study-rooms.html` | 1–160, 161–285, 286–413 | Full; CSS, article claims, links, structured data |
| F066 | `blog-study-with-me.html` | 1–170, 171–300, 301–403 | Full; CSS, article claims, links, structured data |
| F067 | `blog.html` | 1–120 | Full; CSS, article discovery, locale binding |
| F068 | `contact.html` | 1–43 | Full; provider-independent contact routes and operator wording |
| F069 | `index.html` | 1–700 (435–459 reread), 701–1010, 1011–1320, 1321–1670, 1671–2010, 2011–2360, 2361–2710, 2711–3070, 3071–3420, 3421–3770, 3771–4120, 4121–4460, 4461–4760, 4761–4976 | Full; all styling, dialog/room markup, copy, sockets, media, blur, board, chat and timer code |
| F070 | `landing.html` | 1–215, 216–430, 431–624 | Full; illustration disclosure, locales, menu, animation, CTAs |
| F071 | `lobby.html` | 1–280, 281–546 | Full; grid/presence, viewer/publisher flow, retries, lifecycle |
| F072 | `open.html` | 1–400, 401–760, 761–1120, 1121–1420, 1421–1667 | Full; create/join, drafts, runtime config, schedules, calendar, errors |
| F073 | `platform.html` | 1–227 (51–99 reread after output truncation) | Full; all panels, forms, disclosure and accessibility semantics |
| F074 | `privacy.html` | 1–140, 141–263 | Full; both languages and all policy sections |
| F075 | `recovery.html` | 1–44 | Full; no-referrer/noindex shell; recovery.js not part of this assignment |
| F076 | `terms.html` | 1–150, 151–243 | Full; both languages and membership/media terms |

Additional guard-twin reads were scoped, not promoted to full-file reviews: `public/js/halastudy-core.js:120–211`; `co-study-server.js:633–680,1040–1085,1167–1198,2870–2900`; `services/auth/auth-routes.js:1–78,180–290`; `services/platform/study-routes.js:1–29`. Other references found by search were inventory only.

## Source-supported candidates requiring implementation/verification

### C01 — Hidden status still discloses its custom text and activity metadata to room members (P1)

**Path:** `index.html:2754–2766` clears `text`/`goal` when sharing is off but always sends `manual`, `manualPreset`, `ambientType`, `autoSync` and `timerMode`. `co-study-server.js:633–651` repeats that partial clearing, preserving the manual text at 645. The `user-status` handler stores this object and broadcasts it verbatim to the room at 2879–2881. Joined room snapshots include `user.status` verbatim at 1181–1186. `index.html:2939–2944` only hides it in the normal UI.

**Enforcer/refutation:** The current sanitizer correctly suppresses the visible text and goal, but it does not suppress the parallel fields. Membership authorization limits who receives the event; it does not uphold the member's sharing-off choice. This is a source-confirmed disclosure path, not a public unauthenticated leak.

**Fix/control:** Minimize the client payload and have the server remove every private text/activity field when sharing is off. Apply the same projection to status-update, presence and initial room snapshots, including old cached user.status objects. With two synthetic members, set distinctive manual text, turn sharing off, observe the other member's raw event plus a third joining member's snapshot, and assert the distinctive text/activity is absent while sharing-on still works. Do not log real room contents.

### C02 — Ordinary RealtimeKit and embedded SFU joins request video automatically despite optional-camera copy (P1)

**Path:** `index.html:3893–3916` mounts provider media immediately after successful room admission. The ordinary SDK wrapper initializes `{ audio: !!policy.micDefaultEnabled, video: true }` at `public/js/video/realtimekit-client.js:95–100`. `mountSfuFrame()` similarly sets `video: 'true'` at `index.html:4223–4243`. The page promises optional camera at 767/1007/1189 and the effective replacement copy at 1296/1305. Mesh starts camera only through an explicit action at 4266–4284. Lobby headless joins correctly default video/audio false at `realtimekit-client.js:146–149` and explicitly publish at `lobby.html:467–482`.

**Enforcer/refutation:** Server client policy at `co-study-server.js:1071–1080` pins microphone off and recording off but supplies no camera-consent gate. The regular camera toggle is disabled for provider modes at `index.html:4195–4203`; it does not provide a pre-join opt-in. Browser permission can block video, but an existing camera permission does not establish consent for each new room.

**Fix/control:** Join with video false and provide an explicit user action before publishing for each provider mode, retaining mic-off and usable camera-off study. Synthetic SDK fixture must capture `init.defaults.video === false` on room entry; test existing permission, denied permission and a camera-off member. For embedded SFU, inspect the configured provider's supported camera-off initialization contract and verify on an observing device before production acceptance.

### C03 — Stale account page can apply A's form to B's current cookie session (P1/P2; wrong-account integrity)

**Path:** `account.html:657–665` records `currentUser` and prepopulates personal fields once. Its profile PATCH at 696–700 and DELETE at 739 send no expected-account header. Boot at 753–759 never binds focus/visibility identity refresh. `HalaAuth.getUser()` caches the first response (`halastudy-core.js:175–198`). The server profile and deletion routes (`auth-routes.js:190–220,278–287`) authorize whichever user the current cookie identifies, with no expected-account check.

**Enforcer/refutation:** Account mutations recheck their server user epoch (`auth-routes.js:46–74`) and deletion rechecks a password/Google reauth; these prevent some concurrent/revoked actions, but do not detect the frontend being rendered for A while the cookie identifies B. The study subsystem already demonstrates the intended fix: expected account header (`study-workspace.js:7–9`) plus server rejection (`study-routes.js:6–10`) and reload on mismatch (workspace:61–65). Platform focus/visibility refresh at `platform.js:520–528` is also a useful sibling.

**Fix/control:** Pin account reads/mutations to the displayed identity server-side; refresh/reload on focus/visibility and clear stale private state. Use two synthetic accounts/tabs: render A in tab 1, change login to B in tab 2, then save A's form in tab 1. B must not change. Deletion must not offer a confirmation naming A while acting on B. Repeat for initial account stats/rooms response races and provider reauth returns. Existing password/Google checks remain required.

### C04 — Several socket commands have no acknowledgement deadline or recoverable UI (P2)

**Sibling inventory:**

| Command/surface | Current behavior | Required negative control |
| --- | --- | --- |
| `open.html:1516–1548` create-room | `socket.timeout(8000)`; button reenabled and explicit timeout copy | Existing positive implementation; preserve |
| `index.html:3893–3928` join-room | Hides join dialog before sending; no ack bound | Drop ack; bounded failure must restore entry/retry and ignore late stale success |
| `lobby.html:395–406` join-room | Shows lobby view; no ack bound | Drop ack; distinguish connection failure from empty lobby |
| `index.html:3451–3462` board mutations | No timeout; add clears input at 3480 before ack | Drop ack; preserve/restore draft, indicate uncertain result, reconcile before retry to avoid duplicates |
| `index.html:3508–3515` board reorder | No timeout; DOM already reordered | Drop ack; return to acknowledged order/reconcile |
| `index.html:2848–2862` report-user | No timeout; no acknowledgement means no outcome | Drop ack; bounded explicit retry/uncertain result; never falsely claim report sent |
| `index.html:3996–4008` send-message | No timeout; text stays pending but no feedback/disable | Drop ack; retain text, bounded feedback, avoid duplicate submission |
| `index.html:2834–2838` user-status | No timeout or failure feedback | Drop ack; sharing-off must not be shown as acknowledged when the server still holds shared state |

Membership authorization and server persistence errors do not refute these delivery/UI gaps. Use an isolated socket fixture that deliberately withholds each callback; do not simulate by blocking a real production socket.

### C05 — Provider failure state is overwritten on language change, and room UI omits heartbeat-ended notification (P2)

**Path:** Failed RealtimeKit join displays unavailable/retry at `index.html:2483–2487`. `applyLanguage()` then assumes a non-joining provider room is live and replaces any current media error with managed/live at 2642–2649, removing retry. SFU unavailable state similarly becomes loading. `videoClient` creation at 1451–1454 omits `onEnded`; heartbeat revocation/failure does call `options.onEnded` at `video-client.js:95–100`, so this room surface never updates its visible state on that path. The lobby supplies `onEnded` and clears state at `lobby.html:233–240`.

**Fix/control:** Store/render explicit media status, message and detail keys; translate that state rather than infer success from `!joining`. Add an ended callback with cleanup/retry. Force token failure, SDK timeout and 403 heartbeat, then switch AR/EN; unavailable must remain unavailable, no false live claim, and retry must remain actionable. Retain teardown after authorization loss.

### C06 — Failed CDN script elements poison subsequent RealtimeKit retries (P2)

**Path:** `realtimekit-client.js:20–38` and 44–68 retain failed loader/core script nodes. The retry at 82–85 resets only `sdkLoadPromise`. The next attempt finds the same script and subscribes to an event that already fired, without reinjecting it. It therefore reaches the 15-second deadline again even if the network recovered.

**Enforcer/refutation:** The SDK timeout bounds the wait; it does not make the retry perform a new load. A loaded core script correctly resolves through `data-loaded`, and already-defined UI custom elements also resolve. Neither refutes the failed-tag path.

**Fix/control:** Track failure and remove/recreate failed script nodes and clean global loader callbacks. Fixture the first core/UI load failing, restore availability, click retry, and assert a fresh request/injection successfully joins. Keep pinned versions and exact provider URLs.

### C07 — Exposed provider/local camera calls can remain pending indefinitely (P2)

`lobby.html:474–482` awaits SDK enableVideo/disableVideo without a deadline, leaving its CTA disabled until settlement. `index.html:4281–4284` waits for getUserMedia without a timeout or cancel/continue action while the permission prompt remains ignored; `cameraStarting` blocks retry. `index.html:2286` can similarly await rawVideo.play indefinitely during blur setup. This is separate from the correctly bounded token and main SDK join (`video-client.js:9–33,54–63`).

Provide bounded/cancelable preparation with safe cleanup of late camera streams and a camera-off continuation. Fixture each promise never settling and each resolving after cancellation; confirm UI recovery and that late raw tracks are stopped. A timeout alone must not leave a late camera publishing or retain a raw stream.

### C08 — Dynamic/shared keyboard accessibility gaps beyond the parent-owned heading/font fix (P2)

| Source | Candidate | Suggested control |
| --- | --- | --- |
| `index.html:3369–3373` | Empty task toggle button has no accessible name or check/pressed state | Add task, run axe, inspect localized task-specific name/state and keyboard toggle |
| `index.html:3328–3333,3632–3635,2695–2702` | Priority/preset/status selections update CSS without pressed state (quiet-ready is already correct) | Select each choice by keyboard; assert accessible selected state |
| `open.html:65,72,1348–1354` | Create/Join aria-pressed remains initial values while visible form changes | Load `/open#join`, switch choices, assert exactly the visible choice is pressed |
| `ui.js:235–271` | role=menu/menuitem auth menu lacks Arrow/Home/End navigation; Escape removes focused menu without restoring focus | Open with keyboard, move among items, Escape to chip, then Tab onward |
| `landing.html:570–592` | Escape hides mobile menu but can leave focus inside hidden controls | Open mobile menu, focus an item/theme/language control, Escape; focus returns to burger |
| `lobby.html:131` | Name input has placeholder but no label/aria-label | Empty-storage first visit, axe and screen reader name check |
| `index.html:694,747,870` | Custom status, new-task and chat inputs rely on placeholders | Inspect accessible names before/after input; add persistent labels |
| `index.html:886–893,4124–4129` | Ambient sound options are click-only li nodes | Keyboard-only selection including Off, with accessible selected state |

Parent already owns account heading semantics and Latin wordmark correction; these were not duplicated as app edits. Baseline account tab keyboard navigation exists at 533–540; do not replace a working two-tab pattern merely because the markup started imperfectly.

### C09 — Storage-denied browsers can lose otherwise supported room entry (P2)

`index.html:4938` directly reads localStorage during boot before finishing dialog initialization; `index.html:3867` directly writes it in join submit before connecting. `open.html:1571–1576,1642–1647` directly writes sessionStorage before navigation. A SecurityError/quota/storage failure aborts these paths. Most surrounding helpers deliberately catch storage failures (`index.html:1522–1538,1542–1578`; room draft helpers in open:472–505).

Use the existing safe-storage convention; essential navigation must work with in-memory state/URL and request the password again if it cannot be retained. Browser fixture all relevant storage methods throwing; guest must still open/join and get a meaningful password form. Do not store passwords in URLs as a fallback.

### C10 — Public policy/article copy contradicts implemented optional behavior (P2; factual copy, no legal opinion)

| Source | Contradiction / evidence | Suggested disposition |
| --- | --- | --- |
| `privacy.html:148,231` | Says nickname preferences are never sent; same policy 113/196 says nickname is server-stored, and video-client:49 sends displayName | Separate local theme/language from shared nickname/status |
| `privacy.html:97,180` | Unqualified no-phone-number statement; platform.html:145 asks a Saudi phone for sandbox checkout | Scope to starting study/account creation, disclose optional sandbox phone/provider use |
| `privacy.html:124,207` | Measurement tools described only as future; optional seven-day on-device counters are already implemented in ux-insights and platform panel | Disclose present opt-in local counts and deletion/TTL, preserving no network transport |
| `privacy.html:153,236` | Service-provider inventory lists AWS/TURN, while media section already names Cloudflare and auth/payment flows use additional providers | Match actual enabled provider processing, without inventing hosting/legal assurances |
| `privacy.html:186`, `terms.html:176` | Says the camera is on inside rooms as reason for 18+ rule; implemented/product contract is optional | Keep 18+ rule; correct camera wording |
| `blog-best-study-rooms.html:170`, `blog-study-with-me.html:224` | Recommends product for secondary-school students without the 18+ limitation; policy/terms are 18+ | Explicitly scope to adults 18+; preserve the existing service age boundary |
| `blog-study-with-me.html:163,171,172` | Immediate populated-room expectation leads to /open create/code flow; landing now correctly calls scenes illustrative | Explain own-room/invite/code or actual public lobby; do not imply guaranteed occupancy |

The source article comparison has publisher disclosure and sources added by SEO renderer (`public-pages.js:135–144`); that is useful but does not independently verify competitors' current claims. No web research or legal validation was performed in this review. Any approved factual policy edits should retain AR/EN parity and separate production provider acceptance.

### C11 — Other bounded UX/concurrency candidates to disposition (P2/P3)

- `open.html:1270–1291,1447–1465`: room-preview requests have no generation/code guard. A slow A request can overwrite newer B preview. Add request identity and test A slow/B fast plus switching form modes. No unauthorized room entry is established; the actual join admission remains server-owned.
- `admin.html:450–460,472–483,508–521,559–573,622–626`: several legacy-admin mutation handlers await api() without catch/feedback; `refreshActive():667–669` silently ignores errors except 401. 403 retirement, 503 and timeout can appear as stale successful state. Add a shared pending/error wrapper and distinguish unavailable from unchanged state; never infer backend authorization failure from an unhandled client rejection alone.
- `study-workspace.js:413–431,967–977`: project/distraction/routine lists expose archive/resolve/use but no rename/edit/unresolve controls, despite PATCH API worklist descriptions. Check actual twenty-feature acceptance scope before treating this as missing product functionality; API coverage alone does not imply a promised UI editor.
- `realtimekit-client.js:95–114` plus `video-client.js:54–66`: the SDK wrapper mutates shared meetingElement before returning. A timed-out old init resolving after a successful new join could overwrite that element and its late leave sets it to null. The queue/late cleanup correctly releases old joins, but the element side effect needs a generation/ownership guard. Fixture delayed old init and fast replacement init, then resolve old; active new UI/meeting must remain intact.

## Refuted or correctly enforced source candidates

- Focus points are not derived from camera state or local routine duration: focus-client delegates actions to server and caps its extrapolated display to 15 seconds (`focus-client.js:75–80`); study-routine only updates guidance. This is not fresh server reward acceptance.
- Study identity/membership paths use expected account IDs; stale async journal/resource results are guarded by request/account/circle generations (`study-workspace.js:7–9,61–65,837–849,1042–1116`). Resource management controls depend on server canManage rather than frontend role alone.
- Reminder titles require a fresh agenda and preferences request immediately before display (`study-workspace.js:1144–1185`), covering membership removal/cancellation/opt-out. Client-only due candidates are not used as final disclosure authority.
- Circle switching clears selected data before requests and uses a request generation (`platform.js:200–212`); attendance and invitation response rendering also checks that generation. Circle exit clears current selection and refreshes before claiming save.
- Payment redirect destinations have a frontend exact-origin/path allowlist (`platform.js:618–624`); test and sandbox copy clearly says no actual charge/renewal. Backend verification remains required and was not replaced with client redirect trust.
- Optional usage counters are off without consent, schema-allowlisted, bounded, expire after seven days, and have no network transport (`ux-insights.js:3–49`). Names/room codes/content are not part of that contract. The policy wording issue is distinct.
- Video token requests have a 15-second abort; joins/leaves are serialized, late joined sessions are released, and heartbeat denial or repeated failure ends local media (`video-client.js:9–33,36–128`). The remaining UI/status and wrapper element-ownership candidates do not erase these existing safeguards.
- Mesh privacy blur defaults on, uses a processed canvas stream and fails to camera-off if unavailable (`index.html:1467–1484,2331–2361,4279–4324`); raw camera teardown is explicit. No evidence of an automatic raw-stream fallback was found.
- User content is normally inserted with textContent in platform, study, room board/chat/name and lobby tiles. The legacy admin uses innerHTML mostly with typed/server fields and separately assigns user-controlled names via textContent. No confirmed DOM XSS was identified; backend field guards remain separately reviewed.
- SEO routes use a fixed allowlist/canonical origin, escaped copy metadata and private revalidation caching (`public-pages.js:22–54,97–124,166–192`). Article JSON parsing reads trusted static files. Public pages are not an arbitrary template/file-read endpoint.

## Branding, timeout and lifecycle sibling inventory

The parent owns the name/font implementation. This review found the relevant rendered branding siblings, not just text search hits: landing/open/account/lobby/404/blog/two articles use split Hala/em/study wordmarks; contact has its own compact wordmark; index uses logo/logo-mark/logo-word and an Arabic font override; platform/recovery have brand text with explicit language spans; legal routes replace their source headers in `public-pages.js:81–87`; admin is English-rooted. Footer/back-home names, generated document.title and aria-labels also need the intended Latin-name rule. The shared core can alter auth-entry into an avatar chip, so check both anonymous and authenticated states.

Timeout twins: HalaCore JSON and admin JSON each have 15-second bounds; open-room metadata/config reads have AbortSignal.timeout; create-room ack has 8 seconds; video token and wrapper joins/leaves are bounded; SDK script loading is bounded. Remaining unbounded socket and camera operations are listed in C04/C07 rather than silently calling the whole subsystem covered.

Media lifecycle twins: lobby handles pagehide/pageshow/disconnect and onEnded; index pagehide only requests provider leave, while mesh disconnect closes peers but leaves its local camera available; membership/ban/room closure must be verified against server revocation. SDK wrapper late effects and provider unavailable translation require dedicated controls. None of these source reads substitutes for two-device camera/blur/recording-disabled/provider-revocation acceptance.

## Evidence handoff

No runtime findings were manufactured from source review. Every candidate above needs either a fixing change plus targeted synthetic/browser evidence or an explicit source-backed refutation. The original 133-pattern denominator, 26 route-gap list and fourteen socket commands remain the parent's acceptance inventory. This file does not increment executed-route coverage or claim provider, recovery-email, migration, restore, deployment or production acceptance.

Memory was used only to orient scope: prior Halastudy notes preserve test-only/live-payment boundaries and local-versus-production reporting (`MEMORY.md:68–86,95–96`); all findings and full-read statuses above come from the current source.
