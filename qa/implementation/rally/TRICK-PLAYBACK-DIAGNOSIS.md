# Trix fourth-card diagnosis — 2026-10-14

Read-only source investigation plus an offline state/timing reproduction. No production files, game state, server, browser or rendering changes were made by this investigation.

Historical baseline: the owner subsequently authorized and verified the fix in [FIX-VERIFICATION.md](browser-2026-10-14/trick-timing/FIX-VERIFICATION.md). The diagnostic harness below extracted the old queue implementation and is a pre-fix artifact; use `web/tests/trick-playback.test.ts` for executable checks against the current implementation.

## Current incident evidence

The parent investigation supplied these backend observations for trick 2:

| Revision | Public action | Recorded time |
| --- | --- | --- |
| 387 | You: S9 | 00:12:07.834 |
| 388 | Joe: S2 | 00:12:09.402 |
| 389 | Maya: S7 | 00:12:10.969 |
| 390 | Leo: S8; completed trick, You winner | 00:12:12.540 |

Revision 390 was delivered at 00:12:12.570 with an empty active trick. The earlier control loss was at 00:10:40; the manual pause at 00:14:40 still had revision 390. The parent's later DOM observation contained all four cards in the last-trick pocket, an empty center and no reported error. These observations establish that the fourth card reached the public completed-trick record. They do **not** establish whether the fourth face painted in the center or whether the table remounted during its arrival.

The human won this trick, so a subsequent bot lead cannot explain this particular incident.

## Reproducible source findings

Run from the repository root:

```powershell
node qa/implementation/rally/trick-playback-diagnosis.mjs
```

Result: exit 0; six scenario results passed. The script extracts the actual `useTrickPlayback` hook and actual `useGoSession` queue-drain function, supplies fake React state/effects and a deterministic clock, and uses the production `playbackDelay` function. This is an offline state/DOM-independent timing check, **not** browser or animation acceptance.

| Scenario | Observed result |
| --- | --- |
| Mounted table, three cards → completed human-winner trick, speed 1 | All four held for 1615.385 ms |
| Same at speed 1.2 | All four held for 1346.154 ms |
| Same at speed 1.4 | All four held for 1153.846 ms |
| Completion while paused, then resume | Four-card hold remains while paused, then runs its full duration |
| Fresh mount directly into the completed snapshot | No completed-trick hold; latest trick initializes as already seen |
| Completed bot-winner trick followed by a queued next lead, speed 1 | Four-card hold cut to 692.308 ms instead of 1615.385 ms |

### Confirmed separate defect: next lead truncates the hold

- `web/src/api/useGoSession.ts:63–74` schedules every Trix display frame with the turn delay. It does not reserve the longer completed-trick display interval.
- `web/src/games/trix/useTrickPlayback.ts:12–16` requires an empty current trick to hold the completed one, and marks the completed trick seen when a new lead arrives.
- Together, a queued next lead supersedes the completed trick after one turn interval. At speed 1 that is 692 ms, shorter than the intended 1615 ms. This can reduce the opportunity to observe the final card, but does not reproduce a completely absent face or the supplied human-winner incident.

### Verified lifecycle behavior, unproven incident cause

`useTrickPlayback.ts:11` initializes `seen` to the latest completed number. A remount into revision 390 therefore skips the four-card hold. `useGoSession.ts` can clear the displayed session on control/access changes; leaving and returning to the live table also remounts it. The supplied incident evidence does not show one of those events near revision 390. A normal snapshot replacement without a remount does not itself reset this hook's state.

### Throw and pocket trace

- `web/src/games/trix/Table.tsx:121,300` takes central cards from the held completed trick while the hold is active.
- `Table.tsx:415` supplies the latest completed trick to the pocket immediately, independently of hold completion. Seeing the fourth card there is therefore not evidence that it was displayed in the center first.
- `web/src/table/useCardThrows.ts:42–81` animates only one newly added central face. It temporarily hides that original face, renders a cloned flight, and restores it on animation completion or cancellation. Pause, resize and unmount settle active flights. The normal throw duration is approximately 115 ms at speed 1, much shorter than either display interval.
- Initial/catch-up frames and source-seat mismatches skip the animation but leave the central face visible. No concrete persistent-invisibility path was found in the ordinary mounted fourth-card transition. This source review cannot prove actual browser paint or animation completion for the incident.

## Recommended bounded next step

Fix the confirmed presentation-boundary mismatch separately: let a newly completed trick finish its display interval before exposing a queued next lead, with pause/resume preserved. Keep authoritative wire state and command revision checks current; do not delay server truth or change game rules. Cover delayed arrival, already-queued next lead, pause/resume and snapshot recovery. Do not indiscriminately replay historical completed tricks on initial load.

For the reported human-winner incident, capture a short client lifecycle/paint trace on recurrence: displayed revision, mount identity, latest/seen trick numbers, held card count, blocked state, central face visibility and active throw count. This distinguishes remount/snapshot bypass from an animation/paint failure. Neither is established as the current incident's cause by the available evidence.
