# Super-admin dashboard structure assessment

Reviewed on 27 October 2026 (Asia/Riyadh). Scope: current source, local Git state, existing architecture and test definitions. This is a structural review; no application code was changed, no test suite was rerun, and no authenticated production dashboard was inspected.

## Assessment

The access-control foundation and core operating tools are implemented on the feature branch. The dashboard information architecture is unfinished: named staff use one long, permission-filtered Operations panel inside the member application. There is no separate super-admin workspace with navigable operational areas.

## What exists

| Area | Current implementation | Evidence |
|---|---|---|
| Staff identity and access | Named accounts; five composable staff roles; server-side permissions; authenticator/recovery codes; 15-minute account-bound staff sessions; first-owner bootstrap; role-change session invalidation; last-super-admin removal protection | [access.js](../../../services/platform/access.js), [staff route guard](../../../services/platform/routes.js) |
| Entry and navigation | Account page contains the staff entry. All named-staff tools occupy `/app#staff`; the primary navigation remains Study, Progress, Groups and Account | [platform.html](../../../platform.html), [platform.js](../../../public/js/platform.js) |
| Overview and operations | Account, room and participant counts; operational alerts; video entry switch; bilingual temporary announcements; backup trigger; live rooms and participant removal | [staff routes](../../../services/platform/routes.js), [staff rendering](../../../public/js/platform.js) |
| Accounts and reports | Account search and ban/unban with reasons; report list and resolution form | [staff routes](../../../services/platform/routes.js), [staff rendering](../../../public/js/platform.js) |
| Billing | Subscription list; cursor-paginated unresolved payment queue; super-admin payment recheck/review actions. The inspected provider implementation uses test/sandbox orders | [billing UI](../../../public/js/platform.js), [provider billing](../../../services/platform/digetpay-billing.js) |
| Team and audit | Grant/revoke roles, named role roster and recent audit events | [staff routes](../../../services/platform/routes.js), [access.js](../../../services/platform/access.js) |

The older `admin.html` console has seven tabs: Overview, Rooms, Users, Reports, Video, Announce and System. It uses the legacy shared-admin identity. The feature branch blocks that login and its protected API once named staff exist. Thus the code contains two generations of console UI, not two interchangeable super-admin dashboards. See [legacy routes](../../../services/admin/admin-routes.js).

## Current role structure

These roles compose; Admin is not intended to inherit all other roles automatically.

| Role | Actual permissions in this branch |
|---|---|
| Super admin | All currently defined staff permissions, including access grants, backups, audit and payment review |
| Admin | Staff roster and operational read/write tools |
| Moderator | Reports and account moderation |
| Support | Operational read access only |
| Billing operator | Billing read access only |

Supervisors belong to assigned study circles/cohorts and do not gain platform staff authority. `/supervisor` currently opens the circles view in the same platform shell.

## Structural gaps

1. **Dedicated navigation:** staff controls sit under Account and then one long Operations page. There are no independent section routes, contextual workspace switcher or staff-specific home view.
2. **Decision-oriented overview:** the staff summary returns three counts. It lacks a prioritized view of open reports, unresolved payments, backup health and actions awaiting the owner. The underlying operations endpoint already exposes some health data that the UI could present better.
3. **Complete workflows:** reports can be resolved in the UI, while the API also supports investigating and dismissed states. Support currently has no dedicated support-case workflow. Staff grants require a raw account ID. Audit rows show action, actor ID and date without an investigation/detail interface.
4. **Search and scale:** users are capped at 50 results, and cases/subscriptions/audit at the latest 100; those lists have no general filtering/paging flow. Payment review already has cursor pagination and can provide a pattern.
5. **Maintainability:** member, supervisor, billing, security and staff rendering share `platform.html` and `public/js/platform.js`. Staff API handlers share the main platform router. Dedicated staff modules would make role-specific changes and verification easier.

The original [architecture blueprint](../../architecture/2026-10-20-platform-review/BLUEPRINT.md) already proposes a separate operations experience and workspace switcher. The implementation has much of the underlying capability, but has not completed that separation.

## Recommended next structure

Use one staff workspace with permission-filtered navigation. A super admin sees every section; other staff see their assigned sections.

| Section | Main job |
|---|---|
| Overview | Health summary, urgent queues and pending owner actions |
| Rooms and sessions | Live rooms, participants and operating controls |
| Users | Account lookup, status and authorized moderation history |
| Reports and support | Investigation, disposition and case history |
| Billing | Subscriptions and payment reconciliation |
| Team and access | Staff search, role grants/revocation and MFA status |
| Audit | Filterable actor/action/target history and event details |
| System | Video control, announcements, monitoring and backup status/actions |

Reuse the existing identity, MFA and permission services. Keep circle supervision in the supervisor experience. Treat the proposed routes and workflow extensions as next work, not delivered functionality.

## Integration and release status

- Current checkout: `viber/2026-10-27`, HEAD `ee39709d16563aa5a1606e1a8ca1a0ce8dce631f`.
- Local main: `e9412fdb8c6eab3663d693875f6bbdc262bb336e`.
- Fresh local ancestry check: the feature branch is 59 commits ahead and 102 behind main.
- Fresh tree inspection: main has `admin.html`, but does not contain `platform.html`, `public/js/platform.js` or `services/platform/`. The newer named-staff dashboard is therefore not integrated into local main.
- The existing [27 October branch report](../open-brs-2026-10-27.md) records a held integration with 32 previewed conflicts. That conflict count was not recomputed in this review.
- Project-level continuity still names `workspace/Co-study-release-plan` as the canonical readiness work area. Its operator-readiness task targets the older console. Reconcile the newer platform feature line with that release work before claiming a single completed dashboard.
- Live deployment status was not checked. This report establishes local source structure only.

## Verification boundary and next action

Existing tests cover MFA replay protection, owner bootstrap, last-owner protection, explicit grants, staff UI entry and billing-reader restrictions: [platform integration](../../../tests/integration/platform.integration.test.js), [platform browser journey](../../../tests/smoke/platform.smoke.spec.js), and [payment review journey](../../../tests/smoke/payment-review.smoke.spec.js). Their presence is not a fresh passing result.

Next action: prepare the eight-section staff shell against the reconciled release architecture, reusing existing controls and permission checks. Completion should include a direct route for each section, complete loading/error/empty states, role-by-role navigation and API checks, Arabic/English mobile review, and fresh tests on the integrated candidate.
