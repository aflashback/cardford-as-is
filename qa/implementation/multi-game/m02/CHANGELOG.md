# M02 current-game module extraction

5 October 2026. Owner authority: start the next item after the accepted M00–M01 and partnership slice. Change record: [CR-ARCH-002](../../../../planning/decisions/CR-ARCH-002-current-game-module-extraction.md).

- MG-02: extracted Hearts Solo and both Spades variants into game-owned native state, rules, reducers, safe observations, score integration, lifecycle and policy compatibility adapters. Hearts sealed passing retains all 286 legal choices and atomic exchange.
- MG-03 preparation: added strict private-state codecs and V1 readers that reject malformed pins, extra fields, card/history inconsistencies, illegal saved plays, fabricated scoring and inconsistent terminal phases. Missing or unsupported legacy versions remain read-only.
- MG-04 preparation: installed three exact typed registrations through the frozen M01 facade. Existing V1 game/observation entrypoints dispatch to game-owned implementations; their outward shapes, rule profiles and policy defaults remain unchanged. V2 persistence and HTTP/client activation remain M03–M04.
- MG-09: retained independent original reducer, rules and observation bodies; captured 684 legal commands across ten hands and 33 original analysis summaries before changing dispatch. Parity checks compare every transition, collection revision, event, all-seat safe observations, candidate ordering and original policy output. Original archives and public contracts remain unchanged.
- Repaired review findings for saved Spades legality/scoring, completed Hearts phases, strict Hearts V1 extra fields and first-hand cumulative scoring. Nested trusted projections allowlist public fields. Pure document parsing avoids a reproduced module-first import cycle.
- Final acceptance: 449/449 unchanged tests passed on a verified VM-native copy; Windows contracts/typecheck/build passed separately. Earlier transport and mounted-source timing failures remain recorded. Source/dependency/environment bytes matched before and after; no assertion or wall-cap changes were made.
- Jev remains off, with zero live requests and no observed runtime model. Human strategy review remains deferred. This milestone makes no strategy-strength or hosted-release claim.

Exact commands, outcomes, source hashes and the next milestone are in [status](status.md), `baseline.json`, `final.json`, `review.json` and `preservation.json`.
