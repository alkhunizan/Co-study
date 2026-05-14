# CLAUDE.md — Halastudy (e:\Co-study)

> Auto-loaded by Claude Code at session start. Read once, then refer to DESIGN.md / PLAN.md as needed. Do not re-read each prompt.

---

## 1. Project identity

**Halastudy** — live-camera body-doubling for GCC/Saudi students. Quiet by default, camera is the signal, audio is the exception. This repo (`e:\Co-study`) is the active fork — Arabic-bilingual, customized from upstream `co-study`. Owner: Aziz Al Khunizan (solo). v1 scope is the 6-week MVP wedge — **do not** build StudyStream-parity features (mass focus rooms, AI quiz, Spotify integration, social feed); those are v2 / post-Gate 2.

---

## 2. Source-of-truth docs

Read in this order when context is needed:

1. **`CLAUDE.md`** (this file) — how we work
2. **`DESIGN.md`** — UI/visual contract (one accent, logical CSS only, RTL rules, §10 hard-no's, §11 ship checklist)
3. **`PLAN.md`** — active sprint plan (when present; currently mirrored from `D:\Projects\body-doubling\PLAN.md`)
4. **`README.md` / `README_AR.md`** — public-facing project description, EN + AR
5. The body-doubling decision pack still lives at `D:\Projects\body-doubling\project-knowledge\` — port to `e:\Co-study\project-knowledge\` when convenient.

---

## 3. `/goal` — your discipline backstop

`/goal` is a built-in Claude Code feature. You set a completion condition, and after each turn a small fast model (Haiku by default) checks whether the condition holds. If not, Claude starts another turn instead of returning control. The goal clears automatically when met.

**Use `/goal` for substantial work with a verifiable end state**: a feature that compiles + passes specific tests, an integration that works between two services, a checklist that is fully ticked.

**The evaluator's blind spots** — important:
- It only judges what Claude has surfaced in the transcript. It does NOT run commands or read files independently.
- So write conditions that Claude's output can demonstrate. "Tests pass" works because Claude runs them and the result is in the transcript. "The code is clean" doesn't work — too vague.
- Default Haiku evaluator is fast but not infallible. For UI taste, security review, or anything subjective, don't use `/goal`.

**Status, clear, resume**:
- `/goal` (no args) → see active condition, turns spent, last evaluator reason.
- `/goal clear` → stop early.
- A goal active when a session ends is restored on `--resume` / `--continue` (turn count + token baseline reset).

---

## 4. Goal-phrasing recipes

Pick the closest template, fill in the brackets:

**Daily spike** (the common case):
```
/goal Day [N] complete per PLAN.md: [day-specific criterion] AND today's spike-log.md entry written using CLAUDE.md §6 template. Stop after 25 turns even if not met, and report what's blocking.
```

**Bug hunt**:
```
/goal Bug fixed: [stack trace / repro] no longer reproduces; a regression test exists; no other test files modified. `npm test` exits 0.
```

**Refactor**:
```
/goal Refactor done: every call site of [old name] migrated to [new name]; `git grep [old name]` returns zero hits; tests pass; net LOC delta ≤ +[X].
```

**UI work** (use this when touching `index.html`, `landing.html`, or any visual surface):
```
/goal [feature] works end-to-end on localhost AND every item in DESIGN.md §11 ship checklist confirmed in transcript AND zero items from DESIGN.md §10 hard-no's introduced. Stop after 25 turns.
```

---

## 5. `/spike-day` quick reference

`/spike-day <N>` (custom slash command in `.claude/commands/`) — picks Day N's success criterion from PLAN.md §3, sets the appropriate `/goal`, and starts the day's work. Use this instead of hand-writing a `/goal` every morning.

```
/spike-day 1   # boots co-study + mirotalksfu side-by-side on localhost
/spike-day 5   # quiet mode + room create/join flow, with DESIGN.md §11 checked
```

---

## 6. spike-log.md template

Append at the end of every working block to `project-knowledge/spike-log.md` (create if missing):

```markdown
## YYYY-MM-DD — Day N of Week N

**Goal for this session:** <1 line>

**What worked:**
- <bullet>

**What broke:**
- <bullet, with the actual error message>

**What I changed:**
- <files touched, commits made>

**Next session starts with:**
- <single concrete next action>

**Open questions for Aziz:**
- <ranked list, max 3>
```

---

## 7. When NOT to use `/goal`

The Haiku evaluator gets these wrong — don't waste turns:

- **Interviews** (P1) — human-evaluation step. No transcript signal.
- **Distribution outreach** (P3) — same.
- **Subjective UI taste** beyond DESIGN.md's checkable items — let Aziz judge.
- **Anything ambiguous** — if a senior engineer would say "depends," Haiku will too.
- **Anything destructive** that needs a human go/no-go (force-push, dropping data, deploying).

For these, work in normal mode and report when ready for review.

---

## 8. Working agreement (short version)

- Act on low-risk reversible tasks (read, build, test, draft). Ask before destructive ones (force-push, delete outside cwd, install system deps, touch MiroTalk core code → AGPL).
- Windows + PowerShell. `.ps1` not `.sh` for any scripts you generate.
- Append to `spike-log.md` at the end of every working block.
- Conventional commits (`feat:`, `fix:`, `chore:`, `docs:`, `spike:`). Branch names: `spike/<topic>`, `feat/<feature>`, `fix/<issue>`. Push to `origin`, never `upstream`.
- Stuck after 2 attempts on the same approach? Stop, log what you tried, ask.
- Aziz's style: terse. Give ranked options, not open-ended questions. State assumptions in 1 line and proceed.

---

_Last updated: 2026-05-14._
