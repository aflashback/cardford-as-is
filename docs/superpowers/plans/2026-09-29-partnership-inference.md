# Partnership inference implementation plan

> For agentic workers: use `superpowers:subagent-driven-development` for bounded independent tasks, or `superpowers:executing-plans` for sequential execution. Freeze the interfaces before parallel implementation. Check off only work actually completed.

**Goal:** turn the 60 authored partnership recipes into inspectable, deterministic decisions shared by bots and coach, with evidence for each deduction and explicit alternatives for uncertain interpretations.

**Architecture:** extend the existing typed game packs. Add game-owned evidence, hypotheses, tactics, objective comparisons and reachable cases; share only the record contracts, registry, validation and reporting. Start with the A♦–Q♦ family. Preserve current behavior outside each reviewed slice.

**Tech stack:** strict TypeScript, existing Node 24 reducers/test runner, existing server records/worker path and authored coaching templates. No new runtime model or framework.

**Spec:** [Partnership reasoning guide](../specs/2026-09-29-spades-partnership-reasoning-guide.md). **Requirements:** [CR-STRAT-007, PI-01–08](../../../planning/decisions/CR-STRAT-007-partnership-inference-guide.md). **Starting implementation:** `751ebc9`, `spades-tactics-2.1.0`. This plan refines unfinished GR-04–08 work; it does not mark the earlier plan's open tasks complete.

**Status:** planned. This request produced the guide, this plan and a documentation-example verifier. Runtime implementation has not started in this iteration.

## Global constraints

- Use the acting seat's information at the recorded decision. No real hidden cards, bot-private intent, future bids, later public plays or shared team belief cache.
- Rules and scores remain in existing game code. A hypothesis never changes legality or deletes a possible owner.
- Keep all legal actions. A tactic can prefer or discourage one, but only legality determines availability.
- Initial hypotheses are qualitative, versioned and revisable. No invented ownership/win percentages, universal signal convention or optimal-move claim.
- Cues on/off must produce identical internal analysis. Preserve historical advice under its original versions.
- Keep four-seat individual/two-team scope. Other games receive their own semantics; no Spades fields in the generic evidence contract.
- Jev remains off for this implementation. Its later shadow evaluation may receive allowlisted seat-safe context; its Choice confidence cannot prove a card inference or grade its own decision.
- A maintainer backend and difficulty controls remain future ideas. The first maintainer interface is source files plus a generated read-only report.
- One reviewable commit per milestone. Report passed/failed/blocked/not-run checks; respect the owner's one-hour work-session limit and report any unfinished milestone at that boundary.

## Review focus

1. A–Q does not locate K; J under Q does not prove exhaustion. Fourth-seat non-cover and second-seat non-cover have different opportunity conditions.
2. A♦ already fails a Nil-bidding partner in that history. Do not apply live-Nil cues to Q♦ afterward.
3. Correlated clues, stale hypotheses and a current winner can produce unjustified certainty.
4. “Exact score for this projection” does not establish a reachable forecast or a better continuing match position. A table total above thirteen prevents joint contract success; it does not by itself make either particular team's contract impossible.
5. Full-deal search can silently choose different plans in indistinguishable worlds. Test information identity at every simulated decision.
6. A matched scenario, a sensible cue and a passing deterministic test are different evidence from stronger play or human learning.

## Milestone 1 — Typed records and scenario authoring (PI-04/06)

**Files:** modify `web/server/strategy/{types,registry}.ts`; add `web/server/strategy/reasoning-contracts.ts`, `web/server/games/spades/reasoning/types.ts`, `web/server/games/hearts/reasoning/types.ts`, Spades `subcases.ts` and `scenarios/{honors,length,trick,trump,entries,nil,bidding,objectives,information}.ts`; add `web/server/tests/partnership-catalog.test.ts`.

**Contract:** generic `EvidenceRef`, `ScenarioDescriptor`, `HypothesisRecord`, `TacticAssessment`, `CaseRubric` and evidence-status fields. Predicates and card/objective types stay in the game module. Use discriminated game analyses or typed adapters, not unchecked casts. Do not build a text-rule interpreter.

- [ ] Freeze tests for current Hearts, Spades Solo/Partners, forced actions and historical saved advice. Add failing checks for duplicate subcase IDs, unknown parents and unresolved tactics/cues.
- [ ] Register the 60 `SP-*` IDs under their existing S/P parents. Keep broad-family recognition compatible; never rename those historical IDs. Separate recognition, fact-proof, authored-label, independent-review and outcome-evaluation status.
- [ ] Split Spades-shaped facts out of the shared analysis contract with a versioned compatibility reader. Preserve the old record shape as historical data; do not rewrite stored advice.
- [ ] Add a test-only individual pack with no bids/trump/partner fields. Assert the shared reporting/registration path accepts it without Spades defaults.
- [ ] Run `node --test --test-isolation=none web/server/tests/partnership-catalog.test.ts web/server/tests/module-seam.test.ts web/server/tests/strategy.test.ts` and `npm run typecheck`. Commit the parity and authoring milestone.

**Done when:** a maintainer can locate every recipe, its owner module and evidence state; Hearts and legacy advice remain compatible.

## Milestone 2 — Exact evidence and suit bounds (PI-01)

**Files:** modify Spades `knowledge.ts`; add `evidence.ts` and `web/server/tests/partnership-evidence.test.ts`; extend `web/server/tests/support/spades-fixtures.ts` only with reusable replay helpers.

**Contract:** `buildEvidence(observation)` returns public evidence references, `historyComplete`, conservative ownership domains and exact-or-unavailable per-seat suit bounds. Distinguish history completeness from uniquely known holdings; retain a compatibility interpretation of the existing `knowledgeComplete` field.

- [ ] Port DG-A–D from the documentation verifier into reachable fixture groups. Assert identical South evidence, K domains `{N,E,W}`, unknown East residual length, North's next lead and spades unbroken after Q.
- [ ] Implement deterministic allocation feasibility with per-card uniqueness and hand capacities. Compute minimum/maximum suit counts using a bounded exact constraint method, such as min-cost flow over card-to-seat assignments. No behavioral inputs enter this calculation. If the exact computation cannot finish, return unavailable bounds, not estimates.
- [ ] Add cases where total counts force a void or sole owner, where conservative local domains are insufficient, and where an inconsistent history rejects a certainty claim. A known but unplayed higher honor must prevent a suit-master claim. Compare small cases with brute-force enumeration.
- [ ] Add four-seat rotations, new-hand reset and hidden-deal invariance. Distinguish “cannot hold trump” from “declined to trump”.
- [ ] Run `node --test web/server/tests/partnership-evidence.test.ts` red before implementation and green afterward. Run existing observation/sampler/fact tests identified by `rg --files web/server/tests`; commit.

**Done when:** every exact claim has a valid seat-visible derivation, and the diamond counterworlds remain indistinguishable.

## Milestone 3 — Conditional opportunities and hypotheses (PI-02)

**Files:** replace/extend Spades `signals.ts`; add `opportunities.ts`, `hypotheses.ts`, related rules in `scenarios/honors.ts` and `scenarios/length.ts`; add `web/server/tests/partnership-hypotheses.test.ts`.

**Contract:** `detectOpportunities(observation, evidence)` records hypothetical legal covers, current/guaranteed trick effects, seat order and the public objective at that event. `inferHypotheses(...)` returns named propositions with alternatives, evidence groups, assumption conditions and expiry/refutation reasons.

- [ ] Write assertions for SP-H01/H02/H07/H08 and SP-L01–05: missing K, J with K retained, J last, J with 10 retained, no known convention, a forced card, and a ruff distinguished from a preference discard.
- [ ] Reconstruct each opportunity from its historical prefix. If the hypothesis is “actor held K”, test legality and consequences under that assumption; do not claim knowledge of its other cards or affordable alternatives. Respect the actor's information when reasoning about its motive.
- [ ] Implement `open/supported/weakened/refuted` by named predicates. Ordinary contract-seeking fourth-seat non-cover can support the missing-cover interpretation; live Nil/made-contract bag context weakens it. Unknown styles retain alternatives. Neither classification removes card owners.
- [ ] Group the related A–Q/missing-cover/J clues; repeated processing and duplicate evidence must be idempotent. A second independent opportunity can add an evidence reference without a fabricated confidence increase.
- [ ] Test refutation by later K exposure/void, expiry after new hand/control loss, and revised motives after Nil failure. Assert no stale tactic remains supported by cancelled evidence.
- [ ] Run `node --test web/server/tests/partnership-hypotheses.test.ts`, then typecheck. Commit a private evidence milestone; it need not change card choice yet.

**Done when:** the diamond example produces useful, auditable competing interpretations and updates them correctly.

## Milestone 4 — First actionable slice and conflict resolution (PI-03/05)

**Files:** modify Spades `policy.ts` and `entries.ts`; add `tactics.ts`, `resolution.ts`, `content.ts`; modify `web/server/coaching/templates.ts`; add `web/server/tests/partnership-diamond.test.ts`.

**First slice:** SP-H01/H02/L01/L02/W02/W04/T01/T03, plus H03 when we hold K.

- [ ] Author accepted alternatives and forbidden claims before examining the new selector's choice. Include: own K plus low diamond under partner Q; fourth-seat opponent still pending; known-void opponent with possible spades; partner void with/without possible spades; overruff before/after partner.
- [ ] Require every candidate tactic to state its immediate outcome, resource cost, served objective and continuation/cancellation condition. Preserve the current fallback where there is no supported preference.
- [ ] Replace only this slice's conflicting additive effects with named comparisons: preserve control, transfer lead, secure credit, protect Nil, avoid bag cost. Unresolved comparisons use a documented stable tie rule; never silently let duplicate clues outvote an exact consequence.
- [ ] Assert K cannot protect Q from a spade while a legally playable trump sometimes can; a known suit void changes the return plan; and a mere J follower does not have the effect of a proved void.
- [ ] Bind authored cue IDs to actual rendered templates. Assert live advice refers to South's legal turn, review can explain North's earlier lead, and neither says K ownership or a ruff is certain from the two tricks.
- [ ] Run `node --test web/server/tests/partnership-diamond.test.ts`, targeted coach/record tests and typecheck. Commit. Report actual action/cue changes; if the old selector already chose correctly, keep that choice and report the new explanation/evidence only.

**Done when:** both a bot and the coach use the same evidence-driven slice, with paired cases showing justified context sensitivity.

## Milestone 5 — Remaining tactics and adversarial casebook (PI-03/04)

**Files:** extend the nine `scenarios/*.ts` modules, Spades `casebook.ts`, `nil.ts`, `entries.ts`, `bidding.ts`, `objectives.ts`; add `cases/{entries,trump,nil,bidding,objectives}.ts` and `web/server/tests/partnership-plans.test.ts`.

- [ ] For every remaining ID, add a reachable trigger, exclusion, changed-information or changed-objective sibling, acceptable action set, unacceptable claims and concise author rationale. Reuse fixtures where they genuinely exercise multiple rows; do not count a broad tag as action validation.
- [ ] Entries/trump: compare return versus switch, unblock versus preserve entry, take-lead-to-ruff versus overruff, draw trump versus partner ruffs, establish a suit versus no route back. Add crossruff, endplay, guard-preserving discard and proposed squeeze cases with a safe-exit/entry-loss counterexample. Include opponents who decline to cooperate.
- [ ] Nil: live/failed transition, future cover resources, opponent Nil shed under our high lead, both-Nil safe survival, one unavoidable failure, no legal rescue, and Nil versus large positive contract. For no-cover cues, include fourth-seat failure and partner's unbeatable trump; for both-Nil cues, distinguish a possible from guaranteed opponent winner. Replay to the critical decision; never patch playing hands or counters to manufacture a case.
- [ ] Bids/objectives: partner positive/Nil/not-yet-bid, opponent pressure, an individually impossible team contract, table overcommitment (7 versus 7 with either still possible), bag threshold, attempted set, failed set, tied target and simultaneous target crossing. Use completed prior hands for carryover fixtures. Keep the guide's scalar scoring examples separate.
- [ ] For each proposed action, record why the counterexample does or does not reverse it. Distinguish `authored-heuristic` from `exact-local-proof`; two agents agreeing on a rule is not independent expert validation.
- [ ] Run `node --test web/server/tests/partnership-plans.test.ts` and per-family tests. Activate only rules whose prerequisites and conflicts are implemented; catalog the others as planned with their specific gap. Commit by family.

**Done when:** each implemented tactic has meaningful action and cue assertions, and unresolved multi-trick choices are isolated for Milestone 6.

## Milestone 6 — Bounded continuation for unresolved plans (PI-03/07)

**Files:** extend Spades `continuations.ts`, `objectives.ts` and `resolution.ts`; integrate with the existing strategy worker/service path after locating its current caller; add `web/server/tests/partnership-continuations.test.ts`.

- [ ] Keep the initial bound of at most four cards per seat, eight synthetic worlds and sixteen plies. If unresolved plans exceed it, retain the tested tactical fallback. Widen budgets only in a separately measured change.
- [ ] Compare the same legal candidate plans on common, deterministic feasible worlds. Add explicit counterexample-world strata for consequential hypotheses where construction is feasible; these are scenario stress cases, not posterior probabilities. Record sampler, assumptions, seed, completed/truncated work and policy versions.
- [ ] At each simulated turn, select from that actor's observation. Cache/compare by information identity, not concealed world identity. For exact small-case proofs, use one observation-dependent plan across worlds; omniscient per-world optimization cannot establish a proof.
- [ ] Gate `exact-local-proof` on exhaustive coverage of every feasible holding and every legal response by uncontrolled players through the stated horizon, or an independent analytical proof. Include an unfamiliar partner; any assumed partner policy must qualify the result. If more than eight worlds are feasible, the budget truncates, or only a baseline continuation was tried, sampled results stay heuristic. Record proof horizon and coverage separately from exact arithmetic on a synthetic outcome.
- [ ] Test worlds with identical actor observations and different concealed cards at a later continuation node. Require identical actor decisions with the same safe seed. Test root-action permutation invariance, unsupported hypotheses, inconsistent samples and truncation.
- [ ] Score complete reachable outcomes with the actual scorer. Rank settled terminal results separately from heuristic preferences among continuing matches. A sample win rate/mean is internal diagnostics, not a calibrated coach claim.
- [ ] Schedule outside database transactions with the current state/analysis version. Reject stale results, use deterministic work budgets and the existing deadline/fallback path. Quiet UI settings use the same work budget.
- [ ] Run `node --test web/server/tests/partnership-continuations.test.ts`, provider-boundary/fallback fixtures and typecheck. Commit once traces and outcomes describe the same actual selector.

**Done when:** bounded search resolves specifically named conflicts without hidden-information privilege or unsupported probability claims. General early-hand search remains a later extension if needed.

## Milestone 7 — Maintainer report and saved coaching (PI-04/05/06)

**Files:** add `web/server/evaluation/partnership-guide.ts`; extend casebook/report code, coaching/record version readers and cue registry; add `web/server/tests/partnership-report.test.ts` and relevant browser assertions.

- [ ] Generate a read-only report linking requirement → subcase → evidence/hypothesis → tactic → reachable fixture/rubric → actual cue → evaluation slice. Show failed prerequisites and unimplemented rules as gaps.
- [ ] Validate every reference, variant, version and rendered cue binding. Report orphaned entries and contradictions. Keep authoritative fixture deals and private traces out of public APIs/provider payloads.
- [ ] Add an impact mode: changing a fact selects consumers; changing a tactic selects conflicts/counterexamples; changing objectives includes bidding, Nil, bags and full-match checks. Shared infrastructure changes include the individual seam pack.
- [ ] Preserve original advice with inference/tactic/objective/content versions. Verify saved quiet-mode advice equals live-mode analysis for the same observation and does not acquire future evidence on replay.
- [ ] Run `node --test web/server/tests/partnership-report.test.ts` and `node web/server/evaluation/partnership-guide.ts --check`. Add the latter to the normal artifact gate after it exists. Commit.

**Done when:** a maintainer can review and change a single scenario without searching through unrelated weights or regenerating historical advice.

## Milestone 8 — Local verification and evidence (PI-08)

- [ ] Run `npm run test:all`, `npm run typecheck`, `npm run build`, `npm run contracts:check`, `npm run lint:boundaries`, `npm run check:artifacts`, `npm run test:ui` and the new scenario report check. Save actual commands/results and failure seeds.
- [ ] Play local Solo and Partners, including the diamond decision, Nil conflict, near-bag context, quiet hand and saved review. Confirm legal highlighting, whose turn it is, short cues and original advice retrieval. Fix observed defects and rerun affected checks.
- [ ] Freeze a diagnostic manifest before new comparisons: source/policy hashes, grouped deal IDs, objective metrics, partner/opponent styles and acceptance criteria for the intended claim. Keep rotations, counterworlds, score variants and related templates in the same group.
- [ ] Compare one changed teammate, both changed teammates, unfamiliar partner styles and Solo regression. Cross old/new bidding with old/new play to locate effects. Include actual full-match carryover; force rare scenario families in labelled stress sets and report them separately from ordinary random deals.
- [ ] Report action changes by subcase and why; outcome, contract, Nil, bags, match and compute results separately. A matrix with no changed choices does not validate a newly authored tactic. Previously inspected examples are development data, not fresh holdout.
- [ ] Complete an adversarial review of strategic rubrics and cue claims. Authored labels enable implementation and targeted testing now; independent review and fresh comparisons strengthen later playing-strength claims. Human unaided transfer requires a separate future study.
- [ ] Publish the requirement/status matrix and next unfinished item. Do not summarize all 60 as mastered if any remain only authored or recognised.

**Done when:** the implementation is reproducible, the coach's claims match its information, and the evidence identifies exactly which tactics improved, failed or remain unproven.

## Maintainer change workflow

1. Open the scenario's source entry and linked guide row.
2. Change its condition, tactic or cue; record the reason and version impact.
3. Add the counterexample that motivated the change and set evidence status honestly.
4. Run the generated impact checks, inspect candidate/claim changes, then the affected regression gates.
5. Review the diff and commit source, cases and evidence together. Roll back the pack version if needed; saved historical advice remains intact.

The first implementation deliverable is Milestones 1–4. Milestones 5–8 complete the wider guide through family-sized changes; they are not implied to fit in one hour.
