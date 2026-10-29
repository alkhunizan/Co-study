# Design Audit — branch `viber/2026-10-27` vs `main`

Scope: every author UI file in the branch diff (16 HTML pages, 6 CSS files, copy/UI JS modules). `docs/`, `tester-reports/` and `mirotalksfu/` excluded as evidence/AGPL. Static grep audit only — no screenshots, no live render.

## Verdict

**FIX BEFORE MERGE** (was NEEDS REWORK at first pass, 2026-10-29). The three ship-blockers below were fixed the same day in `index.html` (commit on `viber/2026-10-27`): hard-no greps clean, `npm run check` passes, in-room smoke suite 8/8. What remains is the should-fix list (about 20 items) plus two items a grep cannot settle (multi-`<h1>` visibility, photo provenance).

## Ship-blockers (§10 hard-no's + critical §11 fails) — ALL FIXED 2026-10-29

- **§10 — Neumorphic `shadow-btn-inset`** — [index.html:40](../../../index.html:40), [index.html:512](../../../index.html:512)
  Found: `--shadow-btn-inset: var(--sh-inner); /* press state */` and `.btn-ctrl:active { box-shadow: var(--shadow-btn-inset); transform: scale(0.95); }`
  Why blocked: the banned legacy token is still defined and still used; the press state is inset + `scale(0.95)` instead of §4's `scale(0.98)` + drop shadow one step.
  Fix direction: delete the alias on line 40; make `.btn-ctrl:active { transform: scale(0.98); box-shadow: var(--sh-1); }`.

- **§10 — Emoji-as-icon in product chrome** — [index.html:1501](../../../index.html:1501)–1505
  Found: `rain: { …, icon: '🌧️' }, forest: '🌲', fire: '🔥', cafe: '☕', ocean: '🌊'` — rendered as the ambient-sound picker's icons.
  Why blocked: ambient sounds are product chrome, not user content. §10 says Lucide only.
  Fix direction: swap each `icon` for a Lucide SVG name (`cloud-rain`, `trees`, `flame`, `coffee`, `waves`) and render inline SVG where the emoji is injected.

- **§11.3 — Physical properties that break RTL** — [index.html:553](../../../index.html:553), [index.html:535](../../../index.html:535)–536
  Found: `.ambient-popover { … right: 0; … }` and `.msg.l { border-bottom-left-radius: 2px }` / `.msg.r { border-bottom-right-radius: 2px }`
  Why blocked: in `dir="rtl"` the ambient popover anchors to the wrong side and overflows the panel; chat-bubble tails point the wrong way.
  Fix direction: `inset-inline-end: 0`; `border-end-start-radius` / `border-end-end-radius`.

## Should-fix

**§11.3 logical properties (non-breaking but physical)**
- [index.html:100](../../../index.html:100)–125 — five `html[lang="ar"] … { text-align: right|left }` overrides. They work because they are direction-gated, but `text-align: start|end` would delete the gates.
- [index.html:473](../../../index.html:473) — `.cam-controls { left: 50%; transform: translateX(-50%) }` — symmetric, harmless; `inset-inline-start: 50%` keeps the file grep-clean.
- [admin.html:63](../../../admin.html:63) — `th, td { text-align: left }` — admin is pinned `dir="ltr"`, still use `start`.

**§4 component specs**
- [index.html:413](../../../index.html:413) — `.btn-add` radius 14px, 42×42px — §4 says 999px pill and ≥44px on touch.
- [index.html:504](../../../index.html:504) — `.config-input` radius 8px, 40px wide — §4 says 16px, "never 8px".
- [public/css/study-workspace.css:11](../../../public/css/study-workspace.css:11) — textarea radius 12px (spec 16px).
- [admin.html:59](../../../admin.html:59) — `.tile` card radius 12px (spec 24px / `--r-xl`).
- [design-system/landing.css:1702](../../../design-system/landing.css:1702) — `.result-code[role="button"]` radius 12px. It is a code box acting as a button; acceptable if you call it a card, not a button. Decide and comment it per §12.
- [index.html:396](../../../index.html:396), 414, 436, 440, 475, 545, 547 — disabled opacity 0.5 / 0.65 instead of §4's 0.45. `platform.css:8` and `todo-priority-btn` already use 0.45.

**§11.6 contrast — amber on small text**
- [design-system/landing.css:944](../../../design-system/landing.css:944) — 12px mono label in `color: var(--accent)` on `--accent-soft`. Needs `--accent-3`.
- [design-system/landing.css:1020](../../../design-system/landing.css:1020), 1026 — preview-tile pomodoro at 18px/500 in `var(--accent)`. 18px regular is not "large text" under WCAG; use `--accent-3` or bump to 24px.

**§11.7 dark mode — hard-coded colours outside token definitions**
- Three different "live/online" greens: [index.html:477](../../../index.html:477) `#4cd137`, [index.html:223](../../../index.html:223) `#53d47a`, [lobby.html:33](../../../lobby.html:33) `#35c26b`. All should be `var(--success)`.
- [index.html:443](../../../index.html:443) `color: white`, [index.html:465](../../../index.html:465) `color: white`, [lobby.html:69](../../../lobby.html:69) `color: #fff`, [lobby.html:46](../../../lobby.html:46) `var(--card, #fff)` — fine on black video surfaces, but use `--ink-inv` so the token audit stays clean.
- [public/css/platform.css:10](../../../public/css/platform.css:10), [admin.html:80](../../../admin.html:80) — primary button `color: #2D3436` instead of `var(--ink)`.

**§11.1 one headline per page**
- [platform.html](../../../platform.html) has 9 `<h1>` (one per workspace view), [account.html](../../../account.html) 3, [lobby.html](../../../lobby.html) 2, [admin.html](../../../admin.html) 2, [privacy.html](../../../privacy.html) and [terms.html](../../../terms.html) 2 each (AR + EN blocks). If only one is visible at a time this passes; otherwise demote the rest to `<h2>`. Not verified in a browser — a live check is needed.

**§5 number rules**
- [index.html:403](../../../index.html:403) — `.schedule-countdown` has no `tabular-nums`; it reflows every second.
- [public/css/platform.css:61](../../../public/css/platform.css:61) — `.price` has no `tabular-nums`.
- [public/js/study-copy.js:201](../../../public/js/study-copy.js:201), 241, 273, 274, 306, 311–312, 343 — Eastern Arabic digits inside *labels for transactional inputs* ("حتى ٢٠", "٢٤٠ دقيقة", "٠ لإلغاء الهدف", "٢٨ يومًا"). §5 says Western digits for anything near a form input or a limit. The stats in `account.html:242–250` and the step numbers in `landing.html:233–245` are emotional/decorative and are correct.

## Pass / fail — §11 checklist

- [✗] One headline / one accent / one image — accent ✓ (single `--accent` family, no blue/purple anywhere); headline ✗ (multi-`<h1>` pages above, pending live check); image — `landing.html` carries 8 `<img>` (3 tile photos + 5 team photos). Justify in a comment per §12 or trim.
- [✗] Bilingual integrity — `.ambient-popover` and chat-bubble radii break in RTL (ship-blocker above). Depth check deferred to `rtl-bilingual-reviewer`.
- [✗] Logical properties only — see ship-blocker + should-fix list.
- [~] Hit targets — `landing.css .btn` 44px ✓, `room-shell.css .cam-btn` 44px ✓, `.status-btn` 36/44 ✓, `admin.html` tabs 36px ✓. `.btn-add` 42px ✗. Dozens of `index.html` icon buttons carry no `min-height` at all — not provable by grep.
- [✓] Focus rings — `colors_and_type.css:201` applies the 3px `--accent-glow` ring globally via `:where()`; every page imports it; every explicit `outline: none` found is paired with a `box-shadow` ring. `index.html:45` `* { outline: none }` is overridden by that rule (pseudo-class specificity wins).
- [✗] Contrast — three amber-on-small-text hits in `landing.css` (above).
- [~] Dark mode — tokens flip in `colors_and_type.css:153`; hard-coded greens/whites listed above are on black video surfaces, so they render, but they are not token-driven.
- [✓] Reduced motion — `index.html:48`, `landing.css:1387` (covers tile glow, lamp, marquee, live dots per §7), `platform.css:90`, `recovery.css:9`, both blog pages. `landing.html:513` also gates JS timers.
- [✗] No emoji in chrome — ambient-sound icons (ship-blocker).
- [~] No fabricated photography — 8 local JPG/WebP under `images/tiles` and `images/team`, no AI or stock hosts. Provenance of the person photos (Haya Turki, Majed Faisal, Munira Abdullah, …) is not recorded anywhere I could grep. **Aziz to confirm these are real, consented assets or placeholders.**
- [—] Reference comparison — subjective, defer to Aziz.

## Hard-no's checked and clean

Edtech blue · purple gradients · legacy gradient cards · glass-blur nav (all `backdrop-filter` hits are tile chips, overlays and video badges, never nav) · bouncy easing · marketing CTAs ("Get started" / "Sign up now" absent; CTAs are "افتح غرفة" / "Open a room") · centered form CTAs · white-on-black dark mode (`#000`/`#1a1a1a` are only the video-box surfaces).

## Files audited (16,920 lines)

HTML: 404, account (793), admin (708), blog ×3, contact, index (4,982), landing (624), lobby (546), open (1,671), platform (229), privacy, recovery, terms.
CSS: design-system/colors_and_type.css (277), design-system/landing.css (1,752), public/css/{platform,recovery,room-shell,study-workspace}.css.
JS (copy + UI): marketing-copy, platform-copy, study-copy, platform, study-workspace, halastudy-core, recovery, legal-shell.

## Recommended next step

Ship-blockers are closed. Open `rtl-bilingual-reviewer` for the depth pass on `index.html` and the study-copy digits.
