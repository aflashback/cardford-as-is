# Evidence and variant research

Checked 4 October 2026 against source `09b4903`. Links below are the inputs; proposed capabilities are not implemented support.

## What exists versus what the experiments establish

| Item | Verified state | Remaining gap |
|---|---|---|
| Playable catalog | Hearts Solo, Spades Solo/Partners | No Tarneeb or Trix module |
| Production game boundary | Combined engine/state/observations; flat view intentionally frozen for local V1 | Generic `GameModule` is bypassed by the service |
| Shared planning | Hearts and Spades call `decide`; bounded sampled continuations and typed evidence | Round-terminal utility/fixed stance do not establish multi-contract planning |
| Spades policies | Default tactics 2.1; opt-in planning 3.x and observed cases 4.0 | Opt-in availability is not promotion or measured superiority |
| Maintainer scenarios | 60 authored foundations plus six compound children | Recipes are not 66 validated implemented strategies |
| Text discovery | 706 accepted choices; 11 complete, three partial, two unstarted hands | Explanations include factual mistakes; no independent acceptable-action labels |
| Browser baseline | 12 measured hands, six per mode; 672 decisions: 504 bots, 168 human-seat agent | Familiar deals, changed three bots, reused identical player packets; no isolated strength estimate |
| Browser assertions | 1,208 typed cue and 5,109 typed analysis claims confirmed; 336 legacy records lack typed claims | This excludes untyped wording and strategic preference |
| Observed-case coverage | Candidate originals: CASE-01=1, CASE-02=14, CASE-03=0, CASE-04=33 | Forced-finish CASE-03 still missed in browser play |
| Jev | Zero calls in discovery/browser runs; one historical live request rejected, observed `typesafe/jev-1.13-20260917` | Valid live integration and strategy comparison unproved |
| Generality proof | Two isolated counter-module checks pass | No actual service/storage/UI conformance proof; concealed-token fixture has no importing test |

Sources: [current reasoning inventory](02-reasoning-position.md), [original-case report](../../../qa/implementation/OBSERVED-SPADES-CASES-REPORT.md), [source audit](../../../qa/experiments/2026-10-02-browser-baseline/source-audit.json), [browser audit](../../../qa/experiments/2026-10-02-browser-baseline/audit.json), [authored guide](../../../docs/superpowers/specs/2026-09-29-spades-partnership-reasoning-guide.md), [live interface evidence](../../../web/server/evaluation/evidence/jev-interface.md).

The only differing browser pair gives the candidate two extra tricks, two extra points **and two extra bags**. A longer-match benefit does not follow. The formal strength ledger remains unused; human learning and calibrated forecasts have no evidence here.

## Research that changes the architecture

| Game/profile | Decisions and information | Required difference from current Spades |
|---|---|---|
| Tarneeb, published partnership profile | Auction, winning bidder chooses trump, then tricks | Auction pass distinct from card passing; variable trump; auction ownership; module turn direction/scoring |
| Tarneeb Solo | No selected rule source | Do not derive an individual objective by removing team labels |
| Trix, Jawaker standard individual profile | Kingdom owner chooses among five requests; four penalty types and Jack-centered layout | Contract pool, penalty targets, layout adjacency, legal pass, finish order and several-round horizon |
| Trix Complex, Jawaker partnership profile | Two requests: combined penalties or layout; opposite seats combine points; revealed doubles | Combined scoring, evolving public holdings and teammate cooperation beyond winning tricks |

[Tarneeb Masters](https://www.tarneeb.com/rules) describes four-seat partnership Tarneeb, bidding for 7–13 tricks, chosen trump and counterclockwise turns. [Jawaker Tarneeb](https://blog.jawaker.com/en/tarneeb-rules-en/) presents bids with a different display numbering; store semantic commitments separately from UI labels. These corroborate much of the owner's [Waraq reference](https://playwaraq.com/tarneeb/rules), but differ on first lead and ordinary successful-bid scoring. [08](08-standard-rule-reconciliation.md) records the exact conflicts. Tarneeb Solo's intended meaning remains open.

Jawaker is the selected Trix rules authority. Its standard profile has four kingdoms with five requests; Complex has two requests per kingdom, combined penalties and layout. Both use a Jack-centered layout; play a legal card when possible, otherwise pass. The [Arabic Complex original](https://blog.jawaker.com/trix-complex-rules/) confirms Ace and clarifies the English doubling error: the taker loses doubled points, the revealer receives the original bonus. Narrow omissions remain listed in 08; Waraq's conflicting layout is not a supported target.

[Pagat Trix](https://www.pagat.com/compendium/trex.html) corroborates the selected Jack-centered layout and fresh deals between contracts. Waraq's different layout is recorded as a rejected reference, not as another option the implementation must support. Regional editions and flexible combined-contract variants remain outside scope.

## Coverage should follow mechanics, not one diamond example

Build game-owned families from **phase × objective × permitted knowledge × seat order × resource pressure × competition**. Select reachable combinations and counterexamples, rather than every Cartesian combination.

- Spades: bid reliability, losing the lead, teammate entry, Nil cover/attack, trump control and bag/match pressure.
- Tarneeb: raise/pass under changed partner auction history, choosing trump with length versus high cards, fulfilling the team commitment and responding to an opponent's inferred void.
- Trix penalties: choose a round for the current hand, surrender dangerous cards, force another player to take a penalty, and revise after a public double.
- Trix layout: open a sequence, retain or release a connecting card, anticipate blocking, help a teammate finish, and account for players who have finished.

Each is a hypothesis until independently reviewed. Use changed hidden holdings with the same visible history to expose false certainty. For example, failure to play a king over a queen can reflect choice rather than ownership; playing a jack does not alone prove a player has run out of that suit. Layout pass means no legal extension under that profile, not a suit void.

## Evidence defects resolved or carried forward

Corrected the [expanded-batch README](../../../qa/experiments/2026-09-30-expanded-batch/README.md): its eight-complete claim contradicted saved records/results. Raw records were preserved; all 14 archived source-record hashes still match the combined audit. Normative references to `plan-genericity.test.ts` remain unmet: that file is absent. Token-module scaffolding cannot discharge GP-06. Neither defect is papered over by marking a planned check passed.
