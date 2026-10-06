# Private platform record contract

M03, 6 October 2026 (Toronto). Executable definitions live in [records types](../../../server/internal/records/types.go), [strict readers](../../../server/internal/records/document.go) and the [game codec](../../../server/internal/records/codec.go). These are server-private records, separate from the closed public game envelope. They are not HTTP responses or a browser export format.

## Version and identity

Platform records use `recordVersion: 1.0.0`; compact checkpoints use `events-separated-1.0.0`. Session metadata pins the exact game/variant, module, rules, private/public/observation/event schemas, competition, controllers and reasoning policy/budget/components. Missing or ambiguous pins never acquire a default. A trusted registration binds an execution policy to an exact module and input/output schema set. Merely supplying a policy name does not make a session playable.

The decoder rejects unknown/missing fields, duplicate keys, malformed Unicode, nulls outside their declared shapes and unsafe integer values. It validates the envelope before the game-owned payload. A supported reader can keep an unavailable policy's history read-only. A historical reader must supply the exact old opening/replay implementation as well as its decoder, so original advice can be verified at its source revision. It cannot start or advance live sessions. An unknown module without an installed trusted reader fails closed. `ReadLegacyState` preserves supported original V1 private state bytes; complete existing V1 platform documents still use the original TypeScript reader. There is no bulk conversion or policy repinning.

## Persistence and replay

| Record | Durable meaning |
|---|---|
| Current document | Validated bounded current state, revision and event count/byte/digest cursors; no duplicated complete event history |
| Replay anchor | Immutable original configuration, actual opening chance and initial checkpoint, bound to metadata |
| Events | Append-only ordered game events with source revisions and a chained digest |
| Commands | Original accepted operation bytes, actual later chance material, full intent digest and resulting checkpoint digest |
| Decision | Original actor/revision/window/purpose, input digest/version, policy/components, eligible selected candidate, original analysis/advice bytes and admission/attempt/receipt identity |
| Exposure | Append-only record of delivered content and time, referencing the original decision; it cannot rewrite that decision |

The command digest covers `recordVersion`, game identity, resulting revision and the canonical operation. The owner's command-ID namespace plus that digest identifies a retry. Reusing the ID with another game, revision or operation rejects.

A decision stores its input digest and revision, not another copy of its growing observation history. Historical validation reconstructs the original permitted packet from the private replay anchor and accepted operations. It never substitutes current information or a newer analysis. Original analysis, advice and accepted response bytes are retained without JSONB reformatting.

Game snapshots own their compact representation, event suffix, identity and access-unit identity. Current-hand knowledge stays in the snapshot. Frozen Spades policies still require all previous events in their original observations; those events are loaded once from the archive at the import boundary. Compact writes do not imply constant-size reads. The [growth evidence](../../../qa/implementation/multi-game/m03/status.md) distinguishes those costs.

## Publication and recovery

Load releases its database connection before game decoding, policy work or replay. A bound immutable snapshot prevents substitution of a different same-revision state. Publication rechecks the stored origin, owner, current game, revision, window, access/control generations, grant, unit and applicable prepared receipt. One short transaction commits the current snapshot, event suffix, command/checkpoint, decision reference, allowance charge and original accepted response together. Failure leaves none of those accepted writes behind.

Accepted-command reconciliation checks current ownership/read permission and the original intent digest before considering eligibility for new work. It can therefore return the original response after revision advancement, game replacement or loss of play coverage. It never grants another mutation or exposes another owner's result.

The Go and Node migration runners share the canonical SQL directory, `schema_migrations` checksum ledger and advisory lock. Migrations 001–007 remain byte-preserved; 007 added the private platform tables and immutable-history constraints, and M04C adds 008 for local identity, control, service receipts and account erasure. The original Go test entry remains restricted to isolated `_test` schemas. M04C adds an explicit loopback local-service path using the separate fixed `cardford_go_local` schema; its scoped local-service acceptance has passed. See [native run instructions](windows-development.md#m04c-local-go-api).

## Prepared work and access

Work is queued durably before dispatch, and one claimed attempt receives a finite fenced lease. States are `queued`, `running`, `completed`, `rejected` and `canceled`. Reclaim rejects an expired attempt's token. Publication checks the originally admitted actor, packet, policy, revision/window, unit and access/control generations. A completed work row points to the single immutable decision record; acceptance references those same bytes.

Unfinished terminal/expired work can be explicitly requeued under current valid bindings. An expired completed result remains readable and cannot be newly accepted. Its explicit retry creates a successor work identity while retaining the original result and receipt. Concurrent retries share one successor. Neither flow silently overwrites an issued result.

Access trials are separate from review alternatives. Trial activation is unique by server owner and stable trial key, independent of device, offer revision or replacement grant ID. Grant/offer references and purchased terms remain immutable; revocation is explicit. Usage is keyed by owner, stable bucket and period, with one charge per admitted game/unit across periods. A hand crossing midnight retains its original charge period. Policy/grant changes do not create another quota. M03 supports explicit UTC-day and lifetime buckets; other calendars fail closed until implemented.

The game supplies the actual current unit. Natural expiry may finish only a recorded admitted unit when its terms permit; it cannot authorize the next hand. Freshly authorized control/device changes preserve those purchased finish rights while invalidating old prepared work. Current security revocation still denies operations. Play-only access permits the ordinary internal bot/human analysis; delivering coaching or a review alternative additionally requires its configured permission/tool. A separate coaching grant need not also grant play; the current live session still requires overall play access.

Saved review alternatives retain their original parent decision, eligible alternative, source packet digest and original result bytes. The future-exposure marker is conservative: a live revision beyond the parent indicates potential exposure, not proof that a human saw every later fact. M03 stores and validates the result; M04/M05 supply the service and continuation execution.

## Bounds and remaining integration

The record layer caps hot state at 256 KiB, archives at 16 MiB and events at 100,000, with safe-integer counters. Pool, connect, query and lock waits are finite. Work lifetime is at most ten minutes and an attempt lease at most thirty seconds. Oversized or stale work rejects before accepted publication; these are bounded local behaviors, not a production capacity claim.

[M04A](../../../qa/implementation/multi-game/m04/status.md) completes Go Hearts; [M04B](../../../qa/implementation/multi-game/m04b/status.md) adds original policy/coach parity and V2 sessions. M04C now composes them with authenticated local public projections, durable exact preparation, HTTP recovery and atomic receipt publication. It also supplies an owner-scoped account-erasure path while immutable-history triggers continue protecting ordinary writes. Its local service passed scoped acceptance ([evidence](../../../qa/implementation/multi-game/m04c/status.md)); M04D exact-target offers and later complete platform/client integration remain open. Installing a session adapter does not automatically change storage eligibility or pins. The separate M02 V2 wrapper preserves semantic journal/audit JSON, while this repository retains original analysis/advice bytes; complete original V1 history remains with the original reader. Hosting, live billing/providers and human evaluation remain separate work.
