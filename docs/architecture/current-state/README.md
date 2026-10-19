# Current-state architecture review

**Product:** CardFord. **Reviewed:** 16 October 2026, America/Toronto. **Scope:** source inspection and documentation; no application changes, deployment, service restart, database migration or collection run.

The current application is a React browser client backed by a Go modular service and PostgreSQL. Go owns game rules, deterministic bot decisions, persisted coaching/review records, access checks and progression. HTTP carries commands and recovery; a receive-only WebSocket delivers committed player-safe updates. A separate local Keycloak profile provides real sign-in through a dedicated Go entrypoint. Commercial billing and distributed hosting remain outside this implemented local baseline.

The [planned distributed and regional architecture](../planned/README.md) records the later SQL HA, Go affinity, stable-region and regional-outage decisions with a specification and implementation guide. It does not change this source-reviewed baseline into a deployed distributed system.

## Reading order

| Document | Purpose |
|---|---|
| [01 — High-level reference architecture](01-reference-architecture.md) | System context, authority boundaries and the runtime families |
| [02 — Components](02-components.md) | Browser, transport, services, modules, workers and offline tooling |
| [03 — Data and state](03-data-and-state.md) | Persistence, information boundaries and independent lifecycle state |
| [04 — Stack and setup](04-stack-and-setup.md) | Actual dependencies and local deployment diagrams |
| [05 — Gameplay sequences](05-gameplay-sequences.md) | Commands, delivery, recovery, bot work, pause, advice and review |
| [06 — Identity sequences](06-identity-sequences.md) | Sign-in, session replacement, authorization and logout |
| [07 — Decisions](07-decisions.md) | Existing decisions, implementation consequences and deferred choices |
| [08 — Review and evidence](08-review-and-evidence.md) | Findings, evidence limits, source map and update procedure |

Diagrams use editable Mermaid blocks beside their descriptions. Boxes are responsibilities unless explicitly labeled as processes or stores. A component diagram is not a claim that each box is a separately deployed service. Data relationships are conceptual unless identified as actual table names.

## Baseline and evidence convention

- Repository: `C:\repos\test-jev`.
- Git HEAD at review start: `e60cfb21d706611525197183f16628790025f5ac`.
- **The working tree was already extensively modified and contained untracked implementation files.** This review includes those files; the commit alone cannot reproduce it. The [source snapshot](source-snapshot.json) records hashes for the reviewed source entry points. It is a navigation/drift aid, not a complete application archive.
- **Implemented:** behavior visible in inspected source. **Recorded evidence:** a pre-existing report, with its own tested build and limits. **Not verified here:** execution, capacity, deployment or provider behavior not exercised during this documentation review.
- Existing acceptance reports were inspected, not rerun. Do not transfer a pass from an older binary or fixture profile to the entire current working tree.

The implementation takes precedence for this descriptive baseline. Owner decisions and normative contracts still govern intended behavior. Disagreement is recorded in the [review findings](08-review-and-evidence.md), rather than silently treating an older proposal as implemented.
