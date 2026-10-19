# CardFord architecture

Start with the [current-state architecture](current-state/README.md). It describes the implementation in the working checkout, including the local authentication profile, and separates source findings from recorded runtime evidence.

The numbered specification [03 — Architecture](../03-architecture.md) preserves the historical v0.2 design. [Change records](../../planning/decisions/) retain the decisions that superseded it. Neither document should be read as a complete picture of today's runtime.

The [planned distributed and regional architecture](planned/README.md) records the decisions reviewed on 18 October 2026. Read its [specification](../superpowers/specs/2026-10-18-regional-postgresql-architecture-design.md) for the reference, component, stack and sequence views, then the [implementation guide](../superpowers/plans/2026-10-18-regional-postgresql-architecture.md) for phased delivery, fault tests and rollout. These documents describe future work, not the implemented topology.

The owner has selected [PostgreSQL-only game authority, with no Redis](../../planning/decisions/CR-ARCH-007-postgresql-only-game-authority.md). Gameplay, history and archived games share that authority; history and score-retention policy remains later work.

The planned baseline is three data nodes per independent regional PostgreSQL cluster, distributed Go instances and player affinity backed by SQL ownership fences. It preserves confirmed moves after one SQL machine/disk failure and requires safe promotion, protected confirmation and recoverable delivery/work. Provider, placement, recovery-time targets and detailed protocols are explicit first-phase inputs in the guide.

The owner also selected a [stable home region and regional-outage behavior](../../planning/decisions/CR-ARCH-008-stable-player-home-region.md): affected players wait for their home region to recover; other regions keep serving their own players. Global routing and asynchronous reporting do not create a cross-region game recovery copy. Whole-region destruction has no zero-loss guarantee under this baseline.

The earlier [SQL HA and Go affinity](explorations/2026-10-18-postgresql-ha-and-go-affinity.md) and [regional routing and consolidation](explorations/2026-10-18-regional-routing-and-gameplay-consolidation.md) explorations remain supporting rationale. The planned specification is the consolidated source for future implementation.

The earlier [Redis persistence exploration](explorations/2026-10-18-redis-persistence-review.md) is retained as historical evaluation supporting the decision to exclude Redis.
