# trix-luna-review-1.0.0

Review this original Trix decision as an independent evidence reviewer. You did not play any seat in this episode. Use only the frozen actor packet, response and explicitly supplied checkable evidence. No files, tools, hidden hands, seeds, future cards, final scores or other-seat rationales are available to this review. Do not invent them.

{{actorPacket}}

{{originalCardOrDeclarationAndRationale}}

{{nativeFactAudit}}

{{actorSafeAlternativeEvidence}}

The player's confidence is initially withheld; confidence and final success do not establish correctness. Assess the **stated explanation**, not inaccessible internal effort. Length is not quality. A single legal action requires no invented alternative. A legal choice can remain uncertain even with a sound rationale.

Return a JSON review with:

1. The collector supplies `decisionId`, `packetHash`, `reviewVersion` and `provenance` from this assigned job. Omit these metadata fields from your JSON; do not copy or calculate hashes. Return the analysis fields below. Any echoed metadata is replaced by the saved authoritative values and logged separately; your analysis is not rewritten.
2. `rationaleStatus`: `adequate`, `incomplete-explanation`, `unsupported-claim`, `incorrect-fact`, `uncertain`, or `forced`.
3. `checks`: exactly five objects, with `id` = `facts`, `objective`, `material-alternatives`, `tactical-purpose`, or `uncertainty`; each has `status` = `supported`, `issue`, or `unknown`, `explanation`, and nonempty `evidenceRefs`. Every reference is an exact JSON pointer into the actor packet prefixed `actor:`, for example `actor:/ownHand/0`, `actor:/objective`, or `actor:/legalOptions/0`. References must resolve to fields actually supplied; invented paths and outcome references are rejected.
4. `categoryIds`: applicable IDs from {{categoryIds}}. Categories describe the decision; they are not proof of correctness.
5. `explanationIssues`: observable omissions or unsupported claims, each with evidence references. Say “the explanation omits…” rather than claiming the model did not think.
6. `hypotheses`: plausible alternative interpretations or strategies that require testing, with assumptions and counterexamples to seek.
7. `missedOpportunity`: null unless the supplied evidence proves a strictly better legal alternative for the stated remaining-request objective from the actor's information. If populated, include `alternativeCandidateId`, `objective`, `advantage`, `proofKind`, `proofRef`, `actorEvidenceRefs` and a concise `correction`. Valid proof kinds are `native-objective-dominance` or `information-set-exhaustive`. You cannot create a proof by asserting one. A positive sampled rollout, another model's opinion, a plausible scripted line or a lucky final score is insufficient.
8. `limitations`: remaining uncertainty and unavailable evidence.

Evidence reference catalog: the model-response schema includes `$defs.actorEvidenceReference.enum`, a code-generated list of valid `actor:/...` pointers from this exact supplied packet. Choose reference strings from that list verbatim instead of constructing a new path or guessing a field's parent. For example, `handCounts` is at `actor:/handCounts`, separate from `actor:/publicPhaseAndTurn`. The catalog supplies locations, not support for an arbitrary claim: check that the cited data supports your explanation. All actor-information and proof restrictions above still apply.

The orchestrator validates the review and proof reference independently. Failed proof validation leaves `missedOpportunity` null and retains the claim as an unconfirmed proposal. This review does not certify optimality, expertise, strength or human agreement.

Category meanings: DIA = diamond costs; HK = king-of-hearts risk; Q = queen costs; LUT = trick costs; VOID = suit exhaustion and exits; COMB = combined-component tradeoff; DBL = optional doubling; INFER = uncertain public-play inference; END = late lead/control order; TEAM = partnership objective. For Basic use its own request category plus applicable VOID/INFER/END. DBL applies only to king/queens/combined, COMB only to Complex, TEAM only to Partners. Use only categories materially relevant to this packet.

Additional public-information consistency checks:

Independently check the player's factual claims against the actor-visible rules, own hand, public plays, hand counts, legal options and public totals. Account for suit and rank exhaustion using the supplied deck and rank rules, verify legal play, and determine whether trick winners or later leads are forced. Distinguish a single legal action from multiple legal choices with identical forced consequences: a non-forced action does not imply an uncertain winner or score, and a forced consequence does not erase multiple legal choices.

For each consequence that public information proves, follow winner-leads-next and the supplied request-specific scoring rules through all affected seats or teams. Derive forced score changes and resulting totals from the supplied public totals and scoring components, checking whose points change and whose remain fixed. Do not claim that unknown discards can change scores when they cannot change the relevant trick winners or scoring components. Conversely, do not treat a fixed trick winner as fixing card-dependent penalty contents unless public information also proves those contents or their score effect. Preserve uncertainty for consequences that are not forced.

A player's claim contradicted by these constraints must produce an issue in the relevant check and an explanationIssues entry, supported by exact resolving actor: pointers; use rationaleStatus incorrect-fact for a contradicted factual claim, or unsupported-claim when a material claim lacks support without being disproved. A correct action or a mostly correct explanation does not excuse a false score or uncertainty claim. Keep hypotheses and limitations consistent with proven constraints; do not propose testing a possibility already ruled out by public information.

The ban on final scores means no supplied later outcome or actual final-score evidence is available; deterministic score consequences derived solely from the frozen actor-visible information are permitted and must be checked when relevant. Do not use hidden information, future observations, an expected answer or an invented continuation as evidence. Keep the exact JSON schema, five checks, actor-reference requirements, placeholders and missedOpportunity proof guards unchanged. These checks do not authorize a missedOpportunity without its required supplied proof.
