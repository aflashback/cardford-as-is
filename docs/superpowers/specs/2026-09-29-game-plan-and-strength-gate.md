# Generic game plan and strength gate — design

**Status:** design revision 2, 29 September 2026, after a six-lens adversarial review. Change record: [CR-STRAT-009](../../../planning/decisions/CR-STRAT-009-game-plan-and-strength-gate.md), which holds the requirement table and the gate decision rule. Rules, scoring, visibility and the Jev runtime boundary do not change. The live default policies do not change. No live Jev request is part of this design.

## 1. Goals and non-goals

| Goal | Evidence |
|---|---|
| Bots derive a hand-level game plan at every decision, through a contract that is generic across four-seat individual and partnership games | Spades, a Hearts seam proof and a non-card test module pass through one orchestrator |
| Freeze today's Spades policy as baseline D0 | Source snapshot, hash pin, golden-decision parity |
| Reachable cases for S13, S14, S12, P04, P08, P11 with Solo and Partners twins, blind reviewed | Engine replay in both modes; two blind agent reviews; printable packet for a human reviewer |
| Improve one family at a time: S13 bidding, then P04 double Nil, then P11 lead planning | One policy version per step, each compared with D0 and with the previous step |
| Strength gate with Solo and Partners reported separately | Margin, contract and Nil outcomes, bag penalties, cue accuracy, coach abstentions, seed-clustered intervals |
| Offline harness for a later Jev comparison | Payload builders and leakage tests; nothing is sent |

**Non-goals:** live Jev requests; player-visible percentages, grades or “best move”; running a human study; changing rule profiles; changing the live default policy; changing Hearts behaviour; a runtime scripting language; any claim of expert strength.

**Not supported by the contract, and failing closed:** sealed simultaneous steps such as the Hearts pass, a decider different from the card-holding seat, and alliances that change within a round.

## 2. Pipeline

`seat observation -> exact facts -> plan (stance, goals) -> tactical order -> bounded playouts on sampled worlds -> selection -> bot action OR coach cue`

One analysis drives bots and coach (STRAT-07). Plan and search summary are private analysis data. The coach shows authored text only.

## 3. Shared, game-agnostic layer

`web/server/strategy/plan/`, `web/server/game/kernel/competition.ts` and `web/server/evaluation/gate/`. A source scan and an import-boundary test keep game vocabulary and game imports out.

### 3.1 Competition (GP-01)

`competitionFor(mode)` returns the declared partition. `teammatesOf` and `opponentsOf` replace seat arithmetic in new code. A parity test checks the partition against the engine's scoring groups.

### 3.2 Plan (GP-02)

A plan is a pure function of the seat observation. It carries a stance, prioritised goals with exact progress, competing stances with the reason each was not chosen, and revisions.

| Field | Meaning |
|---|---|
| `stance` | The seat's current intent, derived from exact public facts |
| `goals[]` | Beneficiary, who the goal is against, horizon (`step`, `round`, `match`), status, and progress with a comparator (`at-least`, `at-most`, `exactly`) |
| `decisionKind` | `commitment` (a bid or declaration) or `play` |
| `competing[]` | Other stances and why they were not chosen |
| `revisions[]` | Stance changes along the public timeline, each with its exact trigger |
| `estimates[]` | Internal sampled estimates for the selected action |

No plan is stored between decisions, shared between teammates, or shown to another seat's coach.

**How the plan drives the decision.** The continuation policy in playouts derives each seat's stance with the same function the planner uses, so every simulated seat follows its plan. Where exact facts leave a real choice, the focal seat's alternative stance is evaluated on the same worlds. The plan's own stance is kept unless the evidence separates the alternative from it. A selected action that contradicts the stance suppresses the plan cue and is counted.

### 3.3 Estimates (GP-03)

Each estimate records event, kind, unit, horizon, allocation model, continuation policy, assumed population, worlds, effective worlds and seed, and is marked uncalibrated. This milestone delivers the event-schema check and an exact reference on small endings. Calibration and reliability reports stay open under EV-02. Estimates are never shown as percentages and never compared with Jev Choice probabilities.

### 3.4 Bounded playouts (GP-04)

- **Determinism.** The seed is a hash of a canonical decision key that excludes presentation text, event logs, mode and policy version. Solo and Partners twins and every profile see the same sampled worlds. Budgets are work counts, never wall-clock.
- **Budget.** Worlds, searched candidates, stances and total steps each have a ceiling. Candidates without playouts are recorded as not searched, never as inferior.
- **Common worlds.** Every candidate is played on the same worlds. Selection uses paired differences.
- **Actor information.** The continuation policy reads only the acting seat's own holdings and public state. A test redistributes concealed cards and asserts the move is unchanged. Residual sampling bias is a recorded limitation.
- **Equivalence.** Interchangeable actions are merged before playouts and before the comparable set.
- **Comparable set.** A candidate is comparable when its paired shortfall is at most `max(floor, z × standard error)`. The selection rule is a named, versioned constant tuned only on development seeds.
- **Fallback.** Truncated, unavailable or too-thin sampling falls back to the tactical order and records why.

### 3.5 Seam (GP-05)

`PlanningPack<Obs, Move, World>` supplies candidates in tactical order, equivalence, plan, stances, the playout model and the stance-support predicate. `decide(pack, observation, budget, rule)` is the only orchestrator. Analysis schema 1.1.0 adds plan, decision and search; schema 1.0.0 records stay readable through one reader that fails closed on unknown versions.

### 3.6 Genericity proof (GP-06)

- A hidden-token test module with an individual lowest-total variant and a partnership variant whose partition is not opposite seats.
- `hearts-plan-1.0.0`: planner and play-phase playout model, registered as a non-default profile for tests and evaluation. The pass phase keeps the baseline.
- Vocabulary scan and import-boundary test over the shared directories.

## 4. Spades pack

### 4.1 Frozen baseline (SG-01)

`reasoning/frozen/spades-tactics-2.1.0/` is a source snapshot with import specifiers rewritten, hashed over LF-normalised text, with source and snapshot hashes pinned. Shared engine modules stay live and are guarded by golden-decision parity over 48 hands. `local-baseline-1.0.0` has the same pin.

### 4.2 Playout kernel, policy and sampling (SG-02)

Integer-coded cards and per-suit masks. Terminal scoring calls the production scorer. Parity tests compare legal sets, winners and scores with the production engine. A playout hand costs about 0.01 ms.

Sampling uses uniform rejection over public constraints and falls back to the exact sampler when constraints are tight. Bid-consistency weighting multiplies a world by a declared likelihood of the public bids. It never excludes a feasible holding and is evaluated as an ablation.

### 4.3 Objective (SG-03), `spades-objective-1.0.0`

`utility = own adjusted delta − opposing reference + match term`, where the adjusted delta subtracts a bag liability of 10 per carried bag.

| Term | Solo | Partners |
|---|---|---|
| Competitor | The seat | The team |
| Opposing reference | Mean of the three other seats | The other team |
| Match term | ±500 only when the scored hand ends the match | Same |

These constants are named heuristics. The scorer is unchanged.

### 4.4 Stances

| Stance | Exact condition | Solo title | Partners title |
|---|---|---|---|
| `choose-commitment` | Bidding | Choose your contract | Choose your part of the team contract |
| `protect-own-nil` | Own Nil live | Take no tricks | Take no tricks |
| `protect-both-nils` | Own and teammate Nil live | — | Keep both Nil bids alive |
| `protect-teammate-nil` | Teammate Nil live | — | Cover your partner's Nil |
| `make-contract` | Need above 0 and reachable | Make your contract | Make the team contract |
| `salvage-hand` | Need above tricks remaining | Limit the damage | Limit the damage |
| `limit-bags` | No need, nothing to set | Avoid extra tricks | Avoid extra tricks |
| `set-opponents` | An opposing contract needs every remaining trick | Set an opposing contract | Set the opposing contract |
| `deny-tricks` | Alternative to `limit-bags` | Keep taking tricks | Keep taking tricks |

### 4.5 Profiles

| Policy version | Adds | Playouts when |
|---|---|---|
| `spades-plan-3.0.0` | Plan and cue version 2; D0 action selection | Never |
| `spades-plan-3.1.0` | S13 bidding | Bidding |
| `spades-plan-3.2.0` | P04 double Nil | Both partner Nils live |
| `spades-plan-3.3.0` | P11 lead planning | Leading a trick in Partners |
| `spades-plan-3.4.0` | Every unforced play | All unforced plays |

Profiles are selected by name. A server setting chooses one for local trial. The default stays D0.

## 5. Coach

- **COACH-12.** Every shown sentence comes from a cue whose predicate holds for the selected action. Otherwise the cue shows facts only.
- **COACH-13.** Exact goal progress may appear at Notice. The stance appears from Consider onward as one plan among others. Solo cues contain no teammate wording.
- **COACH-14.** Two recorded outcomes: `several-reasonable` when distinct choices cannot be separated, and `facts-only` when no supported explanation holds. Considered choices are named only at level 3.
- **COACH-15.** Factual sentences carry typed claims from a closed vocabulary. Checkers live in evaluation code, never import the fact builder, and treat guarantee claims as claims over every consistent world.
- Cue text moves into per-pack modules. The legacy text is kept verbatim for older policy versions. Cue version 2 applies only to the new profiles and enforces the 6/18/35-word budgets.
- `AdviceView` gains optional `outcome`, `explanation`, `consideredCards`, `consideredBids`, `evidence`, `policyVersion`, `cueVersion`.

## 6. Cases (SG-04)

- Separate store `web/server/games/spades/cases/`. The legacy casebook stays pinned to D0.
- One harvest predicate per family, a pure function of the actor's seat observation. Policy scenario tags and arm disagreement are never used to select cases.
- Natural cases come from matches generated by several styles. Rare states come from declared stress generators and carry no natural-frequency claim.
- Each case stores deal stream, generator version, generating policies, origin mode, action prefix, actor seat, partition and group ID. Twins share a group.
- Review packets are built by allowlist: seat-safe rendering and legal actions only.
- Two blind agent reviews per case, from the same model family. They are recorded as `agent-blind-reviewed`, are descriptive only, and never feed the gate decision. `independently-reviewed` stays reserved for a competent human reviewer.

## 7. Strength gate (SG-05)

- **Deals.** Unbiased shuffle on a mixed 32-bit generator. A seed ledger records every range, purpose and status, and a test rejects overlap or a second read of a confirmation range.
- **Populations.** Primary: in-match hands, where each hand starts from a state reached by a reference match stream. Secondary: zero-start hands. Guard: complete matches. Stress: declared generators per family.
- **Styles.** Built by re-weighting the frozen policy's effects plus a bid offset, with an admission test. Two styles are held out for confirmation. A random-legal style is diagnostic only.
- **Arms.** Reference D0 and candidate in the same seats, same start, same other-seat styles. Also candidate against the previous profile, and both against `local-baseline-1.0.0`.
- **Shadow comparison.** On the reference trajectory both selectors see each observation, giving eligible and changed decision counts.
- **Metrics.** Unconditional per-deal figures: margin, own points, contract points, Nil points, bags added, bag penalties, opposing contracts set. Coach metrics use every unforced evaluated-seat decision as denominator.
- **Inference.** Cluster is the seed. 10,000 resamples with a fixed seed.
- **Decision rule.** In CR-STRAT-009.

| Run | Seeds per mode |
|---|---|
| Development | 400, reusable |
| Confirmation, per profile | 1,200 unread |
| Complete matches | 200 streams |

## 8. Offline Jev harness (SG-06)

Selectors share one interface. J0 and J1 payload builders are tested for leakage. The only fixture is labelled `synthetic-fixture`, observed model “none — no live request”. J0 and J1 outcome rows read `blocked`.

## 9. Runtime

Inline profiles are analysed in the request path as today. Bounded-search profiles are analysed outside any database transaction: read the observation, compute, then commit against the decision identity and discard on mismatch (STRAT-12).

## 10. Risks

| Risk | Control |
|---|---|
| Playout policy bias | Family-by-family contrasts; held-out styles; styles not derived from the playout policy |
| Tuning on evaluation seeds | Seed ledger; one unread confirmation range per profile |
| Agent reviews mistaken for expert labels | Separate status; promotion blocked without human labels or waiver |
| Coach says less to look accurate | Fixed denominators; abstention rate reported beside accuracy |
| Search cost | Work-count budgets; measured decision time; tactical fallback |
