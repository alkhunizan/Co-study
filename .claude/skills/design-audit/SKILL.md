---
name: design-audit
description: Use when reviewing any UI change in Halastudy (HTML/CSS/JSX/Vue/Svelte) against DESIGN.md — the ship checklist (§11) and the hard-no list (§10). Use before claiming a UI artifact is done, before opening a PR that touches a visual surface, after a /design-shotgun or design-html run, and whenever the user says "review the design", "audit the page", "is this on-brand", or "does this pass the checklist".
---

# design-audit

Halastudy's visual contract lives in `e:\Co-study\DESIGN.md`. This skill runs that contract as a checklist against the current code — same way a designer would walk a page before sign-off.

Use this skill for the **objective, checkable** parts of DESIGN.md (§10 hard-no's, §11 ship checklist, §4 component-level specs). For subjective taste calls ("does this feel like a study lamp at 1am?"), surface candidates and let Aziz judge — do not declare them pass/fail yourself.

For the RTL/bilingual subset specifically, prefer dispatching the `rtl-bilingual-reviewer` agent — it goes deeper. This skill should call out RTL issues at the surface level and defer detail to that agent when the scope is large.

---

## When to invoke

- After any change to `index.html`, `landing.html`, or any file under a UI directory.
- Before declaring `/spike-day N` complete if Day N touched a visual surface.
- When the user asks: "review the design", "design audit", "check the checklist", "is this ready", "on-brand?", "ship-ready?".
- Proactively after `/design-html` or `/design-shotgun` produces an artifact.

Do NOT invoke for: pure backend/MCP work, plain-text README edits, config files, or anything without a rendered UI surface.

---

## Inputs

The skill works on one of three scopes, in order of preference:

1. **Explicit file list** the caller passed in.
2. **Git diff** vs `main` (or parent branch) — `git diff --name-only` filtered to UI extensions.
3. **A single named page** ("audit landing.html") — read the file and the CSS it imports.

If no scope is determinable, ask once: "Audit current diff, a specific file, or the whole `index.html`?" Then stop until answered.

---

## The audit — run in this order

Each step has a Grep/Read pattern. Run them and collect findings. Don't fix anything in this skill — fixing belongs to a separate session or to the `rtl-bilingual-reviewer` agent.

### Step 1 — Hard-no's (DESIGN.md §10) — these are ship-blockers

Grep the audited files for each:

| Pattern to grep | Means |
|---|---|
| `#3B82F6`, `#2563EB`, `#1D4ED8`, `bg-blue-`, `text-blue-`, `from-blue-`, `to-blue-` | Edtech blue — banned |
| `from-purple-`, `to-purple-`, `bg-gradient.*purple`, `#8B5CF6`, `#A855F7` | Purple gradient — banned |
| `gradient-blue`, `gradient-purple` (legacy class names) | Removed gradient cards — banned |
| `shadow-btn-inset`, `box-shadow:.*inset.*inset` | Neumorphic — banned |
| `backdrop-filter:.*blur` on `nav`, `header`, `[role="navigation"]` | Glass-blur nav — banned |
| `cubic-bezier.*1\.[0-9]`, `cubic-bezier.*-0\.[0-9]`, keyword `spring` in animation configs | Bouncy easing outside the Pomodoro exception |
| `🚀`, `✨`, `🎉`, `👋`, `🔥` inside JSX/HTML outside of user-content surfaces (chat, room names) | Emoji-as-icon — banned in chrome |
| `"Get Started"`, `"Sign up now"`, `"Join today"` literal CTA copy | Marketing-voice CTAs — Halastudy says "Open a room" / "افتح غرفة" |
| `text-align:\s*center` on a `<form>` CTA, or `mx-auto` on a primary button inside a form card | Centered form CTA — banned (§3 form card rule) |
| More than one accent color on a screen | Count distinct accent fills per file; flag if > 1 |
| `text-white` on `bg-black`, `color:\s*white` on `background:\s*#000`, in a dark-mode block | White-on-black dark mode — banned |

Any hit = ship-blocker. Quote the line.

### Step 2 — Ship checklist (DESIGN.md §11) — each item gets a pass/fail/skip

Walk every item and report status:

1. **One headline / one accent / one image** — count `<h1>` (should be 1), count distinct accent-fill colors (should be 1), count hero images (≤ 1).
2. **Bilingual integrity** — does the file render under `lang="ar" dir="rtl"`? Grep for physical CSS (see §6 below). If anything is found, this item fails. Cross-check with the `rtl-bilingual-reviewer` agent for depth.
3. **Logical properties only** — grep for `padding-left`, `padding-right`, `margin-left`, `margin-right`, `left:`, `right:` (as position), `border-left`, `border-right`, `text-align: left`, `text-align: right`, `float: left`, `float: right`, plus Tailwind `pl-*`/`pr-*`/`ml-*`/`mr-*`/`left-*`/`right-*`/`border-l*`/`border-r*`/`rounded-[tlbr]*`. Any hit fails this item.
4. **Hit targets** — primary CTAs / icon buttons should have `min-height: 44px` on touch (`@media (max-width: 768px)` or a `:where(.touch)` rule) and `36px` on desktop. Grep button declarations.
5. **Focus rings** — every interactive element should have a `:focus-visible` rule with `box-shadow: 0 0 0 3px var(--accent-glow)` (or equivalent). Grep for `outline: none` without a paired `box-shadow` focus rule — that's a fail.
6. **Contrast** — flag any `color: var(--accent)` (the karak amber) applied to body-size text (anything not display heading). Small accent text should use `var(--accent-3)` (#A56B43). Heuristic: amber on cream + `font-size: 1[0-5]px` = fail.
7. **Dark mode** — check that there are no hard-coded light-mode RGB values inside rules that aren't gated by `[data-theme="dark"]` or `prefers-color-scheme`. Grep `rgb(`, `#fff`, `#ffffff`, `white` outside CSS-variable definitions.
8. **Reduced motion** — for every keyframe animation longer than 200ms (parse `animation-duration` and `@keyframes`), check for a matching `@media (prefers-reduced-motion: reduce)` rule. Missing = fail.
9. **No emoji in chrome** — covered in §10 hard-no's above.
10. **No fabricated photography** — grep for `<img src=` and flag any URL that looks like an AI image host (`*.openai.com`, `*.midjourney.com`, `replicate.delivery`, `cdn.leonardo.ai`) or a stock-photo host (`unsplash.com`, `pexels.com`, `shutterstock.com`). Real assets only.
11. **Reference comparison** — last item. Skip — this is Aziz's taste call. Note in the report: "Subjective, defer to human."

### Step 3 — Component-level specs (DESIGN.md §4) — sanity-check the easy ones

- **Buttons**: every `<button>` (or button-equivalent) should have `border-radius: 999px` or a class that resolves to a pill. Square buttons = fail (§4 buttons table). The press state should be `transform: scale(0.98)`. Disabled state is opacity 0.45 — no alt color.
- **Inputs**: `border-radius: 16px`, never 8px. Focus state has the 3px `--accent-glow` ring.
- **Cards**: `border-radius: 24px`, `border: 1px solid var(--line)`, `box-shadow: var(--sh-2)`. Hover (if interactive) lifts 3–4px and bumps to `--sh-3`.
- **Pills**: `border-radius: 999px`, `font-size: 13px`, `font-weight: 500`.

These are easy Grep targets. Flag mismatches as should-fix, not ship-blockers (the design system is the bigger fish; one mis-styled pill isn't blocking).

### Step 4 — Number rules (DESIGN.md §5) — light pass

- Grep timer/code/price elements for `font-variant-numeric: tabular-nums`. Missing = should-fix.
- Grep for Eastern Arabic digits (`[٠-٩]`) hard-coded into HTML/JSX. If they appear inside a timer, room code, or input, that's a ship-blocker (§5 says Western digits for transactional numbers).

---

## Output format

Produce one markdown report. No preamble. Structure:

```
# Design Audit — <branch / file list>

## Verdict
<one of: SHIP-READY / FIX BEFORE MERGE / NEEDS REWORK>
<one sentence justifying it>

## Ship-blockers (§10 hard-no's + critical §11 fails)
- **<§ reference> — <short name>** — `path/file.html:line`
  Found: `<offending line>`
  Why blocked: <one clause>
  Fix direction: <what to change to>

## Should-fix (component-level mismatches, missing tabular-nums, etc.)
- ...

## Pass / fail — §11 checklist
- [✓] One headline / one accent / one image
- [✗] Logical properties only — see ship-blocker above
- [✓] Hit targets ≥ 44px touch / ≥ 36px desktop
- [—] Reference comparison (subjective — defer to Aziz)
- ...

## Files audited
- path/file.html (N lines)
- path/file.css (N lines)

## Recommended next step
<one of: "Open `rtl-bilingual-reviewer` for the RTL details" / "Fix the 3 ship-blockers above and re-run" / "Looks good — Aziz to sign off on §11 item 11">
```

Verdict rules:
- **SHIP-READY** — zero ship-blockers, ≤ 3 should-fixes.
- **FIX BEFORE MERGE** — zero ship-blockers, > 3 should-fixes, OR 1–2 ship-blockers that are mechanical (e.g., one `pl-4` slipped in).
- **NEEDS REWORK** — ≥ 3 ship-blockers, OR any §10 hard-no (those are non-negotiable).

---

## What this skill does NOT do

- Does not refactor or write code. The output is a punch list.
- Does not judge taste — §11 item 11 ("would not look out of place next to NYT/Notion/Arc") is always deferred to Aziz.
- Does not audit `mirotalksfu/` core code (AGPL boundary — see CLAUDE.md §8).
- Does not pull screenshots. If a visual diff is needed, suggest `/design-review` (live audit) or `/browse` (screenshot capture).
- Does not check translation quality — only checks that AR/EN string sets match in keys (delegate to `rtl-bilingual-reviewer`).

---

## Notes for future-you

- DESIGN.md §10 and §11 are the authoritative checklist. If those sections move, update the Grep patterns above to match.
- The hard-no list is intentionally tight — Aziz built Halastudy specifically NOT to look like edtech. Don't soften ship-blocker calls for "well, blue is just one option" — that's the whole point.
- The "one accent" rule in §10 is the most-violated one. People sneak in a second amber-or-not because they want a "highlight" — flag it every time. Exception is documented inline per §12.
