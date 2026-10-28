# Readiness Task 4 evidence

## Scope and state

Completed locally on `plan/site-wide-readiness-2026-10-18`, HEAD `e9412fd`.
Nothing committed, pushed, merged or deployed. All existing Task 1/2/3 work is
preserved. This is the landing/blog content gate, not release approval.

The session began with the Task 3 handoff. A 331-file candidate hash manifest
and temporary archive were saved before edits. Original checkout article/OG
hashes and its standalone blog patch were captured separately. Raw evidence
is ignored under `output/readiness-task4-2026-10-18/`; the temporary archive is
`halastudy-readiness-task4-20261018/candidate-before-task4.tar` under TEMP.
Neither location is a durable backup.

## Changes and claim audit

Removed the 17,264 random-walk count, community totals and LIVE badges. The
landing now uses “A quiet room, ready when you are” / “غرفة هادئة، جاهزة وقت ما تحتاجها”.
Each demonstration tile says “Room preview” / “معاينة الغرفة”. Illustrative
names and images remain explicitly identified; sample timers are frozen.
Real city clocks remain clocks, not activity indicators.

The hero has one primary room-opening action and a secondary lobby action.
Both languages explain cameras, mic defaults, guest access and account gates
before entry. Removed asserted live occupancy, automatic group-break promises,
blanket listening/encryption language and the unsupported beta-price claim.
The shared shell and Task 3 responsive tile repairs are retained.

| Public statement | Evidence and disposition |
|---|---|
| Guests can open/join instant rooms; scheduling needs an account | `co-study-server.js` create-room handler rejects a scheduled request without `getSocketUser()` using `AUTH_REQUIRED_FOR_SCHEDULED`; `open.html` presents the same gate. Both landing and articles explain the boundary. |
| Lobby camera publishing needs an account; watching is guest-accessible | Video-token handler in `co-study-server.js` checks lobby publisher authentication; `lobby.html` presents the sign-in camera CTA. |
| Mic off by default; camera permission should be reviewed | `server-config.js` `buildVideoPolicy`, `realtimekit-client.js` join defaults/disableAudio, and `realtimekit-setup.js` student preset. Copy describes the expectation without claiming prior camera activation. |
| Room name/code, goals, focus/break timer and Riyadh scheduling | Existing create/join form, room-code generator, room board and `index-app.js` timer presets/settings. Corrected the claim that instant room creation itself selects a focus duration. |
| Blur/virtual backgrounds | Removed article promises. `index-app.js` whole-frame blur and its button are mesh-only; production RealtimeKit is separate. No AI-monitoring promise was added. |
| Recording/privacy and moderation | Removed promises of automatic privacy protection or immediate moderation. Articles distinguish user rules from technical prevention and point to existing privacy/support paths. |
| Other services | Removed traffic totals, merger history, 24/7 occupancy implications and unsupported comparative privacy/suitability assertions. Retained bounded descriptions with official links; suitability is identified as editorial opinion. |

The narrow third-party descriptions were checked against the official
[StudyStream](https://www.studystream.live/),
[Focusmate](https://www.focusmate.com/), and
[Flow Club](https://www.flow.club/) pages. [FLOWN](https://flown.com/) exposed
its virtual-coworking page title but a JavaScript-only body; retained only that
general description, not pricing, availability or feature promises.

## Original article patch review

`git diff 0e3d477 e9412fd -- blog-best-study-rooms.html blog-study-with-me.html`
was empty: the candidate's article bases matched the original patch's bases.
Reviewed the saved original diff separately, checked its applicability, and
applied that patch rather than copying whole old pages. Then corrected its
content and metadata before verification.

Retained the editorial mastheads, brief summaries, session cards, pull quotes,
read-next links and social-card metadata. Dropped unverified publication/update
dates and reading times. Restored semantic session headings. FAQ structured data
matches the corrected visible answers; publisher logo references an existing
asset. The articles remain Arabic, as the English blog index explicitly says;
they retain saved theme without changing the visitor's stored language.

Both original PNGs were visually inspected, verified as 1200×630 and copied
unchanged into the candidate's `images/og/`. Their original files and articles
are byte-identical to the session-start hashes. Existing server routes and
Docker asset copies already cover the articles and images.

## Verification

Portable Node 22.23.3 and the repository's existing sanitized Playwright server
helpers were used. Host Node and production services were not changed.

| Check | Result |
|---|---|
| Content red tests, Chromium desktop | 3 expected failures: missing quiet-room label and missing OG images on both articles. `red.log` records the failures before production edits. |
| `npm run test:ci:quality` | Exit 0: 154 JS sources syntax checked, types/lint/dead code/migrations clean, zero production audit findings, 223 unit and 201 integration tests passed, no skips. `quality.log`. |
| Landing + site-consistency smoke suites | 80/80 passed across Chromium/WebKit desktop/mobile. Includes bilingual honesty/entry copy, real CTA navigation, preferences, responsive tiles, reduced motion, keyboard menus, article links, image decoding and FAQ/schema parity. `green.log`. |
| Final article rerun after tap-target repair | 8/8 passed across all four projects. Also checks 360/1440px sizing, 44px article targets, keyboard FAQ expansion, cross-links and navigation to the create form. `articles-final.log`. |
| Initial real-font sweep | 80 configurations: four routes × two saved languages × two themes × five widths (360, 390, 768, 1024, 1440). No overflow, clipped controls, label/timer collisions, page exceptions or broken local links. Found undersized article brand/back/footer/FAQ targets. `initial-sweep.json`. |
| Final real-font article sweep | 40/40 passed after making those targets at least 44px. Together with the unchanged landing/index configurations, all 80 final page combinations pass the measured checks. `sweep.json`. |
| Final syntax/lint/diff checks | Exit 0 after the article-only CSS/test refinement. `check-final.log`, `lint-final.log`, `diff-check.log`. Git reports only normal LF/CRLF notices. |
| Final entry-copy contrast | Computed foreground against the page background: 4.69:1 light and 7.27:1 dark in both languages after changing only the hero-foot color token. Four final phone captures reviewed. `inspect-final.log`. This is a scoped text check, not the later site-wide accessibility gate. |

Real-font inspection permitted only loopback and Google font hosts. The normal
smoke suite's external-network guard was not weakened. Screenshots cover both
themes and all five widths; dedicated phone captures show the hero entry copy,
preview grid and illustrative community section.

## Preservation and remaining gates

Only the six intended product/test baseline files changed in Task 4: landing,
landing CSS, blog index, two articles and landing smoke tests. Planning/TODO/
spike-log records were then updated, with new evidence/handoff and two OG assets.
Task 1 dependencies/restore repairs, Task 2 recovery guidance, Task 3 shell,
legal pages, study code and existing navigation regressions remain unchanged.

Tasks 5–10 remain. This run does not replace Task 9's full final-candidate smoke
and infrastructure gates or real-provider/device, OAuth, staging-migration,
lost-host recovery and deployed-SHA evidence. Task 4 made no backend/media,
account-recovery or production changes.
