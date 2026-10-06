# CR-ARCH-003 — Backend stack and system readiness

Recorded 5 October 2026 against `aa36c85505bcd8f4c42e9967fe1df195e4f55fb9`. Status: **planning direction; replacement backend not implemented**. Authority: the owner requested a system/experience review, preservation of the existing UI, PostgreSQL and a strong justification for any backend outside Rust or Go. Hosting and other nonfunctional implementation remain deferred.

## Decision

Use **Go with PostgreSQL as the default target for the application backend**, subject to the bounded M02A compatibility gate below. Keep React/Vite, public assets, the existing interaction design and one repository. Rust is the alternative if the measured workload or implementation review establishes a material advantage. This choice is engineering judgment about this application's service, persistence and bounded computation responsibilities; no CardFord benchmark has established a language winner.

The current TypeScript backend remains the working reference and migration oracle until replacement paths pass their gates. M00–M02 are completed foundations with their recorded limitations; they are not discarded or relabeled as Go implementations. In M02, “native” means game-owned TypeScript state/rules, not native machine code. Next work is **M02A backend contracts and one compatibility slice**, before M03/M04/M05 backend implementation. The [execution packet](../implementation/multi-game/backend-readiness.md) defines that gate, the source mapping and corrective work. This review itself starts no port, deployment or performance campaign.

This supersedes the backend-language restriction in **IMPL-02**, the Node-only prescription in capacity S02, and the future backend file/language assumptions in the 4 October multi-game plan. Keep their one-repository, schema-first, PostgreSQL, authority, history and UI requirements. The existing npm lockfile remains authoritative for JavaScript; a future pinned Go module has its own dependency lock/checks. There is no requirement to force two languages into one package manager. Earlier numbered specifications and completed milestone evidence remain historical records.

## Why this choice

| Option | Case for it | Cost and evidence needed | Disposition |
|---|---|---|---|
| Go + PostgreSQL | Fits a modular HTTP/SQL service with explicit request cancellation, bounded concurrent jobs and a single backend implementation. | Port exact rules, schemas, policy semantics and stored-history readers; measure allocations, garbage collection, CPU and tail latency. Goroutines alone do not bound admission or work. | Preferred next implementation target; validate with M02A. |
| Rust + PostgreSQL | Ownership and type checking help enforce concurrency boundaries; control of allocation is relevant to repeated search/sampling state copies. | Same compatibility and database work; async execution still requires bounded CPU scheduling and cooperative cancellation. Demonstrate enough benefit to justify additional implementation complexity for this project. | Valid alternative, especially if Go's representative compute slice misses a declared resource budget. |
| TypeScript/Node + PostgreSQL | Strongest existing compatibility evidence and smallest migration risk; typed-array/bitset search kernel already exists. CPU worker pools are supported, and the app already uses one for review trials. | Current gameplay analysis is synchronous in the API process. No current full-journey comparison establishes that retaining Node is preferable under the owner's constraint. A bounded worker design is possible but is not measured here. | Reference during migration. Permanent retention needs an explicit evidence-backed exception, not convenience or shared frontend types alone. |

Go's standard database API manages a concurrency-safe connection pool, and contexts can propagate deadlines/cancellation through supporting database calls. Pool limits, driver support and application cooperation still need tests. [Go connection management](https://go.dev/doc/database/manage-connections), [Go cancellation](https://go.dev/doc/database/cancel-operations), [database/sql driver limitation](https://pkg.go.dev/database/sql).

Node supports parallel CPU work through worker threads and recommends reusing a pool; changing a function to `async` does not relocate its synchronous work. [Node worker threads](https://nodejs.org/docs/latest-v24.x/api/worker_threads.html), [event-loop guidance](https://nodejs.org/en/learn/asynchronous-work/dont-block-the-event-loop). These are capability references, not benchmarks or a dependency upgrade instruction.

Rust's concurrency checks are valuable, but Tokio explicitly requires bounded CPU concurrency and warns that an already-running `spawn_blocking` task cannot be aborted. A Rust port needs the same admission, interruption and publication design. [Rust concurrency](https://doc.rust-lang.org/book/ch16-00-concurrency.html), [Tokio CPU work](https://docs.rs/tokio/latest/tokio/task/fn.spawn_blocking.html).

The largest identified scaling risks are also independent of language: repeated full-document writes, cumulative history copies, duplicate preparation and overbroad use of serialized reads. PostgreSQL row locks persist until the transaction ends; changing the service language does not remove that coordination cost. [PostgreSQL locking](https://www.postgresql.org/docs/current/explicit-locking.html). Current player-row locks protect correctness and must survive until an equally strong replacement is proven.

## System boundaries to preserve

1. A pure, versioned game module owns rules, legal candidates, scoring, observations, scenarios and game-specific reasoning. No shared Spades assumptions or browser authority.
2. An observation-only analysis executor accepts a frozen permitted packet, exact policy/budget pins and cancellation context. Bot choice and coach explanation derive from the same saved analysis. Expensive computation holds no database transaction or connection.
3. Durable command and prepared-work records bind owner, game, actor/window, revision, control lease, original access generation, input digest and all relevant versions. An issued result receipt is immutable. Recovering an accepted outcome is separate from authorizing new work.
4. A compact current snapshot and append-only history retain exact original replay/advice. Original chance material, information chronology and immutable policy attribution survive the port. PostgreSQL is the one durable authority; no dual-write migration or separately authoritative Go/Node services.
5. One public JSON Schema source generates/validates Go and TypeScript wire contracts. Server-private schemas remain separate. Go structs or shared TypeScript domain types must not become a second independently maintained protocol.

## Acceptance and remaining decisions

M02A freezes portable semantics, ports one representative path, compares against the original M02 corpus and records a go/no-go decision. M03 ports/activates durable records and readers; M04 ports/integrates service workflows with the preserved frontend; M05 supplies information-only, bounded planning. The application switches authority only after the required parity/recovery gates. Do not retain a permanent hybrid by default or rewrite the UI to accommodate a backend port.

The [system review](../../qa/implementation/multi-game/system-review-2026-10-05.md) records actual defects separately from planned activation gaps. In particular, the current evaluator exceeds a terminal-root step cap. Fix it as the first version-aware corrective slice of M02A; do not copy the defect into Go or silently change frozen policy attribution. No throughput, strategy-strength, human-learning or hosted-readiness claim follows from this decision.

Go version, router, database driver, schema generation implementation and CPU executor details are selected and pinned by M02A after inspecting available dependencies. No framework/vendor installation is authorized merely by naming this direction. If the slice fails its declared compatibility or resource gate, record the cause and compare the affected Go/Rust path; retaining Node requires a specific rationale and explicit plan amendment.

Affected requirements: IMPL-02–04, MG-01–06, MG-09, MG-15–18 and SYS-01–12 in the execution packet. Hosting topology/vendors, production capacity campaigns, native packaging, operational SLOs and human evaluation remain separate later gates.
