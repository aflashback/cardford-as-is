# Authored-deal scenario lab

Offline research authorized by the owner on 30 September 2026. Source baseline: `94a59cb`. This adds experiment artifacts only; it does not change a runtime bot, coach, rule profile or default. No Jev calls are part of this run.

## Purpose and limits

Use full, deliberately constructed hands to discover strategic decisions, weak explanations and missing cases. A deal can be legal without representing how often a situation occurs in ordinary play. This pilot is not a win-rate study, probability calibration or independent expert labeling exercise. A player paragraph is an authored decision justification, not verified access to its internal reasoning.

The two episodes use different deals and public score contexts. They are not paired evidence that one variant or policy is stronger. The Solo hand starts at zero. The Partners hand uses declared synthetic carried scores/bags; no prior match history is claimed. Fresh agents are used for the second hand. No strategic player receives another player's private paragraph.

## Files

| File | Use |
|---|---|
| `results.md` | Completed checks, outcomes, useful discoveries and remaining limits |
| `scenario-candidates.json` | Traceable development cases and counterexample tests to pursue |
| `follow-up-plan.md` | Proposed case review, strength, Jev and coaching evaluations |
| `partners-observer.md` | Observer's post-game partnership analysis |
| `templates/scenario-review.json` | Reusable review record structure; not runtime configuration |
| `templates/player.md` | Readable generic player contract |
| `templates/spades-rules.md` | Frozen app-specific rules/scoring/goal template |
| `templates/player-invocation.txt` | Condensed instructions actually dispatched, with substitutions |
| `templates/observer.md` | Non-intervening observer audit contract |
| `deals.json` | Full authored deals, score contexts and intended discovery labels; observer-only |
| `referee.mjs` | Offline transport and replay helper using production rules |
| `verify-records.mjs` | Verify saved response hashes, grammar, action correspondence and replay counts |
| `partners-counterexample.mjs` | Reproduce the alternative legal deal disproving a player's exact-ownership claim |
| `records/*.json` | Exact seat packets, accepted raw responses, private justifications, action log and result |
| `records/*.audit.json` | Engine replay, packet checks and D0/D1 shadow choices after player decisions |
| `research-and-evaluation.md` | Primary-source findings and next evaluation steps |

`promptHash` in a game record fingerprints the readable player/rules protocol documents. The condensed transport template is stored separately. Agent names are roles, not independent model families. Exact provider snapshot identifiers are not exposed by the collaboration tool and are not invented.

## Repeat the experiment

1. Declare a game module, rule profile, competition, scoring goal, authored full deal, public starting state and intended scenario families. Check legal deck/card counts with the production reducer. Save intended coverage before play.
2. Give four fresh agents separate contexts, one seat each. Replace name/seat/game/seat-packet placeholders in `player-invocation.txt`. Use the code's current seat packet verbatim. Do not send deal IDs, setup purpose, seeds, hidden cards, benchmark actions, future scores or observer findings.
3. Request one bid/card and one 15-100 word justification. Permit only text. Reject extra actions, illegal actions or malformed replies; save the rejection and retry the unchanged packet. Never substitute a reference-bot move for a player response.
4. Route every accepted move through the reducer. Only then construct the next packet. Every packet contains full public history and the acting seat's current hand. The observer may run transport tools, but never supplies tactical cues. All strategic players are instructed to use no tools.
5. Stop after the complete scored hand. Audit the raw record, and debrief from both the seat view and the separately labeled full-deal view. Preserve failed plans and unsupported claims as well as useful ideas. Record missing coverage.
6. Extract cases with complete replay prefixes, scenario tags, alternatives, counterexamples, source decisions and label status. A human reviewer labels acceptable choices blind to agent/benchmark recommendations before any correctness claim.
7. Repeat on altered suit/rank/seat/score/partner conditions. Keep every discovered deal family in the development partition. A fresh context is essential if an agent has previously seen the same deal or a related deal's hidden cards.

Text-only behavior is an instruction plus strict response parsing, not a tool-permission sandbox. The collaboration API has no per-agent tool-disable setting. Do not claim audited absence of hidden access without tool telemetry; packets are constructed by allowlist and their independence from other hands is separately checked. A stronger repeatable service should use tool-disabled processes and separate per-seat storage.

The observer's accepted tool use is confined to reading templates, routing packets, invoking the referee and writing the research record. Player outputs are data, never executable commands. In this session root routes Solo and the observer agent routes Partners with fresh child player contexts. This schedules five role types without sharing private player state.

Root manually copied Solo packets into the four fresh player contexts and piped each returned paragraph to the referee using literal quoting. The [Partners transport record](partners-transport.md) describes its matching process. Stored packet checks do not independently audit manually copied messages; those messages remain in the collaboration transcript. PowerShell supplied a trailing newline to saved responses.

## Commands (from repository root)

```powershell
node qa/experiments/2026-09-30-agent-scenario-lab/referee.mjs validate
node qa/experiments/2026-09-30-agent-scenario-lab/referee.mjs packet solo-control-01
# Pipe the exact text response into accept; use literal quoting, never evaluate it.
node qa/experiments/2026-09-30-agent-scenario-lab/referee.mjs accept solo-control-01 AGENT_NAME
node qa/experiments/2026-09-30-agent-scenario-lab/referee.mjs audit solo-control-01
```

`audit` evaluates the code policies on the already recorded observations. Its disagreement counts select review candidates; neither code policy grades the agents, and the agents do not grade the code policies. Replaying a record is deterministic; generating new agent decisions is not guaranteed deterministic.

## Reuse for another game

Keep the player response/visibility/rejection/record protocol. Supply that game's module adapter for initial state, legal actions, reducer, public projection, scoring and terminal checks; its exact rule/goal template; and its own authored scenario families. Do not transplant Spades bids, Nil, trump, partnership conventions or score objectives into the shared protocol. The existing helper is intentionally a Spades pilot, not a universal rules interpreter.
