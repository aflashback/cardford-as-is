# CFL-08: exact public twos deductions

Owner continuation, 9 October 2026: “lets do the next step” starts the first item in [the suit-timing investigation](trix-jacks-team-tempo.md): make public ownership deductions usable by the deterministic bot/coach before adding longer-horizon preferences. This slice implements one separate lab candidate, focused counterexamples and a bounded mechanics check. It does not implement team-tempo search or revise the scoring objective.

## Candidate boundary

`trix-ownership-1.0.0` inherits `trix-history-1.0.0`, including its existing penalty endgame behavior. It does not inherit the unsuccessful frontier score change. The only new action input is a tighter set of possible two holders in supported Partners Jacks observations. Existing immediate known-partner/opponent opening weights remain 8, or 45 when the affected seat has one card left; own-card scores and deterministic tie order remain the same. These are unchanged heuristic weights, not expected points or a proof of the better finish.

Older policies, saved traces, historical rules and the live `trix-deterministic-1.0.0` default remain unchanged. Solo and other phases retain the inherited history behavior. An unknown announcement profile cannot turn an absent field into a deduction: new Partners layout selection requires trusted native profile metadata and rejects an unbound parsed observation. Saved-packet audits rebind the exact installed pin through the existing validation path. Known historical profiles retain history behavior. No learned model, provider call, sampled hidden hand or private deal state participates in selection.

## Deduction requirements fixed before validation

Enumerate at most 4^4 original-owner assignments for C2, D2, H2 and S2. Apply only compatible, decision-time constraints:

- Actor's held cards and original ownership proved by the public prefix; a two already on the board has no remaining holder.
- Public revealed identities, or original per-seat counts before the reveal.
- The single-team condition when a valid modern Partners announcement is suppressed. Absence in Solo or historical profiles does not carry that meaning.
- Existing public pass exclusions and remaining-hand capacities for still-held twos.
- Initial versus remaining counts. Playing a two does not erase which team originally held it.

The retained assignments represent compatibility with these bounded two-card constraints. They are not counts of complete feasible 52-card deals and are not equally likely worlds or calibrated probabilities. Other-card dependencies can leave impossible full deals inside this conservative set; a claimed exclusion/singleton must nevertheless hold for every retained assignment. Reject contradictions rather than deriving certainty from an empty set.

Key cases include a displayed partner count of zero; own-card elimination before suit reveal; actor holding some twos under suppression; actor originally holding none while both partner-all-four and opponents-all-four remain possible; a later public two resolving that team ambiguity; already played twos; and old-profile absence. There is no reachable displayed count of four because the native rule suppresses that announcement.

## Shared action and reason

The new trace identity is `trix-decision-trace-1.3.0`, with optional `ownershipEvidence` only for this candidate and its own cue version. Preserve inherited history evidence separately. Record the applied scope, examined assignment count, possible original/remaining owners, count bounds, prior choice and whether the selected action changed.

The saved reason may state that a two belongs to the partner only when ownership is proved by the retained public constraints. A multiple-holder result remains uncertain. Do not infer absence of other low cards, a partner's intention or superior final team points. The bot uses the selected action; the coach consumes that same saved action and support. Validation must recompute the evidence from the original observation and reject changed owners, counts or score explanations.

## Acceptance and handoff

1. Positive and negative reachable native cases, including supported suppression and unresolved ambiguity; check each deduction against known original/remaining holdings across deterministic native deals.
2. Hidden-hand invariance, original policy/action compatibility, unchanged Solo/non-layout decisions, historical profile fallback, saved bot/coach equality and tampered-evidence rejection.
3. Lab candidate/reference/continuation admission, frozen source identity, actor-safe exports and current/historical profile round trips.
4. Focused tests followed by `npm run lab:check` after source edits settle. A tiny headless collection checks operator/archive wiring; it is not a strength study.

Results and exact commands belong in [the acceptance record](../../../qa/evaluation/coach-lab/trix-ownership-acceptance.md). Next work remains comparing opening and delaying through native finishes, retaining all seat outcomes and possible partner costs. Freeze a further narrow rule only after those case comparisons; use fresh origins for subsequent policy validation.
