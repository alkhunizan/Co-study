# On-device UX evidence contract

Version 1, 20 October 2026. Implementation: `public/js/ux-insights.js`.

No external analytics provider or transport is installed. These counters cannot measure a product-wide funnel. They support voluntary local diagnostics and moderated sessions; a future provider, privacy review and transfer decision are separate work.

## Privacy and control

- Off by default. A signed-in user can opt in under Workspace → Account. The choice applies to this browser, including subsequent guest use; it is not an account entitlement.
- Store only consent, a fixed expiry seven days after consent, and aggregate counts for allowed enum combinations in `halastudyUx:v1`. No event log or per-event timestamp. Expiry is checked at each access and discarded on the next access after expiry.
- Clear/off removes counters and consent. Study, login, rooms and focus continue if storage is unavailable. No fetch, beacon, tracker SDK or external destination.
- Transition deduplication is page memory only, bounded to the latest 500 transitions. Counts saturate at 1,000 per enum combination. A return is counted once per tab during the consent window, using only the consent expiry as a session marker.
- Do not log room codes, session/account IDs, URLs, invitation tokens, names, free text, camera/audio, passwords, phone numbers or payment data. Session IDs used to distinguish focus transitions remain in page memory and are never persisted. Join transition tokens are objects in page memory, with no room ID.
- Restoring a focus session or reloading the completion screen does not record another start/completion. A reconnect within the same room attempt does not record another outcome. An explicit retry starts a new attempt. Counters do not deduplicate across devices or independently opened tabs.

## Allowed payloads

| Event | Fields and allowed values | Trigger |
|---|---|---|
| `entry` | `action`: `create`, `join` | Explicit marketing entry CTA click |
| `join` | `outcome`: `success`, `invalid`, `full`, `denied`, `network`; `duration`: `under5s`, `under30s`, `longer` | First acknowledged outcome of a room connection attempt; duration begins at connection attempt, excluding earlier form entry |
| `focus` | `action`: `start`, `complete`; `surface`: `room`, `workspace`; `credit`: `none`, `under1m`, `1to24m`, `25plus` | Successful server transition; start uses `none`, completion uses returned credited milliseconds |
| `return` | `age`: `sameDay`, `later` | First page entry in a tab after opt-in; age is relative to consent, not a person's previous visit |

Unknown events, fields and values are rejected. Unknown persisted count keys are ignored. Duration buckets carry no raw duration. `under1m` means positive credited time below one minute; it does not imply XP. An enabled-counter empty summary is valid.

## Baseline collection

No participant research or conversion uplift is claimed by this implementation. Browser tests are technical evidence only.

Use a consenting test participant's isolated test browser. Ask permission before looking at the local summary or saving observation notes. Copy only the enum counters and non-identifying task outcomes into a research folder; do not collect tokens, codes, names, faces, voices or screen recordings without separate consent. Clear the browser counters after the session. Aggregate by task and device category only. Report raw sample size, completion rate, observed time range and friction; do not infer a population conversion rate from a small moderated sample.

## Moderated task script

Recruit adults using representative Arabic/English and mobile/desktop setups. Read: “We are testing the interface. You can stop at any time. Please use the supplied test account and avoid personal information.” Observe silently first; record assistance separately from unaided completion.

1. **New guest**: “Create a quiet 25-minute study space, name one goal, and start without using a camera.” Observe first-action discovery, optional-setting comprehension, time to joined room and time to intentional timer start. Ask what is saved as a guest and whether the preview looked live or illustrative.
2. **Invite recipient**: give a test invitation privately. “Join this room and find the room's shared goal. If camera permission is denied, continue studying.” Observe code/link handling, focus, password recovery, whether retry is understood and whether the timer remains discoverable. Never copy the invitation into research notes.
3. **Returning user**: “Resume your earlier permitted room, find your next group appointment, then finish a short session and explain the result.” Observe primary navigation, taps from Home to room entry, explicit timezone comprehension, credited-versus-elapsed understanding, zero-point short-session understanding and the next action.
4. **Recoverable states**: test an unavailable room, invalid group invitation, server interruption during completion and a schedule/signup return. Ask what they expect next. Record retained input, understandable recovery and successful retry.
5. **Debrief**: “What felt uncertain? Where did you expect Account and Security? What does today's number mean? Which part of this screen would you remove?” Treat public discovery and navigation preferences as hypotheses.

Before another redesign, compare task evidence with this implementation's screenshots and technical checks. Prioritize repeated blockers over visual preferences, and distinguish observed behavior from participant suggestions.
