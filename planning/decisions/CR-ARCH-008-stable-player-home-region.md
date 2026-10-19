# CR-ARCH-008 — Stable player home region and regional outage

Recorded and extended 18 October 2026. Status: **accepted routing and outage requirements; regional delivery is specified and planned, not implemented**.

## Owner decision

Each player keeps a stable home region across future logins. An active game stays in its original region. The owner explicitly selected this over choosing a new region between games.

The owner also confirmed that an entire home-region outage leaves affected players waiting for that region's recovery. Other serving regions continue with their own players; they do not automatically become a recovery copy or accept those games. Asynchronous global summaries do not guarantee preservation of every confirmed move after whole-region destruction.

This extends [CR-ARCH-007](CR-ARCH-007-postgresql-only-game-authority.md): PostgreSQL is the game/history/archive authority, Redis is excluded, and history/score retention remains later work. The no-loss requirement covers one regional SQL machine and its disk. This record does not select a cloud vendor, region list, global database product, relocation feature, recovery-time target or additional cross-region durability guarantee.

## Consequences for the planned architecture

- Returning players route using their recorded home region, rather than a fresh geographical or latency decision on every login. A network change, travel or cleared affinity cookie must not create a second account or game authority.
- Region assignment and backend affinity are different: a player stays in the region but may recover on another Go instance within it.
- Each game has one authoritative SQL writer at a time. Independent regional SQL clusters may own disjoint player/game data; global reporting copies do not accept gameplay commands.
- Health-based routing must not silently relocate an existing game to an unrelated region. During whole-region outage, return an unavailable/recovery state without creating another account or game authority. Any later cross-region recovery or account migration requires a separate ownership-transfer and durability design.
- Regional recovery validates the authoritative history and receipts, reconciles pending commands and preserves authentication/control deadlines and explicit Resume. An older backup must not be represented as a proven complete confirmed history.

## Specification, implementation guide and evidence

The [planned specification](../../docs/superpowers/specs/2026-10-18-regional-postgresql-architecture-design.md) consolidates the minimal global assignment directory, regional Go/SQL and regional Keycloak direction, account-aware routing and asynchronous selected-fact reporting. The [implementation guide](../../docs/superpowers/plans/2026-10-18-regional-postgresql-architecture.md) defines dependencies and fault evidence. The [regional exploration](../../docs/architecture/explorations/2026-10-18-regional-routing-and-gameplay-consolidation.md) remains supporting reasoning.

The three-data-node HA baseline applies to each independent regional game cluster. The number of deployed regions, cost, directory availability, exact identity discovery/billing protocols, reporting freshness and destructive-region restore procedure remain implementation inputs. The outage behavior itself is decided: affected players wait; no automatic cross-region game failover. No services, databases, schemas or runtime behavior were changed for this decision.
