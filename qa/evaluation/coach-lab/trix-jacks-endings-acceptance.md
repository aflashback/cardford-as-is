# Trix Jacks endings: operation and evidence

Status: implemented and verified for [CFL-09](../../../planning/implementation/coach-lab/trix-jacks-endings.md). This stage compares the scoring consequences of opening or delaying a suit in small native endings. It does not select a new live policy or establish complete-session strength.

## Run the fixed comparison corpus

From `C:\repos\test-jev`:

```powershell
npm run lab:check
node scripts/coach-lab-jacks-endings.mjs --out .local/evaluation/coach-lab/tempo-work/endings-your-unused-run-name
```

Use a new direct child directory under `tempo-work` for every invocation. The operator refuses to replace prior evidence. It needs the installed repository Node/Go dependencies, but no browser, app server, database or model-provider key.

Read `invocation.json` first: only `passed` with unchanged source and a complete native invocation verifies the run. Then read `report.md` for paired objective-point changes, `summary.json` for machine-readable aggregates, and `study.json` for full actor inputs and hypothetical continuations. `protocol.json`, before/after source hashes, build/worker logs and the retained source/binary preserve reproduction evidence. Failed and incomplete invocations remain visible; do not extend a run after looking at its results.

## What the result means

Every legal root action is compared on the same exhaustive set of compatible remaining allocations and the same declared policy profiles. Full current chronology is required. Complete coverage means all compatible allocations were replayed, not that future players are optimal or that allocations are equally likely. The readable report's unweighted allocation averages are conditional diagnostics; they are not calibrated expected outcomes or winning probabilities.

Partners rows use both teammates' points as the objective. Solo rows use only the actor's points. Margin is recorded separately: a 50-point team gain changes the two-team margin by 100. Individual finishes and both partners' points remain available even when the team total ties. A local comparison where all later moves are forced across all compatible allocations has a stronger interpretation than one sensitive to the continuation policy.

Timing distinguishes a card becoming playable on the board from its actual placement. Offsets count accepted native actions, including passes; zero means already board-playable before the root. These are hypothetical consequences, not added facts about the original player's future. Private fixture hands establish a reachable case but are never supplied as the evaluator's hidden-card answer.

Incomplete enumeration retains only completely paired diagnostic rows. Reports withhold averages and paired comparisons for those partial traversals. Historical observations without available chronology and early positions above the total-card bound remain outside this exact-ending evaluator; the existing sampled evaluator is a separate diagnostic tool.

## Verification and findings

Focused checks completed:

| Check | Result |
| --- | --- |
| Native ending API: all four variants, independent mask-free native allocation oracle, observation-only continuations, scoring/timing and caps | Passed, 6.060s |
| Fixed corpus: 11 handchecked action paths, exact forced ending, original twos counts, ambiguity and negative controls | Passed, 0.214s |
| Operator: no-overwrite, failed/incomplete/source-changed receipts, paired point arithmetic, Solo objective and rejected partial averages | 5/5 passed |
| Server TypeScript check | Passed |
| Independent source review | No remaining substantive finding; Solo tags corrected before final run; reviewer ran no tests |

Focused commands:

```powershell
node scripts/windows-env.mjs go -C server test ./internal/games/trix -run '^TestJacksEnding(Native|Caps|Identity|Complete|Already)' -count=1 -timeout=60s
node scripts/windows-env.mjs go -C server test ./internal/games/trix -run '^TestJacksEndingCase' -count=1 -timeout=60s
node --test --test-isolation=none web/tests/coach-lab-jacks-endings.test.ts
node web/node_modules/typescript/bin/tsc -p web/tsconfig.server.json
```

The final integrated `npm run lab:check` passed in 306.278s: both generated-contract checks, all 79 JavaScript tests, all seven selected native Go packages and both TypeScript projects passed. No gate step was skipped, interrupted or timed out. Its receipt is `.local/evaluation/coach-lab/checks/2026-10-10T01-24-13.495Z.json`; source and final-source digests both equal `be31c0f68b42e69fd535bc319f08f21ca9a26b63268c3a1fa72c93d6a51fa4d8`. The ending operator additionally hashes its wrapper, declaration and test files, so its source digest below is intentionally different. No provider call, human-label campaign or new full-session strength study is part of this slice.

## Fixed corpus results

The retained operator run is `.local/evaluation/coach-lab/tempo-work/endings-20261009-v2/`. It passed with unchanged source; build took 3,233.905ms and native execution 3,736.850ms. It contains seven case entries across all four Trix variants, **106 allocation rows and 985 complete root/profile continuations**. There are **six distinct semantic actor inputs**: the no-two low-card/ace contrasts deliberately share one observation and its 18 allocations. Deduplicating that repeated input leaves 88 allocation rows and 805 continuations. None of these counts denotes independent origin families or a strength sample.

Partners profiles are all History, all Ownership, all baseline, Ownership at actor 0 with History elsewhere, and Ownership at both teammates with History opponents. Solo omits the both-teammates profile. Every comparison tests the complete native legal root set. Cases use the default eight-total-card bound except the all-four-twos case, explicitly capped at twelve. Two negative controls preserve early suppressed-announcement ambiguity as outside scope and step-budget exhaustion as incomplete.

| Case | Compatible allocations | Finding |
| --- | ---: | --- |
| Several partner twos; lower release versus upper blocker | 6 | Under History continuations, CK versus C3 loses 50 team points in three allocations, ties in two and gains 50 in one. C3 has the larger unweighted mean; neither universally dominates. |
| Partner holds all four twos | 3 | After the same C3 root, History/baseline continuations give team 150. Ownership, one-seat Ownership and both-teammate Ownership continuations give team 250 in every allocation. The actor remains at 100; partner points rise from 50 to 150. |
| Partner has no twos, lower-card witness | 18 | The actual witness favors C4 for team 350 versus CK 300, while the actor earns 150 versus 200. Across all compatible allocations, CK versus C4 is −50/0/+50 in 3/11/4 allocations under History; the original hidden witness cannot decide the recommendation. |
| Same types of cards in Basic/Complex Solo | 30 each | Under History, CK versus C4 lowers own points in seven allocations, ties in thirteen and raises them in ten; differences span −50 to +50. Its +5 unweighted average is not a calibrated expected gain or a safe universal replacement. |
| Forced five-card release | 1 | C3 gives own 100 + partner 150 = team 250; CK gives own 100 + partner 50 = team 150. Every future move is forced. Baseline, History and Ownership already choose C3. |
| Partner has no twos, ace witness | Same 18 as lower-card witness | Swapping the partner's C3 for CA reverses the actual witness's preferred opening: CK gives team 350 versus C4 300. Its semantic actor input is identical to the lower-card witness, so the evaluator correctly returns the same complete comparison. |

The all-four-twos example identifies the useful mechanism. History plays **C3, CK, D3, H3, S3** at actor 0, releasing the opponent's ace early. Ownership plays **C3, D3, H3, S3, CK**, continuing to release the partner's twos while retaining CK. This is a +100 team-point difference (+200 margin points) in these three compatible allocations under the declared continuation profiles. It demonstrates a concrete local use of CFL-08's exact ownership input, not general policy strength or optimal play.

All three installed controls pick the same initial root in all seven case entries. The all-four improvement occurs in **later decisions**, so a root-choice-only metric would miss it. The unique fully forced case already works. Consequently this study adds diagnostic capability and regression evidence without inventing another card bonus or new runtime policy.

The initial `endings-20261009-v1` run is retained. Its only subsequent source change was replacing partner-specific tags in Solo output with neutral Solo labels; the same fixed cases were regenerated in v2. An early full-check invocation was deliberately interrupted before that edit and is not reported as passing. No extra cases, seeds or games were added after inspecting scores.

## Evidence identity and next use

- Fixture SHA256: `4ce83fd2b9d96966e4c3592325128eec0f0a0b453c46400ebf62c3c9fe8e9191`.
- Operator source digest, before and after: `29b8444ebb3a2af139849214ceba77c7e386ebb95166c982a273620ea61d46d5`.
- Retained native worker SHA256: `46b41a91844d53b097829617dad63d75c42d424d044ec10966b8722c5c4c1e37`.
- Study SHA256: `bdafe4aea1479631c7877a6c20b3e42570a5b0c49bed4ab8740dbe924a8f874c`.

Use the exact forced case as a protected regression and the all-four case as a targeted benefit test for the existing Ownership candidate. Keep the opposite no-two witnesses together as a counterexample to claims about hidden holdings or a universal lower/upper preference. Before promoting Ownership, compare it with frozen History on fresh complete sessions, separating Basic/Complex, partner/opponent policies, one-seat/both-teammate deployment and adverse outcomes. These selected examples cannot substitute for that strength stage. Further action rules need a demonstrated gap that current policies do not already cover; conditional averages alone are insufficient to claim certainty.
