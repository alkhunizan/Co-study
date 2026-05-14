# Halastudy | هلا — Design System

> **One-line:** the warm, late-night study room of the Gulf — body-doubling for GCC students, Arabic-first, editorial-grade.

This design system encodes the *Halastudy* visual direction on top of the existing **Co-Study** codebase, which is being rebranded. The word **Hala** (هلا) is Gulf hospitality — *welcome, come in, sit down, have qahwa* — and **Cam** is the always-on study camera that creates quiet accountability. The brand is what you'd get if Notion, Pitchfork, and a 2am desk lamp had a baby in Riyadh.

---

## Sources

| Source | Type | Location |
|---|---|---|
| Co-Study codebase | Local repo (read-only) | `Co-study/` (mounted via File System Access) — `landing.html`, `index.html`, `README.md`, `README_AR.md` |
| Brief — *Halastudy Visual Brand & Theme Brief* (Aziz, May 14 2026) | Brand brief | Pasted into the kickoff prompt; summarized below |
| Brand reference points | External | Notion, Arc, Linear, Pitchfork, NYT Magazine, AlUla brand system, Studio Safar, Khateeb Brothers |

We were not given Figma access, photography assets, or a finalized logo. **The chick-emoji GIF used in the Co-Study codebase is a placeholder and is intentionally NOT carried forward.** A wordmark using Newsreader Italic + Tajawal Black is provided in `assets/logo-wordmark.html` as the V1 mark, pending logo direction (see "Caveats" at the bottom).

---

## Brand essence (commit to ONE direction, not five)

| Pillar | What it means visually |
|---|---|
| **Warm welcome** | Nobody gets shamed for procrastinating. The product *opens its door*. Cream backgrounds, warm amber, never pure white-on-black. |
| **Quiet ambition** | These are pre-med, KAUST, CFA students. Treat them as adults. Editorial type, no XP bars, no confetti. |
| **Late-night solidarity** | Dark mode is *Gulf night sky × warm lamp*. Cool indigo-charcoal `#0E1218` background with a warm amber accent — the contrast IS the brand. |
| **Bilingual confidence** | Arabic and English are *both* primary. Logical CSS properties everywhere — `padding-inline-*`, `margin-inline-*`, never `left/right`. |
| **Modern Gulf, not Orientalist** | Riyadh 2026, not "Aladdin." Geometric Najdi patterns *sparingly* as accent. No camels, mosques, lamps with genies. |

### What we are NOT
StudyStream's pastel kid-bedroom · Focusmate's corporate SaaS blue · purple Linear-clone · cluttered government-portal Arabic edtech · stock photos of diverse smiling students on laptops.

---

## File index

```
.
├── README.md                  ← you are here
├── DESIGN.md                  ← practical design playbook (rules, patterns, hard no's)
├── SKILL.md                   ← Agent Skills entrypoint
├── colors_and_type.css        ← all CSS vars + semantic recipes
├── assets/                    ← logo, icons, font notes
│   ├── logo-wordmark.html     ← V1 wordmark (Newsreader + Tajawal)
│   ├── baby-chick.gif         ← legacy mark from Co-Study (do NOT use)
│   └── icons.html             ← Lucide icon usage (CDN-linked)
├── preview/                   ← Design-System-tab cards
│   ├── colors-paper.html
│   ├── colors-accent.html
│   ├── colors-semantic.html
│   ├── colors-dark.html
│   ├── type-display.html
│   ├── type-body.html
│   ├── type-arabic.html
│   ├── type-scale.html
│   ├── space-radii.html
│   ├── shadows.html
│   ├── motion.html
│   ├── buttons.html
│   ├── inputs.html
│   ├── pills-badges.html
│   ├── cards.html
│   ├── nav-toolbars.html
│   ├── status-presence.html
│   ├── logo.html
│   └── illustration.html
├── ui_kits/
│   └── web/                   ← Halastudy web app (formerly Co-Study)
│       ├── README.md
│       ├── index.html         ← full interactive prototype
│       ├── Landing.jsx
│       ├── Room.jsx
│       ├── Components.jsx     ← buttons, inputs, pills, cards
│       └── Lang.jsx           ← AR/EN copy + RTL toggle
└── Co-study reference notes   ← (referenced via Co-study/ mount, not copied)
```

---

## CONTENT FUNDAMENTALS

### Voice — *senior friend at the 24/7 library*

A Halastudy line should read like the warmest, smartest student in the room — competent, never cute. Confident enough to be brief.

- **Casing:** Sentence case for everything, including buttons and headings. Never ALL CAPS except for eyebrow micro-labels (`COLLABORATIVE STUDY SPACE` → `Collaborative study space` in v2 unless used as an eyebrow with `letter-spacing: 0.18em`).
- **Pronoun:** Second-person, singular informal. *"You"* in English; *"أنت"* in Arabic — never the formal *"حضرتك"*. Talk to one student, not a "userbase."
- **First-person product:** Avoid. The product doesn't talk about itself in first person ("We help you focus" ✗). It addresses *you* ("Drop in, start the timer, work alongside someone" ✓).
- **Emoji:** Sparingly. **Max 1 per screen** in production UI — currently the Co-Study codebase uses emoji as icons in chips, ambient-sound list, status presets. The plan is to **migrate emoji-as-icon to Lucide line icons** and keep emoji only in user-generated content (chat, status text).
- **Numerals:** Western Arabic digits (0–9) by default for compatibility, including timers, room counts, and codes. **Eastern Arabic (٠١٢٣)** is opt-in for emotional moments — streak counter, "today's focus" summary. Provide a user toggle.

### Tone examples (real, from current copy + revisions)

| Function | ❌ Avoid (edtech default) | ✅ Halastudy |
|---|---|---|
| Empty state | "You don't have any tasks yet! Add one to get started 🚀" | "Shared tasks will appear here." |
| Error | "Oops! Something went wrong 😢 Try again later." | "Can't reach the room right now. Try again in a moment." |
| Hero (EN) | "The #1 productivity app for students!" | "Drop in. Camera on. Work alongside someone." |
| Hero (AR) | "أفضل تطبيق للدراسة!" | "ادخل. الكاميرا شغّالة. اشتغل مع غيرك." |
| Button (EN) | "Get Started Now" | "Open a room" / "Join a room" |
| Button (AR) | "ابدأ الآن مجاناً" | "افتح غرفة" / "ادخل غرفة" |
| Streak | "🔥🔥🔥 7-day streak!! Keep grinding!" | "7 days in a row. Quietly impressive." |
| Schedule | "⏰ Don't forget your study session!" | "Your 9pm room opens in 12 min. See you there." |

### Bilingual rules

1. **Arabic is not a translation layer.** Write Arabic copy *first* for any Gulf-targeted surface (landing hero, room creation, scheduled-room invites), then translate to English. The current Co-Study codebase already does this — `landing.html` defaults to `lang="ar" dir="rtl"`.
2. **Mixed-script lines** (e.g. "Join room ABC123") use a directional isolate so the LTR room code doesn't break RTL flow: wrap the code in `<bdi data-force-ltr>ABC123</bdi>`.
3. **WhatsApp invites are first-class** — Gulf students share by WhatsApp before email. Every shareable artifact (scheduled room, invite link) must have a one-tap WhatsApp share button.

### Hashtags / external copy
Lowercase, no diacritics, joinable: `#halastudy`, `#هلا`, `#مذاكرة_جماعية`, `#focusroom`. Never `#HalaStudy` or `#Hala_Study`.

---

## VISUAL FOUNDATIONS

### Colors
- **Surfaces are paper, not white.** Light mode page bg is `#F5F2EB` (aged cream). White (`#FFFFFF`) is reserved for *raised* cards. Dark mode is `#0E1218` (Gulf night sky — cool indigo-charcoal), **not** warm-coffee black and **not** Facebook grey. The night around the lamp is cold; the lamp itself is warm — that contrast is the brand.
- **One accent — Karak amber `#E0B08B`.** Used for primary buttons, focus rings, links, accent text. Deepened to `#C28A62` for press state and small-text legibility. No competing accent.
- **Semantic colors are warm-shifted:** success is sage `#5A8C5C` (not Twitter green), danger is terracotta `#C75545` (not fire-engine red), warn is deep amber `#D4A256`.
- **No purple, no edtech blue.** Removed `#A29BFE` and `#74B9FF` from the legacy color-palette picker. Single accent shipping.
- **No gradients on surfaces.** A single radial accent-glow (`--accent-glow`) is allowed once per screen, behind hero content, at <30% opacity. Gradient *cards* (the legacy "preview-card.gradient-blue / .gradient-purple") are deleted.

### Typography
- **Display:** `Newsreader` (Google Fonts) — high-contrast editorial serif, NYT Imperial-adjacent. Used at h1–display weights, semibold/600.
- **Body / UI:** `Inter` (Latin) + `Tajawal` (Arabic). Tajawal is the body weight; Inter handles UI controls and Latin chrome.
- **Display Arabic:** `Amiri` for editorial Arabic moments (landing eyebrow, blockquote pull-outs). Falls back to Tajawal Black at heavy weight.
- **Mono:** `JetBrains Mono` for the Pomodoro display, room codes, and timestamps. Tabular numerals on.
- **Scale:** 11 / 13 / 14 / 16 / 18 / 22 / 28 / 36 / 48 / 64 (see `type-scale` card). Body minimum 16px, hit-target minimum 44px.

### Layout, density, rhythm
- **Generous whitespace.** Section padding `clamp(20px, 5vw, 60px)`. Cards have 24–32px of internal padding.
- **12-col grid implicit, but we lean on flex/grid with `gap`** — never inline-margin spacing.
- **Max content width 1200px**, but most editorial moments cap at 720px for readability.
- **Logical properties everywhere.** `padding-inline-start`, `margin-inline-end`, `inset-inline-end` — RTL is automatic.

### Backgrounds
- Solid paper (`--paper`) is the default. No imagery on >50% of the surface.
- A faint radial *lamp glow* (`var(--accent-glow)` blurred at 200px+) sits behind the hero — single instance per screen.
- **No full-bleed stock photography** in v1. When photography eventually ships, it should be warm-graded (golden hour, lamp light), grain optional, never the "diverse-students-on-laptops" template.
- **No repeating SVG patterns** as page backgrounds. Najdi geometric patterns are reserved for *empty-state* cards and the loading splash, at <8% opacity.

### Borders
- 1px hairlines, color `--line` (`#E2D7C8` light / `#2F2820` dark).
- Dashed borders only for empty-state and result-of-action panels (e.g., the room-code result box uses `1px dashed var(--accent)`).
- No double or thick borders. Card "border" is usually a shadow, not a stroke.

### Corner radii
- `6px` chips / micro · `10px` tags · `16px` inputs · `20px` tiles · `24px` cards · `32px` big cards & modals · `999px` pills.
- **The room video tiles are 18px**, the camera grid container is 24px — this is intentional, tighter radii on rectangular media to look more like windowed footage.

### Shadows + elevation
Five-step system; no hard drops. All shadows use a **warm ink** color (`rgba(28, 24, 20, ·)`) — never pure black.
- `sh-1` resting card · `sh-2` raised pill · `sh-3` floating card · `sh-4` modal · `sh-5` hero / heavy floating panel.
- **Neumorphic shadows** (the legacy `--shadow-btn` with `#d1d1d1 / #ffffff`) **are removed.** They read 2019-SaaS and don't translate to dark mode.
- A signature **lamp shadow** (`--sh-lamp`) puts a warm amber glow under the primary CTA — used once per screen.

### Hover + press states
- **Hover (buttons):** lift 2px (`transform: translateY(-2px)`), elevate shadow one step. Accent CTAs darken to `--accent-2`.
- **Hover (cards):** lift 3–4px, elevate one shadow step, border color shifts to `--accent`.
- **Press:** translate 0, shrink to `scale(0.98)`, shadow drops to inner-inset.
- **Focus:** `box-shadow: 0 0 0 3px var(--accent-glow)` — never the default browser outline.

### Transparency + blur
- **Modal scrim:** `rgba(28, 24, 20, 0.55)` + `backdrop-filter: blur(6px)`.
- **Floating badges on video** (room name, AI focus monitor): `rgba(0,0,0,0.6)` + `backdrop-filter: blur(8px)`.
- **Glass nav** is **NOT** used — Halastudy has a solid top bar that fades from `--paper` to transparent at scroll.

### Motion
- **Easing:** `cubic-bezier(0.32, 0.72, 0.32, 1)` (`--ease-soft`) is the default — feels like *pouring qahwa*. Page transitions use `--ease-page`.
- **Durations:** 120ms (state flips, hover) · 220ms (default) · 380ms (entering panels) · 600ms (slide cuts, splash).
- **No bounces.** Springs are reserved for entry of the timer-control "play" pulse only.
- **Fades + slides** dominate. Slide direction respects writing mode (RTL slides come from the inline-start side).
- **Reduced motion:** all transitions drop to ≤120ms; the page-section auto-scroll becomes instant.

### Imagery color vibe
- **Warm, never cool.** Photography (when added) targets a 3000K–4500K white balance. Black-and-white only as a deliberate editorial choice (e.g., room-creator's avatar fallback).
- **No women's faces in marketing illustrations** unless explicitly approved by the team — GCC market sensitivity. Use hands, objects, silhouettes, stylized avatar shapes.

### Cards — what they look like
- Background: `var(--card)` (white on cream / coffee-warm on night).
- Border: `1px solid var(--line)`.
- Shadow: `--sh-2` resting; `--sh-3` on hover.
- Radius: `--r-xl` (24px) default; `--r-2xl` (32px) for big content cards.
- Inner padding: 24px standard, 32px hero / form cards.

---

## ICONOGRAPHY

The Co-Study codebase ships **no icon system** — it uses emoji as icons throughout (📚 🌧️ 🔥 ☕ 🌊 🚀 🔒 ⚡ 🌍). The brief explicitly calls this out as something to fix. The plan:

- **Primary icon set: [Lucide](https://lucide.dev/)** (open-source line icons, 1.5px stroke, MIT licensed). Loaded from CDN — see `assets/icons.html` for usage. Lucide matches the editorial-restraint direction better than Heroicons (which reads more SaaS) or Phosphor (busier).
- **🚩 Substitution flag:** the Co-Study repo has no in-house icon set, so Lucide is a *substitution*. If Halastudy later commissions a bespoke icon family, replace `lucide` references in `assets/icons.html` and the UI kit.
- **Stroke weight:** 1.5px default, 2px for 24px+ display sizes. Color inherits from `currentColor`.
- **Sizing:** 16 (inline), 20 (button), 24 (toolbar), 32 (feature card).
- **Emoji policy:**
  - **In product chrome:** removed. Emoji-as-icon is a tell of "I shipped fast" — Halastudy's posture is "I shipped carefully." The ambient-sound list (`🌧️ Rain / 🌲 Forest / ☕ Cafe`) migrates to Lucide line icons (`cloud-rain`, `trees`, `coffee`).
  - **In user-generated content** (chat messages, status text, room names): allowed. Users can name their room "🐤 night crew" if they want.
  - **In marketing copy:** never.
- **Unicode-as-icon:** `✦` (used for "create a room") and `➤` (used for "join a room") in the existing landing copy are kept as **type ornaments**, not icons — set in Newsreader at the same size as the heading they sit beside.
- **Logo:** the V1 wordmark (`assets/logo-wordmark.html`) is type-only, no glyph. A future `هلا` glyph mark is reserved for the favicon and tiny-context use — pending design (see Caveats).

---

## UI Kits

| Kit | What it covers | Files |
|---|---|---|
| **`ui_kits/web/`** | The Halastudy web app (rebranded Co-Study). Landing page → create room → in-room view with video grid, Pomodoro, shared board, chat, ambient sounds. Bilingual EN/AR with live RTL flip. | `index.html` + `Landing.jsx` + `Room.jsx` + `Components.jsx` + `Lang.jsx` |

Mobile-app and marketing-site kits are **out of scope for v1** — Co-Study is web-only today.

---

## Caveats & open questions for Aziz

1. **Logo:** the V1 wordmark in `assets/logo-wordmark.html` is a working placeholder. The brief's Q1 ("Are you committed to 'Halastudy' as wordmark, or open to a sub-brand mark like هلا + study?") is unresolved. I've delivered the wordmark-only direction — if you want the bilingual lockup, please flag.
2. **Cultural register:** the brief's Q2 ("subtly Gulf vs. unmistakably KSA-coded") was answered implicitly by the codebase already targeting KSA. This system reads "unmistakably KSA, designed to travel." If you want subtler, the geometric-Najdi-pattern usage (currently reserved for empty states) is the first thing to soften.
3. **Fonts on Google Fonts only.** Newsreader, Inter, Tajawal, Amiri, JetBrains Mono all load from the Google Fonts CDN. **🚩 Substitutions:** the brief recommends *29LT Bukra* and *IBM Plex Sans Arabic* — both require licensing. If you have licenses, drop the .woff2 files into `assets/fonts/` and I'll swap. Tajawal + Amiri is a strong free pairing in the meantime.
4. **Iconography:** Lucide CDN is a substitution for an in-house icon family that does not exist yet. See above.
5. **Photography + illustration:** no real assets shipped in this v1 system. The illustration card (`preview/illustration.html`) is a direction sample, not finished art. Please commission or source warm, lamp-lit Gulf-context photography for the marketing site.
6. **Mobile app:** the codebase is web-only. The brief mentions iOS/Android — we'll need to expand the system once mobile starts.

---

## Refresh asks — **read this**

This system is round 1 of the brief. The bold ask back at you:

> **(a)** Confirm the logo direction (wordmark only vs. هلا + study lockup) so I can finalize `assets/logo-wordmark.html`.
> **(b)** Confirm whether to commission the icon family or stay on Lucide for V1.
> **(c)** Drop any photography / illustration references you've collected into `assets/inbox/` and I'll grade them and rebuild the imagery card.
> **(d)** Dark mode now uses the Gulf night-sky direction (cool indigo `#0E1218` × warm amber lamp). If you want it cooler or warmer still, flag the swatches in `preview/colors-dark.html`.
