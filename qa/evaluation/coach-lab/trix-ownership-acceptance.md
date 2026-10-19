# Trix public twos ownership: checks and operation

Status: implementation, focused verification, integrated gate and bounded headless mechanics check complete on 9 October 2026. This record covers [CFL-08](../../../planning/implementation/coach-lab/trix-ownership.md), the exact-information prerequisite for team opening/delay comparisons. Do not interpret this candidate's deduction correctness as evidence of stronger play.

## What to run

From `C:\repos\test-jev`, verify the installed lab:

```powershell
npm run lab:check
```

For a new, separate mechanics run, replace the example ID and seed with unused values and keep its manifest immutable:

```powershell
node scripts/coach-lab.mjs init --run-id ownership-your-run --game trix-complex-partners --candidate-policy trix-ownership-1.0.0 --reference-policy trix-history-1.0.0 --seed ownership-your-unused-seed --max-wall-ms 180000
node scripts/coach-lab.mjs run --manifest .local/evaluation/coach-lab/manifests/ownership-your-run.json
node scripts/coach-lab.mjs audit --manifest .local/evaluation/coach-lab/manifests/ownership-your-run.json
node scripts/coach-lab.mjs report --manifest .local/evaluation/coach-lab/manifests/ownership-your-run.json
```

This creates a reference/candidate pair from one origin, not independent strength evidence. The reference is the frozen history candidate; background seats retain the manifest's declared policy. Check the receipt before interpreting results, including any incomplete/censored runs. Use a new run ID for another experiment; never replace an existing archive. No browser, running application, database or model provider is required.

Inspect `ownershipEvidence` in saved original decision traces for supported scope, retained original/remaining owners and count bounds, earlier selection and actual changed actions. A count of retained assignments is not a probability or a number of fully feasible deals. The original coach message must name the same action and preserve uncertain ownership. Public outputs must contain only information available to that actor at that turn.

## Evidence

Focused checks on 9 October 2026:

| Check | Actual result |
| --- | --- |
| Native ownership tests, including reachable suppression and original/current ownership cases | Passed, 0.709s |
| Independent opening oracle: all 256 original twos allocations, from each of four actor views | Passed: 1,024 reachable observations, 0.483s |
| `node scripts/windows-env.mjs go test ./server/internal/games/trix -count=1 -timeout=120s` | Passed, 40.148s |
| `node scripts/windows-env.mjs go test ./server/internal/evaluation/coachlab -run 'TestTrix(Ownership\|Frontier\|History)' -count=1 -timeout=45s` | Passed, 0.655s |
| Operator, build-freeze and strength admission tests | Passed: 30/30 |
| Generated lab contract check | Passed |
| Independent code/test review | No remaining blocking finding; review itself did not execute tests |

The native checks include complete fixed Jacks deals for all four variants, legal completion and 500 total finish points; actual ownership remains supported through every eligible public prefix. Hidden non-two cards can be exchanged between other seats without changing the actor's observation, selected action or saved explanation. Parsed Partners observations need a trusted profile before announcement absence carries meaning; saved-packet audit rebinds its exact pin and rejects altered ownership evidence.

The reachable Basic and Complex Partners activation fixture changes History's D3 to C3: exact partner C2 ownership makes both candidate scores 8 and the existing legal-order tie break selects C3. The saved coach status is **no-clear-preference**. This proves the deduction reaches the bot/coach decision path, not that C3 is strategically better. Another reachable ending preserves the existing 45-point last-card term. Existing older-policy tests pass, but no pre-edit full-trace byte snapshots were captured.

`npm run lab:check` passed all six steps in **293.391s**: both generated-contract checks, **74/74** Node tests, all seven listed Go packages and both TypeScript projects. The earlier attempt passed its behavioral checks but failed server typechecking because a negative test assigned an invalid ID to the installed-policy union. That test now passes an explicitly untrusted `unknown` input through the validator; production types were not loosened. The focused server typecheck and 21-test strength file also passed after the fix.

Private gate receipts are `.local/evaluation/coach-lab/checks/2026-10-10T00-56-12.333Z.json` (retained failed attempt) and `2026-10-10T01-02-02.324Z.json` (complete pass). The final check's initial/final source digest and mechanics manifest all match `b4c868d9a54f2da670af3d693645d7d9a8a3893e07d5378351cfcd834b590f2b`. Logs are under `.local/evaluation/coach-lab/ownership-work/`.

Longer-horizon score comparisons, fresh-family strength validation and live promotion are outside this slice and remain unperformed. Provider calls and human/model strategic reviews are not part of these checks.

## Bounded mechanics collection

The predeclared `ownership-smoke-20261009-v1` run used one origin, rotation 0 and one candidate seat in Complex Partners. All background seats used History. The plan capped work at 180 seconds, 10,000 actions and 100 rounds and specified exactly one pair, without extending collection based on outcome or activation. Collection began after the complete gate passed.

| Measure | Result |
| --- | ---: |
| Complete native sessions / deals | 2 / 16 |
| Committed decisions | 964 |
| Forced / unforced decisions | 368 / 596 |
| Passed native mechanical checks / failed audits | 964 / 0 |
| Candidate decisions with saved ownership evidence and matching bot/coach action | 125 |
| Applicable Partners layout decisions | 67: 41 forced, 26 unforced |
| Applicable suppressed-announcement decisions | 0 |
| Candidate choices changed by ownership deductions | 0 |
| Missing saved reasons | 0 |
| Human reviews / model reviews / numerical alternative evaluations | 0 / 0 / 0 |

Both arms finished at NS −15, EW +15. There was no changed action in this tiny sample; do not infer a positive or negative strategic effect. Suppression and actual action changes are covered by reachable native fixtures, not this collection. All 964 decisions remain **partially-checkable** for strategic quality despite passing mechanical checks; all 596 unforced choices remain strategically unreviewed. No model ran and no stronger-policy or live-default promotion is claimed.

Private evidence locations:

- Protocol and independently checked summary: `.local/evaluation/coach-lab/ownership-work/mechanics-plan.json` and `mechanics-summary.json` in that directory.
- Immutable manifest: `.local/evaluation/coach-lab/manifests/ownership-smoke-20261009-v1.json`.
- Run, audit and report: `.local/evaluation/coach-lab/runs/ownership-smoke-20261009-v1/`; original export `exports/05033c4af75c5f81a01d8a72` and readable `report.md`.
- Frozen native binary digest: `fcfa119111854f7a101d92192791114552b8f5989c5111e0e463f25d7d96b752`; source digest matches the passing gate above.
- Initial audit/report launches hit the local sandbox's `spawn EPERM`. Their logs were retained; permitted native-worker launches then completed successfully without recollecting games.

## Next unfinished work

Compare opening versus delaying a suit through native finishes, starting with small endings. Include a partner holding many/all/no twos, unresolved ownership, and the choice between releasing a partner's lower path and blocking an opponent's ace. Retain both partners' finishing positions and combined points; evaluate Solo separately. Across uncertain holdings, compare the same legal alternatives on the same plausible worlds with player-information-only continuations. A comparison must distinguish proved outcomes from continuation-policy assumptions before it can justify another narrow rule or fresh-family strength study.
