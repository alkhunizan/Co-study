# A13: Circle refresh and delayed save feedback

Recorded before application edits. Base: `c4d6c50553f55704b4d4a788db28b05fa983047a`.
Scope: `public/js/platform.js` and one distinct circle-feedback browser test. A03 is not included in this branch.

1. Open a private circle with two eligible rooms and enter a scheduling draft using the second room. Fail a circle-detail read during an Arabic/English switch. Show localized feedback and an actionable keyboard-accessible retry. Retain the mounted draft, selected room, title and time; recovering and retrying restores the circle without changing these values.
2. Retry while the detail read still fails. Keep useful feedback and a usable retry. After network recovery, an explicit retry succeeds. A superseded circle response must not show recovery controls for the wrong circle.
   Cross-review follow-up, recorded before its application edit: after a normal View failure, successful Retry also clears that failed read's global error. A newer error created while Retry is pending must remain visible, on either Circles or another view.
3. Hold a schedule-save response, navigate from Circles to Account, then release the successful response. Account must not receive the Circles success notice. Independent server reads must show exactly one saved session. A same-view save must still show localized success.
4. Cover Arabic/English and 390/1440px, inspect saved screenshots, and check controls remain readable, reachable and free of horizontal overflow. Preserve existing authentication, authorization, scheduling validation and provider boundaries.

Evidence plan: demonstrate browser failures on unchanged base source, make the smallest bounded correction, rerun the focused cases, freeze source, then run the coordinated static/integration gates. Full browser qualification is centrally queued. No dependency, schema, configuration, provider, HTML or release changes are included.
