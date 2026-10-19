# Planned distributed and regional architecture

[Architecture index](../README.md) · [Current implementation](../current-state/README.md)

18 October 2026. This folder is the entry point for the planned architecture agreed through the SQL, Go-affinity and regional reviews. **It describes future work, not a deployed or tested distributed system.** The current-state folder remains the source-grounded implementation baseline.

## Reading order

| Document | Purpose |
|---|---|
| [Planned specification](../../superpowers/specs/2026-10-18-regional-postgresql-architecture-design.md) | Requirements, reference/component/stack views, data ownership, failure contracts and sequences |
| [Implementation guide](../../superpowers/plans/2026-10-18-regional-postgresql-architecture.md) | Dependencies, file/interface map, phased tasks, fault tests, rollout and rollback |
| [PostgreSQL-only authority decision](../../../planning/decisions/CR-ARCH-007-postgresql-only-game-authority.md) | No Redis; SQL owns gameplay, history and archive; three-node regional HA baseline |
| [Stable home region and outage decision](../../../planning/decisions/CR-ARCH-008-stable-player-home-region.md) | Stable assignment; affected players wait during home-region failure; no automatic cross-region game failover |

## Agreed direction

- Keep PostgreSQL as the single gameplay/history/archive authority; no Redis.
- Use one writer and two standby candidates per independent regional game cluster, with protected commits and safe promotion.
- Run distributed Go instances with player affinity and SQL-backed execution fences.
- Give every player a stable home region; preserve it across logins, travel and backend replacement.
- Route globally by the recorded assignment, then apply Go affinity within the region.
- Keep full game history in its owning region and consolidate selected global views asynchronously.
- On a whole-region outage, other regions continue serving their own players; affected players wait for home-region recovery. Reporting copies do not become game authorities.
- Design game-history and score-retention policy later.

The global directory and asynchronous reporting mechanisms are the engineering baseline carried into the planned spec. Provider, physical placement, recovery-time targets, export contents/freshness and detailed rollout settings remain explicit inputs to the first implementation phase. No provisioning, runtime change or fault test is authorized or reported by creating these documents.

Earlier reasoning remains in the [SQL HA exploration](../explorations/2026-10-18-postgresql-ha-and-go-affinity.md) and [regional exploration](../explorations/2026-10-18-regional-routing-and-gameplay-consolidation.md). The [Redis review](../explorations/2026-10-18-redis-persistence-review.md) is closed historical analysis.
