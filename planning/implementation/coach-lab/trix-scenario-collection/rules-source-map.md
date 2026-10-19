# Native Trix source map for offline scenario collection

Status: planning and reviewed source guide, 10 October 2026. This document describes the current checked-out Go engine. It adds no rule engine, runner, provider dependency, production behavior or completed experiment. The owner's offline four-seat model action-selection scope applies only to this proposed collection; production bots and coach retain their deterministic boundary. No games or provider calls were run for this audit.

## Collection units and installed pins

Collect independent penalty requests in this order: Basic Solo, Complex Solo, Basic Partners, Complex Partners. Basic units select `diamonds`, `king`, `queens` or `lutoosh`; Complex units select `complex`. “Collections” means the native `lutoosh` request. Trix Jacks is excluded from collected units; its internal ID is `trix`. The Basic engine pool includes all five requests and the Complex pool includes `complex` and `trix`; these are native schedule facts, not permission to collect layout games ([engine.go](../../../../server/internal/games/trix/engine.go), lines 13 and 53–58).

| Variant | Mode | Current rule profile |
|---|---|---|
| `basic-solo` | `trix-basic-solo` | `trix-basic-solo-1.0.0` |
| `complex-solo` | `trix-complex-solo` | `trix-complex-solo-1.0.0` |
| `basic-partners` | `trix-basic-partners` | `trix-basic-partners-1.1.0` |
| `complex-partners` | `trix-complex-partners` | `trix-complex-partners-1.1.0` |

For all four current registrations: `gameId=trix`, `moduleVersion=2.2.0`, `stateSchemaVersion=1.2.0`, `observationSchemaVersion=1.2.0`, `publicSchemaVersion=1.2.0`, `eventSchemaVersion=1.0.0`. Resolve current registrations by the complete `Pin(variant)` and `Historical=false`, rather than the variant alone: `Installations()` also returns historical registrations. Current config uses `layoutHistoryVersion=1.0.0`; Partners additionally uses `profileVersion=1.1.0`, while Solo leaves profileVersion empty ([session.go](../../../../server/internal/games/trix/session.go), lines 40–69 and 109–158; [chronology.go](../../../../server/internal/games/trix/chronology.go), line 9). These fields establish exact installed identity even though no layout request is collected.

The module/schema headline in [the rule document](../../../../docs/rules/trix.md), line 9, predates the current code. Its rule amounts and turn semantics remain consistent with this audit. Do not copy its older module/schema pins into a new run. Record the source commit and dirty-tree content hashes at future run admission; this audit did not establish a clean committed snapshot.

## Cards, seats and actor projection

Native cards are suit-first strings: `C2` through `CA`, `D2` through `DA`, `H2` through `HA`, `S2` through `SA`; ten is `10`, never `T`. Rank order is `2 < 3 < … < 10 < J < Q < K < A`. Model-facing glyphs are display aliases only: `C→♣`, `D→♦`, `H→♥`, `S→♠`, so `HK→K♥`, `DQ→Q♦`, `C10→10♣`. Preserve native strings inside action IDs and persisted engine data ([engine.go](../../../../server/internal/games/trix/engine.go), lines 67–97).

| Native seat | Table name | Partners competitor | Rightward next seat |
|---|---|---|---|
| 0 | South | NS | 3, East |
| 1 | West | EW | 0, South |
| 2 | North | NS | 1, West |
| 3 | East | EW | 2, North |

Thus turns go `0→3→2→1→0`, using `(seat+3)%4`. Opposite teammates are `(seat+2)%4`. Solo has `seat-0` through `seat-3`; it has no teammate ([engine.go](../../../../server/internal/games/trix/engine.go), line 51; [score.go](../../../../server/internal/games/trix/score.go), lines 6–10 and 67–75; [rules](../../../../docs/rules/trix.md), line 25). For this initialization's first deal, public owner identity establishes the H7 holder until that card is played. That is legitimate public knowledge. It must not be generalized to later native deals, where H7 no longer selects the owner ([rules](../../../../docs/rules/trix.md), line 23).

The only model-visible hand is `Observe(state, actorSeat).hand`. Its public fields include current turn/request, hand counts, current and completed tricks, declarations, ledger, withheld bonuses and last external leaders. `Observe` constructs the projection by allowlisting; it does not serialize State and remove secrets ([observation.go](../../../../server/internal/games/trix/observation.go), lines 3–45; [dto.go](../../../../server/internal/games/trix/dto.go), lines 97–127). Never put `State.Hands`, private deck/deal seeds, fixtureDeals, chance material, replay commands, other seats' prompts/responses or private reasoning into the actor request. Native private events can contain deals and must not be forwarded ([session.go](../../../../server/internal/games/trix/session.go), lines 444–446).

The source contract fragment is [trix.schema.json](../../../../web/shared/games/trix.schema.json): `TrixAction` starts at line 5, `TrixObservation` at 527 and `TrixActorPacket` at 797. Registered packet generation emits public schema version, game/variant/seat/phase, observation, and legal candidates with IDs and public action values ([session.go](../../../../server/internal/games/trix/session.go), lines 386–395). A smaller model input is a separately versioned, allowlisted offline projection, not a falsely labelled native `TrixActorPacket` with required fields silently removed.

For isolated-request prompts, expose the selected request and request-local scoring/history. Omit kingdom choice strategy, unrelated remaining-request pool, prior kingdom totals and unrelated layout fields from the separately defined model projection. Retain unchanged native initialization context privately in run provenance. Native observations can still contain `remainingRequests` including `trix`; the collector's scope does not rewrite that pool. Keep collection `unitKind=isolated-request` and collection ordinals separate from native kingdom/deal numbers.

## Legal actions and ordinary play

The engine generates legal choices; the model returns displayed card(s), and the coordinator maps that response uniquely to one enumerated candidate ID. Never ask the model to establish legality. Action IDs are `choose:<request>`, `doubles:<comma-separated-native-cards>` and `play:<native-card>`. Empty declaration is exactly `doubles:`. Compare a returned declaration subset as a set, reject duplicates, then use the enumerated candidate's canonical action value and order directly; rebuilding its payload in a different order can fail exact action equality ([engine.go](../../../../server/internal/games/trix/engine.go), lines 231–245 and 419–422).

During `playing`, follow led suit if held; otherwise any held card is legal. Highest card of the led suit wins, with Ace high and no trump; the winner leads next. The current profile has no duty to beat, no mandatory penalty discard, no special obligation to play K♥ when void, and no restriction on leading hearts. A king-containing hand can have several legal choices. “Forced” means exactly one engine candidate, not a model claim that K♥ ought to be played ([engine.go](../../../../server/internal/games/trix/engine.go), lines 246–284 and 442–449; [rules](../../../../docs/rules/trix.md), line 31).

Every penalty request plays exactly thirteen complete four-card tricks, including King after K♥ is captured, Queens after all queens are captured, and Diamonds after all diamonds are captured. The reducer enters `round-complete` only after trick thirteen; validation rejects an unfinished penalty boundary ([engine.go](../../../../server/internal/games/trix/validation.go), lines 53–60; [engine.go](../../../../server/internal/games/trix/engine.go), lines 369–384; [rules](../../../../docs/rules/trix.md), line 41). This campaign still invokes the assigned player for a sole legal candidate and saves its short forced-move rationale; forced decisions do not fill strategic case quotas.

## Scoring and public doubles

| Request/component | Ordinary capturing-seat debit | Doubled card debit | Bonus |
|---|---:|---:|---:|
| Diamonds: each diamond | −10 | Ineligible | None |
| Lutoosh/collections: each trick | −15 | Ineligible | None |
| Queens: each queen | −25 | −50 | +25 |
| King: K♥ only | −75 | −150 | +75 |
| Complex | All applicable components add | Queen/K♥ component only doubles | Per declared card |

Authority: [score.go](../../../../server/internal/games/trix/score.go), lines 15–47. Doubling replaces the ordinary queen/king debit; do not add a second ordinary debit. In Complex a doubled Q♦ still incurs its separate −10 diamond and −15 trick components: a trick with that as its only penalty card costs the taker −75, with a +25 bonus routed below. Score every card independently; several doubled cards in one trick can have different announcers. No Hearts point system, trump, or shoot-the-moon rule applies.

Queens, King and Complex use four public, sequential declaration turns before first play, beginning at the owner then moving right. Each holder declares any subset of eligible cards, including empty. A Complex holder can have five eligible cards, hence at most 32 choices. Queens are eligible only in Queens/Complex; K♥ only in King/Complex. No declaration occurs in Diamonds or Lutoosh. All seats take a declaration turn, and a seat with no eligible cards has forced empty declaration. Earlier declarations are visible to later declarers; decline does not establish absence of eligible cards. After the fourth declaration, owner starts play ([engine.go](../../../../server/internal/games/trix/engine.go), lines 219–220, 256–271 and 345–368; [rules](../../../../docs/rules/trix.md), lines 49–52).

| Competition / doubled-card capture | Bonus recipient |
|---|---|
| Partners, any capture | Team opposite the capturing team |
| Solo, capturer differs from announcer | Announcer |
| Solo, announcer captures on another seat's lead | Current trick leader |
| Solo, announcer leads and captures, prior external leader recorded | Last seat that handed this capturer the lead in this deal |
| Solo, announcer leads and captures, no prior external leader | No recipient; record withheld bonus |

Authority: [score.go](../../../../server/internal/games/trix/score.go), lines 47–64. Partners routing includes own-team captures: announcer or teammate captures doubled queen → capturing team −50, opposing team +25; doubled K♥ → capturing team −150, opposing team +75. Team debit is a capturing-seat ledger entry; bonus is a direct competitor entry. Sum seat and competitor entries exactly once ([score.go](../../../../server/internal/games/trix/score.go), lines 67–94). Do not credit a fictional teammate or cancel own-team capture back to ordinary points.

On trick completion with `leader != winner`, update `LastExternalLeader[winner]={seat:leader,trick:number}` before scoring. Self-led wins preserve the saved source; fresh dealing resets all four sources. A no-source self-capture records `reason=no_previous_external_leader`; the doubled debit remains and no extra debit or bonus is invented ([engine.go](../../../../server/internal/games/trix/engine.go), lines 211 and 373–378; [score.go](../../../../server/internal/games/trix/score.go), lines 54–64). This is public provenance, not private information.

Arithmetic checks for future collection validation: Diamonds total −130; Lutoosh −195; Queens −100; King −75; a complete Complex request totals −500 across competitors before withheld-bonus adjustment. Doubled debits plus credited bonuses retain ordinary global totals; Solo totals additionally subtract withheld bonus values. Partners Complex always totals −500. These are arithmetic expectations from the reducer, not games run for this source audit.

For request-end comparison, the existing native offline evaluator uses own-team score minus opposing-team score for Partners, and own seat score minus mean opponent scores for Solo. It explicitly excludes future pool/kingdom value ([evaluation.go](../../../../server/internal/games/trix/evaluation.go), lines 111–119 and 219–235). Preserve raw engine request totals alongside any chosen evaluation metric; model self-play outcomes do not by themselves prove strategy strength.

## Legal initialization and isolated-request completion

1. Prepare a complete validated 52-card deck privately. The native New/deal path partitions deck into consecutive seat blocks of thirteen, sorts hands, assigns the first H7 holder as kingdom owner, and initializes kingdom/deal 1 with the full native request pool ([engine.go](../../../../server/internal/games/trix/engine.go), lines 170–217). To balance opening seats across independent collection units, prepare deck seat assignments that place H7 with the intended owner; do not overwrite owner after initialization.
2. Select the current exact-pin registration and call its `Start` with `Config{id,variant}` and `Chance{deck}`. Registration supplies current profile/history config and validates input. Avoid `FixtureID`/`FixtureDeals` for one request: that fixture facility requires a complete 20- or 8-deal schedule ([session.go](../../../../server/internal/games/trix/session.go), lines 138–158; [engine.go](../../../../server/internal/games/trix/engine.go), lines 499–510).
3. At the initial `choose-request` node, orchestration commits the configured legal `choose:<request>` at the engine-assigned owner. This is a collector-selected request admission, not a model kingdom choice. Basic request admits one of `diamonds/lutoosh/queens/king`; Complex admits `complex` only. Use native Commit/Apply; never fabricate a `playing` State, alter `RemainingRequests`, or map Basic requests into a Complex pin.
4. Iterate native actor nodes. Prepare only the acting seat's observation and current legal candidates. Resolve a validated selected candidate through native Commit/Apply; the reducer checks both ID and complete action equality before mutation ([engine.go](../../../../server/internal/games/trix/engine.go), lines 322–335).
5. Stop at the first `round-complete`, after all thirteen tricks. Read the engine request ledger/totals and mark the collection unit complete. Preserve the native phase and request context. Do not call `Continue`, supply another deal, select Jacks, set `session-complete`, or claim a kingdom/full-session outcome. Native Continue starts a new chance node unless an actual full four-kingdom schedule is exhausted ([engine.go](../../../../server/internal/games/trix/engine.go), lines 451–486; [session.go](../../../../server/internal/games/trix/session.go), lines 257–275).

This procedure avoids mixed schedule semantics while preserving an honest native state: each collection unit is a completed selected request at the first round boundary of a newly initialized native session, not a shortened native Trix session or altered rule profile.
