# Real browser baseline

This experiment follows the text-agent discovery archives. South's Luna agent chooses a bid/card from its own cards and public history; Playwright clicks it in the real table. The other three players are server bots. A separate Luna observer receives no ability to influence play. Jev is off.

## Frozen sample

Three authored opening groups, each in Solo and Partners, each under the existing `spades-tactics-2.1.0` and candidate `spades-cases-4.0.0`: **12 measured hands**. Two unused automatic Partners openings are counted too: **14 created sessions**, six Solo and eight Partners. Abort/unknown starts count against the limit of 20 total and 10 per mode. No replacement deals to improve coverage.

- Control: original Solo pilot cards; Partners is a new zero-start mode twin.
- Sweep: two-suit spread, whole-table rotation +2. Strong hand belongs to North bot.
- Resources: expanded partner-spade distribution, rotation +2. North bot holds high spades; South can be the useful teammate.

Opening cards cannot guarantee a later case occurs. These familiar shapes provide a reproducible baseline, not a representative win rate. The normal default is unchanged; the candidate is selected explicitly on the local comparison server.

## Run

From the repository root, using the existing local PostgreSQL instance and `.env.local`:

```powershell
node qa/experiments/2026-10-02-browser-baseline/prepare.mjs
npm run build
node qa/experiments/2026-10-02-browser-baseline/freeze-code.mjs
```

Start each server in its own terminal:

```powershell
node --env-file=.env.local qa/experiments/2026-10-02-browser-baseline/serve.mjs baseline
node --env-file=.env.local qa/experiments/2026-10-02-browser-baseline/serve.mjs candidate
```

Then run the two isolated research roles:

```powershell
$env:CARDFORD_CODEX_EXE = (Get-Command codex).Source
node --env-file=.env.local qa/experiments/2026-10-02-browser-baseline/run-browser.mjs
node qa/experiments/2026-10-02-browser-baseline/audit-browser.mjs
```

Chrome is visible. No screenshots or mocked API are used. Persistent browser identities live in the operating system's temporary folder; cookies/control leases are never saved to this experiment. Player and observer tool events are rejected. Forced choices use no model call. Identical player packets reuse the original accepted response with provenance. Player attempts are capped at two per prompt across restarts.

## Evidence and recovery

- `source-audit.json`: 706 archived decisions independently replayed; archives are unchanged.
- `manifest.json`, `dev-deals.json`, `code-snapshot.json`: pre-play fixtures, order, protocol and exact file hashes.
- `provenance/recorder-amendment-*.json`: recorder-only repairs, with original runner sources and failed checks retained. Runtime, fixtures and model templates are unchanged. Version 1.0.1 handles legacy advice projection and completed-hand control recovery; 1.0.2 accepts an inline action/paragraph separator and permits two isolated observer packets concurrently. Versions 1.0.3/1.0.4 restore browser control before starting another game and wait for the recap to render before dismissing it.
- `revalidations/`: format-only recovery using the earliest original transport-valid response on the exact packet. Original rejection records stay unchanged; no additional model attempt or substitute move is used.
- `sessions.json`: every created session, including bootstrap and aborted starts.
- `runs/`, `public/`, `transport/`: real DOM actions, public server responses, model prompts/replies and provider metadata.
- `observer-jobs/`: durable public checkpoints after tricks 3/7/11 and a bounded retrospective sample. No observer output reaches a player.
- `private/`: complete original bot analyses and replay material, queried only after completion; no authentication fields.
- `seat-packets.jsonl`: later Jev inputs. Send **one seat observation per call**. The combined file exposes different seats' cards and is never a player's context.
- `baseline-decisions.jsonl`: original actions, authored cues, independent claim checks and offline shadow comparison. Keep it outside decision-model prompts.

Rerunning resumes saved hands and observer work. A pending DOM action is reconciled against public history before another choice. A pending start/navigation with an unknown outcome fails closed: reconcile the possible server session and count it before clearing the reservation. Never delete a failed run to obtain a replacement. New sample rounds belong in a new experiment directory and new browser profile name.

The first completed hand encountered one local database connection timeout during audit recovery. Retrying resumed the same game. A rejected new-game request was reconciled against stored IDs: no additional game was created. All 12 measured hands later completed; historical interruption files remain as evidence. Observer timeouts remain rejected judgments; final counts are in [results](results.md). See `provenance/interruption-*.json`, `start-reconciliation-1.json` and transport records for exact outcomes.

## Later comparisons

Compare Jev and future policies on the same seat packets, then test fresh paired deals and independent human judgments. Record factual claims, appropriate uncertainty, partner help, unnecessary resource use, Nil/contract outcomes and actual score consequences separately. Agreement with Luna and a favorable score are not labels for the best move.
