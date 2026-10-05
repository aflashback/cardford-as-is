# Findings and next step

## What the engine run showed

128 paired comparisons finished: 64 Solo and 64 Partners, across eight development card sequences, four seats and two bot environments. All 256 streams reached a production match winner. The candidate and frozen baseline played identical cards/bids throughout; paired score difference was zero.

This establishes observed parity in this sample. General strength, equivalence and teaching benefit remain unproved. The eight sequences are the independent development units; the 4,282 hands are related observations.

## Why the new rules did not change play

The candidate was correctly activated. Supplemental replay checked its policy/trace versions on 24,056 unforced evaluated-seat decisions, with no source/archive changes.

| Added case | Solo occurrences | Partners occurrences | Effect in current code |
|---|---:|---:|---|
| CASE-01: help partner win while saving a strong Spade | Not applicable | 0 | Can change the chosen card |
| CASE-02: this player cannot win another trick | 131 | 66 | Adds a fact/explanation |
| CASE-03: one player can win the remaining suit | 20 | 6 | Adds facts and equivalent-choice handling |
| CASE-04: the selected lead cannot be beaten | 736 | 360 | Adds a fact/explanation |

Occurrences may overlap. CASE-01's preference was never exercised; redundancy or usefulness of that preference was not tested. The other cases' occurrence counts do not establish accurate or helpful coaching. [Diagnostic and limits](pilot/diagnostic.json).

## Next focused milestone

1. Create reachable Partners positions that activate CASE-01, plus similar positions where helping the partner is unsafe or unnecessary. Keep exact public play, scores and actor information; verify activation before running comparisons.
2. Obtain independent acceptable-action and cue reviews using the prepared pack. Broader “resource” contexts in the current pack do not prove CASE-01 activation. Preserve uncertain/disputed labels and exceptions.
3. Improve one justified tactical family, version it, then compare against the frozen baseline on fresh development sequences. Confirm that choices actually differ before planning an expensive confirmation run.
4. Preregister the separate strength experiment and later novel unaided learning study. Human reviewers are deferred; Jev comparison remains a separate bounded step.

No runtime defaults or tactics were changed by this evaluation milestone.
