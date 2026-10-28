# DigetPay suitability for Halastudy

Reviewed 20 October 2026. Recommendation: shortlist DigetPay for a subscription demonstration and written commercial quote. Its documented capabilities fit a Saudi membership product, but the subscription lifecycle and merchant terms need confirmation before selection.

The local Halastudy implementation has one VIP tier at USD 4.99/month and simulated checkout. Production billing is unavailable pending a real provider. Evidence: [billing implementation](../../../services/platform/billing.js), [platform configuration](../../../services/platform/index.js), and [implementation handoff](../../implementation/2026-10-20-platform/README.md). This review does not change that implementation or select a provider.

## What fits

| Requirement | Documented capability | Implication |
|---|---|---|
| Saudi checkout | Mada, Visa, Mastercard, saved cards and Apple Pay, subject to merchant/device availability | Relevant payment methods for the audience |
| Card collection | Hosted checkout handles card entry and 3DS | Prefer a redirect integration for Halastudy |
| Monthly membership | Scheduled and merchant-initiated recurring payments using tokens | Technically plausible; demonstrate the exact monthly lifecycle |
| Payment verification | Webhook notifications plus transaction-status lookup | Activate VIP only after server verification |
| Refunds | Full and partial refund API | Can support an audited refund workflow |

Sources: [payment methods](https://docs.digetpay.com/docs/payment-methods), [recurring payments](https://docs.digetpay.com/docs/recurring-payments), [webhooks](https://docs.digetpay.com/docs/receiving-webhooks), [core APIs](https://docs.digetpay.com/docs/introduction-to-digetpay).

## Subscription questions that affect the decision

The recurring guide describes both automatic schedules configured in the dashboard and subsequent charges initiated by the merchant backend. It discusses installment counts. Confirm who runs the scheduler and whether indefinite monthly subscriptions are supported. The reviewed pages do not establish a complete cancellation, card-update, or failed-renewal workflow. [Recurring guide](https://docs.digetpay.com/docs/recurring-payments)

The checkout recurring reference exposes `POST /payment/checkout/recurring`, but its flow diagram names `/payment/s2s/recurring`. Its response uses `payment_id`, whereas the recurring guide shows a transaction UUID. Ask for the canonical request, response and reconciliation identifiers for hosted recurring payments. HTTP 200 alone is insufficient: the reference also uses it for declines. [Checkout recurring API](https://docs.digetpay.com/reference/checkout-recurrning)

Request a demonstration of:

1. Initial hosted authorization and secure retrieval of the recurring token.
2. A second monthly charge without customer attendance, with support confirmed separately for Mada, Visa/Mastercard and Apple Pay.
3. Cancellation at period end that prevents future charges while retaining already-paid access.
4. Failed renewal, bounded retries, expired cards, reauthorization and refunds.

## Commercial fit

The public fee page lists free payment-gateway setup, but settlement and payment-link charges depend on the merchant agreement. It does not establish the full processing cost for this project. Request percentage and fixed fees by card type, monthly/minimum charges, refund and dispute fees, settlement fees, FX charges and VAT treatment. [Published fees](https://digetpay.com/ar/products-fees)

Illustrative arithmetic, not DigetPay pricing: on a SAR 20 payment, a SAR 1 fixed fee alone consumes 5% before percentage fees or tax. Small memberships need a quote evaluated at their actual ticket size and expected payment-method mix.

The payout guide labels a Sunday/Tuesday/Thursday schedule as daily. Its example also gives inconsistent net amounts and an unclear VAT calculation. The public terms allow fund holds and do not promise a fixed settlement timetable. Obtain contractual availability delays, payout days, minimums and reserve/hold rules. [Payout guide](https://docs.digetpay.com/docs/payout), [terms](https://digetpay.com/ar/terms)

## Onboarding and unresolved checks

Typical onboarding documents include a Saudi commercial registration, signatory identification, IBAN letter, address proof and an operational website. Confirm acceptance of Halastudy's entity and activity; freelancer eligibility is not established here. [Merchant KYC](https://docs.digetpay.com/docs/merchant-signup-kyc)

Before contracting, obtain the exact contracting legal entity and the licensed bank/payment institution responsible for acquiring and settlement. Independent regulatory verification was not completed in this review; unsuccessful name searches are not evidence of an authorization problem.

Confirm USD charging and settlement support before retaining the existing USD price, or make an explicit SAR pricing decision. The checkout examples default to SAR; a generic currency field is not proof that USD is enabled. The API also requires a customer phone and recommends Saudi formatting, so confirm non-Saudi numbers for wider GCC customers. [Payment-link API](https://docs.digetpay.com/docs/create-payment-link)

## Integration approach

Use a server-side DigetPay adapter behind the current billing service. Keep monetary values in integer minor units internally and convert explicitly at the provider boundary. Persist the internal order, checkout session and payment transaction as separate identifiers.

Webhook processing should durably accept notifications, query authenticated provider state, match the order, merchant context, amount and currency, and apply each successful payment once. The merchant webhook guide does not specify a signing scheme or fixed retry schedule. Confirm available authentication; do not import the separate Developer Portal's signature assumptions. [Merchant webhooks](https://docs.digetpay.com/docs/receiving-webhooks)

Resolve conflicting environment guidance before using credentials: the environment overview specifies separate staging/live hosts, whereas the payment-method page describes one host with key-selected modes. [Environment overview](https://docs.digetpay.com/docs/environments-overview), [payment methods](https://docs.digetpay.com/docs/payment-methods)

Acceptance should cover duplicate and reordered notifications, redirect spoofing, timeouts after charge submission, reconciliation, renewal failures and cancellation races. Persist renewal work and protect recurring tokens. Preserve the existing separation between membership benefits and administrative permissions.

## Questions to send DigetPay

- Can you demonstrate an indefinite monthly subscription through hosted checkout, including initial token delivery, renewal, cancellation and card replacement?
- Which card/wallet methods support unattended recurring charges for our merchant account?
- Who schedules renewals, and what APIs stop, pause or retry them safely?
- What is the complete fee quote for a USD 4.99 membership or a separately agreed SAR price?
- Which currencies and customer phone-country formats can our account accept?
- What are the contractual payout timing, reserve, refund and dispute terms?
- What legal entity contracts with us, and which licensed institution acquires and settles our payments?
- Can you provide the current hosted-recurring API collection, webhook authentication details and test credentials after onboarding?

These questions are a draft; no message was sent. No merchant account, payment, integration or deployment was created. The next useful step is a written response and sandbox demonstration.
