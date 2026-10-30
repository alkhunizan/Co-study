# Release verdict and external acceptance

This task authorizes local refinement and disposable verification. It does not authorize production mutations, live charges, messages, provider dashboard changes, purchases, pushes, merges or deployment. None was performed.

The local candidate passes its technical gate and is ready for review, with exact evidence in REVIEW.md. **Production release remains NO-GO pending the following external acceptance.** These are not waived by passing fixtures.

| Boundary | What local verification establishes | Remaining acceptance |
|---|---|---|
| Media and camera | Synthetic blur failure is fail-closed; lifecycle, renewal, leave, revocation and reconnect are checked with local providers. | Two physical devices with the designated real provider: sustained session beyond three minutes, camera denial/device loss, reconnect, remote pixels on blur failure, leaving, revoked-token replay and zero residual access. |
| Google | State, PKCE, explicit linking, safe returns and stale-identity rejection work in a synthetic OAuth fixture. | Approved real Google consent/client configuration and complete login/link/reauthentication on a designated test app. |
| Recovery mail | Local spool/token expiry, single use, recovery UI and session invalidation are verified. | A configured real delivery adapter, delivery to owner-controlled test inboxes, failure/retry and recovery end to end. No email was sent by this task. |
| Payments | Catalog remains one VIP offer at USD 4.99/month; simulator/sandbox reconciliation, failures, refunds and idempotency remain tested. | Merchant/provider commercial and technical acceptance; no live charging or automatic renewal is enabled or authorized here. |
| Hosted data and release | Disposable PostgreSQL outage/restore and local persistence/backup tests pass; single-instance locks remain enforced. | Authorized hosted migration/restore and lost-host rehearsal, secrets/config review, rollback plan, explicit integration/deployment approval and independent production verification. |

## Status boundaries

- Local: refinement source and evidence in this checkout; final results are recorded in REVIEW.md.
- Preview: loopback review app only, `http://127.0.0.1:3495/app`, isolated from production credentials and data.
- Merged: no merge performed.
- Production: no push, deployment, production data change or live verification performed.

Watch first-week real observations for provider reconnect/revocation failures, recovery delivery, and single-instance storage/capacity alerts. No user research, activation uplift, return rate or field-performance improvement was measured by this local task.
