# Trix campaign continuation — implementation note

**Status:** processor and CLI implemented; original frozen admission passed and continuation started at 22:12 UTC. It subsequently stopped at one completed game, 26/52 accepted decision reviews and zero game reviews after an interrupted MCP startup timeout. Append-only recovery is implemented; actual zero-call recovery admission is pending. Combined continuation/driver/recovery/raw-export fixtures passed 55/55, no skips, in 22.1 seconds. Full collection remains incomplete.

## Scope

Continue the existing Trix Luna campaign through its full planned request budget, preserving the existing run journal and private checkpoint reports. Follow Basic Solo, Complex Solo, Basic Partners, Complex Partners order. The completed Basic Solo Diamonds request counts toward the 32-request Basic Solo budget: 32 Basic Solo, 32 Complex Solo, 32 Basic Partners and 64 Complex Partners, 160 total.

Retain the 300-second invocation limit and two attempts per decision. Remove the aggregate 90-minute wall limit. After each completed game, finish all decision reviews and its game review before starting the next game. Defer selection, curation and selected-case export. Preserve every raw attempt, response, action, outcome and review; the later selected-case ceiling remains at most 1,000.

## Continuation CLI

The implemented command sequence is:

```powershell
node scripts/trix-scenario-collection.mjs continue-campaign --run-id ID --context-admission FILE
node scripts/trix-scenario-collection.mjs campaign-check --run-id ID [--context-admission FILE]
node scripts/trix-scenario-collection.mjs campaign --run-id ID
```

`continue-campaign` freezes the audited immutable owner amendment without making a model call. `campaign-check` exercises frozen processor admission with zero model calls and no journal changes. Actual initial admission passed, and the worker started at 22:12 UTC. Preserve that launch and prior checkpoint evidence.

The current stopped worker requires the narrower recovery sequence:

```powershell
node scripts/trix-scenario-collection.mjs recover-campaign --run-id ID
node scripts/trix-scenario-collection.mjs campaign-recovery-check --run-id ID
node scripts/trix-scenario-collection.mjs campaign --run-id ID --executable PATH_TO_AUDITED_CODEX_EXE
```

Recovery verifies all successful history and the specific stopped, interrupted MCP startup failure with no final output. It appends immutable `private/campaign-recovery/<hash>.json` and an authorization after the exact failed-worker boundary, preserving the original amendment and processor. The failed review's first attempt stays consumed; only its second attempt remains. Zero-call recovery admission is pending. `campaign` selects the latest authorized processor after admission. Later operator/safety pauses remain effective; legacy `resume` is prohibited. Each fully reviewed game's raw bundle is revalidated, with an earlier publication audit reusable only when recognized in the hash journal and bound to unchanged original/native pins. No selected-case export or publication rewrite occurs.

## Acceptance checklist

- `continue-campaign` verifies the existing run identity and freezes the audited immutable amendment, preserving all prior history and checkpoint artifacts.
- `campaign-check` admits the frozen processor with zero model calls and no journal changes.
- The campaign uses the fixed four-phase order and remaining request counts, counting the prior Diamonds request once.
- Every invocation is capped at 300 seconds; each decision has at most two attempts; no aggregate 90-minute cap blocks continuation.
- Detailed decision and game reviews complete after every game before the next game begins.
- Raw attempts, responses, actions, outcomes and reviews remain available; complete reviewed-game bundles retain every accepted decision. No selection, curation or selected-case export is performed in this continuation path.
- Interruption and recovery preserve accepted work, outstanding-claim safety, immutable receipts and accurate progress without claiming unfinished work complete.
- Command help and the operator report clearly distinguish planned totals, remaining counts, completed games/reviews and deferred selection. The combined continuation/driver/policy suite passed 49/49; run the actual frozen CLI admission before campaign dispatch.

## Out of scope

Changing campaign JSON, schemas, runtime behavior outside the continuation implementation, tests, private artifacts, game rules, model policy, production bots or coaching behavior.
