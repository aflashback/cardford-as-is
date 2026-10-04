# Inputs required by the main implementation plan

Proposed prerequisites, 4 October 2026. PRE identifiers are research tracking IDs, **not approved release requirements or completed checks**. The later plan must map adopted items to requirements, files, compatibility, acceptance evidence and changelog entries.

## 1. Freeze the rule and product inputs

**PRE-01 — Variant dossier.** For each supported variant, select a source and record deck/ranks, turn direction, deal schedule, bidding/auction/pass, trump/contract selection, legal play, public disclosures, doubles, score breakdown, ties and termination. Include examples and contradictions resolved with the owner. Solo is not inferred from a partnership toggle.

The owner selected standard gameplay, preferred Waraq references and corroboration; Syrian/Egyptian editions are excluded. The narrow unresolved decisions are listed in [08](08-standard-rule-reconciliation.md), rather than a backlog of regional variants:

- **Tarneeb:** Solo's meaning; first leader; ordinary successful-bid scoring; all-pass dealer; unbid sweep; match threshold/ties. The common auction/trump mechanics are researched; the failed bid-13 penalty is corroborated, not a conflict.
- **Trix:** use corroborated Jack layout and ordinary five-contract / Complex two-contract schedules as proposed targets; freeze opening actors, penalty-play restrictions, doubles inclusion/timing/self-capture and tied final scores. Flexible combinations and alternative team-ranking editions are excluded.
- **Product budgets:** permitted decision latency/work/memory and which horizons matter in coached single-hand versus full-match sessions. Measure candidate costs before fixing limits.

The source-supported distinctions are in [05](05-evidence-and-variant-research.md). These block new-game reducers/objectives, not the shared architecture review.

## 2. Specify data and ownership before coding

| Artifact | Required content / owner |
|---|---|
| `ModuleManifest` | Game, supported variants, schemas, capability handlers, compatibility; installed trusted module |
| `SessionEnvelope` | Four seats, controllers, competitor partition, game/variant/rule/module versions, revision, lifecycle; platform |
| `ModuleState` / events | Namespaced phase, active/pending actors, contract pool, game board, private/public zones, deterministic automatic transitions; game |
| `ActorInput` | Own holdings, permitted public/own-private event history at this revision, legal candidate IDs, exact knowledge and actor-owned memory; allowlisted game projector |
| `KnowledgeRecord` | Constraint IDs, evidence-event references, feasible domains, separately named soft assumptions/belief version; game |
| `DecisionRecord` | Original input/hash, full candidates, selected action/source, objective/horizon/comparison, searched/unsampled set, work/truncation, versions and limitations; shared envelope + typed game data |
| `PlanMemory` | Actor/visibility, objective, contingent plan, evidence/assumptions and revision; never a private partner channel |
| `Estimate` | Defined event/population, world prior, continuation policy, seed/work, effective samples, uncertainty and calibration status; no confidence invention |
| `CaseDefinition` | Stable ID/family/variant, trigger, alternatives, exception/counterworld, tactic, claims/cue, fixtures, sources, owner/status/version; game |
| `EvaluationManifest` | Frozen policies/rules, objective, independent labels, deal-family split, opponent/teammate styles, estimand, harm bounds, compute limits and promotion rule |

Persistence loads and validates the identified module schema before use; public transport is generated independently. Card instance identity, phase-specific trick ordering and layout adjacency remain distinct. Pin constraint, belief, continuation, objective, case, prompt, model and schema versions with decisions. Historical review reads originals; recomputation has a new identity. Versioned reducers/readers or read-only legacy support preserve old sessions without silent rescoring.

The information key covers everything that actor may remember, including earlier permitted private exchanges/reveals, not just today's hand or the visible UI. Event projections cannot expose another actor's private choices. Synthetic future chance events use explicit reproducible random inputs; real dealing material stays private.

## 3. Make scenarios maintainable

**PRE-02 — Typed case catalog.** Use small TypeScript files per game/family and validated JSON fixtures. Reuse the existing Spades case approach rather than inventing an arbitrary rule DSL. A human-readable catalog is generated from those definitions, preventing a second manually maintained rules copy.

Track recognition, factual proof, action effect, cue fidelity, reviewed labels, browser occurrence and strategic confirmation separately. Priority/conflict resolution must be explicit when multiple tactics apply. Each changed tactic needs a counterexample and a reachable exception. A zero-hit scenario is a coverage gap, not passing evidence. Optional future admin controls must publish a versioned reviewed configuration.

**PRE-03 — Research-to-code ledger.** Map the 706 text and 672 browser choices to game/variant/phase/family and permitted input. Preserve original paragraphs as hypotheses. Group related deals, rotations and counterworlds before splitting development versus held-out data. Identical actor packets are not independent samples. Obtain blind acceptable-action sets, alternatives and contested/unknown labels before showing the bot's answer.

## 4. Proof cases required before selecting the API

**PRE-04 — Production conformance.** Exercise service → saved state → seat projection → policy → authorized candidate commit → restart/replay → UI adapter. Include a non-trick test module and exclude it from the catalog. Check unsupported capabilities fail closed. The current isolated counter tests cannot satisfy this.

**PRE-05 — Phase/horizon and information cases.** Define reachable fixtures under approved rules:

| Proof case | Required observation |
|---|---|
| Tarneeb auction pass, chosen trump, reversed direction | Distinct typed actions; correct next actor and score after resume |
| Tarneeb first lead, all-pass redeal, both teams crossing target | Exact chosen profile; redeal consumes explicit chance input; winner/tie is module-owned |
| Trix layout origin/order and opening actor | Profile fixture distinguishes Jack/Ace-high target from Waraq's incompatible seven/Ace-low description |
| Trix public doubling, if included | Revealed card appears only after its event; earlier packets/advice remain unchanged |
| Trix layout blocked seat / finished player | Pass only when no legal extension; skip finished players; no false suit-void inference |
| Trix contract selection and kingdom horizon | Consumed contract stays consumed; future deals follow the profile; declared longer objective survives restart |
| Identical actor information, changed hidden hands/partner plan | Identical policy inputs and deterministic outputs with fixed seed; no scratchpad sharing |
| Simulation versus production reducer | Reachable legal transitions and identical scoring/terminal results; no second authoritative scorer |
| Advice hidden versus shown | Same analysis/original advice; assistance visibility affects display and learning records only |

Test chance/redeal/pass termination and bounded work explicitly. A rollout cut short cannot claim a completed outcome. For tree search, also prove information-set consistency across future nodes. These are planned tests, not newly completed ones.

## 5. Evaluate intelligent play separately from correctness

**PRE-06 — Per-variant evaluation specification.** Progress through:

1. Legal/scoring/replay and information-boundary gates.
2. Blind reviewed tactical cases plus exact small end positions where feasible.
3. Fresh paired deal families across seat order, score pressure, contrasting opponents and unfamiliar teammates; complete sessions at the declared horizon.
4. Explicit Jev comparison on identical permitted packets, after valid adapter fixtures and a separately bounded live experiment. Preserve the exhausted historical cap; no automatic retry/reset.
5. Human evaluation: understanding, then improved unaided decisions on unfamiliar situations. Measure helpfulness/abstention and misleading cues, not only match wins.

Define the estimand, practical gain/harm bounds, family dependence, sample-size rationale and stopping rule before the confirming run. Separate phases and Solo/Partners; do not reuse Spades score thresholds for Trix. Report coverage, contract/penalty/finish outcomes, factual errors, disagreement, resources and latency. Forecast calibration, strategic strength and teaching benefit are different results. Agent/model agreement supplies no independent answer key.

## Dependency and rewrite decisions

The later main plan should order: **rule dossiers → typed boundaries/legacy strategy → production conformance → phase/horizon and actor-isolation proof → game tactics/case ledger → independent evaluation → optional model promotion**. Current games need preservation gates throughout.

If a proof case needs fabricated Spades state, false round completion, hidden reads or ambiguous persisted actions, replace that boundary and record the example. Otherwise migrate it. Replacing the entire app requires evidence that these changes cannot be isolated. The completed [interview](03-architecture-answers.md) supports targeted migration plus selective planner replacement; it does not select a universally strongest search algorithm.
