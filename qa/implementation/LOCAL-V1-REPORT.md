# Local V1 handoff — 27 September 2026

The local product is implemented and reviewable at `http://127.0.0.1:4173`. This is **not a completed hosted V1 or W19 release**. Identity is `local-test`, billing is `fixture`, and ordinary play/coaching uses local code with Jev off. No payment is collected, no public deployment or pipeline was created, and nothing was pushed to GitHub.

**Verified implementation revision:** `4145972565caf974e9c197b3e641aa8d8f597142` on `v1/local`. The following documentation/evidence commit records these results without changing application behavior.

## Run it

Requires Node 24, npm and a running Podman service. From the repository root:

```powershell
npm ci
npm run db:up
npm run db:migrate
npm run build
npm start
```

Open the loopback URL above. Ctrl+C stops the foreground app. Windows background start/stop, development ports and configuration are in [LOCAL-README](../../LOCAL-README.md). PostgreSQL uses the persistent `tricks-coach-data` volume; startup does not reset games. Secrets remain server-only; never put them in `VITE_` variables, browser storage or evidence.

## What is implemented

| Scope / requirements | Local result and limit |
|---|---|
| W00–W03, W05A: workspace, contracts, rules, observations and baseline | Generated closed DTOs and CSP-safe validators; pure Hearts, Spades Solo and Spades Partners reducers; legal actions, scoring and allowlisted observations. Server owns authoritative state; browser receives its own hand and public facts. |
| W04/W06: persisted service and bounded work | PostgreSQL commands, revision/idempotency checks, tab control, recovery, access fences and isolated trial worker. Local enforcement is tested; the complete hosted concurrency, failover and operational matrix is not certified. |
| W07/W08; UX-01–03/05/07/09/11–12 | Existing blue table, four seats, hand and right coach retained. Explicit bid/pass/play, prepared selection without autoplay, pause/reload controls, responsive layouts and finite authored demo. Demo sends no API requests. |
| W09/W09A; LOCAL-01/02/04/05 | Explicit local identity, own account ID, safe JSON export, typed-confirmation local deletion and fresh-account restart. Hosted authentication, provider-backed deletion and commercial retention policy remain unfinished. |
| W10/W11; COACH-07/08 | Progressive Notice/Consider/Suggestion, source labels, table notes and explicit limited-hand unlock. Unlimited help unlocks on request; nudges cannot spend limited allowance automatically. These are code suggestions, not validated model expertise. |
| W05B/W12/W13 | Constraint-counted hidden-card sampling, current-game Original review and an isolated one-trick Possible continuation. Live state remains unchanged. Synthetic policy smoke exists; calibrated bidding, independent quality validation, categorical grades and promotion are unfinished. |
| W14–W16; SUB-01–04, A06/P06 | Local plan preview/confirm, cancel/resume, scheduled downgrade and account-bound family invitations with private player records. Stripe SDK adapter, persisted event/reconciliation boundaries and subscription-management primitives exist. Hosted route orchestration, recovery, live entitlement activation and full Stripe sandbox scenarios remain unfinished. |
| W17 | Jev adapter fixtures, server-only loader, bounded smoke runner and durable request/budget ledger exist. The single live smoke reached the model but failed response validation; integration and promotion remain unfinished. |

The [packet status](status.md) deliberately marks broader packets partial where only their local subset is demonstrated. Requirement coverage is scoped evidence, not blanket completion of every acceptance case in [requirements and tests](../../planning/implementation/requirements-and-tests.md).

## Checks and evidence

| Command / evidence | Actual result |
|---|---|
| `npm ci` | Passed in root integration. |
| `npm audit` | 0 vulnerabilities reported by architect. |
| `npm run contracts:check`, `npm run typecheck`, `npm run lint:boundaries`, `npm run build`, `npm run check:artifacts` | Passed in root integration. |
| `npm run test:all` | Final run: **140 passed, 0 failed/skipped, 25.43 s**, including the provider deadline regressions. Earlier post-Stripe run: 137 passed in 26.99 s. |
| `node --test --test-isolation=none web/server/tests/billing-stripe-management.test.ts` | 4 passed using injected HTTP responses through the actual pinned Stripe SDK; no Stripe network request. See [billing evidence](../../web/server/billing/README.md). |
| `npm run test:ui` | 18 passed, 0 failed, 44.8 s: 8 actual HTTP/PostgreSQL journeys and 10 explicitly response-fixture UI cases. All three modes reached the first completed trick; includes actual trial-worker publication, account export/deletion, subscription and two-identity family flows. Service tests separately complete full hands in all three modes. |
| `node --test --test-isolation=none web/e2e/boundary.test.ts` | 2 passed. |
| `node web/server/evaluation/local-policy.ts` | 384 synthetic complete hands; [frozen smoke evidence](../../web/server/evaluation/evidence/README.md). Comparator is deliberately weak; results do not certify strategy strength. |
| `npm run db:backup:verify` | Passed: 104,316-byte logical backup, isolated restore and matching player/game/migration counts `23,28,5`, 3,106 ms. [Evidence](backup-restore.json). Not production RPO/RTO or a full integrity audit. |
| [Local HTTP load evidence](local-load.json) | 1/10/100 concurrent-table stages completed with 0 errors; 111 total transitions across stages. At 100, request p95 516.67 ms. Short single-process workstation sample; not W19 capacity, sustained load or failover proof. |
| `node web/server/evaluation/jev-smoke.ts --live` with process-only `JEV_MODE=shadow`, `JEV_MAX_REQUESTS=1` | **Failed live response acceptance:** one request, `unavailable-invalid-response`. Observed `typesafe/jev-1.13-20260917`, known cost USD 0.0000714. No retry or promotion. |

Browser evidence used Node 24.19.0 and Chrome 153.0.8010.53 on Windows. PostgreSQL 16 runs through Podman 6.0.2; observed image digest `sha256:a85daf0dbd5e79586e850e3fe4b21b796799828ad015ce2166aeb98cc24da61c`. Detailed earlier commands, failures/fixes and source hashes remain in [UI acceptance](ui-live-acceptance.md). Screenshots were refreshed by the final browser run: [desktop 1280×800](local-live-desktop.png), [landscape phone 667×375](local-live-landscape-phone.png), [portrait account 390×844](local-live-account-phone.png). Browser emulation does not replace physical devices. The final build emitted a >500 kB main-chunk advisory (665.73 kB / 115.19 kB gzip); it passed. A sandboxed build failed with child-process `EPERM`; the permitted rerun passed. All 56 original specification-manifest file hashes are unchanged.

**Provider evidence:** The cap-one synthetic bidding request ran at `2026-09-27T06:51:11Z`, after the final local tests. Requested `typesafe/jev-1.13`; observed `typesafe/jev-1.13-20260917`. The ledger independently confirms one `invalid-response` attempt and cost USD 0.0000714. The specific rejected field was not retained, so the cause is unresolved; do not label this a successful integration or relax validation without evidence. See [Jev interface evidence](../../web/server/evaluation/evidence/jev-interface.md) and [sanitized result](../../web/server/evaluation/evidence/jev-smoke.json). All product/browser checks used Jev off; ordinary play remains unchanged. Do not reset the exhausted ledger or copy credentials into the report.

Review fixes include saved advice after expiry, effective family coverage, explicit limited unlock, committed unavailable trial status, stale attempt fencing, stale browser refresh protection, strict query validation and the provider's end-to-end decision timeout. Security checks cover local ownership/CSRF/secret and hidden-state boundaries; they are not a comprehensive hosted security certification. Third-party font and browser-code notices ship under `web/public/licenses/`.

## Integrated references

Root commits include `6bad76a` (local guides), `878cf07` (DTO freeze), `d8b6b42` (rules/observations), `b24ac05` (PostgreSQL service), `2aed11d` (CSP-safe contracts), `e6b9b1b` (billing/family), `e8ede9d` (trials), `773debd` (account data), `15d6df9` (provider adapter), `67d8718` (access/security regressions), `c79dabb` (account UI/live checks), `ba3e333` (durable provider ledger), `1779684` (local load), `11504dc` (browser evidence), `c6e924a` (Stripe management primitives) and **`4145972`** (reviewed integration, deadline fix and readable formatting). The UI evidence also preserves original worker commit references. Reusable managed worktrees retain `v1/ui`, `v1/billing` and `v1/provider-ledger`; integrate current `v1/local` before assigning new work there.

## Next agent / unfinished milestones

1. For further Jev testing, add safe field-category diagnostics and fixture reproduction for the rejected response before a separately bounded experiment. Preserve the exhausted attempt ledger. This is the next unfinished model milestone; it does not block local play.
2. Implement and configure hosted managed identity, session lifecycle/revocation and account recovery. Hosted startup currently rejects local fixtures; keep that gate closed until the replacement is ready.
3. Complete persisted, authorized Stripe purchase/change orchestration and ambiguous-result recovery around the adapter; mount and verify the full event/reconciliation lifecycle. Run real sandbox authentication, declines, renewals, refunds/disputes and family payer-revocation scenarios. Approve offers before prices or paid coverage appear.
4. Complete independent W05B/W12/W17 evaluation before enabling strategic grades or model promotion. A successful optional Jev smoke proves only the observed transport behavior.
5. Run physical iPhone/iPad/Android, VoiceOver/TalkBack, Firefox/WebKit and experienced-player pilot acceptance. Current browser evidence covers scoped local journeys, not these gates.
6. Select hosting and resolve commercial/privacy/support decisions; rehearse encrypted backups, migration rollback, recovery and hosted load/failover. W19's 1,000-active-table minimum and wider growth scenarios remain unproven. Follow the [deployment guide](../../planning/DEPLOYMENT-GUIDE.md) and [local build cycle](../../planning/LOCAL-V1-BUILD-CYCLE.md). No CI/pipeline work is authorized by this handoff.
