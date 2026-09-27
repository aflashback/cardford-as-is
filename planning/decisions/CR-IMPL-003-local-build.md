# CR-IMPL-003 — Authorized local build and deferred activation

**Recorded:** 27 September 2026. **Status:** owner-authorized local implementation direction, recorded by the architect's documentation worker. This is delivery change control, not proof of application completion.

## Owner authorization and reason

The owner initiated implementation through local completion, authorized Git worktrees and agent reviews, accepted Podman for local infrastructure, requested the guide before implementation, and specified no GitHub push and no pipeline now. Keep the existing fit-for-purpose B2C UX. Optional OpenRouter testing follows implementation; Stripe remains the selected payment service.

CR-IMPL-001 continues to govern three game modes, server authority, B2C scope, in-app subscription management and Stripe. This record supersedes the earlier plan's current-cycle CI pipeline requirement and its planning-only execution status. It does not authorize live charges, public deployment, model promotion or changes to rules/hidden-information/scoring semantics.

## Requirements and acceptance

| ID | Requirement | Evidence required |
|---|---|---|
| LOCAL-01 | Implement locally through dependency-ordered milestones with an architect integrating schema-first work and agent reviews. | Frozen contract revision, scoped local commits, integrated check results and review resolutions. |
| LOCAL-02 | Keep local fixtures explicit and prohibited in hosted startup. | Default-deny startup tests for fixture identity/payment/grants in staging and production; local ownership/revocation/quota tests against PostgreSQL. |
| LOCAL-03 | Do not create a CI/CD pipeline, push to GitHub, deploy publicly or activate live payments in this cycle. | Review repository diff and execution report; local build/check scripts remain executable manually. |
| LOCAL-04 | Separate local completion from real-service and paid-launch acceptance. | Per-check passed/failed/blocked/not-run matrix; real Stripe/identity/model results only when actually observed; no fixture result presented as live. |
| LOCAL-05 | Keep existing OpenRouter credentials server-only and Jev disabled by default. | Off/zero-cap sends zero requests; safe file loader, secret redaction and public-artifact checks; bounded experiment evidence if invoked. |

## Alternatives and compatibility

Waiting for hosting/identity/Stripe provisioning would unnecessarily block deterministic implementation. Quietly substituting fixture identity or payments in hosted deployments would violate the trust boundary. Building CI, a deployment fleet or an enterprise administration layer would exceed this cycle. The selected path implements real adapter boundaries and tests locally, records external blockers and preserves existing hosted release gates.

No historical schema, original specification or prototype result is rewritten. Future CI can reuse local scripts when separately authorized. Hosting and region remain undecided. Proposed commercial prices/family policy remain test fixtures until the existing activation decisions are resolved. The historical direct-Jev runtime assumptions remain superseded by CR-IMPL-001's local policy with optional Jev; no new strategic model is introduced.

## Affected work and checks

Applies to W00 pipeline work, W01 integration, W04/W09 development identity, W14–W16 billing fixtures and real Stripe acceptance, W17 experiment ordering, and W18/W19 completion labels. Rules, knowledge, public contracts, persistence, access and provenance tests remain mandatory. Hosted startup must reject local fixture settings even if `NODE_ENV` is accidentally set to development.

The [local build cycle](../LOCAL-V1-BUILD-CYCLE.md) and [deployment guide](../DEPLOYMENT-GUIDE.md) make this decision executable. Their commands beyond the current prototype are deliverables of implementation, not claimed available scripts. No application/provider/payment/deployment tests were run to create this record.
