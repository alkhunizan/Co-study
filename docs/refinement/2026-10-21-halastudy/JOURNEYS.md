# Journey and UX review

The chosen structure keeps Study, Progress, Groups and Account visible. It preserves URLs and existing free access. Evidence comes from actual local browsers, separate participant contexts, real disposable SQL storage and provider fixtures; it does not establish production behavior or retention uplift.

| Journey | Resulting behavior | Evidence and recovery |
|---|---|---|
| First visit | Arabic promise and clear create/join actions, with labeled illustrative imagery. | Existing mobile-first, honest-presence and public accessibility smoke checks; 320/390/768/1440px visual sweep. |
| Guest | Create/join with an optional password, set an intention, share a goal/status, use the timer, and study with the camera off. Device time is explicitly local. | Real two-context companionship test, existing chat/board/password/timer/camera tests; invalid/full entry has a route back to room selection. |
| Room invitation | Keep the intended room and safe creation draft through sign-in/signup. Passwords are excluded from the draft. | Existing draft/expiry and deep-link tests plus shared safe return corpus. Backslash and normalized off-site redirects are rejected. |
| Circle invitation | Open a private fragment link, authenticate when needed, retain a bounded per-tab invitation draft, and join after a lost response without duplicate membership. | Signup handoff, same-document hash restoration and abort-after-commit acceptance browser tests; transaction tests cover revocation and removed-member rejection. |
| Returning member | See eligible actual return/session information, open a room or focus alone, and see today's credited progress. Empty scheduling/room cards no longer dominate the start. | Dashboard privacy/midnight tests; conditional home, history/reload and bilingual visual review. Unavailable data stays distinct from zero. |
| Focus and completion | One server-owned session across tabs; paused/resumed/completed state reconciles, reload restores control, uncertain completion retries the same session, and recap uses acknowledged credit. | Two-tab/reload/lost-response and transient-auth recovery tests. Clock manipulation, interruption, abandonment, daily caps, replay and Riyadh rollover are covered server-side. |
| Circle owner/member | Owners invite/revoke, schedule, manage roles/members and archive. Members can join/leave; existing membership survives revoking unused invitations. Empty room selection explains the prerequisite. | Cohort lifecycle/scoping integration and platform browser journeys. Existing VIP terms and server permissions are preserved. |
| Supervisor | Only assigned circles and their permitted attendance are available. | Platform permission and attendance tests, including cross-circle denials. No private-room discovery or public progress ranking was added. |
| Staff | Named roles and authenticator verification gate secondary tools; ordinary Study navigation stays simple. | Existing staff/MFA/role/audit/last-owner tests and platform smoke coverage. Paying and earning achievements never grants staff authority. |
| Account/recovery/billing | Preserved identity/history, clear verified-progress link, theme/language consistency, revocation/deletion failure handling and honest sandbox status. | Auth mutation/recovery/provider fixtures, scoped billing/reconciliation tests, anonymous API/file probes. Real mail, Google and merchant acceptance remain external. |

## Community and progress choices

The refinement surfaces existing shared goals and status rather than adding a feed. With zero participants, the room reports connection state; with one it welcomes the first arrival and suggests sharing; with several it reports actual attendance without invented activity. Readiness respects the existing sharing control. Quiet and camera-off participation earn the same valid focus credit.

Progress now adds a ledger-backed seven-day view and a small next milestone. History is retained; manual/imported/device time is explicitly separate from verified awards. Copy welcomes a return after rest. No public leaderboard, compulsory challenge, camera incentive, payment multiplier, confetti or XP progress bar was added.

## Visual and accessibility corrections

Actual screenshots led to correcting hidden shared-goal display, entry reflow, enlarged-text navigation obstruction, primary timer placement, error contrast, lobby language semantics and focusable chat scrolling. Mobile navigation stays in the document flow so it cannot cover an enlarged primary action. The timer's primary controls precede secondary duration settings in DOM and visual order.

The final visual sweep checks both themes/languages and four widths. Six additional 200% text cases check that primary actions remain within the viewport and unobstructed after scrolling. Automated axe results supplement inspected screenshots and keyboard journeys; assistive-technology and physical-device acceptance are not fabricated.
