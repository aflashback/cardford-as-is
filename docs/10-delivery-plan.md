# 10 — Delivery backlog and agent execution plan

## A. Execution order

Use small, independently testable increments. G0 interface/strategy work and the deterministic core can proceed in parallel once contracts are frozen. Do not spend the first iteration polishing a table while hiding missing rule or model work.

| Work package | Owner / inputs | Deliverables | Exit evidence |
|---|---|---|---|
| W00 — Repository and contracts | Lead integrator; entire pack | Workspace skeleton and module contracts, compatible lockfile, generated DTO pipeline, spec discrepancy log | Typecheck and contract checks; no changed rules without a decision record |
| W01 — Jev capability spike | AI integration agent; docs 04/09 and provider examples | Real smoke harness, fake-server tests, 40-position pilot, model/latency/usage report | G0 interface and preliminary strategic findings, or precise blocked status |
| W02 — Deterministic rules | Engine agent; docs 02/03 and golden fixtures | Generic kernel/registry and competition validation; Spades reducer, legal actions/scoring; test-only individual module; deterministic replay, seeded generator | G1 rule/property suite, including Nil/bags/ties |
| W03 — Observation and decision boundary | Engine + AI agents | Allowlisted projection, exact facts, candidate mapping, provider validation, demo policy | Hidden-hand invariance and malformed-response suite |
| W04 — Persistence and service | Backend agent; docs 03/07/08 | Guest identity, SQLite migrations, command API, durable jobs, resume/delete/fork infrastructure | Transaction/race/restart/auth tests |
| W05 — Playable responsive slice | Frontend agent; docs 01/06, typed API | Start, bid, play, score, service states, mode label | G2 completed human/three-bot hand on phone and desktop |
| W06 — Coaching and lessons | Learning-content agent + frontend/backend | Authored templates, hint stages, review, retry UI, twelve complete drills, progress | G3 factual-content tests and complete coaching journey |
| W07 — Evaluation and hardening | QA/evaluation agent | Dataset, baselines, paired experiments, UX/accessibility/security tests | G4 report with genuine evidence and known limitations |
| W08 — Reproducible pilot handoff | Lead integrator | Container/dev instructions, backup/restore check, release notes, demo/live setup guide | Fresh-checkout run; no secret leakage; explicit release decision |

Dependencies: W03 needs W02's legal/fact interfaces; W04 can scaffold against frozen contracts but cannot certify correctness before W02/W03; W05 may use labelled fixtures while W04 proceeds but cannot claim G2 until wired; W06 needs historical observations and replay. W07 designs tests early and runs them as slices arrive.

## B. Parallel ownership

Lead integrator owns shared schemas, root configuration and architecture decisions. Engine agent owns `game-kernel`, observation contracts and Spades engine/projections. AI agent owns `decision-policy` and prompt tests. Backend owns `apps/server` and migrations. Frontend owns `apps/web`. Learning-content agent owns `coaching`/`content`. QA owns end-to-end/evaluation harnesses and independent checks.

Each branch is limited to its owned paths unless the integrator approves a contract change. Shared interface proposals go through a small change request with impact and tests, not competing hand-edited DTOs. Integrate contracts first, then engine/service, then UI/coaching. Keep compile/test green at each merge. Parallelism is not permission to invent incompatible rule interpretations.

## C. Acceptance traceability

| Product requirement | Primary implementation | Required proof |
|---|---|---|
| Guided/practice/match play | W02/W04/W05 | Complete legal hand and match, selected frozen rules |
| Jev strategic decisions | W01/W03/W04 | Authenticated pin + recorded valid selections, no hidden information |
| Deterministic arithmetic | W02/W03 | Exact golden scores and pure facts |
| Hints and brief coaching | W06 | Original pre-action advice; predicate-tested text |
| Review and retry | W04/W06 | Immutable parent, safe historical view, branch/resume |
| Twelve drills and progress | W06 | Complete authored fixtures, accepted-set tests, assistance separation |
| Responsive accessible UI | W05/W07 | Viewport, keyboard, physical touch and manual accessibility evidence |
| Guest continuity/deletion | W04/W07 | Restart/resume, ownership and deletion races |
| Live/demo honesty | All | Mode labels and no silent substitute on failures |

The stable product IDs are in document 01; when implementation starts, expand this map to individual automated test IDs rather than relying on broad rows alone.

## D. Iterations and change control

Iteration 0 establishes provider feasibility and a trustworthy engine. Iteration 1 delivers one complete hand and persistence. Iteration 2 adds the full learning loop. Iteration 3 proves quality and operational behavior. These are work boundaries, not calendar promises.

After each iteration, produce a short handoff containing completed requirements, tests actually run, screenshots where relevant, live versus mocked dependencies, remaining risks and the next bounded work item. Ask the owner to review product tradeoffs, not details already decided in this pack. Any new decision must preserve the central Jev/code separation or explicitly request a scope change.

## E. Definition of done

A new checkout can install, test, build and run using documented commands. A local demo works without paid credentials and is clearly labelled. With valid owner-supplied credentials, a real Jev game completes and persists. Rules, API, observation isolation, scoring, retries, coaching facts, original drills and responsive interactions all have tests. The release report admits skipped/inconclusive evidence. There are no fake menus, TODO-backed core features, seeded-only gameplay sold as random, or unsupported coaching accuracy claims.

A prototype can be useful before all gates pass, but its label must say what remains incomplete. Do not call a fixture-driven frontend the finished product.

## F. Multi-game acceptance additions

FR-17/18 map to W00/W02/W03/W04 plus the extension-conformance suite. FR-19 maps to W05/W07. Treat the shared interfaces as part of the initial build, not a future refactor. The next-game iteration adds one module, source-checked rule profile, original content, game-specific Jev evaluation and any new capability adapters. It does not fork the whole product.

No production Hearts/Tarneeb/other game, simultaneous hidden-action engine, multiplayer service or module marketplace is part of the initial workload. Do not enlarge scope under the name of extensibility.
