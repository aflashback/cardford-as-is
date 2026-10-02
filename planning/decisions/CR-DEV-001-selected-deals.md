# CR-DEV-001 — Selected opening deals for local training and regression tests

**Owner approval:** 1 October 2026: build a way to provide predefined cards for training, evaluation and repeatable testing in a development/staging environment or local testing; rebuild, test and merge into main.

The engine already accepts an explicit deck. The local HTTP entry point previously always shuffled. This change connects that existing seam to an explicitly enabled, server-owned fixture catalog. It is an exception to random dealing for labelled practice, not a change to ordinary dealing or either game's rules.

| Requirement | Behaviour | Acceptance evidence |
|---|---|---|
| RD-01 | A versioned private JSON file specifies four complete opening hands and a dealer. Reject malformed cards, duplicate cards/IDs, missing or extra fields, unsupported modes/versions and incomplete deals. Materialize the existing engine's clockwise deck deterministically. | `dev-scenarios.test.ts`: all modes and all dealer seats, input immutability, invalid files and safe metadata. |
| RD-02 | `DEV_SCENARIOS_FILE` enables selection only with `APP_ENV=local` or `test`. Default is disabled. Hosted overrides fail closed. The catalog returns metadata; a new-session request submits only a scenario ID or a replay selector. Existing ownership, coverage, control, origin and idempotency checks apply. Unknown or mismatched selections never fall back to randomness. | Config, generated-contract and selected-deal HTTP tests, including disabled/hosted/authentication/ownership/control cases. |
| RD-03 | Persist the actual opening deck, dealer and scenario ID/version privately. Label the table. Replay starts a fresh game from the saved deck and dealer, resets scores/actions and preserves the original game, even if the source fixture has changed. Bot/coach decisions are recomputed from seat-safe observations. | HTTP complete hands/replay/restart in all three modes; changed-file replay; browser selection and replay. |
| RD-04 | Provide runnable local commands, editable examples and instructions for using the same private fixture loader in offline tests. Normal new games and subsequent `/next-hand` calls retain cryptographic Fisher–Yates dealing. | Build, boundary/artifact checks, browser journeys and execution report linked below. |

Scope is **opening hands**, not arbitrary mid-hand states, forced bids, scripted future actions or partially specified hands. The first Hearts hand uses the existing left pass; initial scores/bags are zero. Each catalog entry selects one of the existing frozen modes. The public scenario marker applies only to hand one. The UI's “Replay this deal” starts that selected opening setup again; a normal new-game selection defaults back to random.

If the server is restarted with selection disabled, an already saved selected hand retains its honest label and ordinary play. Its completion offers normal “Play again”; it cannot request a selected replay while the feature is disabled.

Selected deals are authored practice/test inputs. They are not representative random samples or unaided assessments, and passing these scenarios does not establish coach strength. Original saved advice and event history are immutable. No fixture metadata, other hands or deck material enters strategy/provider observations, and Jev remains off.

Alternatives: public full-deck input would expand the browser trust boundary; seed-only reproduction would depend on shuffle versions; a second engine would duplicate rules. Use the existing explicit-deck engine and privately stored actual deals instead. No database migration is needed; the provenance field is optional for historical documents. Request/response additions are compatible optional fields generated from the canonical public schema.

Hosted staging remains blocked by its existing managed-identity gate. This delivers the owner-authorized local option without relaxing that gate.

**Necessary baseline repair:** the starting `main` omitted the required `PlanDecision.tiedActionIds` field in the test/evaluation Hearts plan adapter, causing `npm run typecheck` to fail with TS2741. Forward its already-computed `decision.tiedIds` (or an empty list when no search ran), matching the existing Spades adapter. This does not change the live Hearts policy, rules or selected actions.

Usage: [selected-deal guide](../dev-deals.md). Actual results: [acceptance report](../../qa/implementation/selected-deals-acceptance.md).
