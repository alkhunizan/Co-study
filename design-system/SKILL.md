---
name: halastudy-design
description: Use this skill to generate well-branded interfaces and assets for Halastudy (هلا), the warm, late-night Gulf study-room product — landing pages, in-room screens, marketing artifacts, slides, and bilingual EN/AR prototypes. Contains the brand brief, color + type tokens, fonts, logo, iconography, and a ready-to-fork web UI kit.
user-invocable: true
---

# Halastudy Design Skill

Read **`README.md`** first — it contains the brand essence, content fundamentals, visual foundations, and iconography rules. Then read **`DESIGN.md`** for the practical playbook (layout patterns, component rules, ship-blockers). Then load **`colors_and_type.css`** as your token source.

## Quick orientation

- **Brand:** Halastudy | هلا — "the warm, late-night study room of the Gulf." Body-doubling for GCC students. Editorial restraint + warm hospitality + bilingual confidence.
- **One mood:** "a study lamp on a desk at 1am — quiet, focused, warm, and yours."
- **One accent:** Karak amber `#E0B08B`. No edtech blue, no purple, no gradients on surfaces.
- **Languages:** Arabic-first, full RTL parity, logical CSS properties always.
- **Fonts (Google Fonts CDN):** Newsreader (display), Inter (UI body Latin), Tajawal (Arabic body), Amiri (Arabic display), JetBrains Mono.

## What's in here

| Path | What it gives you |
|---|---|
| `README.md` | The brief — voice, tone, visual foundations, iconography, caveats |
| `DESIGN.md` | Practical playbook — decision order, layout patterns, component rules, ship checklist, hard no's |
| `colors_and_type.css` | All CSS vars + semantic recipes; light + dark themes; @import this and you're set |
| `preview/` | 19 small reference cards — colors, type, spacing, components, brand |
| `assets/logo-wordmark.html` | V1 wordmark (Newsreader + Amiri) — copy into your output |
| `assets/icons.html` | Lucide icon usage + emoji-to-Lucide migration map |
| `ui_kits/web/` | Forkable React/Babel prototype of the full web app (landing + room) |

## When asked to build something

1. **Always** start by `@import "colors_and_type.css"` (adjust the relative path) — never reinvent tokens.
2. Set `<html lang="ar" dir="rtl">` if Arabic-primary; otherwise `<html lang="en" dir="ltr">`. Use logical properties (`padding-inline-start`, `inset-inline-end`) so RTL flips automatically.
3. **Copy** logo and icons from `assets/` into your output rather than referencing across folders. Keep the bundle self-contained.
4. Match the voice: sentence case · second person · max 1 emoji per screen · editorial restraint. Bad: "🚀 Get started now!"  Good: "Open a room."
5. Use the existing components from `ui_kits/web/Components.jsx` (`Button`, `IconBtn`, `Input`, `Pill`, `Card`, `Avatar`, `LangSwitch`, `Logo`, `Icon`) as your building blocks. Don't restyle them — extend them.
6. **Imagery:** if you need a photo, use a placeholder with the imagery brief in `preview/illustration.html`. **Never** generate AI imagery in this brand — warm Gulf photography is reserved for human-sourced shoots.
7. **Icons:** Lucide line (1.5px stroke). Inline a few in `Components.jsx`'s `Icon`, or pull from the Lucide CDN. No emoji as icons in product chrome.

## When working with production code

The current implementation is in the **Co-Study** codebase (see `README.md` → Sources). Migration path:
- Drop `colors_and_type.css` next to the existing `<style>` block; replace the inline `:root` vars.
- Replace the chick-emoji `<img>` logo with the wordmark.
- Replace emoji-as-icon lookups (the `ambient-list` `<li>` items, `feature-icon` spans, status presets) with Lucide `<i data-lucide="...">`.
- Remove the 5-color "color-palette" picker from the room header — Halastudy ships one accent.
- Migrate the existing dark mode to the cool Gulf night-sky palette (`#0E1218` paper × warm amber accent).

## When the user invokes this skill without context

Ask them what they want to build (slide deck, landing page, in-app screen, social asset, deck for investors, mobile mock), then ask a few specifics:
- Language: AR-first, EN-first, or both side-by-side?
- Light or dark mode? (Halastudy ships both equally — pick deliberately, never both at once.)
- Photography available? If no, work with the lamp-glow direction in `preview/illustration.html`.
- Audience: students themselves, parents, investors, regulators? (Tone shifts.)

Then output HTML artifacts (for previews, mocks, decks) **or** production code (TSX, CSS), depending on the ask. Default to HTML artifacts unless the user has imported a codebase.

## Hard rules
- ❌ Edtech blue (`#3B82F6` family).
- ❌ Purple gradients.
- ❌ Gamification iconography (XP, badges, confetti) in v1.
- ❌ Stock photos of diverse smiling students on laptops.
- ❌ Emoji-heavy UI in product chrome.
- ❌ "Cozy + cute" infantilization. Treat the user as an adult.
- ✅ Editorial restraint, intentional whitespace, one strong accent, photographic texture, real Arabic-script craft.
