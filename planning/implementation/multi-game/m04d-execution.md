# M04D — Online demo and exact-target access

Started 6 October 2026 from `7639d22`, following the owner's authorization. Requirements: MG-15 and MG-16; preserve the M04C authentication, control, revision, idempotency and prepared-work fences. Native Windows remains the local environment. Full M04 client activation, hosting, real identity/payments, Jev and human evaluation remain separate gates.

## Delivery and interfaces

1. Move the existing five authored demo frames and their edges into `server/internal/demo`. Keep the frozen `DemoFrameRequest`/`DemoFrame` DTOs and exact teaching content. Serve validated anonymous open/choice/replay through Go with no engine, account, provider or quota work. The existing React demo requests each frame, retains its last confirmed frame on failure, and fences stale responses.
2. Implement a pure `server/internal/access` resolver over verified immutable grants, exact registered target, authoritative unit/admission/unlock/result context, recorded usage and server time. Select one grant by declared precedence; never stack quotas. Reject unsupported calendars, units and tools when configuration is loaded.
3. Extend PostgreSQL records with authoritative context reads, explicit configured identities, atomic coached-unit unlocks and once-per-identity access-trial activation. Keep original buckets, purchased terms and receipts. Add only forward migration 009; preserve migrations 001–008.
4. Integrate the resolver with new-session admission, continued play, coaching preparation and saved reads. Add separate strict access/offer endpoints; do not repurpose legacy `AccountView.offers`. Retain the explicit M04C fixture constructor for its acceptance harness; configured mode issues no broad fixture grants.
5. Verify targeted policy, HTTP, persistence/concurrency/restart and browser demo cases, then full native checks and independent review. Record actual evidence under `qa/implementation/multi-game/m04d`.

## Execution decisions

- Configuration controls future issuance; verified grant terms remain immutable. Launch offer values remain unset. Checked-in example offers are explicitly local acceptance fixtures.
- Storage supports UTC day and lifetime buckets. Wire `grant` periods map explicitly to a stable lifetime bucket, never to an offer version. Week/month or non-UTC calendars fail configuration validation.
- A separate demo-only local entry point may serve the built existing UI for Go/browser acceptance. This does not activate the unfinished practice/account client envelope or add a permanent proxy.
- Database acceptance runs serially. The earlier intermittent native PostgreSQL timeout cause remains an open investigation before full M04 activation; later successful suites cannot close it by themselves.

## Progress

- **Passed scoped local acceptance.** Implementation and independent review are complete. Normal Go and race runs passed across 18 tested packages, with the Windows symlink fixture and two long race-growth fixtures explicitly recorded as skips. Actual Go/React demo acceptance passed all nine cases. Contracts, builds, original Node regressions and source-preservation checks passed against the same frozen source. [Status and evidence](../../../qa/implementation/multi-game/m04d/status.md).
- **Follow-up delivered: M04E scoped functional acceptance**, covering the platform/account/client integration, normal-random full-hand journeys and replay-validated terminal fixtures; see [current evidence](../../../qa/implementation/multi-game/m04e/status.md). Full M04/default activation still requires complete normal Spades match evidence, the cumulative-history resource pass and the earlier native database cause. Launch offer values remain unset.
