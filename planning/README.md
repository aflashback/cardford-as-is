# CardFord V1 specifications

**Current work: M04F.** The [history/resource packet](implementation/multi-game/m04f-execution.md) and [first measured slice](../qa/implementation/multi-game/m04f/status.md) record focused tests, two verified allocation/validation improvements and bounded native database diagnostics. Full prepared-service profiling, normal Spades match evidence and the earlier database cause remain open before default activation. M04E below retains its prior frozen-source acceptance.

**CardFord** is the current owner-approved product name. The earlier `trickscoach.com` domain plan is unverified; a CardFord domain has not been chosen. [Naming decision and setup status](brand-and-domain.md).

Implementation target, grounded in the playable [web application](../web/README.md). On 27 September 2026 the owner confirmed the planning baseline with earlier safeguards retained, a simple monorepo, the existing UX, a B2C learning product, in-app subscription management and Stripe payments. [CR-IMPL-001](decisions/CR-IMPL-001-monorepo-and-stripe.md) records that authority and its compatibility effects. Earlier analysis remains supporting research; the original pack is preserved.

**For implementation agents:** start at [IMPLEMENTATION-START-HERE.md](IMPLEMENTATION-START-HERE.md), then use the [multi-game plan](../docs/superpowers/plans/2026-10-04-multi-game-reasoning-implementation.md) and [backend readiness/M02A](implementation/multi-game/backend-readiness.md). M00–M02 have recorded acceptance; [CR-ARCH-003](decisions/CR-ARCH-003-backend-stack-and-system-readiness.md) makes Go/PostgreSQL the replacement target while preserving React/Vite and the TypeScript reference. [CR-FIX-001](decisions/CR-FIX-001-urgent-system-repairs.md), [M02A](../qa/implementation/multi-game/m02a/status.md), [M03](../qa/implementation/multi-game/m03/status.md) and M04A/M04B have scoped acceptance. M04C passed its local Go API gate ([evidence](../qa/implementation/multi-game/m04c/status.md)). [M04D demo/backend offer acceptance](../qa/implementation/multi-game/m04d/status.md) passes its MG-15/MG-16 backend scope. [M04E implementation](implementation/multi-game/m04e-execution.md) now connects the complete Go platform to the preserved React game, review and account journeys; [scoped functional acceptance has passed](../qa/implementation/multi-game/m04e/status.md). The explicit `npm run start:go` path launches this app. Default Node startup remains unchanged. Full M04 activation remains blocked by the unresolved native PostgreSQL timeout investigation and the long-history resource pass with integrity-preserving optimization and uncensored normal Spades match evidence. See [local run instructions](../LOCAL-README.md), [current milestone evidence](../qa/implementation/multi-game/status.md), [local-build evidence](../qa/implementation/status.md) and the later [deployment guide](DEPLOYMENT-GUIDE.md). Hosted/paid-launch gates remain unfinished.

**M04E scoped functional acceptance passed:** all 16 frozen-source verification captures passed. Nine Go/React browser checks cover five full-hand/account/family journeys, with normal random deals and real prepared work in the full-hand flows, three replay-validated terminal-only fixtures, and configured access. The terminal fixtures exercise the final HTTP/React transition, saved result and refusal of another hand; their imported history establishes no policy/coaching or statistics result. Optional capped normal-match soak evidence stays separate. Complete normal Spades match evidence and the long-history resource pass, including integrity-preserving optimization, remain open before default activation.

| Read | Purpose |
|---|---|
| [Native Windows performance decision](decisions/CR-ARCH-004-native-windows-performance.md) / [findings](../qa/implementation/multi-game/performance-windows/report.md) / [setup](implementation/multi-game/windows-development.md) | Corrected workload comparison, stable native toolchain, typed state boundaries and repeatable Node/Go/PostgreSQL checks before M03. |
| [M03 durable records execution](implementation/multi-game/m03-execution.md) / [evidence](../qa/implementation/multi-game/m03/status.md) | Authorized records/replay/work milestone; comparison closed and native Windows selected for subsequent local work. |
| [M04 sequence](implementation/multi-game/m04-execution.md) / [M04B packet](implementation/multi-game/m04b-execution.md) / [evidence](../qa/implementation/multi-game/m04b/status.md) | Accepted original Go bot/coach and V2 session prerequisites; overall M04 remains open. |
| [M04C local service](implementation/multi-game/m04c-execution.md) / [evidence](../qa/implementation/multi-game/m04c/status.md) | Authenticated durable local Go API passed scoped acceptance; its fixture constructor remains an explicit alternate path. |
| [M04D demo and offers](implementation/multi-game/m04d-execution.md) / [native run instructions](implementation/multi-game/windows-development.md#m04d-online-demo-and-configured-offers) | [Scoped MG-15/MG-16 backend acceptance passed](../qa/implementation/multi-game/m04d/status.md): authored online demo and exact-target configured grants; M04E completes the platform/client and account presentation. |
| [M04E platform and preserved client](implementation/multi-game/m04e-execution.md) / [current evidence](../qa/implementation/multi-game/m04e/status.md) | Complete Go app implementation on explicit `npm run start:go`; scoped functional acceptance has passed. Default startup cutover and full M04 remain gated. |
| [Multi-game reasoning implementation plan](../docs/superpowers/plans/2026-10-04-multi-game-reasoning-implementation.md) | Completed M00-M02A foundations; remaining production migration, maintained cases, Tarneeb/Trix and independent evaluation. |
| [Backend stack decision](decisions/CR-ARCH-003-backend-stack-and-system-readiness.md) | Recorded Go/PostgreSQL target, TypeScript reference, preserved frontend and bounded compatibility gate; current delivery status is in the M04 sequence. |
| [Urgent system repairs](decisions/CR-FIX-001-urgent-system-repairs.md) | Current TypeScript work caps, active-state validation, durable preparations and stable retries; [execution evidence](../qa/implementation/multi-game/urgent-repairs/status.md). |
| [Backend readiness and system acceptance](implementation/multi-game/backend-readiness.md) | M02A execution packet, replacement responsibilities, SYS-01–12 acceptance and deferred hosting/NFR work. |
| [Launch access and client readiness](implementation/multi-game/launch-access-and-client.md) | Online demo, configurable game/coaching grants, React/Capacitor reuse recommendation and basic quality; MG-15–18. |
| [Card-game architecture interview](research/2026-10-04-card-game-architecture-interview/README.md) | Two-agent review of implementation/evidence and Tarneeb/Trix architecture; input for the multi-game plan. |
| [Implementation handoff](IMPLEMENTATION-START-HERE.md) | Fresh-agent reading order, task selection, preserved B2C UX and evidence reporting. |
| [Local-build and release plan](2026-09-27-monorepo-implementation-plan.md) | W00–W19 reference for original build, Stripe and release gates; backend-language assumptions superseded by CR-ARCH-003. |
| [Requirements and tests](implementation/requirements-and-tests.md) | Stable IDs, named fixtures and concrete rule/UX/service/payment assertions. |
| [01 — Product and views](01-product-and-views.md) | Preserve the coded experience; define missing interactions. |
| [Brand and domain](brand-and-domain.md) | Current naming decision, selected visual direction, previous domain plan and unverified setup. |
| [Cardford design guide and SVGs](brand/cardford/DESIGN-GUIDE.md) | Selected Open Hand artwork, reusable assets, usage rules and validation. |
| [12 — Spades reasoning](12-spades-reasoning.md) | Table types, solo core, partnership overlays, scenarios and saved analysis. |
| [Partnership reasoning guide](../docs/superpowers/specs/2026-09-29-spades-partnership-reasoning-guide.md) | 60 foundation recipes plus six compound children, counterexamples and linked implementation plan. |
| [Scenario coverage review](../docs/superpowers/specs/2026-09-29-scenario-coverage-and-success.md) | Product success, systematic discovery, probability meanings and protection against overfitting. |
| [Scenario and Jev evaluation plan](../docs/superpowers/plans/2026-09-29-scenario-and-jev-evaluation.md) | Future deterministic/direct-Jev/hybrid comparisons, calibration, complete matches and unaided learning. |
| [Authored-deal scenario lab](../qa/experiments/2026-09-30-agent-scenario-lab/README.md) | Offline reasoning-agent pilot, reusable player/observer templates, raw decisions, research and proposed next evaluations. |
| [Two-suit scenario batch](../qa/experiments/2026-09-30-two-suit-batch/README.md) | Six authored Solo/Partners fixtures with fixed Maya cards, saved player decisions, explicit completion status and public-information fact checks. |
| [02 — Games and decisions](02-games-and-decisions.md) | Exact rules, player knowledge, tactics, probabilities and Jev's role. |
| [03 — Local runtime](03-local-runtime.md) | OpenRouter, state ownership, persistence and failures. |
| [04 — Coaching and evidence](04-coaching-and-evidence.md) | Assistance, feedback, mistake categories and progress. |
| [05 — V1 setup](05-v1-setup.md) | Current versus planned runtime, configuration, experiments and activation gates. |
| [06 — Product and subscriptions](06-commercialization.md) | Fixed demo, member-only play, proposed individual/family plans and worldwide selling. |
| [07 — Hosted architecture](07-hosted-architecture.md) | Server-only engine/coach, identity, usage, recording and competitive boundaries. |
| [08 — Commercial test gates](08-commercial-testing.md) | 49 planned acceptance cases and actual prototype baseline evidence. |
| [09 — Delivery and evidence](09-delivery-and-evidence.md) | Work split, changed decisions, dependencies and remaining launch choices. |
| [10 — Capacity and scaling](10-capacity-and-scaling.md) | Concurrent-player workload, independent scaling, database/provider limits and growth gates. |
| [11 — Future play and membership](11-future-play-and-membership.md) | Consideration only: free/play-only offers, enjoyable bots, human matching and rating boundaries; no change to launch scope. |
| [Security research and plan](security/hardening.md) | Stack decision, browser/Wasm limits, access protection and abuse detection. |
| [Historical local plan](2026-09-26-implementation-plan.md) | Earlier rule/strategy/review task reference; revise before execution. |
| [Planning changelog](CHANGELOG.md) | Later changes without editing the original v0.2 pack. |
| [Diagram index and style](DIAGRAMS.md) | Visual summaries across the authored documents, with a consistent Mermaid style. |

## Read the design visually

Suggested reading order; this is a document map, not a runtime sequence.

```mermaid
%%{init: {"theme":"base","themeVariables":{"fontFamily":"Segoe UI, Arial, sans-serif","fontSize":"14px","lineColor":"#64748B","textColor":"#183153","primaryTextColor":"#183153","edgeLabelBackground":"#FFFFFF","clusterBkg":"#F8FAFC","clusterBorder":"#CBD5E1"},"flowchart":{"curve":"basis","htmlLabels":false,"nodeSpacing":24,"rankSpacing":36}}}%%
flowchart TD
  accTitle: Read the current design
  accDescr: Suggested reading order from player experience through strategy, coaching, access, hosted delivery and measured release gates.
  A("01 · Player experience"):::view --> B("02 · Games and strategy"):::service
  B --> C("04 · Coach and learning evidence"):::service
  C --> D{"06 · Membership and allowance"}:::gate
  D --> E("03, 05, 07 · Runtime and hosting"):::service
  E --> F("10 · Capacity and growth"):::service
  F --> G{"08 · Release evidence"}:::gate
  G --> H("09 · Staged delivery"):::view
  classDef view fill:#E8F1FC,stroke:#7FA6CB,color:#14283F;
  classDef service fill:#E5F5EF,stroke:#65A68C,color:#173F33;
  classDef gate fill:#FFF3D9,stroke:#C7A253,color:#594219;
```

Later numbered decisions resolve conflicts in earlier documents: CR-IMPL-004 governs configurable launch access and online demo; CR-ARCH-003 governs the replacement backend. Prices and session/family details remain labelled proposals; capacity tiers require measured evidence.

## Fixed direction

- Full games: Hearts solo, Spades solo, Spades partners; four seats each.
- Players know the basic rules. Help improves decisions during real play.
- Preserve the existing table, dialogs and responsive layouts.
- Jev runs through OpenRouter when enabled; ordinary play currently uses code with Jev off. Go/PostgreSQL is the preferred replacement backend after bounded M02A acceptance; the current TypeScript service remains the reference. Hosting and managed identity activation are later work.
- Demo transitions require the application server. Versioned free/access-trial/paid offers may select games/variants and coaching limits; final launch values remain undecided. Browser edits confer no access. [CR-IMPL-004](decisions/CR-IMPL-004-online-demo-and-launch-readiness.md).
- Required action/usage records are written by the server. Optional analytics and client display reports cannot prove integrity.
- Every started game is stored internally. No player-facing game archive.
- All project artifacts remain under `C:\repos\test-jev`.

## What exists today

The preserved React/Vite app now has an explicit Go/PostgreSQL platform path for Hearts Solo, Spades Solo and Spades Partners, with code coaching, notes, original replay, isolated sampled continuations and local account/subscription/family controls. M04E's scoped functional acceptance has passed. `npm run start:go` builds and serves that complete app; `npm start`, `npm run dev` and `npm run start:reference` retain the original TypeScript service and V1 reader. Browser-local engine/storage modules and the 38-test [prototype UI report](../web/qa/UI-V1.md) are historical references, not current authority.

[M02 evidence](../qa/implementation/multi-game/m02/status.md) records completed game-owned TypeScript extraction, 449/449 Linux/WSL acceptance and separate Windows contracts/typecheck/build checks, with platform limitations retained. M03 private persistence passes its scoped gate. M04C passed its authenticated local Go API, durable preparation and receipt-first recovery gate ([evidence](../qa/implementation/multi-game/m04c/status.md)). [M04D scoped acceptance passed](../qa/implementation/multi-game/m04d/status.md): Go owns the finite demo and exact-target configured grant/usage boundary for MG-15 and the MG-16 backend. [M04E](implementation/multi-game/m04e-execution.md) extends that service to the complete preserved React app through generated platform contracts and migration 010; [current evidence](../qa/implementation/multi-game/m04e/status.md) records scoped functional acceptance and the separate remaining activation gates. `npm run start:go -- --configured` selects the empty launch policy; the default explicit Go launch uses local fixtures. Neither path silently converts existing V1 records or grants. Full M04/default-start activation remains blocked by the unresolved native PostgreSQL timeout cause and the long-history resource pass with integrity-preserving optimization and uncensored normal Spades match evidence. Jev is off; M05, human strategy review, live providers, hosting/payments and learning claims remain deferred. The [system review](../qa/implementation/multi-game/system-review-2026-10-05.md) retains the earlier defect and planning record.

## Changes justified by the review

Retain the UX and use the existing service as the migration reference. M02A has frozen portable contracts and verified a bounded Go compatibility slice; M03–M06 then prove durable records, service integration, recovery and complete journeys. Hosting and advanced operational implementation follow functional delivery. Code retains the complete Hearts pass set; the current provider contract marks its 286 choices unsupported rather than truncating them for Jev. Separate assistance from independent improvement. Replace generic tips only when supported feedback exists.

Compare calibrated contextual bidding (A) with constrained-deal rollouts (B) before selecting a strategy; adaptive A/B (C) must justify its complexity. Bots and coach share one observation-only policy. V1 starts code-only, then evaluates Jev in shadow. A three-arm comparison separates shortlist loss from Jev benefit before requested suggestions are promoted. Monte Carlo confidence and provider confidence cannot validate human grades by themselves.

Numerical sampling, cue and assessment defaults are initial test settings, not research-established constants. Adjust them through the stated acceptance checks without changing product scope.
