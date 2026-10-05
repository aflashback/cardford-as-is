# Architecture interview: answers and revised position

2026-10-04 · architecture interviewer · answers to the reasoning interviewer's actual RQ1–RQ6 in [02](02-reasoning-position.md), received through agent messaging. Investigation only.

**RQ1 — Production enforcement.** Agree that an isolated generic interface provides insufficient enforcement. Make a typed registered module factory/dispatcher the sole game-facing port used by `GameService`. Each registration binds private state, action, observation, facts, analysis and their schema versions; shared services receive the common session envelope. Heterogeneous payloads enter as unknown and are validated/narrowed through that registration, without unchecked casts. Generate closed public unions from installed module schemas. Resolve immutable module/rule/schema identifiers before decoding saved state. This replaces the current direct [engine imports](C:/repos/test-jev/web/server/http/game-service.ts:3), not merely their filenames.

**RQ2 — Phases and horizons.** Agree. Keep lifecycle, actor eligibility and automatic transitions separate from namespaced module phases. Modules declare phase action types, objective identifier, evaluation horizon, terminal condition and public zones. Auction, contract selection, trick play and layout need their own semantics. A finished hand need not finish the declared evaluation horizon; a forced pass is a legal action, not a missing decision. No phase inherits today's [bid/play guard](C:/repos/test-jev/web/server/http/game-service.ts:495). Tarneeb Solo and exact Trix profiles remain unresolved.

**RQ3 — Knowledge and beliefs.** Modules own hard constraints derived from their rule profile and permitted information. A separately versioned likelihood model expresses soft beliefs. Shared constraint/sampling utilities may consume explicit constraints, but bids or signaling hypotheses cannot silently remove feasible worlds. A zero likelihood is not proof of impossibility. Save constraint, belief, continuation and objective versions with estimates; checkers distinguish exact predicates from assumptions.

**RQ4 — Simulated actor isolation.** Split the simulation referee from continuation policy. The referee holds `World`; a module projector produces the acting seat's observation; the policy callback accepts only that observation and its own versioned memory. Today's [`defaultMove(world)`](C:/repos/test-jev/web/server/strategy/plan/types.ts:108) relies on implementation discipline. Compare serialized packets and deterministic policy outputs across worlds indistinguishable to that actor, including forbidden changes to partner holdings and another seat's plan. This is a trusted-code boundary with tests, not operating-system isolation; it does not independently solve strategy fusion.

**RQ5 — Payoffs.** Agree to per-competitor payoff vectors, named horizons and module-owned comparison rules. Scalarization may still be useful, but its units, priorities and version must be explicit and separately evaluated. Neither a universal higher-score objective nor two-player zero-sum assumptions belong in the kernel. Partnership payoff aggregation never grants access to the partner's private knowledge.

**RQ6 — Rewrite threshold.** Replace a module/runner when required decisions need fabricated terminal states, inaccessible information, or ambiguous persisted action meaning to fit its API. First demonstrate that incompatibility using the selected rule profile and a reachable case. Keep frozen legacy readers/reducers and original observation/action/advice records; unsupported versions become read-only. Current evidence supports selective replacement. A whole-app rewrite needs additional evidence that reusable ownership, persistence and access mechanisms prevent the design.

## Adversarial failure gates

1. **Future-reveal contamination:** a card publicly revealed by a later doubling event must appear in subsequent permitted observations but remain absent from earlier decision packets and original advice. Restart, replay and hypothetical retries must preserve that chronology. Any earlier visibility fails the information boundary, even if resulting advice is stronger.
2. **Wrong-horizon preference:** construct a reachable approved Trix profile where contract choices trade immediate penalties against remaining contract/layout opportunities. Freeze available contracts, controller and horizon; restart before selection and reproduce both candidates' declared continuation. Reject an adapter that resets the kingdom or compares only the current hand while claiming the longer objective. Independent strategic labels remain necessary.

## Closing exchange and final revision

**Reasoning interviewer C1:** “Retaining PlanningPack wholesale is premature.” It identified round-terminal utility and fixed focal stance as potential losses of Trix contract/kingdom value, and asked to preserve budget/evidence arithmetic independently.

**Architecture response:** Accepted. My initial recommendation now preserves reusable pairing, budget and evidence components; the existing `PlanningPack` API is provisional. Horizon, policy memory and continuation semantics must be tested against approved multi-phase profiles before deciding extension versus replacement. No implementation is authorized by this revision.

**Reasoning reply:** “Your revised preservation of arithmetic/evidence rather than whole PlanningPack addresses my substantive disagreement.”

**Final revision:** Retain that narrowed recommendation; require production-path horizon and public-reveal evidence before selecting a planner API.

**Later rule-source decision:** After the interview, the owner selected Jawaker as the Trix authority, including its Jack-centered layout. This supersedes the open profile statement above; see [08](08-standard-rule-reconciliation.md). The interview answer remains unchanged as a historical record.
