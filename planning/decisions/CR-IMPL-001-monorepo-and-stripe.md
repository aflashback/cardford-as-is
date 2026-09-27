# CR-IMPL-001 — Implementation baseline, simple monorepo and Stripe

**Recorded:** 27 September 2026. **Status:** owner direction confirmed; implementation has not been initiated by this planning request.

## Owner decisions

The owner requested an implementation plan based on all current artifacts, highlighting design patterns, best practices and principles, assuming a simple monorepo. When asked which baseline governs, the owner selected **“Latest Tricks Coach planning, with earlier safeguards retained.”** The owner then clarified: **“subscription management can be done within the app but payment will be with stripe”.**

The owner further requested agent-ready plan files with enough implementation and testing detail, retaining the earlier UX as good enough to start. The product is explicitly **B2C: a platform to learn to play well**, not an enterprise product.

Requirements introduced by this record:

| ID | Requirement | Acceptance |
|---|---|---|
| IMPL-01 | Plan and build from current planning 01–10, preserving the earlier correctness, information-safety, provenance and original-content safeguards. | The implementation plan maps conflicts explicitly, covers all three game modes, and traces work to current acceptance cases. |
| IMPL-02 | Use one simple TypeScript monorepo, with enforceable browser/server boundaries and shared public schemas. | One workspace/lockfile and documented commands; dependency and production-artifact checks reject privileged browser imports. Multiple deployment roles do not create separate repositories or domain microservices. |
| IMPL-03 | Make the implementation handoff executable by later agents. | Entry point, ready-packet selection, concrete files/interfaces, fixture/test expectations, evidence reporting and resumable status; no new brainstorming or UX redesign prerequisite. |
| IMPL-04 | Preserve a B2C learning product and the existing accepted UX. | First usable slice preserves table/play/coaching interactions; no enterprise organization, SSO/SCIM, configurable role system, corporate reporting or procurement features. |
| SUB-01 | Provide subscription management in the app. | Account UI shows plan, renewal/paid-through status, allowance and pending changes; supports change previews, upgrade/downgrade, cancellation and resuming renewal where eligible. Account/billing works in portrait. |
| SUB-02 | Use Stripe for payment processing and subscription billing integration. | Server-created Stripe Checkout, verified billing events and reconciliation drive access. No second payment provider is necessary for this release. |
| SUB-03 | Keep commercial authority on the server. | Forged prices, payer IDs, success URLs or browser plan flags cannot grant access; failed upgrades retain prior valid coverage and usage. |
| SUB-04 | Keep payer and player authority separate. | A payer can manage payment and family assignments, but cannot access another member's private game or coaching. |

## Reason and alternatives

The latest design already describes the intended product and the existing prototype. Executing the original Spades-only pack or the historical local plan would restore superseded scope and trust assumptions. A single modular codebase keeps delivery simple while supporting the documented worker and capacity boundaries.

Stripe is selected by the owner. The plan proposes Stripe-hosted Checkout for collecting payments and completing required authentication; ordinary subscription management remains in the app. Stripe-hosted payment-method or invoice screens may be used for those specific actions. Sending every management action to a portal is not the planned product experience. Exact Checkout presentation is an implementation choice, not a separately confirmed owner decision.

Alternatives not selected: the original guest/SQLite-only release; separate repositories or microservices per game; a browser-owned paid game engine; a second payment provider; a portal-only subscription-management experience.

## Scope and compatibility

- Current scope includes Hearts Solo, Spades Solo and Spades Partners; local code supplies normal bots and coaching. Jev remains the only remote strategic model, off by default, then shadow and evidence-gated requested recommendations.
- Earlier restrictions on hidden hands, deterministic legality/scoring, runtime generative prose, fabricated confidence/grades, unsafe persistence and copied assets remain. The former ban on local strategy/shortlisting is superseded by current planning 02; the complete human legal-action set remains available.
- Current hosted PostgreSQL, managed identity, paid play, finite public demo and coached-hand allowance replace the original guest/SQLite/free-play assumptions. This does not authorize live charges or deployment during planning.
- Preserve the original 56-file specification pack and its manifest. New schemas must explicitly supersede the historical contracts; do not update two competing DTO sources.
- Existing browser saves remain untrusted local reference data. No production import as game state, entitlements, quota or learning evidence is authorized.
- Prices, currency, family-policy details, identity/hosting vendors, region and enabled countries remain decisions at the relevant activation gate. Choosing Stripe does not settle seller, tax, privacy or country obligations.

## Affected artifacts and checks

Execution handoff: [Monorepo implementation plan](../2026-09-27-monorepo-implementation-plan.md). Current requirements remain in [product/subscriptions](../06-commercialization.md), [architecture](../07-hosted-architecture.md), [acceptance](../08-commercial-testing.md) and [capacity](../10-capacity-and-scaling.md), except where this later record resolves payment-provider choice.

Affected acceptance: T01–T34 and T36–T49; T35 remains later PvP work. SUB-01–04 add explicit in-app/Stripe acceptance in W14–W16 of the plan. BRAND-01–03 remain unchanged. Gate names in the plan use CG1–CG5 to distinguish current commercial gates from historical G0–G4.

**Evidence status:** this record documents explicit owner direction and planned acceptance. No application, payment, provider or deployment test was performed by writing it.
