# DESIGN.md — Halastudy

Practical design playbook. README is the *why*; this file is the *how*. When in doubt, pick the rule that produces fewer elements, more whitespace, and warmer color.

---

## 1. The one-line direction

**"A study lamp on a desk at 1am — quiet, focused, warm, and yours."**

If a screen does not feel like this, stop and re-cut. The most common failure mode is over-decoration: too many cards, too many icons, too many colors. The remedy is always subtraction.

---

## 2. Decision order — pick in this sequence

When designing any new screen or asset, decide in this order. Don't skip ahead.

1. **Language** — AR-first, EN-first, or stacked? (Arabic copy first if the audience is GCC students.)
2. **Mode** — light (paper) or dark (night sky)? Pick *one*. Never both at once. Default light.
3. **Layout grid** — single column (≤720px content), two-column (sidebar + main), or three-column (the in-room view: left context · main work · right talk)?
4. **One headline** — the editorial sentence, set in Newsreader / Amiri, max 8 words.
5. **One accent moment** — exactly one place per screen gets the karak amber `#E0B08B` push (primary CTA, focused state, live pill). Everything else is ink + paper.
6. **One photographic surface** — at most one warm image or lamp-glow region per screen. Reserved for hero / empty-state.
7. **Icons** — Lucide line, 1.5px stroke. Decide which set before laying out — never sprinkle them in later.

---

## 3. Layout patterns (use these — don't reinvent)

### Editorial hero
- Two-column split, 1.1fr / 0.9fr.
- Left: eyebrow (11px, accent-2, letterspaced) → headline (Newsreader 48–64px, italic on the emphasized phrase) → 2-line description → feature pills → primary + secondary CTA.
- Right: a single visual artifact — camera grid mock, code box, scheduled-room card. Not a hero illustration.
- Radial accent-glow centered behind the right column, ≤30% opacity, blur 200px+.

### Decision card pair (create / join)
- Two cards side by side, equal width, gap 14px.
- Active card: 2px accent border + `accent-soft` background + sh-3. Inactive: 1px line border + sh-1.
- Icon tile 44×44, accent-soft background, accent-3 stroke icon. Heading 16/600. Sub 13/regular.

### Three-column app shell (in-room)
- 320px · 1fr · 320px on desktop. Collapses to single column under 1024px.
- Left pane: members → status → board (vertical stack inside a single scroll container).
- Center: video grid (2×2 fixed 18px-radius tiles, 6px gaps, on `#0f0c08` carrier) → Pomodoro card stuck below.
- Right pane: chat → ambient → scheduled room.

### Form card
- Max-width 560px. Padding 28px. Bottom-border hairline under the form title (14px gap).
- Vertical stack, gap 18px. Inputs full-width. Checkbox-tiles replace standalone checkboxes — they pair an icon + a label inside a tappable card.
- Primary CTA at the bottom, **left-aligned in LTR / right-aligned in RTL** — never centered. Centered CTAs read "marketing"; this is a tool.

---

## 4. Component-level rules

### Buttons
| Rule | Spec |
|---|---|
| Primary | `--accent` fill, `--ink` text, `--sh-lamp` shadow. Hover deepens to `--accent-2` and inverts text to `--ink-inv`. |
| Secondary | Transparent fill, 1px `--line-strong` border, `--ink` text. Hover → border `--accent-2`, text `--accent-2`. |
| Press | All variants → `scale(0.98)` + drop shadow one step. |
| Disabled | Opacity 0.45. No alternative state. |
| Width | Hug content. Full-width only inside narrow form cards (≤480px). |
| Radius | 999px pill on every button. Never square buttons. |
| Min hit | 44px on mobile, 36px on desktop. |

### Inputs
- Fill `--inset` resting, `--card` on focus + 3px `--accent-glow` ring.
- 16px radius, never 8px. 12/16 padding.
- Labels above (13/600). Hints 12/regular below. Error 12/`--danger`.
- Room-code inputs use `--font-mono`, letter-spacing 0.18em, `text-align: start`, `dir="ltr"` (even in AR layouts — codes don't flip).

### Cards
- Resting: `--card` fill, `--line` border, `--sh-2`. Radius 24px.
- Hover (only if interactive): lift 3–4px, shadow → `--sh-3`, border → `--accent`.
- Featured: gradient `rgba(224,176,139,0.18)` → `rgba(224,176,139,0.06)`, border `rgba(224,176,139,0.4)`.
- Empty state: dashed `--line-strong`, no shadow, content centered, copy in `--ink-3`.

### Pills, chips, tags
- Padding 6/12, radius 999. Font 13/500.
- Tones: `line` (default border + card fill), `accent` (`--accent-soft` + `--accent-3`, 600 weight), `solid` (`--accent` + `--ink`, 600 weight), plus success/warn/danger/live.
- Dot prefix is a 8px circle. Live dot pulses (`hcPulse 1.6s infinite`).

### Avatars
- Circle, `--accent-soft` background, `--accent-3` initial, Newsreader display weight.
- Presence dot 28% of avatar size, inset-block-end + inset-inline-end of -1, 2px `--card` ring.
- Colors: online → `--success`, away → `--ink-3`, busy → `--danger`.

---

## 5. Number rules (numerals are a brand decision)

- **Western digits (0–9)** for: timers, room counts, codes, prices, dates in form inputs, anywhere RTL/LTR mixing happens.
- **Eastern Arabic (٠–٩)** for: streak counters, "today's focus" hours, scheduled-room session stats, anywhere the number is *emotional*, not transactional. Apply via `font-feature-settings: "lnum" 0` on the specific span.
- Always tabular numerals (`font-variant-numeric: tabular-nums`) — the timer must not reflow each second.
- Letter-space 0.06em on monospace numbers; 0 on display-font numbers.

---

## 6. Bilingual & RTL rules

- Use logical CSS properties **always**: `padding-inline-start/end`, `margin-inline-*`, `inset-inline-*`, `border-inline-*`. Never `left` / `right` / `padding-left` / etc.
- Set `dir="rtl"` on `<html>` for Arabic — not on a wrapper div. The whole document flips.
- Some elements stay LTR even in Arabic: room codes (`A7K-2QF`), URLs, English brand names, code blocks. Wrap them in `<bdi data-force-ltr>` or apply `dir="ltr"` on the element.
- The Logo wordmark is **never translated**. "Halastudy" stays Latin in Arabic UI; the Arabic glyph mark `هلا` can stand beside it.
- Mirror icons that imply direction (back-arrow, send, chevron) — `transform: scaleX(-1)` under `[dir="rtl"]`. Symmetric icons (clock, camera, mic) do not flip.
- Hit targets are unchanged across languages; only flow direction changes.

---

## 7. Animation rules

- Default easing: `cubic-bezier(0.32, 0.72, 0.32, 1)` (var `--ease-soft`). Feels like pouring qahwa.
- Default duration: 220ms. Use 120ms only for state flips (hover, focus); 380ms for entering panels; 600ms only for full page swaps and the splash.
- **No springs, no bounces.** The one exception: the play-button pulse on Pomodoro start.
- Slide direction respects `dir`: in RTL, sheets enter from the inline-start (right) side. Use `transform: translateX(var(--slide-from))` with `--slide-from: -100%` and let logical flow handle the rest.
- Reduced motion: drop transitions to ≤120ms, disable the chat-message scroll-into-view, disable the camera-tile glow pulse.

---

## 8. Surface rules (what gets a card)

A `<Card>` exists when the content inside is:
- (a) **discrete** — a self-contained unit (one Pomodoro, one member list, one schedule),
- (b) **persistent** — it survives a scroll or state change, and
- (c) **interactive** or **measured** — clickable, or shows a number.

If none of those, it's just text on paper. Do not card every paragraph.

---

## 9. Empty states

- Dashed border, no shadow, content centered.
- Copy 1–2 short sentences, no exclamation marks, no emoji.
- Optional CTA inline, secondary variant.
- **Never** show "Oops!" or "Uh oh!" — the brand does not panic.

Templates:
- *Shared board, no tasks:* "Shared tasks will appear here."
- *No upcoming sessions:* "No upcoming sessions. Schedule one to bring your group together."
- *Chat, no messages:* "Messages will appear here."
- *Members, alone in room:* "You're the first one in. Share the code to invite people."

---

## 10. Hard "no"s (ship-blockers if you see these)

| ❌ | Why |
|---|---|
| Edtech blue (`#3B82F6` family) | Done to death in the category. |
| Purple gradients | SaaS-startup tell. |
| Gradient cards (gradient-blue, gradient-purple from the legacy code) | Removed — see README. |
| The 5-dot color picker in the room header | Halastudy ships one accent. |
| Neumorphic shadows (`shadow-btn-inset` from the legacy code) | 2019, dead. |
| Emoji-as-icon in product chrome | Use Lucide. Emoji is only for user-generated content. |
| Stock photo of "diverse smiling students on laptops" | This is what we are *not*. |
| Glass-blur navigation | Halastudy has solid nav. |
| Bouncy spring animations | Not the brand. |
| "Get Started Now 🚀" | We say "Open a room." |
| Centered CTAs in form cards | Tools left-align (or right-align in RTL); marketing centers. |
| Multiple accent colors on one screen | One. Always one. |
| White-on-black dark mode | Dark mode is cool indigo + warm ink + warm lamp — never pure white text on pure black. |

---

## 11. Quality bar — ship checklist

Before calling any artifact done:

- [ ] One headline, one accent, one image. (If you broke any rule of one, justify it in a comment.)
- [ ] Bilingual: switching `lang="ar" dir="rtl"` does not break a single layout.
- [ ] Logical properties only (no `padding-left`, `margin-right`, etc).
- [ ] Hit targets ≥ 44px on touch surfaces, ≥ 36px on desktop.
- [ ] No browser default focus outline anywhere — every focus uses `box-shadow: 0 0 0 3px var(--accent-glow)`.
- [ ] Text contrast ≥ 4.5:1 for body, ≥ 3:1 for large. (Karak amber on cream needs `--accent-3` (`#A56B43`) for small text.)
- [ ] Dark mode renders correctly — preview at `<html data-theme="dark">` and check that no rgb(...) is hardcoded for light mode.
- [ ] Reduced-motion media query respected.
- [ ] No emoji in product chrome (chat / room names / status text are exempt).
- [ ] No fabricated photography or AI imagery — placeholders only until real assets ship.
- [ ] The page would not look out of place next to NYT Magazine, Notion, or Arc. If it would, simplify until it doesn't.

---

## 12. When you genuinely need to break a rule

Document the break inline. Example:

```jsx
// EXCEPTION: two accents on this screen (amber + sage) because the
// success state is the entire content of the page. Approved by Aziz · 2026-05-14.
```

No silent rule-breaks. The point of the system is that exceptions are visible.
