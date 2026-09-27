# Billing and family local slice

Requirements implemented here: SUB-01/03 fixture preview and confirmation; SUB-02/A06 Stripe adapter and persisted purchase/event/reconciliation boundaries; SUB-04/P06 family seat/privacy rules. Public DTOs remain generated from the canonical shared schema. No approved live prices or currency exist.

Integration:

- `service.ts`: `previewChange(pool, playerId, body, guard?)`, `confirmChange(...)`, `applyDuePlan(client, playerId)`. Guard runs after the player lock and must recheck the authenticated session. Confirmed fixture changes collect no money; downgrades schedule in `profile.scheduledPlan` without fabricating paid coverage. Root access checks apply scheduled changes and actual paid-through times.
- `access/family.ts`: `getFamily`, `mutateFamily`, `effectiveFamilyGrant`. Root supplies the authenticated player ID and transaction guard, combines family and individual grants by strongest coverage without resetting usage, and maps BillingFailure status/code. Normal member reads contain only that member's seat and payer display identity. Payer reads have seat/invitation administration data, never game or coaching records.
- `stripe.ts`: real Stripe SDK adapter, pinned API `2026-08-26.dahlia`, exact raw-body signature verification and server-bound Checkout metadata/idempotency. No API call occurs merely by importing/constructing it.
- `purchases.ts`: persist intents before external calls; inbox and reconciliation-job transaction before webhook acknowledgement; current subscription retrieval outside transactions; purchase/customer/environment/product/price/currency validation; reconciliation fencing and explicit revocation. `processBillingInbox` retries bounded failed jobs using current provider state.

A verified Stripe event is not an entitlement. Unknown/unbound events stay recorded and cannot activate coverage. Refund/dispute automatic mapping and full real sandbox payment scenarios remain incomplete; `revokePurchase` is the explicit downstream hook, not evidence that those Stripe event scenarios were tested. Hosted access must not activate this adapter before those gates, managed identity and offer approval. Local profile coverage remains an explicitly separate fixture.

Real PostgreSQL fixtures use only a TEST_DATABASE_URL ending `_test`, create an independently named schema and delete only that schema. Run from repository root:

```powershell
node --env-file=.env.local --test web/server/tests/billing.test.ts web/server/tests/family.test.ts
```

For isolated worktree verification only, `BILLING_BASELINE_ROOT=C:/repos/test-jev` reads the already integrated 001 migration. No credential contents are printed. Tests passed: 8 on Node v24.19.0, covering raw signatures/time/body integrity, purchase bindings, preview/confirm/retry/ownership, durable event dedupe, current-state reconciliation, late-result fencing/outage preservation, family capacity/last-seat race/wrong identity/expiry/held removal/privacy and session guard rejection. Targeted strict TypeScript compilation also passed. Initial execution failed on a non-erasable constructor parameter property; it was replaced with explicit fields before rerun.

Known scope limits: actual Stripe calls and observed payment IDs: none. Real managed identity, Stripe sandbox authentication/declines/refunds/disputes/renewals, hosted payer-revocation races, commercial policy review, physical devices and family usability pilot are blocked or not run. Family period renewal orchestration is not claimed by these tests. Local ordinary removals fence through the removed player's lock/access generation. Public offers continue to require null price/currency. Stripe documentation checked: https://docs.stripe.com/api/checkout/sessions/create and https://docs.stripe.com/api/events.

Changelog 2026-09-27: introduced the local subscription/family services, migration 002, Stripe boundary implementation and eight actual fixture/DB tests; no live payment activation.
