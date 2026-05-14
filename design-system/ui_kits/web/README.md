# Halastudy Web — UI Kit

Pixel-fidelity recreation of the **Halastudy web app** (rebranded Co-Study). Bilingual EN ↔ AR with live RTL flip, click-through from landing → create room → in-room view.

## Files
| File | Role |
|---|---|
| `index.html` | Entry; loads React + Babel, wires the screen state machine |
| `Lang.jsx` | EN/AR copy dictionary + RTL toggle (kept separate so copy is easy to find) |
| `Components.jsx` | Atomic primitives — `Button`, `IconBtn`, `Input`, `Pill`, `Card`, `Avatar`, `Live` |
| `Landing.jsx` | Two-section landing: hero + create / join form |
| `Room.jsx` | In-room: video grid, Pomodoro, shared board, chat, ambient |

## Coverage of the source product (Co-study/index.html + landing.html)
- Landing hero with bilingual headline + feature chips ✓
- Create room form (name, password toggle, scheduled-room expansion) ✓
- Join room form with room-code preview ✓
- Top bar (logo, lang switch, theme toggle, share CTA) ✓
- Room toolbar (focus pomodoro, board tab, chat tab, mic, leave) ✓
- Camera grid with 1 self + 2 fake peer tiles ✓
- Pomodoro timer with tabs (Focus / Break) + tabular numerals ✓
- Shared board (room goal + 3 to-do items, priorities) ✓
- Live chat with system messages ✓
- Ambient sounds popover (Rain / Forest / Cafe / Fireplace / Ocean / Off) — kept as line icons, not emoji ✓
- Status presets (Studying / Working / Meal / Away) ✓
- Scheduled-room card with countdown ✓

## What we intentionally cut from the source
- Neumorphic shadow buttons (`shadow-btn-inset`) — replaced with single-direction warm shadows
- 5-color "color-palette" picker in the header — Halastudy ships one accent
- Emoji-as-icon (📚 🌧️ 🚀 🌍) — migrated to Lucide line icons
- Gradient preview-cards (`gradient-blue` / `gradient-purple`) — removed; brief says no purple, no gradients
- Baby-chick GIF logo — replaced with Newsreader wordmark
- AI Focus Monitor pill on the camera tile — kept but redesigned as a quiet line item, not a status-dot emoji

## How to view
Open `index.html` in any browser. No build step. Toggle EN/AR in the top bar; the layout flips RTL live.
