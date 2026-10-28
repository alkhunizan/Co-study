# Halastudy platform structure review

> Baseline architecture review before implementation. See [implementation status](../../implementation/2026-10-20-platform/STATUS.md) and the [subsequent remediation](../../viber/2026-10-20/remediation/RUN.md) for the current local state.

20 October 2026

**The current structure supports the MVP, but needs foundational changes before packages, delegated supervision, and competitive gamification.** Keep the app and improve its internal boundaries incrementally.

| Deliverable | Contents |
|---|---|
| [Architecture review](REVIEW.md) | Current structure, 12 evidence-linked findings, strengths and limitations |
| [Target blueprint](BLUEPRINT.md) | Site map, role matrix, package candidates, entitlement rules, data model, gamification and module structure |
| [Implementation plan](IMPLEMENTATION_PLAN.md) | Seven stages, migration/rollback considerations and acceptance criteria |
| [Validation](VALIDATION.md) | Actual commands, results, local probes and verification limits |

The core design separates **identity**, **permissions**, **package benefits**, and **earned progress**. A user can hold several scoped relationships without gaining unrelated authority.

The first implementation work should fix data integrity and identity lifecycle, then add named staff accounts and persistent room ownership. Pricing, payment-provider choice, and reward formulas remain configurable product decisions.

This folder contains review/design artifacts and local evidence. Application implementation and production changes were not performed.
