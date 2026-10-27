# Implementation notes

## 20 October 2026 — resolved

- Windows PowerShell's native-command stdin used ASCII encoding. A Python here-string authored new Arabic copy as question marks. Detected by source search and replaced using UTF-8 apply_patch/Node authoring; explicitly set UTF-8 OutputEncoding for remaining Python pipes. No corrupted copy was released. Use guarded text replacements and normalize CRLF before indexing blocks.
- The initial room-shell override combined logical insets with an inherited translateX, clipping camera controls. The existing fake-camera privacy smoke test caught it. Reset the transform for collapsed controls and allow center-column scrolling at shorter desktop heights; all eight room tests passed afterward.
- The first online font probe inherited a synthetic x-forwarded-for header used to isolate local rate limits. Google font CORS rejected that header. Clear synthetic headers for external GET diagnostics. The clean probe loaded the actual font families with zero font request failures or notices. Do not weaken application CSP to fix an automation artifact.
- Platform smoke navigation must enter Account before Security/Operations after the authorized navigation change. The permission and MFA assertions remain intact.
- Final real-font screenshot review exposed a shared `.topbar nav` rule overriding the marketing menu's responsive hiding. Scoped legal navigation rules to `.is-legal-page`, preserved the global standalone link target sizing, and added explicit mobile desktop-menu-hidden assertions. Review screenshots as well as automated overflow/contrast checks.
