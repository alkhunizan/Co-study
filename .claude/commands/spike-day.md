---
description: Set a /goal matching PLAN.md Day N for the Halastudy spike
argument-hint: <day-number 1-7>
---

You're starting PLAN.md Day $ARGUMENTS work on Halastudy. Pick the row matching Day $ARGUMENTS from the table below, then invoke `/goal` with the resulting completion condition.

## Day-by-day success criteria (from PLAN.md §3)

| Day | Lane | Success condition |
|---|---|---|
| 1 | Spike — boot | `co-study/server.js` boots on localhost AND `mirotalksfu` Docker container runs side-by-side without a port 40001 conflict AND today's `spike-log.md` entry is appended |
| 2 | Spike — first integration | A co-study room boots and MiroTalk handles its media for that room (any quality, even hacky) AND result is logged in `spike-log.md` |
| 3 | Spike — Pomodoro sync | Pomodoro state syncs across two clients in an integrated room AND result is logged in `spike-log.md` |
| 4 | Mid-sprint check | `spike-log.md` contains a self check-in with explicit red/yellow/green for P1, P2, P3 AND a pivot decision is written if any proof is red |
| 5 | Spike — UI flow | Quiet mode + room create / join / leave flow works end-to-end on localhost AND every item in `DESIGN.md` §11 ship checklist is confirmed in transcript AND zero items from `DESIGN.md` §10 hard-no's are introduced AND `spike-log.md` entry is appended |
| 6 | Synthesis | `project-knowledge/sprint-findings.md` exists with: 5 verbatim student quotes, 1 stack-surprise note, named beta list of 30+ humans, updated risk register entries. **No coding today.** |
| 7 | Go / no-go | PLAN.md §4 gates applied to P1, P2, P3 with explicit decisions written AND `SCOPE-RECONCILE.md` updated with the sprint outcome |

## Now do this

1. Pick the **single row** for Day $ARGUMENTS above.
2. Run `/goal` with the condition from that row, plus this exact suffix:
   `Stop after 25 turns even if the condition isn't met, and report what's blocking.`
3. Begin Day $ARGUMENTS's work per PLAN.md §3.

## Fallback

If Claude Code does not allow a custom slash command's expansion to nest a call to `/goal`, paste the assembled `/goal …` line manually as your next message. Either way the table above is the source of truth.

## Reminders

- Append the `spike-log.md` entry at the end of the block, using the template in `CLAUDE.md` §6. The evaluator will check for it.
- On Day 5 (UI), keep `DESIGN.md` open and check §11 items as you go. Don't let "almost shipped" fool the evaluator.
- On Day 6, do **not** code. The condition is documentation-only on purpose.
