# CR-ARCH-007 — PostgreSQL-only game authority

Recorded 18 October 2026. Status: **accepted storage direction; distributed delivery is specified and planned, not implemented**.

## Owner decision

The owner confirmed: “decision is made, no redis in design.” Keep PostgreSQL as the single authority for gameplay, history and archived games. Game-history and score-retention policy will be designed separately later.

This supersedes the permission to investigate Redis as a transient cache in [CR-ARCH-006](CR-ARCH-006-pause-presence-and-expiry.md) for the current design. The [Redis persistence review](../../docs/architecture/explorations/2026-10-18-redis-persistence-review.md) remains historical evaluation material, not an active implementation alternative. No Redis cache, journal, queue or gameplay store is included in this architecture direction.

## Rationale and consequences

- The current SQL acceptance transaction already coordinates game state, history, access/control checks, receipts and publication intent. Preserve that shared authority and its existing invariants.
- Redis offered no demonstrated latency or throughput advantage for this workload. Its proposed durability, visibility, failover and SQL handoff protocols added complexity without an established benefit.
- PostgreSQL replication creates copies of the same authoritative data. It does not introduce independent writable game authorities or permission to accept conflicting moves on multiple databases.
- Completed games are already durable SQL data. Later archive organization and retention can operate within PostgreSQL without moving live authority to another store.
- Expiry of resumability remains distinct from deletion of historical games, scores, access/usage receipts and account records. This decision authorizes no cleanup or retention change.

## Distributed architecture planning

Explore PostgreSQL failure recovery with distributed Go instances and player affinity. The owner selected **three database nodes** as the exploration baseline so gameplay can recover using surviving nodes rather than wait for a failed node's replacement.

The [planned specification](../../docs/superpowers/specs/2026-10-18-regional-postgresql-architecture-design.md) applies that baseline per independent region: one writer plus two standby candidates, durable primary-plus-standby confirmation, safe promotion/fencing and protected recovery using the survivors. [CR-ARCH-008](CR-ARCH-008-stable-player-home-region.md) records stable regional ownership and the owner's expectation that affected players wait during whole-region failure.

The [implementation guide](../../docs/superpowers/plans/2026-10-18-regional-postgresql-architecture.md) maps this direction to phased code/infrastructure work and acceptance evidence. Exact replication/promotion settings, availability-zone placement, provider, recovery-time target and deployment limits remain first-phase choices. The [earlier HA exploration](../../docs/architecture/explorations/2026-10-18-postgresql-ha-and-go-affinity.md) remains rationale. The owner requested documentation and an implementation guide; runtime changes, provisioning and service activation remain outside this task.

## Compatibility and future evidence

Preserve public command identities and original receipts, module/rule/schema/policy pins, actor-safe views, ownership/control fences, exact revision checks and explicit Resume after interruption. Existing Go, SQL and frontend behavior remains the implementation baseline.

Before a future distributed rollout, validate SQL-node loss and fencing, ambiguous commit recovery, Go-owner replacement, socket/outbox delivery, interrupted work, drain/reconnect, replica lag and backup restoration. This decision records no benchmark, fault-test or production-capacity result.
