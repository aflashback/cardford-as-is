# 09 — Verification, benchmarks and release evidence

**Important:** everything in this document is a required future test or proposed experiment unless `qa/spec-validation.md` explicitly says it was performed on the planning files. No game engine, live provider test, user study or browser test has been run as part of preparing this pack.

## A. Four independent questions

1. Does the program enforce the selected game correctly?
2. Does every player/coach operate only on permitted information?
3. Does Jev choose useful actions, beyond merely valid ones?
4. Does the experience help a person learn?

Passing one does not establish the others. A responsive mockup is not a complete game; a completed game is not a proven coach.

## B. Deterministic verification

Use Vitest for unit/integration tests and fast-check for properties (research R21–R22). Cover all scoring rows in `examples/scoring-golden.json` and rule cases in `examples/rule-unit-cases.json`. Those files are future test specifications, not evidence of tested implementation.

Run at least 10,000 seeded complete hands against legal baseline policies. Assert card conservation, unique ownership, 52 total plays, thirteen completed tricks, four cards per trick, clockwise turn order, correct leader changes, legal action membership, no premature completion, integer scores and bags in 0–9. Test positive bids summing above thirteen, both teammates bidding Nil, failed Nil, repeated bag rollover, negative totals and a tied match threshold.

Property-test replay identity against the materialized snapshot, pure reducer determinism, input immutability and illegal-command non-mutation. Test every phase transition and each command's duplicate-ID/stale-version behavior. Equivalent serialized observations must use deterministic canonical field and candidate ordering.

Check timing-dependent integration races: double tap, two tabs, provider returns after human turn advances, lease expires during request, server restarts before/after commit, session deleted while job runs, lost client response after a successful commit, and retry after quota backoff. Each accepted action applies once.

## C. Information-safety verification

Hold actor hand and all public history fixed, permute feasible hidden hands among other seats, and assert byte-identical serialized provider payloads. Do the same for human coaching. Assert that cache keys are not exposed and that human advice is never included in bot observations.

Inspect network/DOM/source fixtures for seed, original deal and hidden card identities. API authorization tests cover other guest IDs across every route. Review endpoints must not return bot-private observations; a completed-hand reveal must be explicit. Repeat these tests after feature or prompt changes: a seemingly useful feature can leak information.

Do not require identical results from repeated Jev calls as a fairness test. The invariant concerns inputs and permissions. Recorded choices make replay deterministic even when a model service is not.

## D. Provider contract tests

Use a fake HTTP server for valid replies, malformed JSON, missing/extra candidate keys, nonfinite/negative probabilities, wrong totals, nonmaximal choices, invalid model IDs, 401/422/429/529, network reset, slow response and exhausted deadline. Verify bounded retries, redaction, circuit recovery and no silent fallback.

Run a separate optional authenticated smoke suite using environment credentials. Its report must include date, resolved model, exact prompt/feature version, usage, latency and pass/fail evidence. CI without secrets must clearly mark this suite skipped, not passed. Revalidate after model changes.

## E. Strategic evaluation dataset

Create 400 independent, versioned decision positions: 120 bidding and 280 playing. Split 200 development, 100 calibration and 100 holdout, stratified by decision category and grouped by source deal/scenario family. All alternative views or retries from one deal belong in the same partition. Do not tune prompts using holdout results.

Include ordinary play, trump management, protecting own/partner Nil, setting an opponent, bag thresholds, protecting partner's current winner, overbids, end-of-hand exact outcomes and match-score context. Include ambiguous choices and multiple acceptable answers. Explicit narrow tactical objectives may have engine-proved answers; broader strategic labels require review by at least one competent Spades player and ideally a second independent reviewer with disagreement retained.

Report acceptable-set match rate, harmful-advice rate, category coverage, ambiguity/disagreement rate, action-order sensitivity and confidence calibration against those labels. An unaudited generated dataset or another language model's opinion alone is not strategic ground truth. Jev cannot grade itself into passing.

The 100-position calibration split is small. Confidence-bin results must show sample counts and intervals; do not publish a polished “90% reliable” badge from sparse bins. Calibration measures agreement with a defined reviewed label, not match-win probability.

## F. Playing-strength experiment

Implement two deterministic fair-information baselines: a random-legal policy with seeded randomness, and a documented basic heuristic policy. Neither is presented as an expert solver. For the basic policy, freeze bidding and card heuristics before evaluation; it may use only the same permitted observation. Document its weaknesses and ensure it does not know the deal.

A first controlled comparison uses 200 duplicate-board seeds with the evaluated player rotated through four seats: 800 hands per configuration. Keep partner and both opponents on the same frozen basic policy to isolate the evaluated seat. Run matching configurations for Jev, basic and random legal. Then run a separate all-Jev table to check composition and pathological interaction, rather than conflating it with single-agent strength.

A duplicate board fixes the initial deal, not the later action trajectory; each policy receives its own legitimate observation as play diverges. Score the evaluated seat's team minus the opposing team. Report paired differences against baselines, contract success, bags, Nil success/failure, latency and input tokens. Bootstrap confidence intervals by original deal seed, not by correlated decisions or seat rotations. Add match-level tests for the 500-point objective after hand-level stability.

Proposed go/no-go hypotheses: clear improvement over random legal; no worse than the frozen basic baseline by more than 5 net team points per hand; and no systematic serious coaching errors in a core category. A provisional harmful-advice ceiling is 5% of reviewed unambiguous positions. These thresholds are product choices, not statistical guarantees; show intervals and mark inconclusive results inconclusive. More samples may be required.

An action can be acceptable without maximizing expected score. Likewise, one won trick/hand does not prove its selected card was best. Do not use hidden actual cards to score a recommendation as if the player knew them.

## G. Coaching and user-experience tests

Test every template predicate and binding, stale/missing advice, neutral disagreement wording, confidence disclaimers, partial hint exposure and retry assessment exclusion. All twelve drills require independently checked acceptable sets and a playable complete scenario where needed. Do not ship placeholder drill text behind a working menu.

Playwright tests cover complete bidding/hand flow, hint use, review, fork, exercise submission, refresh/restart, offline/reconnect, keyboard operation and deletion. Use the viewport matrix in document 06, with screenshot evidence. Supplement automated accessibility checks with manual keyboard, screen-reader and touch testing. Never claim WCAG conformance from an automated scan alone.

A pilot learning study can use 5–8 consenting users spanning novice and casual experience, a short pre/post rules/tactics test using different questions, task observation and feedback. This is exploratory usability evidence, not proof of broad educational efficacy. Keep learning metrics separate from win rate and Jev agreement.

## H. Required release report

The report states commit, dependency lock, rule/schema/model/prompt/feature/content versions, environment, executed commands, dataset provenance, counts, failures, skipped work, measured latency/usage and representative screenshots. It distinguishes real Jev from demo runs. It includes unresolved risks and a recommendation: release pilot, iterate, or strategy quality blocked.

Missing API access means live integration/evaluation remains blocked, even if all deterministic tests pass. Do not mark the product complete by substituting random moves, a frontier model or fabricated screenshots/results.

## I. Extension-conformance gate

Before G1, implement a **test-only** four-seat individual-play module with one sequential `choose:<id>` action family, no bidding, no trump and four independent result rows. It is not a second commercial game and does not need strategic quality evaluation. Use it to prove shared session creation, candidate transport, observation validation, provider mapping (mocked), state persistence, replay, generic table and score rendering do not import Spades semantics.

Also test a two-team manifest with the same generic kernel, invalid team partitions (duplicate/missing seats, wrong group sizes), unsupported mode rejection, missing capability rejection, game-version isolation, game-scoped skill/cache IDs and immutable competition on resumed sessions. A partnership variant does not become individual-play merely by changing `competition.mode`. Each real game variant needs its own validated rules and objective.

Additional invariant: candidate-set generation and observations must be identical for indistinguishable actor information sets. The generic adapter receives only registered safe payloads. Candidate sets over the provider's 255-option cap are rejected as unsupported until an explicitly approved sequential-choice protocol exists; never silently truncate.
