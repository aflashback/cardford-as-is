# Trix decision cases and evaluation packet

**Planning only — no fixtures executed or strength measured.** Applies to all four profiles in [the rules](../../../docs/rules/trix.md), under [the implementation plan](../../../docs/superpowers/plans/2026-10-07-trix-four-variants.md). This extends the deterministic feedback lab; it does not require an LLM to play a seat.

## 1. Reusable structure, game-owned meaning

Proposed locations:

- `server/internal/games/trix/reasoning/`: typed predicates, features, candidate priorities and versioned parameters.
- `server/internal/games/trix/coaching/`: original short cues that use the same analysis/evidence.
- `server/internal/games/trix/testdata/`: private 52-card deals, legal prefixes and mechanical expected results.
- `planning/implementation/trix/cases/`: maintainers' case notes, one named family per file; stable IDs below.
- `qa/implementation/trix/`: immutable run manifests, private trajectories, actor-only review packets, reports and policy versions.

Each case record links **ID/version → applicable variants/phases → public trigger → candidate alternatives → intended reason → counterexample → fixture/prefix → predicate/cue IDs → evidence status**. Include objective/horizon, failure conditions, source provenance, author, change record and review status. A case note may propose a useful rule without declaring an answer proven.

Fixture manifests include the complete deck, owner/start context, validated prefix and expected rule outcomes. Only the referee reads this artifact. Export a separate actor packet without fixture names that reveal a trap, other hands, future results or private seeds. Keep mechanical goldens separate from reviewer acceptable-action sets and policy-selected actions.

Code implements predicates; JSON/YAML catalogs describe cases, tests and authored constants. They cannot introduce executable rules or silently change production behavior. A generated coverage page links each case to code, positive/negative tests, last observed activation and current evidence status. Missing links fail catalog validation; numerical win rates alone do not mark a case resolved.

## 2. Initial coverage: 24 families

Each family needs at least a positive fixture and a refuting/contrast fixture, with complete legal prefixes. These **48 planned cases are a starting coverage floor**, not a claim of exhaustive play or statistical adequacy. Apply both competition modes where listed; do not count four renamed copies as four independent situations.

| ID | Situation / useful decision | Contrast that prevents a brittle rule | Coach wording example |
|---|---|---|---|
| TX-01 | Choose among remaining requests using own hand, exits and owner lead | Queen-free hand can still capture queens; compare low-exit availability | “Having no queens does not stop you taking one.” |
| TX-02 | Save a request for a later fresh deal versus use it now | Last remaining request leaves no choice; unknown future hand is not promised | “This is your last available game in this round.” |
| TX-03 | Diamonds: count exposed diamonds and safe low follow cards | Short diamonds can become a useful way to discard; length alone is not risk | “This low diamond may help you avoid the lead later.” |
| TX-04 | Lutoosh: dispose of a high card beneath an unbeatable led card | The proposed high card instead overtakes while a lower card loses, or keeping it improves a later continuation | “You can lose this trick while getting rid of a high card.” |
| TX-05 | Queens: release a queen onto a secured opposing trick | Leading a queen or playing before a higher follower is not the same position | “This queen goes to the opponent only if they keep the lead.” |
| TX-06 | The King: keep a route to discard K♥ | Many hearts/no other-suit exit can leave K♥ trapped | “You still need a way to get rid of the king.” |
| TX-07 | Decide which held cards to double | Decline remains legal; self/team capture costs double and can reward an opponent, while revealing the card changes their choices | “Doubling this queen risks a 50-point loss and a bonus for the other team.” |
| TX-08 | Route each double bonus using competition and public lead history | Own/partner capture does not cancel the penalty; Solo opening self-capture may give nobody a bonus | “Leo last handed you the lead, so he gets the queen's 25-point bonus.” Only use this cue when public evidence identifies Leo. |
| TX-09 | Complex: compare all additive penalties | A diamond without Q/K♥ still costs points; Q♦ has two card components | “This trick costs points for the trick, diamonds and queen.” |
| TX-10 | Complex: accept a smaller loss to avoid a larger later capture | Greedy lowest immediate penalty can leave a forced expensive ending | “Taking these points may leave a safer last few cards.” |
| TX-11 | Use exact void evidence after failure to follow suit | A voluntary low card or high discard alone does not prove a void | “They showed they have no clubs left.” |
| TX-12 | Track remaining higher cards and actor order | A high card winning does not prove its teammate holds the missing higher card | “The king is still unseen; its owner is unknown.” |
| TX-13 | Lead/exit planning over several tricks | A safe card today can surrender the only later way out | “Keeping one low card gives you another chance to lose the lead.” |
| TX-14 | Partners: route penalties away from teammate | A teammate capturing your doubled card still costs double and rewards the other team; later seats can change the winner | “Your partner taking this doubled queen costs your team 50 and gives the other team 25.” |
| TX-15 | Partners: take control to release teammate's dangerous cards | A safe exit is required; taking the teammate's doubled card is not safe disposal | “Taking the lead helps only if your next play helps your partner.” |
| TX-16 | Soft partner signals from repeated suit choices | Same public plays must allow plausible alternate hidden hands and intentions | “That play may be an invitation; it is not proof.” |
| TX-17 | Layout: open a Jack versus extend an existing suit | Mandatory play forbids passing to keep a Jack; opening can free opponents | “Opening this suit also gives other players more options.” |
| TX-18 | Layout: unblock own long chain with a connecting card | A distant high/low card stays blocked until every gap is filled | “This card opens a path to the cards behind it.” |
| TX-19 | Layout: use a pass as an exact, time-stamped constraint | A board extension changes what is playable; pass is not a suit void | “They could not extend the board on that turn.” |
| TX-20 | Layout: deny an opponent's finish while making progress | A small card count does not reveal the last card; don't claim certainty | “They have one card left, but we do not know which one.” |
| TX-21 | Layout Partners: help teammate's finish when team total improves | Own first+partner fourth ties opponents second+third; own rank alone misleads | “Your team's two finishing places decide the points.” |
| TX-22 | Layout: finish/skip/pass sequence and last active seat | Last active seat can have several legal frontiers; no extra award or infinite pass cycle | “Only one placement is possible” only when legal-choice count is exactly one. |
| TX-23 | Endgame: current totals and requests left change objective | Leading competitor may prefer lower risk; a cutoff is not a proved match win | “The points still available matter more than this one trick.” |
| TX-24 | Reset knowledge on a new deal; preserve kingdom/score context | Yesterday's suit void and held reveal no longer describe this hand | “These are new cards; earlier suit clues no longer apply.” |

No-trump games favor avoiding some captures, unlike Spades' bid fulfillment. Shared card-count utilities may be reused; the tactic direction and score objective belong to Trix. Basic penalty requests need not treat taking a harmless trick as a loss. Partners do not share hidden hands or private plans.

### Doubling discriminators — planned unit cases

These are scoring/public-history expectations, not complete dealt fixtures or executed engine tests. Unless stated otherwise, use a doubled queen (v=25); run the corresponding king cases with v=75. Each card costs its taker −2v, without an additional reversed debit.

| ID | Input / public sequence | Expected bonus and check |
|---|---|---|
| TX-D01 | Solo: Maya announces; Leo captures on Sarah's lead | Maya +v; leader irrelevant when someone else captures |
| TX-D02 | Partners: Maya announces; opposing Leo captures | Maya's team +v; Leo's team −2v |
| TX-D03 | Partners: Maya announces and captures | Other team +v; Maya's team −2v |
| TX-D04 | Partners: Maya announces; her partner captures | Same team/bonus result as D03; no seat assigned the team credit |
| TX-D05 | Solo: Maya announces/captures on Leo's lead; stored prior giver was Sarah | Leo +v; current external leader replaces Sarah before scoring |
| TX-D06 | Solo: Leo leads, Maya wins, then wins two own leads and self-captures | Leo +v; preserve giver through consecutive own leads |
| TX-D07 | Solo: after D06's lead transfer, Maya loses the lead and later wins on Sarah's lead, then self-captures | Sarah +v, not Leo; latest external lead replaces earlier giver |
| TX-D08 | New deal after a prior Leo→Maya transfer; Maya leads/wins from opening and self-captures | No bonus; no giver carries between deals |
| TX-D09 | Solo opening streak: self-capture own doubled Q♦ and K♥ in separate Complex tricks, no prior giver and no other penalty cards in those tricks | Taker −75 then −165, total −240; bonuses 25+75 withheld; no extra −100 debit. Never put two held cards from one seat into one trick. |
| TX-D10 | Solo: Maya takes own doubled Q♦ and Leo's doubled K♥ on her lead, with Sarah as prior giver | Maya −225; Sarah +25; Leo +75; net −125 |
| TX-D11 | Same mixed-announcer trick as D10, but Maya has no prior giver | Maya −225; Leo +75; queen bonus 25 withheld; net −150 |
| TX-D12 | Doubled Q♦ captured in Complex, any competition | Taker −75; route +25 by the rules or withhold for Solo opening; diamond −10 and trick −15 remain ordinary |

For D05–D11, save/reopen between tricks and before scoring; replay must reproduce recipients and source references. Retries apply each entry once. Coach tests assert the same recipient, amount and public reason; no-bonus cues explicitly say nobody receives a bonus. Full engine fixtures must later supply complete 52-card deals and legal prefixes for these cases.

The revised ledger targets seats or competitors. Track missing credits separately with reason `no_previous_external_leader`. Across all penalty requests of a Basic kingdom or one Complex penalty deal, Partners sums −500; Solo sums −500−W (W = withheld bonuses). Layout adds 500, so a Partners kingdom totals 0 and a Solo kingdom totals −W. Apply the same scoped W sum across a whole session; never normalize it away to force zero-sum Solo results.

## 3. Deterministic decision pipeline

1. Enumerate **all legal choices** from the typed observation: request, double subset, penalty card, layout card or pass. Identify forced choices exactly.
2. Compute proven facts and exact immediate score effects, including bonus recipients, direct team credits and publicly derived lead-giver history. Keep behavioral interpretations separate with their assumptions and counterexamples.
3. Apply a complete, inexpensive Trix baseline across every phase. Pin deterministic tie-breaking and every parameter; do not use the sorted first card as the normal strategy.
4. For the improved policy, evaluate all candidates on the **same feasible synthetic worlds** derived from the actor view. Each future seat chooses through its own synthetic observation, without inheriting the root player's hidden cards. Do not let perfect-information search choose future seat moves.
5. Start with a request-end horizon. For request choice, compare current-request payoff plus an explicitly versioned remaining-pool estimate from synthetic future deals; otherwise saving/using requests has no planned meaning. Later extend to kingdom-end and complete-session evaluation with measured budgets. Sampled continuations are possible futures, not predictions of the saved deal.
6. Keep terminal session outcomes distinct from cutoff score estimates. Solo considers own final standing and points; Partners considers team standing and aggregate points. Declare the finite-horizon comparator and tie handling before a run. Score-sensitive changes are candidates until evaluated.
7. Save selected candidate, alternatives, reason IDs, fact references, estimate assumptions, budget/horizon and policy/cue versions once. Bots commit that choice; coach renders that same result. Optional search exhaustion uses only a **predeclared baseline inside the same policy** and records that path. Operational cancellation publishes no machine-dependent partial choice.

Use the existing generic Go rollout/knowledge types, adding Trix-owned sampler and continuation adapters. Constraint sampling must respect public reveals, initial-owner H7 ownership in deal one, hand counts, observed follow-suit failures and layout-pass chronology. H7 ownership is not known merely from the retained kingdom owner on later deals. Baseline priors are explicit assumptions, not learned expertise. Bounded exhaustive endgames may establish exact results only when the actor information actually makes them exact; synthetic perfect-information solutions do not become real-game proof.

## 4. Evaluation sequence and stop conditions

| Stage | Planned work | What passing would establish |
|---|---|---|
| Mechanics | Full 52-card fixtures, properties, all four complete-session paths, invalid actions and replay | Rule correctness, not strength |
| Coverage | At least the 48 paired cases above; suit changes only where rules allow them, rotated seats/owners, score contexts and unseen distributions | Cases activate and counterexamples are handled; no general-strength claim |
| Development baseline | 8 distinct full-session seed families per variant × 4 seat placements × 2 paired arms = 64 trajectories per variant, 256 total, with one changed seat. Separate both-changed-teammates manifests add 64 per Partners variant, 128 more (384 total proposed trajectories) | Reproducible development estimate; not independent confirmation |
| Independent confirmation | Freeze policy/cases first; hold out unseen deal families and opponent policies. Size from development variance and a predeclared meaningful improvement | Separate per-variant evidence for promotion; no pooling away a weak variant |
| Browser integration | Initially 2 complete sessions per variant (8 total), including chosen fixtures and normal deals, one human-interface driver plus three production code bots | Real catalog, controls, advice, restart and result integration; not a strength sample |
| Human review | Blinded acceptable-action sets and cue usefulness on actor-only packets; later learning study | Expert/learner evidence, separately reported |

The development workload is a proposed bounded offline campaign, not authorization to run a long batch now. Checkpoint runs at most every 20 minutes; retain failures and partial sessions as incomplete, not losses or omitted data. Rotate teams as teams and evaluate one changed seat and both changed teammates as separate deployments. Basic's 20 deals and Complex's 8 are **one session each**, not 20/8 independent samples.

Report legal/replay/privacy errors (must be zero), policy-coach disagreement (must be zero), case activation, move differences, fulfilled review labels, points/standing by variant and seed family, doubled-card transfers and withheld bonuses with lead provenance, layout finish/team placements, search coverage, latency and cue support. Use family-clustered uncertainty; do not inflate sample size from tricks/decisions/seat rotations. Predeclare tie share, failure handling, effect threshold and confidence method before opening confirmation outcomes. Solo's withheld bonuses make its total variable; evaluate actual scores without assuming constant-sum rewards.

Stop promotion for any rule/privacy error, unsupported factual cue, untracked policy version or new deterministic regression. If moves/outcomes are unchanged, report parity and return to cases that actually activate. Offline LLM reviewers may propose critiques; they neither control seats nor supply independent human labels. Jev comparison is outside this plan under CR-STRAT-011.

## 5. Browser and saved-evidence boundary

Use DOM/accessibility and network/devtools observations. The driver sees only the player's view; the recorder can store private authoritative data separately but must not cue the player. Record real production bot decisions and original coach outputs, accepted commands, request score rows, full-session outcomes and denied actions. Label these **native-browser sessions**, distinct from older text-agent discovery hands and headless engine experiments. Do not mutate a running state to manufacture a case; use the native selected-deal launcher and legal-prefix replay **to be built in T03**. The current Go client rejects selected deals; the older launcher is not native Trix support.
