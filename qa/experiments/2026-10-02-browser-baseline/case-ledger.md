# Discovery cases admitted to the browser baseline

Source boundary: historical text agents supplied examples, not expert labels. All source archives stay unchanged. This folder contains real browser/server evidence separately.

| Archive | Accepted decisions | Completed / partial / unstarted hands |
|---|---:|---|
| [Pilot](../2026-09-30-agent-scenario-lab/results.md) | 112 | 2 / 0 / 0 |
| [Two-suit batch](../2026-09-30-two-suit-batch/results.md) | 336 | 6 / 0 / 0 |
| [Expanded batch](../2026-09-30-expanded-batch/results.md) | 258 | 3 / 3 / 2 |
| Total | 706 | 11 / 3 / 2 |

## Disposition

| Source cases / record | Useful question | Implementation disposition |
|---|---|---|
| LAB-01; TWO-SUIT-01; expanded opening bids | Separate certain top spades from possible side-suit tricks. | Regression-only: current bidder already bids five on the five-top-spade hand. No learned bid weights. |
| LAB-02 | Preserve safe exits while trying to win no tricks. | Existing Nil tactics; keep counterexamples. No universal cross-suit highest-discard rule. |
| LAB-03 | Use a small spade in last position and retain stronger cards. | Existing legal/current-winner/resource tests; second-position twin retains overtake risk. |
| LAB-04 | Does an unplayed high card reveal its owner? | Existing uncertain-ownership rule; retain withheld-honor counterexample. |
| LAB-05; expanded Partners31/35 | Public voids and counts can prove owners or remove threats. | Existing fact builder regression. No card-choice signaling convention. |
| LAB-06; TWO-SUIT-02 | Concede a trick while protecting a contract or avoiding bags. | Existing exact scorer; general preference deferred to broader score-context evaluation. |
| LAB-07 | Preserve later cover for a partner trying to take no tricks. | Existing cover priorities; no unconditional high-lead rule admitted. |
| LAB-08 | Nil attack versus bag penalty. | Existing score arithmetic; new attack preference deferred. These observations do not prove the better continuation. |
| LAB-09 | Explanations must not invent owners or score routes. | Keep the identical-packet alternate-deal counterexample; original observations remain the evaluation boundary. |
| TWO-SUIT-03/04; solo-spread31 onward | A publicly forced sweep makes defender discards equivalent. | CASE-03: exact proof and abstention; earlier23 is a negative. |
| Expanded solo-void-trumps-at-jason35; solo-concentrated36/40/43/47 | Cards cannot win without a way to regain the lead. | CASE-02: own future trick bound of zero. Never infer a failed team contract solely from this. |
| Expanded partners-void-trumps-at-jason21/25 | Leading spades can consume partner resources unnecessarily. | CASE-01: narrow conditional preference with proved opponent spade voids and retained own entry. |
| Expanded solo-void-trumps-at-jason33/37 | A highest side card is unbeatable after all spades are gone. | CASE-04: precise selected-action cue; retain a possible-trump counterexample. |
| Expanded changed-order pair7 | Winning your partner's trick differs from beating an opponent. | Existing mode-specific objective regression; changed bids prevent treating the source pair as a controlled mode-only experiment. |
| Unfinished late-score hands; unstarted honor-gap setups | Score pressure and missing high spades. | Preserve as unfinished discovery. No completed outcome or inferred probability is claimed. |

Rule definitions, exceptions and acceptance gates: [CR-STRAT-010](../../../planning/decisions/CR-STRAT-010-observed-cases-and-browser-baseline.md).

## Limits

- The four admitted additions address reproduced production gaps; research-player mistakes already handled by code become regressions.
- Suit/seat rotations and negative premises test general predicates instead of recognizing one literal hand.
- Independent human labels, calibrated probabilities, advanced double-Nil tradeoffs and match-strength conclusions remain open.
- Browser collection completed **12 hands: six Solo and six Partners**. Original candidate matches: CASE-01 once, CASE-02 14 times, CASE-03 zero, CASE-04 33 times. CASE-03 remains a browser coverage miss. [Results](results.md) and [audit](audit.json) retain exact game IDs, actions, policy pins, terminal scores and separate offline shadow counts.
