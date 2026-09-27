# Local sampler and trial evidence

Implemented W05B/W13 subset: exact constraint-counted sampling, isolated one-trick Possible continuation, and a bounded synthetic baseline smoke comparison. This does not complete calibrated bidding A/B, rollout ranking, shortlist-loss evaluation, expert/human validation, categorical grades, or Jev promotion.

Executed with Node v24.19.0:

- `node --test --test-isolation=none web/server/tests/*.test.ts` — 43 passed, 0 failed. Includes 90 complete rule-regression hands, 6,000 sampler seeds checked against exhaustive tiny-state assignments, hidden-deal invariance, pass knowledge, void/lead restrictions, explicit infeasibility and all-mode isolated trials.
- Strict standalone TypeScript check with ES2022, NodeNext, `strict`, `noEmit` and `allowImportingTsExtensions` — passed. Workspace integration typecheck belongs to the integrator.
- `node web/server/evaluation/local-policy.ts` — 384 synthetic complete hands. Frozen input: `local-policy-manifest.json`. Output: `evidence/local-policy-smoke.json`; includes manifest hash, grouped rows, score summaries and observed elapsed time. Each seed stays grouped across modes, seats and policy variants. No learned parameter was fitted.

The first-legal comparator is deliberately simple and bids Nil whenever bidding. Outperforming it cannot certify strategic strength. The saved results do not select a new policy or enable player grades.

Provider mode: off. Observed model: none. Network/provider requests: zero.

The sampler consumes only a validated seat observation. It enforces hand sizes, own cards, public plays, voids, unbroken restricted leads, Hearts first-trick forced-penalty constraints and known outgoing-pass ownership. Dynamic programming counts complete assignments by permitted-seat masks, then selects allocations in proportion to exact combinatorial counts. Work is bounded to 250,000 count steps; impossible, inconsistent or exhausted inputs are explicit unavailable results. The deterministic PRNG seed is analysis material, never a production deal seed.

Trial frames always show the original viewer's permitted information; each simulated actor receives its own sampled observation for policy choice. Other players' private pass memories are unknown and are not reconstructed. The current baseline does not consume those memories. The result labels this limitation and stops at the end of one trick. It never reads actual future actions, modifies the live game or calls a provider.
