# CR-ARCH-002 — Current-game modules and original V1 readers

Recorded 5 October 2026. Authority: the owner's instruction to start the next implementation-preparation item after M00–M01. This executes M02 of the adopted multi-game plan; human strategy review remains deferred.

Hearts Solo, Spades Solo and Spades Partners receive game-owned native state, legal actions, pure reducers, score arithmetic integration, safe observations, strict private codecs and exact registrations. Native module/state/observation/event pins are `2.0.0`, with the same existing rule profile IDs. Original V1 state, journal operations, policy pins and issued advice retain their original meaning. This is an implementation-boundary change, not a rule or policy promotion.

Keeping the combined reducer would leave the next games dependent on current-game fields. Erasing private state into one generic union would weaken the typed registration seam. Concrete game-owned modules with explicit V1 adapters preserve existing consumers while preparing the bound-session integration. The independent original bodies remain available as historical readers and parity oracles.

The V1 service facade dispatches through explicit game-owned typed conversions and reducers while returning the existing V1 shape and pins. Trusted typed compatibility helpers preserve low-level legacy operations and synthetic rule fixtures; untrusted snapshot readers and registered sessions always use strict codecs. Old reducer/rules/observation bodies are retained independently under `game/legacy` to reproduce historical behavior and serve as parity oracles. Native policy adapters reconstruct the old safe input from one native actor observation, never from the complete game or another seat's input.

Ruling: move installed factories to `games/registrations.ts` and pure document parsing to `records/game-document-codec.ts`. The shared kernel keeps registry interfaces/factories but imports no installed game. The former kernel-level empty singleton aliases are removed; there are no production callers of those aliases. The same `RegisteredSessions` methods and `records/game-document.ts` decoder remain available. This resolves a reproduced module-first initialization cycle without mutable global installation or unchecked heterogeneous casts.

Ruling: a completed round requires explicit confirmation and fresh chance material. V1 action, collection and next-hand commands keep their separate logical revision boundaries. Native V2 journal/storage activation and cross-instance prepared-work fencing remain M03; HTTP/client dispatch remains M04. No existing saved document is rewritten or automatically repinned by this milestone.

Ruling: codec rejection of an impossible saved history is separate from accepting a trusted low-level typed test context. Native/legacy unknown-data readers reject illegal trump leads, follow-suit violations, inconsistent completed phases and invented score/winner results. These checks must not weaken to accommodate synthetic legacy rule tests.

Affected requirements: MG-02, MG-03, MG-04 and MG-09, scoped to M02. Public V1 and V2 schemas, rules, strategy/cue packs, prior experiments, held-out ledgers and launch offers remain unchanged. Tarneeb/Trix rule gates do not block this current-game extraction. Evidence and exact runnable commands are under `qa/implementation/multi-game/m02/`.
