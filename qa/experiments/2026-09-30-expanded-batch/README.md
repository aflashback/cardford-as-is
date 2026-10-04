# Eight additional authored Spades hands

Owner requested the eight previously proposed cases with **GPT-6.1 Sol at extra-high (`xhigh`) reasoning**, then changed the remaining turns to **GPT-6 Luna at extra-high**, retaining the one-hour limit. These are four matched Solo/Partners pairs: changed first bidder/leader, long spades moved to Jason, late scores with bag pressure, and gaps in Maya's high spades. See `deals.json` for reviewer-only setups and `provenance/model-switch.json` for the exact switch boundaries.

## Collection protocol

The named seats remain Maya, Leo, Jason and Sarah. Each decision runs a fresh text-only Codex CLI agent with the owner-selected model and `xhigh` explicitly configured. The first 49 accepted decisions use Sol; subsequent decisions use Luna. Each decision records its actual configuration. The prompt contains the existing rules and response template, the player's remaining cards, the complete public history, scores, bags and all legal actions. No fixture IDs, coverage labels, other hands, other players' explanations, reference-policy choices or reviewer notes are sent. The named seats are not independent expert sources.

This replaces manual routing and persistent player chat contexts from the first batch. The current public history is sufficient to reconstruct legal observations; private prior plans are not supplied. Three hands contain both models. Scores cannot isolate the effect of a changed deal, model or context protocol. Exact original Sol prefix records and referee source are retained under `provenance/`; the updated audit accepts that archived source fingerprint while still checking every original prompt, answer and transition.

The CLI runs from an empty temporary folder with read-only permissions. Project instructions, plugins, memories, browser, shell and agent spawning are disabled through its supported settings; player instructions also prohibit tools. Any reported tool event, multiple response messages, transport failure or invalid response prevents acceptance. This is an audited text-only protocol, not a claim of independently verified model internals or operating-system isolation of all private data.

Each prompt is passed directly through stdin without transcription or shell interpolation. `transport/` retains the delivered prompt, exact answer, hashes, invocation settings, thread ID, reported token usage and status for every attempt. Only final answer text is retained; internal reasoning is not requested or recorded. The model's paragraph is a short decision explanation.

Production reducers check legality, trick winners, scores and completion. All accepted choices—including forced cards—come from player replies. No deterministic policy fills in missing turns. Invalid replies are recorded and retried at most once with the identical prompt. A transport failure stops new work and preserves completed decisions.

## Evidence and scope

Eight hands were planned. The saved collection contains **three complete hands, three partial hands and two unstarted setups: 258 accepted decisions**. See `results.md` and `records/integrity.json`; the earlier sentence claiming eight complete hands was incorrect and was corrected on 4 October 2026. These are authored development cases; they do not measure general strength, calibrated probabilities or optimal play. The late-score pair begins from a synthetic score/bag state whose match prefix has not been proved reachable. Keep Solo and Partners conclusions separate.

Jev and OpenRouter are not used. The runtime bots, coach and rules are unchanged. `configuredModel` records the requested CLI model; an exact backend model snapshot is not independently exposed.

## Commands

From repository root:

```powershell
node qa/experiments/2026-09-30-expanded-batch/referee.mjs validate
$env:CARDFORD_CODEX_EXE = (Get-Command codex).Source
$env:CARDFORD_BATCH_MINUTES = '26'
node qa/experiments/2026-09-30-expanded-batch/run-agents.mjs
node qa/experiments/2026-09-30-expanded-batch/referee.mjs verify
```

The runner uses at most three simultaneous player invocations across different hands. Each individual hand advances one player at a time. Records are saved after every accepted choice. One initial request exceeded the original three-minute transport timeout; its unchanged position was retried with a ten-minute maximum, bounded by the remaining collection budget. That failed attempt remains in `transport/`, with unavailable usage marked unknown. Run status and findings belong in `results.md`; planned counts must not be reported as completed counts.
