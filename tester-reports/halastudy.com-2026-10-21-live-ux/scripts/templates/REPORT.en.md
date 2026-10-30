# UX & Quality Report - Halastudy - 2026-10-21

**Overall: 3/5**. Biggest problem: the mobile homepage hides its purpose and main study action below the first screen.

Public target: [Halastudy](https://halastudy.com). Audit date: 2026-10-21, Asia/Riyadh. Evidence and reports are in `tester-reports/halastudy.com-2026-10-21-live-ux`. This is a read-only audit of production, with a separate review of local source to locate fixes. It is not a deployment or a certification of the room experience after joining.

## 1. What the site is for

Halastudy provides quiet online study rooms for Arabic-speaking students and people doing focused work. The public conversion is to prepare a room or enter an invitation code; accounts are optional for instant rooms. The landing page, room form, account form, blog, two guides and policies were swept on desktop and mobile.

| Persona | Primary goals |
|---|---|
| New Saudi student on a phone | Understand the service and prepare a room; find people already working after tapping the advertised discovery action. |
| Returning student | Reach the account entry in the preferred language; find a recovery path after forgetting a password. |
| Student researching study methods | Read a relevant Arabic guide and reach the study form; read camera/privacy information before participating. |

The primary experience is Arabic and RTL. The desktop viewport was `1440x900`; the mobile viewport was iPhone 14 emulation at `390x664` CSS pixels with DPR `3`. The observed mobile problem is not inferred from a desktop resize. The mobile headline begins at approximately `y=752`, and the primary hero CTA at `y=952`, both outside the initial `664px` height. The menu offers a working alternative, after an extra interaction. Evidence: `shots/01-home-mobile-fold.png`, `verification/home-menu-mobile.png`, `verification/home-inventory.json`.

## 2. Scorecard

Scores are expert judgments informed by the evidence, not measurements from participant research. The arithmetic mean is `33/11 = 3.00`; the rubric score is `3.0/5`.

| Dimension | Score | Evidence |
|---|---|---|
| First impression | 3/5 | Desktop explains the product and shows actions; mobile opens with a portrait and clocks. `shots/01-home-desktop-fold.png`, `shots/01-home-mobile-fold.png` |
| Journey success | 3/5 | Five paths reached their defined boundary; discovery, password recovery and the extended English menu-close check failed their tested goals. `journeys/discover-mobile/step-05.png`, `journeys/recover-mobile/step-04.png`, `verification/english-menu-mobile.png` |
| Navigation & information architecture | 3/5 | The mobile menu works, but the discovery label promises a destination the join form does not provide. `verification/home-menu-mobile.png`, `journeys/discover-mobile/step-05.png` |
| Visual design & consistency | 4/5 | Warm paper, amber accents, Arabic display type and consistent cards create a recognizable identity. `shots/01-home-desktop-fold.png`, `shots/04-open_html-desktop-fold.png` |
| Content & copy | 3/5 | Useful Arabic study guidance; camera-on messaging and live-style examples need clearer framing. `shots/08-blog_study_with_me_online_arabic-desktop-fold.png`, `shots/01-home-desktop-fold.png` |
| Mobile experience | 2/5 | No global horizontal overflow in the sweep, but the main landing action is off-screen and the room form exposes optional settings immediately. `shots/01-home-mobile-fold.png`, `shots/04-open_html-mobile.png` |
| Performance | 4/5 | Sampled LCP is `524-816ms`; raw desktop home CLS `0.340` did not repeat in a focused check (`0.030`). `probe.json`, `verification/layout-and-console.json` |
| Accessibility | 2/5 | Confirmed ARIA errors, text contrast failures and two keyboard-inaccessible scrollable tables. `verification/article-table-mobile.png`, `verification/observations.json`, `verification/layout-and-console.json` |
| Trust & conversion | 2/5 | Contact and policies exist; randomly animated attendance and LIVE-style clips weaken the reliability of the first impression despite an illustrative disclosure. `shots/01-home-desktop-fold.png`, `verification/home-public-source.html` |
| Technical health | 4/5 | All `16` page/viewport loads returned `200`, with `0` JS exceptions, failed requests or broken same-origin links in the sweep. `probe.json` |
| Localization / RTL | 3/5 | Arabic layout is coherent and English persists into account entry, but switching the landing menu to English expands the page from `390px` to `444px` and clips its toggle. `journeys/english-mobile/step-05.png`, `verification/english-menu-mobile.png` |

## 3. Journeys

`✓` means the defined read-only destination was reached. It does not mean a room was created, a camera connected, or authentication succeeded. `✗` means the tested goal was abandoned. The original seven scripts completed technically, including two that intentionally document a dead end; an eighth script reproduced the English menu-close interaction failure. Machine completion and user success are recorded separately in `verification/audit-summary.json`.

{{JOURNEY_TABLE}}

Times are runner-active time, not human task completion time. Counts include navigation, assertions and notes; wasted steps count detours that did not advance the stated user goal. The runner waits up to `4s` for URL changes after every click, including menu and language clicks. A step over `3s` is therefore not by itself a slow interface. Detailed timing and errors remain in each `journeys/<slug>/journey.json`.

- **Prepare a room, mobile and desktop.** Mobile needs the menu to reveal an immediate study action. Desktop has an obvious topbar action. Both reached the creation form and accepted a clearly fake room name. Testing stopped before “افتح الغرفة”. No production room was created. Evidence: `journeys/create-mobile/step-03.png`, `journeys/create-desktop/step-04.png`.
- **Find people already working.** The user scrolls to “شوف اللي شغّال”, then lands at `/open.html#join` and must provide a room code. There is no public-room list on that destination. The browsing goal is abandoned; the code-entry form itself is not claimed to be broken. Evidence: `journeys/discover-mobile/step-05.png`.
- **Recover an account.** “تسجيل الدخول” opens an ordinary sign-in form with Google as another option. Neither the visible controls nor the full-page inventory offers password recovery. No credentials were entered and neither authentication option was submitted. Evidence: `shots/03-account_html-mobile.png`, `verification/account-inventory.json`, `journeys/recover-mobile/step-04.png`.
- **Use English.** The menu exposes “EN”; switching language and opening the account entry produces “Welcome back”. Testing stops at the authentication boundary. An extended check then exposed horizontal overflow and a clipped menu-close target; a normal locator click timed out. This is not a claim that every possible edge tap or keyboard exit is unavailable. Evidence: `journeys/english-mobile/step-05.png`, `verification/english-menu-mobile.png`, `journeys/english-menu-close-mobile/journey.json`.
- **Read and start.** The menu leads to the blog; the second guide opens correctly, and its “افتح غرفة” action returns to the creation form. The content-to-form path works; actual session entry is outside this audit. Evidence: `journeys/article-mobile/step-06.png`, `journeys/article-mobile/step-08.png`.
- **Read privacy information.** The footer's “الخصوصية” opens the policy and its storage explanation. This verifies discoverability and readable content, not the truth of every legal or operational statement. Evidence: `journeys/privacy-mobile/step-04.png`, `shots/05-privacy-mobile-fold.png`.

{{JOURNEY_STATS}}

## 4. Findings by severity

### P0 - No confirmed public outage in scope

No tested page was down, and no broken-link or JS-exception flag was recorded. Actual room creation, joining, video transport, account actions and payments were not attempted, so this is not a release-readiness verdict.

### P1 - Major friction or lost conversion

- **F01 - The first mobile screen does not explain how to start.** At `390x664`, the full hero headline and CTA are below the fold (`y=752` and `y=952`). A visitor initially sees the logo, sign-in, a large LIVE-style portrait and city clocks. Move purpose and the primary action before decorative media. A working menu mitigates the problem but does not fix the first impression. Evidence: `shots/01-home-mobile-fold.png`, `verification/home-inventory.json`.
- **F02 - Discovery wording leads to invitation-only entry.** “شوف اللي شغّال” promises browsing, while its destination requires “رمز الغرفة”. Rename the action to explain code entry, or deliberately design a privacy-safe discovery feature in a separately agreed scope. Renaming is the smaller fix already reflected in local copy. Evidence: `journeys/discover-mobile/step-05.png`.
- **F03 - Returning password users have no recovery path.** The production sign-in page contains no recovery/reset control. The local account page already contains a `/recover` link, but local operating notes say real recovery-mail delivery still needs its provider acceptance. A link alone is insufficient for release. Evidence: `shots/03-account_html-mobile.png`, `verification/account-inventory.json`; source hints: `account.html:189`, `docs/hardening/2026-10-21/ACCEPTANCE.md:16`.
- **F04 - Attendance is simulated inside live-style presentation.** Public HTML seeds `liveN = 17264`, changes it using `Math.random()`, and updates the “now” counter. Featured clips also have LIVE badges and personal names. A small “عرض توضيحي” disclosure does exist; the issue is the stronger real-time visual implication. Remove pseudo-attendance and label each scene as an illustrative preview. Evidence: `shots/01-home-desktop-fold.png`, `verification/home-public-source.html` lines `582-595`. This finding does not assert that the named people are real participants or endorsements.

- **F09 - English switching clips mobile navigation.** After opening the menu and choosing EN at a `390px` client width, document `scrollWidth` becomes `444px`. The menu toggle spans `x=380..424`, so most of its target is beyond the client viewport; the menu CTA also extends to `x=424`. A normal center-target click failed in both a focused check and the recorded journey. Direct DOM hit tests still identified the button at sampled coordinates, so a separate overlay is not proven; the confirmed defect is overflow/clipping, not a universal menu lock. Evidence: `verification/english-menu-mobile.png`, `verification/english-layout.json`, `journeys/english-menu-close-mobile/journey.json`.

### P2 - Quality and accessibility

- **F05 - Core controls expose invalid accessibility semantics.** The live language switch uses `role=tablist` with ordinary child buttons. The room mode has `aria-checked` on a button without a supported radio role. Direct DOM/axe verification confirms these structures; actual screen-reader usability was not tested. Local source already uses a language group and explicit radio roles. Evidence: `verification/layout-and-console.json`, `verification/observations.json`; visual context: `shots/04-open_html-desktop-fold.png`.
- **F06 - Small amber text lacks contrast.** A direct example is `#a56b43` on `#f5f2eb`, measured by axe at `3.92:1` where `4.5:1` is required for this size/weight. The sweep found at least one serious/critical axe issue on each of the eight pages, including `11` contrast nodes on the desktop policy. Preserve the palette while using darker text tokens. Evidence: `verification/layout-and-console.json`, `probe.json`, `shots/05-privacy-desktop-fold.png`.
- **F07 - Comparison tables cannot receive keyboard focus.** Each of two `.table-wrap` elements is `348px` wide with `460px` content and `tabIndex=-1`. The contained scrolling avoids page-wide overflow, but keyboard users cannot focus the region to read the hidden columns. Add a named, focusable region and visible focus. Evidence: `verification/article-table-mobile.png`, `verification/layout-and-console.json`.
- **F08 - Several standalone mobile links have small hit areas.** The sign-in link is approximately `87x21px`; several footer links are `20px` high. Treat these as touch-comfort findings, not a blanket WCAG failure: inline-link and spacing exceptions require separate assessment. Enlarge navigation targets toward `44px` while keeping the current typography. Evidence: `verification/home-inventory.json`, `shots/01-home-mobile-fold.png`.

### P3 - Lower-priority structure

The account page has no `h1` or meta description, and the policies each contain `2` `h1` elements from their bilingual sections. These raw flags are not counted as conversion blockers or proof of an accessibility failure. Account pages may intentionally be excluded from search. Reconcile heading hierarchy and localized policy presentation when releasing the shared shell; do not prioritize auth-page SEO over usability. Evidence: `probe.json`, `shots/03-account_html-desktop-fold.png`, `shots/06-terms-desktop-fold.png`.

### Verification notes - Do not turn these into confirmed defects

- **Console warnings were scanner-induced.** Every sweep view recorded two Google Fonts stylesheet connection messages. A clean page recorded `0` console errors before axe and `2` after its scan. The baseline had no failed font requests. Do not relax the application's CSP to silence audit tooling. Evidence: `verification/layout-and-console.json`.
- **CLS needs controlled rechecking.** The initial desktop home sweep measured `0.340`; a focused `10s` idle check and the same scrolling pattern both measured `0.030`. Preserve both receipts. The high value was observed but did not reproduce; its root cause is unconfirmed. Evidence: `verification/layout-and-console.json`, `verification/home-desktop-idle-10s.png`.
- **No page-wide overflow appeared in the Arabic sweep; the English-switch check is an exception.** The comparison table's internal scrolling is intentional containment, with a separate keyboard defect. No broken-image issue was confirmed. Tiny links embedded in prose are not automatically failures. There was no WAF/rate-limit stop in the main sweep.

## 5. Metrics snapshot

One unthrottled Chromium sample per page and viewport. These are lab results from this machine, not mobile-network, Safari, CrUX or percentile measurements. `axe S+C` counts affected nodes marked serious or critical, not unique bugs. `Console` includes the two scanner-induced messages. Routes `guide-compare` and `guide-start` mean `/blog/best-online-group-study-rooms-saudi` and `/blog/study-with-me-online-arabic`.

{{METRICS_TABLE}}

All `16` views returned HTTP `200`. LCP range: `524-816ms`; TTFB range: `148-196ms`. The sweep recorded `0` JS exceptions, `0` failed requests, `0` broken images and `0` broken same-origin links. Metrics source: `probe.json`. The main sweep reviewed eight distinct URLs and generated `32` fold/full-page screenshots.

## 6. What already works - Keep it

- The visual identity feels appropriate for a calm Arabic study service: warm surfaces, restrained amber and legible Arabic typography. This is an expert visual judgment. Evidence: `shots/01-home-desktop-fold.png`.
- Menu opening, form entry, language persistence, guide navigation and policy navigation worked without a JS exception. Evidence: `verification/home-menu-mobile.png`, `journeys/english-mobile/step-05.png`, `journeys/article-mobile/step-08.png`.
- The Arabic guides give concrete study use cases and direct calls to action. Their long-form content has consistent hierarchy. Evidence: `shots/08-blog_study_with_me_online_arabic-desktop.png`.
- The forms retain guest access and a choice to use a room code. Do not add an account wall to the instant guest flow while fixing the copy. Evidence: `shots/04-open_html-desktop-fold.png`.
- Public contact details and both policies are reachable. Retain the actual contact values without sending a test message or making a call. Evidence: `shots/02-blog-desktop-fold.png`, `shots/05-privacy-desktop-fold.png`.

## 7. Not tested / limits

- No form was submitted. No account was created or accessed; no password, payment detail or OTP was entered. No room was created or joined, no camera/microphone was granted, and no message or invitation was sent. Room/video quality, moderation, focus credit, scheduling submission, account sync and billing remain unverified.
- Google authentication was observed as an option but not followed. Recovery delivery was not attempted. Policy content was reviewed for UX, without a legal/compliance conclusion.
- The full sweep covers Arabic/light public pages. Mobile English checks cover account entry and the menu-close failure. Dark theme, physical iOS/Android devices, assistive technologies and authenticated workspaces were not systematically audited.
- Supplementary public inspections were sequential; the probe and journeys never ran together. Journeys were separated by at least `15s`. No WAF block was recorded. The supplementary verifier blocked automatic mutating HTTP requests; its Socket.IO polling aborts are tool containment, not website failures.
- One supplementary inspection used the wrong accessible role for the signup tab. It was corrected using the observed `#tab-signup` selector and the unfinished inspections were resumed. That runner error is excluded from findings. Tool notes are in `.learnings/ERRORS.md`.
- The checked-out source differs from public HTML. Several fixes are already present locally: copy-first mobile layout, invitation wording, illustrative scene labels, recovery entry, language semantics, contrast tokens and focusable comparison tables. Source comparison is in `verification/source-comparison.json`. Their production availability is not established by their presence in the checkout, and this audit did not run or certify the full local test suite.
- Use `PLAN.md` for the next coding-agent handoff. It identifies existing fixes, the additional English menu regression, tests to rerun, and release/provider dependencies. PDF appendix figures may show the upper portion of a tall capture; complete original screenshots remain in the run folder. No application source was edited, committed, pushed or deployed by this audit. Earlier work was preserved.
