# CR-STRAT-008 — Scenario coverage and Jev evaluation

**Owner direction:** 29 September 2026: review the concept files before implementation, discover missing scenarios, avoid fitting the design to the diamond example, retain the product's success criteria, and prepare future probability/Jev comparisons. **Current scope:** documentation only; no runtime activation or paid experiment.

## Decision

Retain typed per-game reasoning packs. Build the main scenario foundation once per game and maintain versioned corrections when evidence changes. Use independent discovery and explicit uncertainty; no exhaustive-catalog claim or fixed probability per scenario.

The [concept review](../../docs/superpowers/specs/2026-09-29-scenario-coverage-and-success.md) anchors bot quality, coaching quality and unaided learning separately. The [Spades guide](../../docs/superpowers/specs/2026-09-29-spades-partnership-reasoning-guide.md) now contains 60 foundation recipes and six compound children. The [evaluation plan](../../docs/superpowers/plans/2026-09-29-scenario-and-jev-evaluation.md) specifies direct Jev, deterministic and hybrid comparisons, probability semantics, dataset separation, provider gates and human transfer.

| ID | Requirement for later implementation/evaluation | Acceptance |
|---|---|---|
| EV-01 | Scenario discovery MUST sample independent legal play and allow unmatched/no-cue cases, rather than derive every test from our catalog. | Development discovery ledger, multi-style generation, reachable child cases and representative first batch. |
| EV-02 | Every numerical forecast MUST define its event, information, horizon, allocation/continuation assumptions and population. Choice confidence and heuristic weights MUST remain distinct. | Event-schema checks, exact tiny-state references, calibration/test separation and per-event reports. |
| EV-03 | Jev comparisons MUST distinguish direct full-legal-set selection, analysis-assisted selection and shortlist loss. | Frozen arm payloads and candidate sets, blinded rubrics, anchoring ablation and legal divergence replay. |
| EV-04 | Related deals/templates/rotations/repeats MUST stay grouped; final test material MUST remain untouched until policies and the analysis plan are frozen. | No partition overlap, source hashes, pilot sizing, fixed stopping rule and grouped intervals. |
| EV-05 | Coaching content MUST be supported for the selected action; Jev output MUST NOT inherit a conflicting local rationale or fabricated model explanation. | Rendered-action/cue tests and explanation-abstention reporting. |
| EV-06 | Playing strength, coaching usefulness and independent human learning MUST have separate experiments and claims. | Paired matches, blinded cue review and fresh delayed unaided transfer with assistance/coverage records. |
| EV-07 | Provider readiness, model identity and finite budgets MUST be verified before a separately authorized live run. Historical failed/exhausted experiments MUST remain intact. | Redacted failure fixtures, contract reconciliation, new bounded manifest and no ordinary runtime activation. |
| EV-08 | Failures, abstentions, censored games and underpowered slices MUST remain in reporting; evaluation MUST NOT silently substitute local play or discard unfavorable data. | Attempt/completion denominators, unresolved outcome bounds, declared fallback arms and inconclusive status. |

## Reconciled decisions

- **Diamond-first scope:** replace the earlier narrow first acceptance slice with six independent decision mechanisms plus one ambiguous sequence family. Retain diamond fixtures as development examples, not the source of every tactic.
- **Primary Jev candidate set:** full legal Spades actions for this experiment. The existing shortlisted-code/same-shortlist-Jev study remains a separate diagnostic. No production candidate/UI contract changes now.
- **Ordinal versus numeric evidence:** qualitative hypotheses remain the first runtime design. The new probability plan adds a separately evaluated event-forecast workstream; it does not reinterpret heuristic scores as percentages.
- **Counts and thresholds:** retain the historical 400-position authoring baseline, 200-seed/four-rotation hand diagnostic and provisional hand/harm gates. Add pilot-sized full-match and player studies; previous counts do not establish adequate power or universal coverage.
- **Provider facts:** current adapter is OpenRouter, eight-second smoke deadline, `0.02` probability-total tolerance, shadow-only. Historical direct-TypeSafe/four-second/`0.000001` text is not a verified current contract. Resolve those differences with official evidence and fixtures before live acceptance; no validator change or cause of the previous rejection is inferred here.

## Alternatives and compatibility

Rejected as sufficient: more variations of one example; a fixed success percentage per scenario; Jev agreement as truth; a single bot tournament as proof of teaching value. Selected: independent discovery, typed conditions, explicit probability events and separate evaluation lanes.

Rules, scoring, visibility, table types, current policy, public API and saved advice stay under their existing versions. Future changes version inference, tactics, events, prompts, calibrators and content. Other games reuse the method, not Spades-specific thresholds, trump/partner rules or sample counts.

**Evidence for this review:** [review report](../../qa/implementation/scenario-coverage-review.md). New compound scenarios, discovery batches, forecasts, provider experiments and player studies remain planned.
