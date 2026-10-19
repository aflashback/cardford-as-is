# Standard-game implementation packets

M08/M09 engine and M10 strategy inputs for [the main plan](../../../docs/superpowers/plans/2026-10-04-multi-game-reasoning-implementation.md). **Not implemented.** Exact profiles must be recorded before a reducer, objective or public catalog depends on them. M01–M07 do not depend on the remaining Tarneeb answers.

## Tarneeb Partners: narrow rule freeze

Shared source agreement: four opposite partners, 52 distinct cards, Ace high, 13 each, counterclockwise bidding/play; bids 7–13 increase; pass permanently exits that auction; last bidder chooses a trump suit. Follow led suit if possible, otherwise any card; highest trump or led-suit card wins. See [Waraq](https://playwaraq.com/tarneeb/rules), [Tarneeb Masters](https://www.tarneeb.com/rules) and the [source conflict register](../../research/2026-10-04-card-game-architecture-interview/08-standard-rule-reconciliation.md).

Recommended single standard profile: auction winner leads; successful ordinary bidder scores tricks and opponents zero; failed ordinary bidder loses the bid and opponents score tricks; unbid sweep scores 16; bid-13 success 26, failure −16 and doubled opposing tricks. Prefer normal target 31; resolve all-pass dealer and tied/simultaneous threshold handling explicitly. These are proposed answers to the recorded source conflicts, not an owner-approved rules change. A pending owner question asks Waraq exactly versus the corroborated lead/scoring pair. If Waraq is chosen, update these arithmetic fixtures before coding; do not implement two selectable editions.

“Tarneeb Solo” has no selected individual-scoring source. The catalog adds only `tarneeb-partners` unless a distinct individual profile is supplied. One human plus a bot teammate is controller configuration, not a new competitive variant.

Create these files under `web/server/games/tarneeb/`: `state.ts`, `profile.ts`, `engine.ts`, `score.ts`, `module.ts`, `observation.ts`, `knowledge.ts`, `policy.ts`, `coaching.ts`, `schema.json`. Public DTO fragment: `web/shared/games/tarneeb.schema.json`; client adapter: `web/src/games/tarneeb.tsx`.

State holds auction participants/current bid/winner, chosen trump, trick history, private holdings, dealer, team scores and match context. Actions are distinct `tarneeb.auction.bid`, `tarneeb.auction.pass`, `tarneeb.choose-trump`, `tarneeb.play-card`; auction completion, trick collection and scoring are deterministic operations. All-pass asks for explicit new private chance material. No Spades broken-trump rule, Nil or bags.

Engine exports `tarneebModule`, `scoreTarneebRound(profile, bid, bidderTricks)` and `tarneebTrickWinner(plays, trump)`. Write `tarneeb-rules.test.ts`, `tarneeb-score.test.ts`, `tarneeb-observation.test.ts`, `tarneeb-service.test.ts`:

- repeated auction raises, permanent pass, exactly one winning bidder; first leader/direction match the frozen profile;
- all-pass redeal and dealer progression; private new deck never enters a packet;
- every trump suit, follow-suit/void/overtrump freedom, no Spades lead restriction;
- recommended scoring goldens `(bid, bidder tricks)`: `(7,8) → (8,0)`, `(7,6) → (-7,7)`, `(7,13) → (16,0)`, `(13,13) → (26,0)`, `(13,12) → (-16,2)`;
- both team totals checked only after scoring; explicit tie/continuation rule; replay/resume and private-data exclusion.

Baseline policy considers own winners, suit length, losing cards, partner auction history as uncertain context and current team commitment/score. Evaluate raises jointly with later trump choice through information-only continuation; do not select a bid assuming knowledge of partner cards. Trump conservation, teammate entry and covering the last required trick have separate reviewed cases. Every optional new preference is a named policy candidate, not automatic default promotion.

## Trix Solo and Complex Partners: Jawaker authority

**Superseded implementation scope, 7 October 2026:** [CR-GAME-001](../../decisions/CR-GAME-001-trix-four-variants.md) expands this to **Trix Basic Solo/Partners and Complex Solo/Partners**. Use the [current rules](../../../docs/rules/trix.md), [Go implementation plan](../../../docs/superpowers/plans/2026-10-07-trix-four-variants.md) and [scenario/evaluation packet](../trix/scenarios-and-evaluation.md). The TypeScript paths and two-variant tasks below are historical inputs; the queen-free fixture remains useful evidence to port through the new engine.

The recorded owner choice selects [Jawaker Trix](https://blog.jawaker.com/en/trix-rules-en/) and [Complex](https://blog.jawaker.com/en/trix-complex-en/), corroborated/clarified by their [Arabic](https://blog.jawaker.com/trix-rules/) [originals](https://blog.jawaker.com/trix-complex-rules/). Use Jack-centered layout only; no seven-centered compatibility mode. Trick ranking is Ace high; layout adjacency is its own operation.

Standard Solo has four kingdoms with five requests each. Complex Partners has four kingdoms with two requests each: combined penalties and layout, with opposite scores summed. The first kingdom belongs to the 7♥ holder; the owner selects from remaining requests after seeing the current deal. Each request consumes its own fresh deal; ownership passes right only after that kingdom's pool is exhausted.

Create under `web/server/games/trix/`: `state.ts`, `profiles.ts`, `engine.ts`, `layout.ts`, `score.ts`, `module.ts`, `observation.ts`, `knowledge.ts`, `policy.ts`, `coaching.ts`, `schema.json`. Public fragment: `web/shared/games/trix.schema.json`; client adapter: `web/src/games/trix.tsx`. Register `trix-solo` and `trix-complex-partners` separately; share mechanics, not their schedule/objective/competitor assumptions.

State records kingdom owner/index, consumed request pool, current request, private holdings, public layout bounds, trick captures, visible doubled cards, finish order and scores. **Owner amendment:** TRX-D01/D02 are resolved in the current rules. The native plan uses `declare-doubles` with a subset/empty decline, public lead-giver tracking for Solo and a seat-or-competitor ledger. Earlier separate `double-card`/`decline-double` proposals are superseded. The selected Complex profile includes doubling; it is not an optional feature silently dropped.

Historical engine exports proposed `trixSoloModule`, `trixComplexPartnersModule`, `layoutCandidates(board, hand)` and `scoreTrixCapture(profile, request, plays, taker, doubles)`; use the native four-variant plan for current interfaces. Penalties remain independent additive components: king of hearts −75, each queen −25, each diamond −10, trick −15 when applicable; layout awards 200/150/100/50. Doubled cards cost −50/−150: Partners bonus goes to the team opposite the capturer; Solo credits the announcer on another player's capture, otherwise the current/prior external leader, or nobody when none exists. Scoring therefore needs public lead provenance in addition to the historical inputs. Diamond/trick components remain ordinary.

Write `trix-rules.test.ts`, `trix-layout.test.ts`, `trix-score.test.ts`, `trix-observation.test.ts`, `trix-service.test.ts`:

- chosen request cannot repeat; 20 standard or eight Complex deals, fresh holdings each request, owner retained within kingdom and advanced right;
- no trump; follow suit; request-dependent penalties; ordinary queen trick −25, Complex Q♦ plus its trick −50, doubled Q♦ plus its trick −75 to taker with +25 routed by the confirmed competition/lead rules, or withheld in the Solo opening exception;
- empty suit accepts Jack only; board containing J accepts 10/Q, not 9/A; legal play mandatory, pass only with no extension; finished players skipped and finish score order exact;
- public doubles reveal only declared held cards after their event; original earlier packets unchanged; decline does not prove no penalty cards; save/replay the Solo lead giver and reset it at every fresh deal;
- layout pass generates adjacency constraints, never a generic suit void; future redeals do not inherit old holdings/voids;
- selection and consumed pool survive persisted resume; public board, scores and final statistics render through the shared shell.

### Concrete source-advice counterexample fixture

Create `web/server/tests/fixtures/trix-queen-free.json` with a full deal represented by these compact lists, expanding ranks in the fixture builder:

```json
{
  "south": ["C2","C3","C4","C5","C6","C7","C8","C9","C10","CJ","CK","CA","H7"],
  "west": ["CQ","D2","D3","D4","D5","D6","D7","D8","D9","D10","DJ","DQ","DK"],
  "north": ["DA","H2","H3","H4","H5","H6","H8","H9","H10","HJ","HQ","HK","HA"],
  "east": ["S2","S3","S4","S5","S6","S7","S8","S9","S10","SJ","SQ","SK","SA"]
}
```

South owns the first kingdom via H7 and chooses Queens. Run this fixture only after the selected profile confirms the kingdom owner leads that penalty request; that is the explicit opening prerequisite. South then leads CA. Counterclockwise East plays S2, North H2, West must play CQ: South captures a queen despite holding none. Use the selected no-double choices for this counterexample; test doubles separately. Assert 52-card conservation, every action's legality, winner and queen score through the engine. This falsifies a source's certainty, not a claim that another contract was optimal. If opening is different, build a reachable owner-leading prefix under that profile rather than force the action.

For planning, compare penalty risks under this deal, future fresh-deal opportunities and the remaining pool at the declared horizon. Layout policies reason about visible openings, connecting cards, blocking and partner finish order—not winning tricks. Keep unfamiliar teammate/opponent continuations and independent labels in evaluation.

## Catalog and browser gate

Before enabling a variant, require its frozen rules, strict schemas, legal/scoring/replay/visibility tests, every phase handled by code bots and coach, registered controls, persisted original analysis, restart/resume and a complete engine session. A development catalog may expose an explicitly identified local practice mode after these correctness gates; it cannot claim proven strategic strength or human teaching benefit. Hosted/multiplayer activation is outside this plan.

Create `web/e2e/multi-game.live.spec.ts` and `multi-game.config.ts`. Use real local API/server/DOM controls and dev-tools/network records; no injected player move or screenshots as decision input. Save per-variant starts, selected deals, safe player packets, actual bot analyses, cues, choices and scores. Browser correctness is separate from LLM text discovery and statistical strategy confirmation. Reconcile all starts against the campaign budget; the old Spades campaign already created six Solo/eight Partners sessions, leaving four Solo/two Partners starts under its original 10-per-mode cap if resumed.
