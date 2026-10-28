# DigetPay sandbox integration

Halastudy now has a DigetPay hosted-checkout adapter, a bilingual phone/checkout flow, and persistent payment verification. The existing VIP price remains **USD 4.99 for one month**.

This implementation is sandbox-only. Production charges and automatic renewal are disabled in code. No actual DigetPay credentials or merchant account were used, and no API call was made to DigetPay. Local tests use explicit provider fixtures.

## Behavior

- Development defaults to DigetPay; missing configuration disables checkout.
- The local preview launcher explicitly keeps the original outcome simulator. Test environments retain that default unless `BILLING_PROVIDER=digetpay` is specified.
- Orders are saved before requesting a hosted payment link. Repeated checkout reuses the pending link.
- An ambiguous creation result blocks another attempt and is retained for review; the adapter never automatically retries a charge-creation POST.
- Return URLs cannot grant access. Verification uses the authenticated Status API and checks the amount, approved status, refund state and payment/order binding.
- Webhooks store only order/transaction identifiers in the existing durable outbox. Untrusted notification amounts and statuses cannot grant VIP.
- A background worker runs every 30 seconds, processes bounded batches, retries provider failures with backoff, and reconciles eligible orders. Completed orders are periodically checked for refunds. Shutdown waits for reconciliation before closing the database.
- Verified payments grant one test month exactly once. Test memberships never satisfy production entitlements.
- Any verified partial/full refund ends the membership tied to that payment. Stale success cannot reactivate a refunded order.
- The DigetPay UI offers no cancellation toggle because this adapter never schedules renewal. Turn scheduled recurring payments OFF in the merchant sandbox dashboard.

## Configure the merchant sandbox

Use Node 22 and server-side environment variables. The app launch does not load `.env` by itself; inject values through the process environment or your established launcher. Keep the key out of Git and browser code.

| Variable | Value |
|---|---|
| `BILLING_PROVIDER` | `digetpay` |
| `BILLING_MODE` | `test` |
| `DIGETPAY_ENVIRONMENT` | `sandbox` |
| `DIGETPAY_API_KEY` | Merchant sandbox key |
| `DIGETPAY_PUBLIC_ORIGIN` | Bare application origin, e.g. `https://sandbox.example.com`; HTTP is permitted only for localhost |
| `DIGETPAY_USD_ENABLED` | `true` only after USD is enabled for this merchant |
| `DIGETPAY_STATUS_LOOKUP` | `session` or `transaction`, after provider confirmation |

Register the sandbox webhook:

```text
https://<your-sandbox-host>/api/platform/billing/digetpay/webhook
```

The API host is fixed to `https://fin-api.digetpay.com/v1`; credentials cannot be redirected to an arbitrary configured host. Checkout redirects accept only `pay-staging.digetpay.com` and `fin-admin.digetpay.com`, with the expected checkout path and matching session ID. If the merchant's canonical sandbox differs, verify it before changing these allowlists.

Only Saudi mobile numbers are accepted in this initial flow. The phone is sent to DigetPay but is not stored with the payment order. No card number, CVV or recurring token is collected or stored by Halastudy.

## Resolve the status API contract

The public documentation contradicts itself about the lookup identifier. The implementation makes the choice explicit instead of trying both identifiers automatically. [Status API](https://docs.digetpay.com/reference/gettransactionstatus), [hosted checkout](https://docs.digetpay.com/reference/hostedinitiate)

**Session mode:** query only the checkout session ID saved from DigetPay's server response. The provider must confirm that this lookup is scoped to that specific session. The published example lacks order/currency fields, so the binding comes from the authenticated, session-scoped lookup; any supplied order/currency values must still match. Browser and webhook transaction hints are ignored.

**Transaction mode:** the notification supplies a candidate transaction ID, but authenticated status must independently return the matching `orderId` or `merchantOrderId`, plus `currency` or `currencyCode`. Missing binding data leaves access ungranted. The published sample does not contain these fields, so this mode requires a confirmed merchant response or a provider contract update.

Both modes require exactly one transaction, a matching USD 4.99 amount, explicit refund information, and successful approval. Different or incomplete responses remain unverified; they are not treated as payments.

## Storage and operations

Migration `002-digetpay.sql` adds `halastudy.digetpay_orders`; `003-payment-review.sql` separates paid review orders from open checkouts. Local embedded databases apply both at startup. Runtime requires schema version 3. Managed PostgreSQL still requires the explicit offline migration command, with the app stopped:

```powershell
npm run platform:migrate
```

Provide `PLATFORM_DATABASE_URL` through your existing secret mechanism. No remote migration was performed.

Backups now use `halastudy-platform-v2` and include payment orders and the existing outbox. Restore also accepts previous v1 snapshots. Restored financial state must be reconciled with the provider before any future live billing is enabled.

The member can revisit `/plans` to inspect the most recent attempt and request verification. An unknown creation outcome requires checking the merchant dashboard by the saved order ID before any repair; never reset it merely to allow another checkout. Retain the provider evidence and repair through a reviewed maintenance change.

Useful read-only operational queries:

```sql
SELECT id, user_id, status, session_id, transaction_id, last_error, checked_at
FROM halastudy.digetpay_orders
ORDER BY created_at DESC;

SELECT id, status, attempts, last_error, available_at
FROM halastudy.outbox
WHERE kind = 'digetpay.verify'
ORDER BY created_at DESC;
```

Webhook work stops retrying after 20 failed processing attempts and remains recorded as failed. Periodic session reconciliation and member verification provide additional recovery. Notifications for deleted/unknown orders cannot activate access.

## Before live billing

Demonstrate the real merchant sandbox flow, including USD support, identifiers, session/transaction binding, canonical checkout URLs, device payment methods, failed attempts, delayed notifications and refunds.

Automatic monthly renewal still requires a confirmed token-delivery mechanism, scheduling ownership, consent, cancellation/card-update APIs and retry policy. This implementation does not fabricate those APIs or enable a billing scheduler. Live support will require a separate code change and end-to-end acceptance; setting a production key or `NODE_ENV=production` cannot enable charging.

See [validation](VALIDATION.md) for local test evidence and [the provider review](REVIEW.md) for the remaining commercial questions.


## Staff review added 21 October 2026

Open Operations in `/app#staff` after MFA verification. Billing operators can read unresolved orders; only super admins can recheck them. Enter an investigation reason and, in transaction lookup mode, an optional provider transaction reference. The server independently verifies the reference; it never trusts an operator-provided paid status. An overlapping paid order remains in review until a super admin explicitly activates it and no other membership is active. All requests and outcomes are audited. The interface cannot close an unknown creation outcome without verifiable provider evidence.

There is one durable notification job per order. Callbacks preserve the retry budget and cannot bypass the five-minute verification cooldown or revive exhausted work. Old per-hint records remain stored as coalesced evidence. Provider selection and real merchant acceptance remain pending. See the [hardening review](../../hardening/2026-10-21/REVIEW.md).
