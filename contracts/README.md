# Contract inventory and authority

These are planning contracts, not a generated client/server. JSON Schema uses draft 2020-12; OpenAPI is 3.1.0. Resolve relative references within this directory. Generate application DTOs from these schemas during W00. The draft private engine-state schema must be designed, reviewed and frozen in W02 before the first persistence migration; it is not the public observation schema.

`common`/`competition`/`game-manifest`/`table-view` describe shared boundaries. `spades-*` describes the initial module. `decision-observation` and `session-view` are the initial registered union with one Spades member; adding a game extends the discriminated union rather than accepting arbitrary JSON. `jev-*` describes our supported Choice subset and Spades semantic projection, not every vendor API feature. A future game adds its provider-state branch, leaving HTTP transport unchanged.

`spades-rule-profile.json` is a configuration snapshot governed by document 02. It is not a general rules engine. Examples are separately labelled synthetic. Missing or extra fields fail closed at private-information boundaries; do not silently strip fields and declare safety.

Required post-schema semantics include unique seat partitions; approved Spades NS/EW membership; phase/candidate consistency; `bid:n` matching payload n; `play:X` matching cardIds and payload; ownership; legal moves; probability keys exactly equal candidates; sum within 1e-6 and chosen maximum; model names, probabilities, confidence and token usage null for demo/forced sources; forced source only when exactly one legal candidate exists.

Catalog manifests in examples use human-readable identifiers for private/test state schemas that the future engine work must supply. Those values are registry IDs, not references to files claimed to exist in this pack. W00/W02 replace them with registered IDs before any app startup can pass capability validation.
