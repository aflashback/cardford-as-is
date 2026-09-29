# Typed Game Reasoning Implementation Plan

> **For agentic workers:** Implement task by task with failing cases before behavior changes; record exact commands and outcomes.

**Goal:** Make per-game bot and coach reasoning reviewable and finish the six partial Spades scenario families with honest evaluation.

**Architecture:** Trusted TypeScript packs own facts, objectives, tactics, cues and cases. Shared registration and tracing connect them to the real service. Bounded information-set continuations augment exact rules and authored heuristics where justified.

**Tech stack:** Node 24, strict TypeScript, Node test runner, Fastify, PostgreSQL, Playwright. No new runtime model or dependency is planned.

**Spec:** `planning/decisions/CR-STRAT-006-typed-game-reasoning.md` and `planning/proposals/2026-09-29-game-reasoning-options.md`.

## Global constraints

- Keep rules, arithmetic, legal actions, scoring and state transitions in code; no provider supplies these.
- Every strategy input is an allowlisted seat observation. The actual concealed deal is never an analysis input.
- Preserve old policy and original saved advice. Bump affected policy/trace/content versions for new behavior.
- Keep all legal candidates, stable action IDs and deterministic tie ordering.
- Current platform supports four seats with individual competition or two teams; per-game tactics do not introduce universal partner assumptions.
- Jev remains off during this implementation unless a separate promoted experiment is authorized.

## Review focus

1. A high card that wins a trick does not prove the owner of a higher unseen card; test alternate hidden deals.
2. A double-Nil cover can fail the covering player's own Nil; test both sacrifice directions.
3. A short search can waste an entry or Nil protection; test multi-trick counterexamples and truncation.
4. A bidding adjustment can improve one hand but damage a match; test score and bag carryover.
5. Catalog labels can appear without a sound choice; require an action/rubric assertion, not only scenario counts.

---

### Task 1: Freeze current behavior and register packs (GR-01)

**Files:** `web/server/strategy/index.ts`, new `web/server/strategy/registry.ts`, new `web/server/games/{hearts,spades}/reasoning/manifest.ts`, `web/server/tests/{module-seam,strategy}.test.ts`.

**Interfaces:** `ReasoningPack<Obs, Facts> = { modes, policyVersion, facts(obs), analyze(obs, facts) }`; `getPack(mode)` rejects unknown modes. `analyzeDecision` keeps its existing signature.

- [ ] Add reachable frozen decisions for bid/play/pass, including expected action and original advice. Add a test that dispatching an unsupported mode fails and each registered mode identifies its own pack; run `node --test web/server/tests/strategy.test.ts` and observe failure.
- [ ] Register typed packs with explicit mode lookup. Route the production `analyzeDecision` path through it, preserving the current action and reason for each frozen decision; run the same test until green.
- [ ] Run `npm run typecheck` and `node --test --test-isolation=none web/server/tests/{strategy,module-seam,spades-reasoning}.test.ts`. Commit the parity milestone.

### Task 2: Split scenario authoring and add a private trace (GR-02/03/07)

**Files:** `web/server/strategy/{types,spades,facts}.ts`, new `web/server/games/{spades,hearts}/reasoning/{catalog,knowledge,tactics,objectives,content}.ts`, `web/server/coaching/templates.ts`, `web/server/records/types.ts`, new catalog/trace tests.

**Interfaces:** `ScenarioDefinition = { id, modes, phase, kind, status, caseIds, cueId }`; `DecisionTrace = { schemaVersion, scenarioChecks, candidateEffects, resolution, limitations }` is private and versioned.

- [ ] Test catalog duplicate/unknown IDs, missing cue/case references and wrong variant. Run targeted catalog test red. Add validated S01–S14/P01–P12 entries and Hearts' separate descriptor; run green.
- [ ] Move Spades exact facts and tactics into game-owned files. Keep exports at old paths temporarily for compatibility. Add a candidate-effect trace showing why competing priorities selected a legal action; test deterministic equality on identical seat observations with different concealed deals.
- [ ] Preserve old saved records, immutable original advice and safe public projection. Test quiet/review behavior and a candidate whose two tactics conflict; assert the selected trace matches the explanation. Run `npm run test:all`, `npm run typecheck` and contracts/boundary checks. Commit behavior-preserving extraction.

### Task 3: Contextual bids, contracts and endgame (GR-04)

**Files:** new `web/server/games/spades/reasoning/{bidding,objectives,planning}.ts`, S13/S12/S14 cases and tests, evaluator manifest.

**Interfaces:** `assessBid(obs, bid)` returns declared heuristic assumptions and an objective comparison; `evaluateOutcome(obs, projectedResult)` uses the existing Solo/team scorer and terminal result. No numeric estimate is shown to users without calibration.

- [ ] Construct reachable pairs with the same hand but different public bids/scores; include ninth bag, tied/near-target match and ordinary opponent contract denial. Add action and forbidden-claim assertions; run red against frozen policy.
- [ ] Implement separately versioned contextual regular/Nil bid assessment. Compare deterministic table and bounded constrained-deal continuation only when its outcome is supported; track assumptions, coverage and work budget. Run S13 tests green.
- [ ] Evaluate all legal candidate plans through actual Solo/team scoring and terminal match rules. Keep nonterminal continuation value explicitly approximate. Run S12/S14 and competing-objective tests green.
- [ ] Compare old/new bidding crossed with old/new play over grouped seeds, including carryover contexts; save seeds and report subgroup results. Commit the strategy milestone.

### Task 4: Double Nil, partner signals and entries (GR-05/06)

**Files:** new `web/server/games/spades/reasoning/{nil,signals,entries}.ts`, P04/P08/P11 case files and tests, bounded continuation worker.

**Interfaces:** `inferPartnerBehavior(observation)` returns hypotheses with public evidence and counterexamples, never hidden-card facts; `compareContinuations(observation, actions, seed, budget)` returns actor-safe estimates, coverage and truncation.

- [ ] Add reachable cases for both-Nil survival/sacrifice/recovery, forced versus voluntary signals, contradictory cues, partner entry preservation, lead transfer and overruff. Watch current tactic failures first.
- [ ] Add conditional partner-policy interpretations. Hard void/ownership constraints always prevail; unfamiliar partners begin without a convention. Test same-observation hidden-hand permutations and opposite partner styles.
- [ ] Compare bounded multi-trick plans using feasible worlds, common seeds and simulated actor observations. Exhaust only genuinely small declared information sets; test actor-information invariance and deterministic seed/work count.
- [ ] Assert rotated-seat results and conflict resolution against contract/bag objectives. Commit this milestone.

### Task 5: Evidence, maintainer workflow and local play (GR-07/08)

**Files:** new casebook validator/maintainer report, `web/server/evaluation/*`, `qa/implementation/*`, affected browser tests and planning report.

**Interfaces:** a generated link report connects requirement→scenario→tactic→case→cue, with separate recognition, independent-label and strength status.

- [ ] Generate the link report and reject dangling references. Preserve independent labels, counterexamples and case-group IDs; a scenario match never changes its strength status.
- [ ] Run fresh grouped full-hand and reachable match comparisons against multiple partner/opponent policies. Report Solo, one changed seat, both changed teammates, Nil, contracts, bags, match outcomes, latency and fallback; retain failed seeds.
- [ ] Run `npm run test:all`, `npm run typecheck`, `npm run build`, `npm run contracts:check`, `npm run lint:boundaries`, `npm run check:artifacts` and the seeded evaluator. Fix observed defects and rerun affected gates.
- [ ] Play local Solo and Partners turns, cues and review; inspect that saved original advice survives UI preference changes. Publish passed/failed/blocked/not-run evidence and explicit strength limits. Commit the report.

Every task ends with a small commit of only its files and a test result in the implementation report. Application correctness and strategic benefit remain separate claims.
