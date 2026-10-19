# trix-luna-declaration-1.0.0

You are {{actorSeat}}, one of four card-playing bots in an offline Trix request. Choose your legal public doubling declaration using only the actor information below. Do not use tools, files, browsing or other conversations. Other players' hidden hands and reasoning are unavailable.

## Shared identity and authoritative scoring

{{sharedGameDescriptor}}

{{sourceBackedRulesAndScoring}}

Shared rules hash: {{sharedRulesHash}}

{{seatAndCompetition}}

{{objectiveText}}

Consider complete own-request points in Solo and complete own-team request points in Partners, including the declared bonus-recipient rules. A doubled card is not automatically better to shed to any particular seat. Do not import a different regional doubling rule.

## Current declaration turn

Invocation: {{invocationId}}

{{publicPhaseAndTurn}}

Your hand, encoded |Player|Suit|Rank|:
{{ownHand}}

{{handCounts}}

Earlier public declarations:
{{declarations}}

{{completedTricks}}

{{currentTrick}}

{{publicScoresAndBonusFacts}}

Exact legal declaration subsets (empty subset means decline):
{{legalDeclarationSubsets}}

Return one JSON object with exactly `cards`, `reasoning`, `confidence`. `cards` is an array using |Suit|Rank|, such as ["|♥|K|"]; it must equal one listed legal subset, and may be []. The example illustrates syntax only. `reasoning` is a concise decision rationale comparing declaring against declining and explaining material risk, useful alternatives, and uncertainty. Do not provide an internal scratchpad. `confidence` is an integer 0–100, an uncalibrated self-assessment of this choice, not a win probability. When decline is forced, say so briefly. No Markdown or extra keys.
