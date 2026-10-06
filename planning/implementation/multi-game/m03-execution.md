# M03 — Durable records and prepared work

6 October 2026 (Toronto). Owner instruction: close the completed Go/Node comparison, choose one local environment, and proceed with M03. Starting commit: `6310d6e`, branch `codex/current-game-modules-m02`. Requirements: MG-03/05/09/16 and SYS-03–07/10; SYS-12 records local growth evidence. The backend mapping in [backend readiness](backend-readiness.md) governs the earlier TypeScript file list.

## Environment and scope

Use native Windows for all current local development and verification: pinned Go 1.26.8, Node 24.19.0 and PostgreSQL 16.15 through [the wrapper](../../../scripts/windows-env.mjs). WSL/Podman remain historical alternatives for existing data; no new milestone depends on them. Keep original databases, backups, `.env.local`, unrelated worktrees and the committed comparison evidence. Delete only identified disposable comparison builds, controls and downloads. Benchmark tools remain available for a future explicitly scoped investigation; normal verification does not rerun the comparison.

M03 implements the private Go persistence boundary and database behavior. M04 owns production HTTP/client dispatch, full current-game service activation and access-offer resolution; M05 owns reasoning execution. The existing UI and TypeScript authority remain active. Go Hearts still has the explicitly bounded opening/pass adapter until its complete port is accepted. No live provider, human evaluation, hosting or new-game scope is added here.

## Work ownership and acceptance

| Work | Owner/files | Evidence required |
|---|---|---|
| Strict records and game codec | `server/internal/records/document*`, `codec*`, private types and game-owned compact adapters | Reject malformed/ambiguous records; installed versions only for play; trusted historical reader for safe read-only; exact checkpoint/projection parity |
| Durable store and migration | `server/internal/records/store*`, canonical forward migration 007 | Two-instance/restart behavior; atomic snapshot, appended events, decisions, charge and receipt; rollback and idempotent reconciliation |
| Prepared work, access and trials | `server/internal/records/work*`, `access*`, `trials*` | Duplicate suppression before computation; lease/attempt fencing; immutable issued result; revoke/regrant, actor/window/control/revision fences; stable allowances and immutable grant terms |
| Integration and review | Coordinator; milestone evidence and plans | Native Go/race, canonical migrations, preserved Node regressions/contracts/typecheck; independent review and bounded growth measurements |

Freeze session metadata, replay anchor, decision and work-attempt formats before depending on them. Keep these private, separately versioned records out of the closed public game envelope. Opening chance and every accepted later chance draw are private append-only replay material. Decision records refer to their immutable revision/input digest and carry original analysis/advice once; exposure appends separately.

The [private record contract](private-records.md) documents the executable schemas, publication/recovery rules, finite limits and M04 integration boundary.

## Execution rulings

- The owner authorized M03, so implement its Go responsibility under CR-ARCH-003 instead of duplicating it in the current Node application. Preserve the existing canonical migration sequence and add only forward SQL. M04 activation remains a separate milestone.
- Frozen Spades observations include all prior events. Preserve that exact input by reading the append-only archive once at the explicit import/projection boundary. Compact hot snapshots and incremental writes remove duplicated growing histories; this does not make the preserved policy's archive read constant-size. Bound and measure that read, and do not silently truncate information or repin policy for speed.
- The comparison is complete. Keep its original tracked evidence byte-for-byte and its reproducible harness source. Remove ignored redundant output, obsolete Go 1.27.1 diagnostic installations and downloaded archives; keep the selected native toolchain and caches for development.

## Completion record

Current execution status and actual results belong in [M03 evidence](../../../qa/implementation/multi-game/m03/status.md). Failed initial checks, final checks, limits and next milestone must remain distinct. Passing a private storage adapter does not establish production activation, full Hearts/reasoning parity, hosted capacity or strategic quality.
