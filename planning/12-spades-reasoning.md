# Spades reasoning and table design

**CR-STRAT-005 · 29 September 2026 · Owner-authorized design and implementation.** Supersedes the permanent bot-only interpretation in the preceding review. Rules/scoring remain the three frozen profiles. This document governs the new reasoning work; earlier strategic prose remains supporting context.

**Partnership detail:** [CR-STRAT-007](decisions/CR-STRAT-007-partnership-inference-guide.md) adds the [60-scenario reasoning guide](../docs/superpowers/specs/2026-09-29-spades-partnership-reasoning-guide.md) and [implementation plan](../docs/superpowers/plans/2026-09-29-partnership-inference.md). These authored recipes explain hypotheses, counterexamples, decisions and cues; they do not certify partnership mastery or change the rules.

**Coverage/evaluation review:** [CR-STRAT-008](decisions/CR-STRAT-008-coverage-and-evaluation.md) adds six compound child scenarios, broadens the first acceptance batch, and links [independent discovery](../docs/superpowers/specs/2026-09-29-scenario-coverage-and-success.md) to [future probability, Jev and learning evaluations](../docs/superpowers/plans/2026-09-29-scenario-and-jev-evaluation.md). These are documentation requirements; new scenarios and numerical forecasts remain unimplemented.

**Game plan and strength gate:** [CR-STRAT-009](decisions/CR-STRAT-009-game-plan-and-strength-gate.md) freezes `spades-tactics-2.1.0` as baseline D0 and adds selectable plan profiles and a measured gate. The partial-scenario table below keeps its statuses until gate evidence and human-reviewed labels exist.

**Observed cases and browser baseline:** [CR-STRAT-010](decisions/CR-STRAT-010-observed-cases-and-browser-baseline.md) admits four narrow additions from the saved discovery hands through selectable `spades-cases-4.0.0`. It adds private original bot records and policy pinning, plus a separate real-browser comparison. This does not supersede the strength gate or promote the default. [Case ledger](../qa/experiments/2026-10-02-browser-baseline/case-ledger.md) · [maintenance guide](observed-case-maintenance.md).

## Product and information contract

- **TABLE-01:** `tableType` is independent of `mode`. `practice-bots` has human South and three bots; `human-only` is a future four-human table, unavailable until its own lifecycle/access/fair-play gate passes. Solo/partnership describes competitors, never whether seats are human.
- **TABLE-02:** Practice setup says **three trained players**, as requested. Future human-only tables omit that phrase. In partnership the opposite bot is a teammate.
- **COACH-09:** Analyze each human decision from a frozen pre-action observation regardless of cue preference. Save the analysis and original authored advice with policy version. Hidden analysis neither spends coached-hand allowance nor counts as assistance. Issuing/revealing it follows existing access and exposure rules.
- **COACH-10:** The coach sees own cards, legal actions, public bids/scores and all prior/current public plays. It never sees the actual concealed deal, bot scratchpads or future plays. A later review reuses the saved analysis; legacy decisions without it explicitly lack original analysis. User replay after starting a new game remains future scope.
- **COACH-11:** No separate live Table notes screen is required. Live cues follow preference. End-game results may show trick winners, bids/tricks, score/bags and assistance counts, with optional current-game review. Public memory can support a requested cue without permanently displaying every count.

## Reasoning structure

`safe observation -> exact facts -> solo tactical core -> partnership objective/exception layer -> legal choice + evidence -> bot action OR human cue`

**STRAT-07:** One versioned `analyzeDecision` result drives both bots and coach. `chooseAction` is a thin wrapper. Facts, heuristic interpretations and selected action remain separate. No arbitrary probabilities or claimed optimality. Retain the previous policy as a named benchmark.

**KNOW-05:** Derive played cards, void suits, outstanding ranks and conservative possible owners from allowed knowledge. Failure to follow proves a void; a lower card or a declined trump does not prove absence of a higher card/trump. An unplayed card is certainly held by a seat only when public/own knowledge excludes every other feasible owner. Incomplete constraints must widen uncertainty, never fabricate certainty. Sampling absence is not proof.

**STRAT-08:** Solo maximizes individual score under this rule profile: contract failure, Nil and bags matter more than taking every trick. Compute exact contract need and scoring thresholds. Rank legal alternatives using explicit conditional tactics for Nil, control, trump conservation, voids and safe/current winners. Unvalidated bidding remains a named heuristic with no calibrated percentages.

**STRAT-09:** Partnership reuses the card mechanics and solo tactics, then changes the objective to team score. Apply partner Nil, combined positive contract, partner control, public voids, potential ruffs/overruffs and lead transfer before selecting. Never implement partnership as a flat bonus on an already selected solo move. Both-Nil and failed-Nil states have explicit branches. Partner hints are observable plays interpreted conditionally; no secret signals between bots.

**STRAT-10:** Current winner differs from a guaranteed outcome. Prove a stronger claim only against every still-possible legal response. Saving partner Nil by overtaking can be exact even if an opponent later wins. A side-suit master may still be trumped. A king winning does not locate the ace.

## Scenario coverage

This is a decision taxonomy, not enumeration of every possible deal. The legal-action engine always supplies every legal play. E = exact rule/fact; H = tactical heuristic requiring evaluation.

| ID | Situation | Shared bot decision / coach evidence |
|---|---|---|
| S01 | Follow suit; trump unbroken; one legal action | Enforce legal set (E); forced only when complete legal set has one action. |
| S02 | Off-suit play | Record void in led suit (E); distinguish discarding from choosing not to trump. |
| S03 | Higher unplayed card / possible owner | Track possible holders (E); never infer owner from failure to win. |
| S04 | Second/third versus fourth seat | Track later actors (E); currently winning is provisional. Fourth-seat result is exact. |
| S05 | Live own Nil, legal underplay | Avoid current trick (E); unload highest safe losing card conditionally (H). |
| S06 | Live Nil, every legal card currently wins | A later actor may rescue only if a feasible response can beat a legal choice; otherwise failure is already certain (E). |
| S07 | Failed Nil | Bonus cannot recover; tricks add bags and no contract credit (E). |
| S08 | Positive contract still needs tricks | Prefer economical supported winner; assess trump exposure and future control (H). |
| S09 | Contract met / bag boundary | Compare extra-trick value, including +1 or -99 on ordinary tenth bag (E); avoiding current win is contextual (H). |
| S10 | Leading a master / developing short suit | Cash or preserve control conditional on voids/trump and objective (H). |
| S11 | Void: discard, ruff or overruff | All may be legal (E); spend trump only when objective justifies it (H). |
| S12 | Opponent Nil or contract pressure | Prefer a supported set opportunity when team/own score tradeoff warrants (H). |
| S13 | Bid and Nil choice | Consider own high-card/trump/suit structure; earlier bids are soft strength hints (H), never ownership proof. |
| S14 | Late hand / match score | Apply exact score arithmetic; uncertain match-winning tradeoffs remain ungraded. |
| P01 | Partner positive bidder currently winning | Usually conserve; consider opponent still to act and next lead (H). |
| P02 | Live Nil partner winning | Cover when possible, even after positive contract met (E current-trick protection). |
| P03 | Live Nil partner cannot be covered | State impossibility or remaining opponent rescue; never praise the winning Nil. |
| P04 | Own and partner Nil both live | Competing obligations; no universal sacrifice rule (H). |
| P05 | Partner Nil failed | No recovered bonus, no contract credit for Nil tricks (E); retain score/bag objective. |
| P06 | Partner void in led suit | Potential ruff only if trump remains possible; opponent overruff and turn order matter (H). |
| P07 | Partner proved void in Spades | No future partner ruff (E); choose leads using remaining side-suit possibilities (H). |
| P08 | Partner lead/discard/high card | Track exact public play; suit preference/control suggestion stays soft (H). King win never proves ace ownership. |
| P09 | Partner safe winner vs threatened winner | Preserve safe team winner; consider economical protection when later opponent can overtake (H). |
| P10 | Team contract, bags and opponents | Combine positive bidders only (E); team need overrides personal bid fulfillment (H). |
| P11 | Lead transfer / trump management | Preserve partner entry, exploit voids, avoid needless trump draw when partner can ruff (H). |
| P12 | Same cards in solo and partners | Same legal/factual core; opposite seat is opponent in solo (E), objective and choice may differ. |

## Jev and confidence

Jev remains the only remote strategic model. Local facts/tactics work without it. A promoted Jev selector may compare the same candidates and supplied evidence; it cannot invent hidden cards or generate teaching rationales. Choice concentration is not probability of winning, correctness or card ownership. Store provider confidence for evaluation only. Confidence shown to users requires separately calibrated outcome evidence. No live Jev request, cap reset or promotion is authorized by this reasoning change; the existing rejected-response investigation remains a prerequisite.

## Persistence and compatibility

Internal analysis schema 1.0.0 stores policy version, source (`code`/`forced`), selected action, scenario IDs, exact/heuristic reasons, facts, candidate assessments and limitations. Store complete authored advice beside it so historical wording cannot drift. Existing public AdviceView remains the projection contract; private analysis is never sent wholesale. Existing records without analysis remain readable, but missing original analysis is explicit. No rescoring or rule-profile migration.

## Acceptance and evaluation

- Reachable complete deals and legal action prefixes prove scenario cases; scalar scoring tests remain valid for arithmetic.
- Test solo first, then partnership on paired information-equivalent positions, hidden-hand permutations and rotated seats.
- Bots and coach must share choice/reason IDs. Cue preferences never alter analysis. Unshown analysis never marks assistance or consumes allowance.
- Run full seeded hands against frozen baseline and contrasting policies; retain seeds, score, contracts, Nil, bags, legal transitions and scenario coverage. Report per mode. Self-play and smoke results do not establish expert strength or mastery.
- Validate local UI solo and partnership turns, cues and review. Fix observed defects and rerun affected checks within the one-hour owner limit.


## Delivery boundary for this change

Implemented: exact knowledge constraints; current/guaranteed trick outcomes; shared conditional Solo and Partners tactics; versioned saved human advice; concise scenario cues; final-hand results at match end. This is a tested tactical foundation, not a declaration of partnership mastery or optimal advice.

The following remain explicit partial scenarios:

| Scenario | Current behavior | Remaining work |
|---|---|---|
| S13 | Retained hand-structure bidder; public bids are recorded | Contextual bidding and calibrated Nil choice |
| S14 | Exact score/bag facts and late-game label | Match-winning objective and remaining-hand search |
| S12 | Pressure live opposing Nil | Evaluate ordinary opponent contract denial and deliberate bagging |
| P04 | Recognize both live Nils; conservative survival/cover priorities | Independently evaluated sacrifice tradeoffs |
| P08 | Public voids/ranks constrain every decision; leads/discards retained | Validated soft partner signals and declared conventions |
| P11 | Conserve potential partner ruffing trump | Plan multi-trick lead transfers and entries |

**Next strength gate:** independently label adversarial examples for these partial scenarios, compare against multiple opponent styles on fresh deal groups, and evaluate a bounded information-set selector (code/search or Jev) using only seat-safe facts. Promote only if partnership outcomes and factual explanations improve. Choice confidence alone cannot pass this gate.
## Implementation sequence

1. Freeze this contract and research findings; retain current baseline.
2. Implement fact builder and solo policy, then partnership overlays and scenario reasons.
3. Persist unseen human analysis and reuse original advice on authorized review.
4. Add reachable scenario tests, full-hand evaluation and end-game public results.
5. Run regression, local browser play and independent review; publish concise evidence and remaining gaps.

## Checked sources and implications

| Source | Finding used |
|---|---|
| [Pagat Spades](https://www.pagat.com/auctionwhist/spades.html) | Variants differ; its named Solo mandatory-beating rule does not replace our optional-trump frozen profile. |
| [Bidding in Spades](https://arxiv.org/html/1912.11323v2) | Contextual bidding and Nil require separate evaluation. Main measured results concern partnership; no imported universal coefficients or undeclared signaling convention. |
| [Commercial Spades hybrid, AIIDE 2013](https://edpowley.com/academic/papers/aiide13.pdf) | Evaluate tactics with information-set search; isolate Nil results and partner-resource mistakes. Its surrogate bag utility does not replace our scorer. |
| [AI Factory hand inference](https://www.aifactory.co.uk/newsletter/2018_02_opponent_hand.htm) | Separate hard exclusions from uncertain behavioral inference. |
| [AI Factory analysis workflow](https://aifactory.co.uk/newsletter/2020_01_credible_analysis.htm) | Repeated policy agreement does not independently validate advice. |
| [TypeSafe confidence](https://docs.typesafe.ai/confidence) | Choice confidence describes distribution concentration; no direct card-ownership or win-probability meaning. |

Alternatives considered: Jev-only reasoning leaves deductions unauditable; full search requires separately validated policies and compute budgets. Selected first implementation: exact public facts plus explicit conditional tactics, saved analyses, independent scenario fixtures and measured baseline comparison. Search/Jev promotion remains gated by evidence.
