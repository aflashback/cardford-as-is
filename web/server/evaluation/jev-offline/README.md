# Offline Jev comparison harness (SG-06)

Change record: [CR-STRAT-009](../../../../planning/decisions/CR-STRAT-009-game-plan-and-strength-gate.md). Arms and provider gate: [evaluation plan](../../../../docs/superpowers/plans/2026-09-29-scenario-and-jev-evaluation.md), sections 2 and 9. Requirement EV-07: [CR-STRAT-008](../../../../planning/decisions/CR-STRAT-008-coverage-and-evaluation.md).

**State:** offline only. Nothing in this directory sends a request, reads a credential or writes a file. No Jev result exists in this project. Observed model: none — no live request. This document makes no statement about how any model behaves.

## What exists

| File | Content |
|---|---|
| `selectors.ts` | One selector interface, `(observation, candidateIds) -> SelectorOutcome`. Arms D0 (frozen `spades-tactics-2.1.0`), D1 (a registered profile named by version), and blocked J0 and J1. |
| `payloads.ts` | `buildJ0Payload(observation)` and `buildJ1Payload(observation, analysis)`. |
| `fixtures.ts` | Authored response bodies, the field-category diagnostic, the synthetic fixture arm, and a deterministic position sampler for harness tests. |
| `report.ts` | `runOfflineComparison` and `renderComparisonReport`. Prints to standard output only. |
| `../../tests/jev-offline.test.ts` | Leakage, legal-set, forced-bypass, hidden-hand, validator-class, report and configuration tests. |

Scope is Spades Solo and Spades Partners. Any other mode, and any action that is not a bid or a card play, fails closed.

### Selector rules

- Every arm receives the complete legal set: 14 bids, or every legal card. A shortlist is refused.
- A forced decision (one legal action) bypasses every arm, has provenance `forced`, and is excluded from strategic denominators.
- Unavailable and blocked outcomes stay inside strategic denominators. No arm substitutes another policy.
- Outcome provenance is `code`, `forced` or `synthetic-fixture`. There is no live selector kind and no path that emits source `jev`.

### J0 payload

The adapter's seat-safe request from `buildDecisionRequest`, unchanged, plus:

| Addition | Content |
|---|---|
| `codeFacts.competition` | Competition kind, competitor, member seats, partner seat and opponent seats, read from `competitionFor(mode)`. |
| `codeFacts.contract` | Whether this competitor's bidding is complete, contract bid, credited tricks, tricks still needed. |
| `codeFacts.nil` | Nil status (`none`, `live`, `failed`) for the seat, the partner and each opponent. |
| `codeFacts.bags` | Bags carried, bags added this hand, and `bagRoom`: the number of further bags at which the ten-bag penalty is charged (1 means the next bag is penalised). |
| `codeFacts.tricksRemaining` | 13 minus completed tricks. |
| `legalSet` | Marks the candidate list as complete, with its count and encoding. |

J0 takes no local analysis as input. It holds no selected action, order, weight, cue text, stance or sampled value.

### J1 payload

J0 plus `derivedAnalysis`:

| Part | Source | Rule |
|---|---|---|
| `shared` | Reasons attached to every candidate | Each item is labelled `hypothesis` or `fact-stated-by-local-analysis`. |
| `candidates[].evidence` | Reasons attached to that candidate | Candidates are in canonical order. |
| `plan` | Plan of a schema 1.1.0 analysis | The plan's own stance, goals with exact progress, competing stances, revisions. Described as one plan among others. |
| `limitations` | Analysis limitations | Text only. |

Withheld from J1, with counts recorded under `withheld`:

- The selected action, dispositions, candidate order, trace, decision record and search summary. The builder never reads them.
- Reasons outside the scenario catalogue, which covers every plan and selection reason.
- Any sentence that names one legal action (`bid 4`, a card label, a card code).
- Every sampled value.

### Both payloads

Both carry `promptVersion`, `promptTextHash`, `featureVersion`, `observationSchemaVersion`, `ruleProfileId`, `candidateEncoding`, `candidateIds` and the placeholder `experimentId` `unassigned — no approved experiment`. Both are marked `dispatch: never-sent`. Builders accept only a closed seat observation, so a seed, a hidden hand, an evaluator label or a player identity cannot be passed in.

Canonical order: bids ascend from Nil; cards follow suit order C, D, H, S and then rank.

### Synthetic fixture

Every response body in `fixtures.ts` was written by hand. None is a Jev output and none was recorded from a provider. The well-formed body always names the first candidate in canonical order with a uniform distribution, so it carries no strategy. Its `model` field holds a pinned name only because the validator requires one; the arm reports `synthetic fixture (authored; not a Jev output); observed model: none — no live request`.

`diagnoseResponse` returns a field category and the validator's static message. It returns no value from the inspected body. It runs beside `validateResult` and does not change or relax it.

| Validator message | Field categories with a fixture |
|---|---|
| Invalid provider response. | envelope, model-pin, answers-shape, answer-type, choice, probabilities-shape, confidence |
| Invalid provider distribution. | distribution-keys, distribution-total, distribution-argmax |
| Invalid provider probability. | probability-value |
| Invalid provider usage. | usage-shape, usage-tokens |
| Invalid provider cost. | usage-cost |
| Invalid provider metadata. | metadata |

### Report

- Solo and Partners are separate sections and are never pooled.
- J0 and J1 outcome rows read `blocked: live run needs owner-approved budget and provider-readiness gate (EV-07)`.
- The writer refuses any margin, accuracy or agreement figure under a J0 or J1 label while that arm is a fixture or blocked, and checks the finished text again.
- For D1 it prints how many decisions differ from D0. That is a decision-change diagnostic, not a strength result.

## Commands

```bash
# tests
node --test --test-isolation=none web/server/tests/jev-offline.test.ts
# harness self-check on sampled positions, printed to standard output
node web/server/evaluation/jev-offline/report.ts --seeds=4 --d1=spades-plan-3.1.0
```

The sampled positions are harness test material reached with the frozen baseline in every seat. They are not the SG-04 cases, they use their own random streams, and their output is not gate evidence.

## What is blocked

| Item | Reason |
|---|---|
| Any J0 or J1 result | No live request is authorized. The earlier cap-one smoke ledger is exhausted and stays intact. |
| Any figure comparing a model arm with D0 or D1 | No model output exists. |
| Promotion or runtime use of Jev | `readConfig` rejects every `JEV_MODE` other than `off`. |

## Prerequisites for a later live experiment (EV-07)

All of these are needed. None is met by this package.

1. A recorded owner decision that authorizes a live run, with a new experiment ID, a finite request limit, a finite cost limit, a deadline and a stop on unknown cost. The old ledger is never reset.
2. A reviewed manifest with every required field listed in the evaluation plan, section 10. It replaces the placeholder `experimentId`.
3. The provider-readiness gate of the evaluation plan, section 9:
   - Redacted field-category diagnostics connected to the experiment runner, so a rejected response records its category. The validator is not loosened to pass a response.
   - The endpoint, deadline and distribution-total tolerance reconciled against current official contract evidence.
   - The requested and resolved model pins and the usage contract verified. An unexpected model is recorded as unavailable.
   - Provider route, retention and training settings reviewed. The first requests use synthetic observations only.
4. A reviewed change to the adapter's limit of three requests per experiment, if the 40-position pilot is to run.
5. Credentials provisioned in a server-only environment. They are never pasted into a file, a browser setting or a conversation.
6. A reviewed change that adds a live selector kind. Until then the report keeps both model rows blocked.
7. The runner stays separate from normal game configuration, which keeps Jev off.
8. Frozen prompt versions. `promptTextHash` changes whenever the adapter's instruction text or a payload description changes; the prompt version must change with it.
9. A person reads a sample of J1 payloads before the first request and confirms that no sentence works as a recommendation.

## Known limits

| Limit | Effect |
|---|---|
| The naming filter matches `bid N`, card labels and card codes only | A recommendation phrased another way would pass. Prerequisite 9 covers this. |
| The diagnostic repeats the validator's checks in the validator's order | Agreement is tested on the authored bodies and on the set of validator messages. A reordered validator needs a diagnostic review. |
| J1 has no estimates-enabled variant | Per-candidate sampled values would reveal the local order. That variant needs its own recorded design. |
| The adapter's objective text is inherited unchanged | It states that partners are opposite seats and mentions protecting a partner Nil. Changing it belongs to the adapter's owner. |
| Positions come from the harness sampler | The comparison should take SG-04 case observations once that store exists. |
