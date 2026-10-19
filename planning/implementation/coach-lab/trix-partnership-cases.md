# Trix partnership history cases — 9 October 2026

Source: owner examples in the feedback-lab conversation. These cases guide deterministic deductions, candidate tactics and evaluation. They are not expert labels, calibrated probabilities or universal optimal-play rules. All reasoning uses the acting player's hand and information public at that turn. Players pursue their individual or team objective, but may choose a different reasonable plan or make a mistake.

## PH-01 — Doubled king and releasing the partner's ace

Observation: an opponent publicly doubled K♥. South leads and can consider hearts, with or without A♥. Record turn order, known holdings, heart length, public voids, remaining players and every applicable Complex penalty component.

Exact facts: the declarer held K♥ when declaring; a double has the native score/bonus routing. Public play can establish ownership changes, a void or an unbeatable winner. The declaration does not itself establish the rest of that hand.

Conditional interpretation: the declarer may expect cover, long hearts, or an escape through another suit. A heart lead may let the partner release A♥ while the declarer plays below it. Evaluate both the immediate team cost and later risk; in Complex, taking the trick and other penalty cards also matters. South holding A♥ and many hearts is a different case from South lacking the ace.

Counterexamples: the declarer has no lower heart, must follow with the king, has misjudged protection, or opponents later force a dangerous return. The partner may retain A♥ for control or choose another strategic plan. **Not playing A♥ does not prove the partner lacks it.** Only legal constraints or a public ownership reveal can establish absence. Unknown king/ace locations must retain all feasible allocations.

Required comparisons: doubled/ordinary king; ace own/partner/opponent/unknown; short/long hearts; actor lead/follow; Basic King versus Complex; changing turn order and score context. Distinguish exact score differences from conditional future outcomes.

## PH-02 — Repeated upper-side layout play

Observation: partner repeatedly places queens, kings or aces while lower frontiers exist on the board. Save the board immediately before each observed action, public hand count and any passes/reveals.

Conditional interpretation: the partner may be exhausting an upper chain before opening a lower chain that helps opponents more than the team. Repeated genuinely voluntary choices can support this hypothesis. Seeing a lower frontier on the board does not prove the partner held its next card.

Counterexamples: every high placement was forced; partner held no playable lower card; lower opening was postponed to protect our other teammate; upper choices also open opponents; the revealed twos establish low-card ownership despite upper play. A later low card confirms that card was held earlier only if card movement rules and its public history support that deduction. It does not prove absence of every lower card of that suit.

Required tests: same public sequence compatible with multiple hidden hands; forced versus provably voluntary actions; delayed low play with and without additional same-suit lows; board changes; partner near finish; Solo versus Partners objective.

Implementation continuation: new module `2.2.0` records the public chronology needed to test these conditions. Saved history signals distinguish provable alternatives from unknown preference and forced actions. Repeated voluntary upper play remains conditional evidence with no new action weight; absence of lower cards is not inferred. Historical observations are not backfilled.

## PH-03 — Opening or withholding a jack/frontier

Observation: partner opens J♠, or publicly known to hold a frontier card, postpones it while making other placements.

Exact facts: a played jack was held; public twos identities/counts and forced passes impose time-specific constraints. In this game hands only shrink within a deal. A pass means no legal placement on that particular board, not a suit void.

Conditional interpretation: if another legal action was demonstrably available, delaying a known frontier may indicate that opening it benefits opponents or does not advance the partner's plan. Opening J♠ alone does not identify a preferred suit or prove possession of lower spades. Do not count a forced action as a preference signal. Do not treat several observations of the same constraint as independent new evidence.

Counterexamples: only legal jack/action; low cards still blocked behind another player; partner protects a teammate's finishing order; a player makes a mistake; a known two contradicts a guessed no-low-card conclusion.

## PH-04 — Public twos and uncertainty through time

Before the announcement reveal, use only published counts per seat. After the reveal, use the published card-to-seat mapping. Never read future revealed identities while analyzing an earlier move. More public information usually narrows the feasible set, but does not guarantee a unique best action or monotonically increasing confidence.

Behavioral beliefs must remain conditional on an explicit player-policy assumption, allow mistakes and preserve hard-feasible hands. Do not display invented percentage confidence. Distinguish facts, conditional estimates, deterministic preferences and exact finite endgame results in saved traces.

## PH-05 — Exact two-card penalty ending (first implementation target)

Actor is fourth on the penultimate penalty trick with two legal cards; each other seat has one remaining card after its current play. Enumerate every assignment of the three unseen remaining cards compatible with full public history and declarations. After either legal root choice the last trick has forced plays. Use native scoring, including double bonuses and team totals, to compare residual request outcomes.

A candidate may replace the frozen reasoning choice only when complete enumeration proves it never worsens the declared objective in any feasible assignment and improves it under the declared strictness rule. Otherwise retain the old choice and report ambiguity. This is a local request-ending result, not a probability of winning the whole session.

Retain legal full-deal fixtures, reversed alternatives, team/Solo scoring, ordinary/doubled penalties, changing leader and a no-dominance counterexample. Fresh full-session validation checks the complete policy after this local change.

## PH-06 — Opening timing, endpoints and individual/team finish

Owner continuation: investigate whether releasing a lower suit path helps a partner holding several/all twos, whether a partner with no twos needs a different path, and whether delaying high cards to block opponents' aces improves the team result. Measure both teammates' finishing points, including sacrifices and equal-team-total outcomes. Solo uses the player's own objective and public information, with no partner or twos announcement assumption.

These examples are recorded as seven paired positive/counterexample families and an ordered investigation in [who benefits when a suit opens](trix-jacks-team-tempo.md). The first task is exact information and reachable fixtures, followed by native finish comparisons; no new tactic or probability is established by this addition. In particular, a missing modern Partners announcement implies one team held all twos, but an actor who originally held none cannot immediately distinguish partner-all-four from opponents-all-four. A player known to hold no twos may still hold low intermediate cards. Delay requires another legal move.

## PH-07 — Known partner two, uncertain release timing

Source: the frozen CFL-10 Basic Partners development comparison, preserved in [the Ownership session evidence](../../../qa/evaluation/coach-lab/trix-ownership-study.md). This is an observed adverse case, with action quality unlabelled.

At the unrotated decision, the actor holds C2, CK, H10 and S3; the partner has eight cards remaining. The pinned suppression rule plus own C2 proves that the partner holds D2, H2 and S2. H10 and S3 are the two legal choices. Ownership selects S3 through the existing immediate partner-release bonus; History selects H10. Neither immediately opens another actor-held card.

The later public ledger records the actor finishing second in both runs, but the partner finishing third under History and fourth under Ownership. The paired team difference is −50 points. This is one natural origin repeated across rotations, deployments and opponents, not eight independent examples. The public ownership deduction is exact; the timing preference has no optimal-action label.

Next comparison: evaluate immediate release against progress in other suits and resulting team finish, with each continuation restricted to that player's observation. Retain the [CFL-09 positive all-four-twos case](../../../qa/evaluation/coach-lab/trix-jacks-endings-acceptance.md) and counterexamples. A partner's card count alone must not become an inferred threshold from this case. Later finishing order is retrospective evidence, never an input to the earlier move.

CFL-11 diagnostic completed on 10 October: [sampled timing results](../../../qa/evaluation/coach-lab/trix-release-timing.md). S3 has a small positive sampled mean over H10 but both favorable and harmful worlds under all declared continuations. Earlier availability frequently does not change S2 placement time. The original loss does not justify a blanket H10 replacement or a partner-count cutoff; no new action rule was introduced. The positive full release sequence and exact-ending corpus remain unchanged.

## PH-08 — Doubled king after a low partner return

Source: the owner's protected K♥ scenario and the [CFL-13 lead](../../../qa/evaluation/coach-lab/trix-king-return.md) / [CFL-14 discard](../../../qa/evaluation/coach-lab/trix-king-discard.md) investigations. Pattern: the actor owns doubled K♥, is publicly void in the partner's led suit, and an opponent still has a chance to overtake that partner. Judge the leader and discarder from their separate observations.

Exact facts include own cover/escape cards, declared K♥ ownership, previous and current public plays, proven voids, remaining counts, turn order and all native score components. A leader may prove an opponent must overtake using its own cards; the partner does not inherit that private deduction. A low return can be a voluntary attempt to help, but intent remains conditional.

CFL-14's specific South position favors K♥ on sampled mean full team points across both variants, streams and four fixed continuations. The Comparison policy instead keeps K♥; Baseline already releases it. This is a promising conditional escape hypothesis, not an implemented action change or a rule for every protected king hand.

Mandatory counterexamples: a higher return remains winning; the last opponent is void; withholding lets an opponent take K♥ later; or other Complex costs outweigh an earlier escape. The same South observation can describe both a safe immediate release and a 225-point harmful release. Its exact East-void allocation fraction, 1/646 under uniform compatible deals, belongs only to that observation and must **never become a constant for this pattern**.

Next missing mechanism: interpret voluntary partner/opponent choices with versioned deterministic likelihood assumptions, distinguish forced choices, keep mistakes and competing plans possible, then compare inference-aware decisions against the facts-only allocation reference. Include both rare adverse and usual allocations with correct weights. The authored low lead is an intervention; naturally selected lead/response sequences are needed for behavioral calibration. Bots and coach must share the selected move and its evidence; plain-English wording can follow later.

## Case output contract

The first saved layout comparison is [J♦ versus 10♠](../../../qa/evaluation/coach-lab/trix-layout-case-study.md), including K♥ as the third legal alternative. It remains a separate historical-profile case; new chronology does not retroactively improve its information.

For each case retain: variant/rule profile, native legal prefix, decision-time observation, exact deductions, assumptions, candidate actions, score objective/horizon, root comparison, negative example, selected rule ID, saved action, and support for a later plain-English explanation. Later events may test a belief's calibration retrospectively; they never rewrite what was known at the original decision.
