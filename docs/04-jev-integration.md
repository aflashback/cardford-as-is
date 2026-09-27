# 04 — Jev decision contract and capability spike

## A. Verified interface; project-specific adaptation

Use the documented TypeSafe HTTP endpoint `POST https://api.typesafe.ai/v1/systemone` with a server-held Bearer key. A request contains `model`, `state` and a `questions` map. Use one `choice` question named `action`; its options belong in a `criteria` map, not an invented `options` array. The response contains the selected `choice`, candidate `probabilities`, distribution-derived `confidence`, resolved `model` and token `usage`. Sources: research R01, R03 and R04.

Pin `jev-1.13.0` for the initial experiment, subject to authenticated availability confirmation. Do not use a moving alias for a measured release. The model page describes request-based customization rather than customer fine-tuning; build a better state and rubric, not an imaginary training endpoint. Source: R02.

The local schemas in `contracts/` intentionally describe our supported subset, not the entire vendor API. Confirm them during G0. Synthetic examples are not proof that the endpoint accepted them or that their selected action is good.

## B. Decisions delegated to Jev — Spades module

The common adapter accepts versioned generic legal candidates. Each game supplies its own objective, compact rule context, phase instructions and candidate meanings; it must not inherit the Spades partnership objective. `DecisionObservation.game` selects a registered typed module payload. The provider `state` is a second semantic projection; see document 12.


| Situation | Choices supplied by code | Runtime decision |
|---|---|---|
| Bidding | `bid:0` through `bid:13`, with ordinary Nil explained | Jev selects one bid |
| Playing | Exactly the current legal `play:<cardId>` actions | Jev selects one card |
| Human advice | Same observation, objectives and choices a player would receive | Jev recommends one action; it does not execute for the user |
| Only one legal action | Single legal action | Code selects it, labelled forced; no API call |

Jev is not asked to count cards, enumerate legal moves, determine a winner, perform score arithmetic, generate explanations, decide whether its own answer is correct or grant authorization. Independent `Score`/`Noul` self-judgments would not constitute an objective evaluator and are excluded from the initial pipeline.

## C. Input construction

`DecisionObservation` is a frozen seat-safe input with card identities such as `HQ` plus human-readable descriptions in the provider projection. The structured state contains the applicable rule summary, own cards, public bids/tricks/scores, publicly established void suits, and exact program-computed features. Send current-hand public history only, not the entire user's history.

Useful exact features include own suit lengths, ranks, higher cards in the same suit that are not in the actor's hand and have not been publicly played, remaining cards by seat, current trick leader/winner, team contract and fulfilled tricks, Nil status, and the marginal bag/contract arithmetic. An unplayed higher card's owner remains unknown. Counts are facts; interpretations such as “safe winner” are not facts unless proved for the exact position.

For each candidate, code can compute whether it follows the led suit, is a trump, takes the current lead, or definitely wins a completed four-card trick. `wouldCurrentlyWin=true` does not mean later seats cannot overtake it. Non-applicable fields are `null`, never invented defaults that imply knowledge.

Use a stable presentation order: bids ascending; cards clubs, diamonds, hearts, spades and rank ascending. Test order sensitivity in G0. All legal actions must be included. Do not prune weak-looking actions by heuristic, preselect a strategy, or let a confidence threshold redirect the choice to a secret stronger bot.

Local session IDs, private hashes, user names, timestamps and browser metadata are removed before the HTTP request. The provider payload uses semantic card descriptions so that the model does not need to decode opaque card indices. R05 motivates moving arithmetic into code and keeping context focused; the precise feature design here is a project decision.

## D. Objective and instructions

The Spades runtime text is versioned in `prompts/JEV-DECISION-v1.md`; it is not a universal prompt. Shared safety/choice instructions are in `prompts/JEV-SHARED-v1.md`. The objective is partnership score under the frozen rule profile, considering the match score when available. Nil, contract failure and bag penalties are explicit. The model sees only legal options and is told not to assume hidden cards.

For playing, prefer one bounded choice call, rather than asking Jev to choose a strategy and then choose a card in independent questions that may contradict each other. The adapter does not request or receive chain-of-thought. Teaching text is produced separately from validated facts.

The initial model difficulty is fixed. Beginner support changes hint depth, practice exercises and visibility of learning aids—not secretly weaker opponents or rigged deals. Authored drill deals are visibly marked as exercises.

## E. Validation and application

Validate request shape locally. Validate the response before it can affect the game:

- `answers.action.type` is `choice`; choice is one of the submitted IDs; returned probability keys exactly match the submitted IDs.
- Every value is finite in `[0,1]`, the total differs from 1 by at most `0.000001`, and the chosen probability is maximal within the same tolerance. Ties may choose any tied maximum.
- Confidence is finite in `[0,1]`; token counts are non-negative integers; resolved model matches the approved pin. Unexpected version drift stops automatic application pending review.

Reject invalid provider data; do not normalize a malformed distribution into a seemingly valid answer, parse natural-language card names as a fallback, or apply a different legal action. Log a redacted diagnostic and expose a recoverable service status. Revalidate current turn/version/legal membership in the game transaction even after the provider response passed schema checks.

A Choice distribution is not a distribution over match outcomes. Confidence is not calibrated probability of a strategically correct move. Store both for evaluation, but do not display them as win odds, player accuracy or certainty that another move is wrong. Low confidence does not prevent a legal bot move; it only makes coach wording cautious. V1 always calls the result a suggestion.

## F. Reliability and usage controls

Set an overall provider attempt-group deadline of four seconds. Allow at most one transient retry, with jitter and any `Retry-After` honored only when it fits the remaining deadline. Retry network/eligible 5xx/429/529 failures; do not retry 401 or invalid-request 422 automatically. Circuit-break repeated failures and show a retry action. Manual retries also obey rate limits and a cooldown. These are project defaults to measure, not vendor latency guarantees.

No key or invalid key: live mode reports configuration unavailable. `AI_MODE=demo` enables an explicitly labelled deterministic basic bot for development and a separate demo session. A session's mode is immutable. Never turn a live session into demo mode silently; starting a demo creates a separate session and leaves the live session resumable.

Record requested/resolved model, instruction/feature/rule versions, candidate IDs, choice, probabilities, confidence, usage, latency, retries, validation outcome and frozen observation reference. Keep API keys out of logs. Raw payload debugging is local opt-in with short retention; production telemetry uses dimensions and counts rather than complete hands.

## G. G0 experiment before claiming strategic fit

The first authenticated spike must confirm endpoint, candidate encoding, response shape, pin, quotas and observed latency. Test at least 40 original positions across bidding, ordinary follow-suit play, trumping, partner currently winning, Nil protection, bag avoidance and late match score. Include multiple-option bidding and playing; a forced legal move is not useful evidence of intelligence.

Have a competent Spades reviewer label acceptable alternatives before seeing Jev output. Separate rule mistakes, strategic disagreements and ambiguous cases. Randomize candidate order in repeat trials, compare sparse versus computed-feature inputs, and run hidden-information invariance tests. Preserve raw results in a local evaluation report with secrets removed.

G0 succeeds as an interface spike only when real authenticated evidence exists. It succeeds as a preliminary strategy spike only if the model shows useful, explainable agreement across categories without systematic harmful advice. The larger G4 evaluation remains mandatory. No published reproducible Spades-specific Jev benchmark was located in this research; lack of evidence is not proof that it will fail.

If the initial strategy result is weak, iterate instructions and exact features. Do not paper over poor quality with high-confidence labels or an unapproved frontier-model fallback. Keep the rule-teaching app operational in explicit demo mode while recording that the live strategic-coaching gate is blocked.

## H. Cost model — an assumption, not a quote

With one recommendation per human decision and one decision per bot turn, a hand has at most 4 bid decisions plus 52 card decisions: 56 initial calls before retries; forced plays reduce that count. Reopening a hint or reviewing recorded advice should add zero calls. Retry branches are new play and incur new decisions.

At the documented input rate of $0.042 per million tokens, an assumed 2,000 input tokens per call gives `56 × 2,000 × 0.042 / 1,000,000 = $0.004704` per hand. At 5,000 tokens it gives `$0.01176`. These are illustrative input charges only, not measured usage, CAD conversion, taxes, hosting or total product cost. Actual payload lengths, retries, billing currency and current terms must be checked. Source for rate only: R02. Do not optimize token cost before information safety and usefulness.
