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

## Local account export and deletion follow-up

`access/account-data.ts` exports `exportAccount(pool, playerId, guard?)` and `deleteLocalAccount(pool, playerId, request, guard?)`. Both lock the authenticated player and recheck the supplied session guard. Only fixture billing is accepted. Export constructs own public/own-card frames, saved advice, profile/preferences, usage and local billing-operation views; authoritative deals, private game states and other owners' games never enter the output.

Migration 003 makes a removed member's held family assignment anonymous after account deletion. This retains capacity for the period without retaining that deleted player's identity on the seat. Deleting the payer fences affected members and removes the family relationship; their own identities and game records remain. Local fixture billing requires no external cancellation, and the deletion response says that no real payment subscription was canceled. Real provider billing/retention/export and shared administrative-record policy remain hosted release work.

Three additional isolated PostgreSQL tests passed: owner-only allowlisted export with hidden canaries; guarded deletion with session/game cascade and anonymous held seat; payer deletion with member access-generation change and account preservation. Combined billing/family/account run: 11 passed, 0 skipped. Strict TypeScript with unused checks, deterministic regeneration and 8 contract tests with string code generation disabled also passed. One unprivileged test-process spawn failed with EPERM; rerunning with `--test-isolation=none` passed. No live payment/model calls.

Changelog 2026-09-27: added local account export/deletion and required current-player UUID in AccountView for account-bound family invitations.
