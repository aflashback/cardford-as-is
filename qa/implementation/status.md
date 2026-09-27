# Local V1 status — 27 September 2026

Integration branch: `v1/local`. Local product is implemented; **hosted V1/W19 is incomplete**. Identity is `local-test`, billing is `fixture`, ordinary coaching is local code and Jev is off. No real payment, public deployment, GitHub push or pipeline is claimed.

See the [handoff report](LOCAL-V1-REPORT.md), [run instructions](../../LOCAL-README.md) and [detailed browser evidence](ui-live-acceptance.md). Packet status describes the entire packet; a passing local subset does not close its external gates.

| Packet | Status | Demonstrated scope / remaining work |
|---|---|---|
| Planning / local cycle | passed | CR-IMPL-001/003 and local/deployment guides; local fixture authority is explicit. |
| W00 workspace / database | passed (local) | Reproducible install, persistent PostgreSQL, migrations, build and isolated backup/restore rehearsal. Hosted operations remain below. |
| W01 public contracts | passed (local) | Generated DTOs and standalone runtime validators; strict compilation and drift checks passed. |
| W02/W03/W05A rules / observations / baseline | passed (local) | Three deterministic modes, seat-scoped views, legal actions/scoring and code baseline; no strength claim. |
| W04/W06 durable server / jobs | partial | Local PostgreSQL commands, recovery, fences and bounded trial work tested; complete hosted operational/failover matrix unfinished. |
| W07/W08 table / finite demo | passed (local scope) | Preserved table UX, pause/reload and response recovery; finite zero-API demo. 8 actual-service browser journeys and 10 fixture cases passed. |
| W09/W09A identity / account data | partial | Local identity, own export and typed-confirmation deletion work; managed identity and hosted data lifecycle unfinished. |
| W10/W11 access / progressive coaching | partial | Local permissions, explicit limited unlock, saved help, notes and progressive code advice implemented; no blanket closure of all hosted acceptance cases. |
| W05B/W12 evaluation / assessment | partial | Exact constrained sampler and frozen synthetic policy smoke; calibrated/human evaluation and categorical grades not complete or enabled. |
| W13 review / possible continuation | partial | Original review and actual isolated one-trick trial worker passed live-state invariance checks; broader packet matrix unfinished. |
| W14/W16 local subscription / family | partial | Fixture preview/confirm, cancel/resume and identity-bound family privacy/seat flows tested. Commercial renewal/revocation and pilot gates unfinished. |
| W15 real Stripe | partial | SDK primitives, event/reconciliation boundaries and fixtures pass; hosted orchestration/recovery and complete real sandbox scenarios not done. |
| W17 optional Jev | partial | 19 provider/ledger checks pass. One live response from `typesafe/jev-1.13-20260917` failed validation; cost USD 0.0000714. No retry or promotion; ordinary runtime remains off. |
| W18 integrated acceptance | partial | Real browser, PostgreSQL, source/artifact, local load and backup evidence exists. Physical devices, assistive technology, other browser engines and pilot remain not-run. |
| W19 hosted / commercial release | blocked | Managed identity/Stripe activation, hosting/commercial decisions and remaining release validation are required. No full hosted V1 or paid-launch completion claim. |

## Final integration evidence

- `npm ci`, audit (0 vulnerabilities), contracts, typecheck, source boundaries, build and artifact checks: passed per architect.
- `npm run test:all`: **140 passed**, 0 failed/skipped, 25.43 seconds after the provider deadline fix.
- `npm run test:ui`: 18 passed in 44.8 seconds, comprising 8 real-service journeys and 10 response-fixture cases. Boundary checks: 2 passed.
- Provider smoke: **failed response acceptance**, one attempted request, no retry. The sanitized result and exact next investigation are recorded in the handoff.
- Verified implementation revision: **`4145972565caf974e9c197b3e641aa8d8f597142`**. Later documentation commits preserve these results.

Evidence preserves scope: [backup](backup-restore.json) compares restored counts, [load](local-load.json) is a short local 100-table sample, and [browser evidence](ui-live-acceptance.md) reaches the first trick in each mode. None substitutes for production recovery/capacity, physical-device acceptance or full-hand browser testing. See the handoff's ordered next-agent tasks before hosted work.
