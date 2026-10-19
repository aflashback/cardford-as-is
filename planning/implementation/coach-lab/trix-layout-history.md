# Trix Jacks public history and named-case investigation

Owner continuation, 9 October 2026: implement the next two steps from the feedback-loop review: preserve chronological public Jacks play, then investigate the saved 10-spades versus jack-diamonds case. Product UI, model integration and default-policy promotion remain outside this slice.

## Requirements

- **CFL-05:** capture each public layout placement/pass with its seat, sequence number, board and remaining-card counts before the action, and the announcement information public before that action. Bots and coach receive the same actor observation. Never expose another player's private legal options or cards.
- **CFL-06:** reproduce the saved case exactly, compare every legal root choice on common feasible hands through native request completion, test different deterministic continuation populations and retain counterexamples. Record a supported classification and a next research question; do not manufacture an accuracy label from one game's result.

## Version and compatibility boundary

All four new Trix modules use module `2.2.0` and public/state schema `1.2.0`. Scoring/legality rule identities remain Solo `1.0.0` and Partners `1.1.0`. Chronology is a separate capability, `layoutHistoryVersion: "1.0.0"`. The event schema remains `1.0.0`.

Historical module `2.0.0` games and Partners module `2.1.0` games retain their exact pins and omit the new observation field. Absence means unavailable, not an empty reconstructed history. New games have an explicit available history, initially empty, reset for each deal. No archived decision gains facts learned after it was made.

## Evidence and reasoning

Native public replay checks the recorded frontier, turn order, counts, finish order, passes and announcement reveal timing. Offline feasible-hand evaluation additionally restores played cards to their recorded owners and replays the same actions with native legality. This strengthens the evidence used to compare alternatives without disclosing actual hidden hands to a decision policy.

A later placement already visible in the current observation can prove that its owner held that card on an earlier turn. If that card was then playable, it is a **known alternative**, so the earlier action was voluntary. The actor's own still-held cards can provide the same proof for that actor's earlier turns. These are subsets of earlier legal options, not a reconstruction of another player's complete private legal set.

A legal pass is forced. A one-card hand making its legal placement is forced. Otherwise, absence of a known alternative leaves preference unknown. Repeated voluntary upper-stack choices may support a conditional interpretation, but do not prove low-card absence, competence, intent or a calibrated probability. These signals add no action weight in this slice.

## Named case protocol

Case `case-bdf5b9cd6d1b3ecf9e46e2d154dd89bf` is an immutable Complex Partners public-schema `1.1.0` observation with three legal choices: J♦, K♥ and 10♠. Its missing chronology stays missing. Reproduce its archived legal set, original choice and small comparison before extending analysis.

Use 32 feasible synthetic hands on each of two deterministic sampler streams. Share each hand across all root choices and four named continuation populations. Record native finish order, team scores, signed differences and work consumption; keep nearby-case searches separate from the primary averages. These are 64 synthetic hands from one decision, not 64 independent real-game families or a strategy-strength test. Fixed work and an outer watchdog must retain incomplete work explicitly. Freeze source/binary identities before execution and verify them afterward.

The outcome is a reproducible case study and a bounded deterministic-rule hypothesis, if warranted. Any resulting action-rule change needs its own version, focused counterexamples, then frozen complete-session development and fresh validation. It is not automatically deployed.

## Verification and handoff

Verify native history round trips, old-profile byte compatibility, public-only signals, exact pin admission, schema shape, blind export and retrospective reconstruction. Then run the integrated lab gate and a fresh headless collection/audit. The named study script and findings are documented in [the case study](../../../qa/evaluation/coach-lab/trix-layout-case-study.md); the general collection and feedback commands remain in [the lab runbook](../../../qa/evaluation/coach-lab/README.md).

Completed: public chronology and conservative choice evidence, exact historical compatibility, lab replay/export integration, four complete headless Partners sessions and the 64-world named-case study. A discovered retrospective-size failure was repaired with lossless versioned compaction; decoded prefixes match every saved observation. The case is a reproducible conditional-mean disagreement with harmful counterexamples, not a validated replacement rule. [Acceptance, checks and retained evidence](../../../qa/evaluation/coach-lab/trix-layout-history-acceptance.md) records the initial failing gate and passing focused closure honestly. Strategy weights and the live default remain unchanged.
