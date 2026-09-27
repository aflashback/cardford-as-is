# 11 — Architecture decisions, risks and future changes

## Accepted baseline decisions

| ADR | Decision | Reason / consequence |
|---|---|---|
| ADR-001 | Spades first; one explicit partnership rule profile | Removes ambiguity from scoring and test oracles; variants later |
| ADR-002 | Jev is the only live strategic decision model | Preserves the intended System One experiment; poor strategy cannot be hidden behind an LLM |
| ADR-003 | Deterministic rules, facts and teaching templates | Verifiable legality/arithmetic; no fabricated explanations |
| ADR-004 | Separate per-seat information projections | Partner and opponents cannot cheat; historical advice remains fair |
| ADR-005 | TypeScript end to end | Shared domain/contracts and fewer language boundaries than a Python/.NET hybrid for this prototype |
| ADR-006 | React/Vite + Fastify, not a full-stack serverless framework | Clear client/server boundary; straightforward long-lived worker and local SQLite |
| ADR-007 | SQLite and one process/replica | Minimal operational surface; explicit scale limit and durable-volume requirement |
| ADR-008 | REST and short polling | Enough for one human against bots; avoids unnecessary real-time infrastructure |
| ADR-009 | Server-authoritative event history plus snapshot | Resume, audit and immutable retry; no need to re-query models for replay |
| ADR-010 | Guest browser identity; no account system | Faster first-use; no cross-device progress guarantee |
| ADR-011 | Neutral suggestions rather than chess-like accuracy labels | Confidence and disagreement do not establish optimality |
| ADR-012 | No runtime search/simulation engine in v1 | Measures Jev's actual fit; future exact/estimated features require a separate evaluation |
| ADR-013 | Responsive original HTML/CSS cards | Touch/keyboard support without graphics assets, canvas accessibility work or native clients |
| ADR-014 | Pinned model and independent version tags | Reproducibility and safe iteration; upgrades require re-evaluation |

These are chosen defaults, not requests for the owner to select a stack. Implementation may revise them with evidence, but must record a superseding decision and preserve historical sessions.

## Risk register

| Risk | Likelihood / impact before testing | Mitigation / release consequence |
|---|---|---|
| Jev weak at imperfect-information strategy | Unknown / high | G0 and G4 tests; improve inputs; label/stop unsupported strategic coaching |
| Confident but poor advice | Plausible / high | Neutral wording, authored facts, accepted-set evaluation; no raw “win odds” |
| Hidden information accidentally enters a feature | Plausible / high | Typed allowlists, invariance tests, per-seat requests and review separation |
| Nil/bag rule disagreements | Likely / medium | Named profile with explicit failed-Nil convention and golden cases |
| Duplicate or stale provider result mutates state | Plausible / high | Job uniqueness, short transactions, expected version and legality recheck |
| Small-screen hand is hard to use | Plausible / medium | Non-overlapping grid, 44px controls, touch/zoom tests |
| Weak lesson content despite functional app | Plausible / high | Authored objectives, tested accepted sets, novice user observation |
| Model/version/pricing availability changes | Plausible / medium | Pin, verify current account facts, configurable caps, no aliases in releases |
| SQLite deployment loses data or is scaled unsafely | Plausible / high | Durable volume, one replica, safe backup/restore test |
| API key unavailable during build | Possible / medium | Complete deterministic/demo work; live gate explicitly blocked |
| Spec expands into a generalized card-game platform | Likely / medium | Spades-only scope until complete coaching loop is proven |
| Retry appears to prove a move is optimal | Plausible / medium | Explain exposure and divergent opponent behavior; no false counterfactual scores |

## Unknowns that require evidence

Actual Jev strategy quality, card-domain order sensitivity, observed request size/latency, quota behavior, useful confidence thresholds and learning outcomes remain unmeasured. No architecture document can honestly settle those experimentally. The plan assigns tests and stop/go conditions instead of pretending the answers are known.

The owner does not need to decide these before the first build. The implementing agent must surface results rather than secretly substituting a different architecture when an assumption fails.

## Change process

Add a numbered change record: problem, evidence, proposed change, alternatives, affected contracts/tests/content, migration impact and acceptance criteria. Small compatible clarifications update patch versions. Changes to rule meaning, observation semantics or provider objectives require a version change and regression suite. Existing rule profiles and decision records stay immutable.

Prioritized later options: more and better authored exercises; localization (including RTL only after dedicated layout testing); empirical calibration; alternative Spades profiles; stronger deterministic feature computation; additional card games behind a proven adapter boundary. Accounts, multiplayer, voice and monetization are separate initiatives, not unfinished v1 requirements.

## ADR-013 — Four-player multi-game platform; Spades first

Owner update: support future four-player individual or two-pair card games and new capabilities. Decision: a small shared kernel with trusted build-time game modules; explicit competition partitions; namespaced typed actions/observations/content; generic lifecycle with module-owned phases. Ship Spades only, but prove the boundary using a test-only non-Spades individual module. Rejected: a Spades-only monolith later renamed to generic, a universal configurable rules language, microservices per game, runtime plugin downloads. See document 12.

## ADR-014 — Minimal table, not graphical game production

Owner update: cards must display properly, four players need only simple icons/avatars. Decision: semantic HTML/CSS cards, four compact seat badges, flat background, concise coaching panel, no 3D/character assets or elaborate animations. Responsive and accessible input takes priority over visual effects. This supersedes any earlier decorative design interpretation.
