# GR-02 / GR-08 — Spades casebook and fresh style matrix

**Run:** 29 September 2026. **Policy:** `spades-tactics-2.1.0`. **Provider mode:** local code only; Jev calls 0, observed model ID none. These are deterministic maintainer and exploratory comparison checks, not strategic certification.

## Casebook

`node web/server/games/spades/reasoning/casebook.ts qa/implementation/spades-reasoning-casebook.json`

The generated [casebook report](spades-reasoning-casebook.json) links all 26 catalog families to one reachable case, a policy reason ID and a casebook cue anchor. All 26 scenario recognitions and factual/claim-type rubric premises passed. Each decision had at least two legal actions. All independent action-label statuses remain `unlabelled`; strength remains `not-assessed`. Case groups and optional counterexample references have explicit fields, but no counterexample pair has been labelled. Catalog links resolve to casebook anchors; cue binding to rendered authored content is still unverified.

## Grouped style matrix

`node web/server/evaluation/reasoning-matrix.ts qa/implementation/spades-reasoning-style-matrix.json`

The [matrix report](spades-reasoning-style-matrix.json) used 12 new original deal seeds (`840001`–`840012`), 180 complete hands and 108 paired comparisons. Each pair shares deck, dealer, assessed competitor and other-seat style. One-seat and both-teammate changes are separate arms. Baseline, conservative and assertive are declared local synthetic styles. Score arithmetic was independently checked against the Spades scorer. Values below are mean candidate-minus-reference hand-score margins in points, grouped by the 12 originating deals per row.

| Mode | Other-seat style | One changed seat | Both teammates changed |
|---|---:|---:|---:|
| Solo | Baseline | +22.25 | — |
| Solo | Conservative | +8.33 | — |
| Solo | Assertive | +38.67 | — |
| Partners | Baseline | **−8.67** | **−17.33** |
| Partners | Conservative | +6.08 | +23.92 |
| Partners | Assertive | +160.67 | +175.25 |

The negative baseline-style partnership comparisons are a weakness against the local baseline; this run does not establish that the policy is stronger. The assertive style makes aggressive bids and high-card plays, so the large positive differences against it should not be generalized. Only 2 of 180 hand rows contained a Nil bid. No bag penalty or match completion occurred. The run begins at zero score and bags, so carryover and match outcomes remain unmeasured. Per-hand elapsed time records local computation, not provider latency; fallback count is zero because there is no provider call.

## Negative partnership seeds and version comparison

`node qa/implementation/reproduce-spades-policy-diagnostic.mjs qa/implementation/spades-policy-2.0-vs-2.1-diagnostic.json`

The [diagnostic](spades-policy-2.0-vs-2.1-diagnostic.json) replays policy source from pinned base commit `fb7ce6feb655a4f9afd5a8863dd62d27853d623d` through the same 12-seed matrix. Across all 180 hands, 2.0.0 and 2.1.0 selected identical bids and card sequences, so their scores and margins were identical. The following negative pairs therefore predate 2.1.0. Candidate and reference bids match within each pair; the difference begins in card play. The first differing card locates where trajectories split and is not, by itself, an independent label that the card was wrong.

| Seed | Arm | Margin difference | Candidate versus reference contract | First play difference |
|---|---|---:|---|---|
| 840007 | Both teammates | −143 | Missed 6/7 versus made 8/7 | D2 versus C2 |
| 840003 | One seat and both teammates | −123 | Both made 6/6 versus 8/6; opponents gained much more against candidate | DA versus C2 |
| 840004 | One seat and both teammates | −101 | Both made 8/8 versus 9/8; opponents gained more against candidate | CA versus C3 |
| 840009 | Both teammates | −101 | Missed 4/5 versus made 5/5 | D3 versus H2 |

This separates the observed bid and play differences for these seeds. It does not establish whether changing any one card would improve the full-hand result, and the new 2.1.0 scenarios still need targeted outcome evaluation.

## Checks

| Check | Result |
|---|---|
| `node --test --test-isolation=none web/server/tests/reasoning-casebook.test.ts web/server/tests/reasoning-matrix.test.ts` | Passed: 5 tests |
| `npm run typecheck` | Passed |
| `npm run lint:boundaries` | Passed |
| `npm run check:artifacts` | Passed |
| Pinned 2.0.0 versus 2.1.0 diagnostic script | Passed: 180 paired policy-version hand replays, 0 action differences |
| Full test suite, build, browser play, expert labels, Jev evaluation | Not run in this subtask |

**Next evidence:** Independently label acceptable actions and counterexamples, verify cue binding in the rendered coach, and run larger grouped comparisons with explicit Nil, bag-carryover and match contexts. Keep negative partnership results visible when evaluating any later strategy change.
