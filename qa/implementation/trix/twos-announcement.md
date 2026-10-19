# Trix Jacks Partners twos announcement acceptance

Date: 2026-10-08. Status: implemented; final core and both real-server browser checks passed. Local Go/Vite app refreshed and healthy. No commit or deployment was made for this amendment.

Authority: [CR-GAME-002](../../../planning/decisions/CR-GAME-002-trix-jacks-twos-announcement.md), including the owner's explicit four-turn reveal and unchanged-legality clarification. [Canonical rules](../../../docs/rules/trix.md).

## Required outcomes

- TRX-13: the layout request is named Trix Jacks in every variant; the family and internal request IDs remain Trix / `trix`.
- TRX-14: only new Partners games announce the four twos when their holders span both teams. Before four turns, show owner counts only. After four turns including passes, reveal exact suits/owners automatically.
- Keep normal legal placements, hand counts, scoring and turn order. No announcement dialog, action or client-side reveal timer.
- Persist and replay the boundary; preserve historical Partners behavior and original saved evidence.
- Reuse the shared doubled-card badge area and card artwork on desktop and supported landscape sizes.

## Implementation and compatibility

The typed Go reducer stores original holders and the accepted-turn counter. The public `twoAnnouncements` union contains only `{status: "hidden", counts: [...]}` before reveal, or `{status: "revealed", cards: [{seat, card}, ...]}` afterward. No concealed suit IDs reach the browser through this field. Revealed twos use the shared doubled-card badge area; after a two is played, the duplicate badge face disappears while the original public announcement stays in saved history.

New Partners games use module `2.1.0`, rules `trix-basic-partners-1.1.0` / `trix-complex-partners-1.1.0`, and state/observation/public schemas `1.1.0`. Existing commands keep event schema `1.0.0`. Solo remains unchanged. Historical Partners installations remain executable for exact-pin resume/replay and are excluded from new-game catalog/admission. The catalog still has seven modes. Deterministic policy identity is unchanged; no strategy improvement is claimed.

## Final checks

Run from the repository root. Every invocation has a process-tree ceiling of at most 30 minutes; the focused browser check uses five minutes.

```powershell
node scripts/trix-checks.mjs core --seconds=1800
node scripts/trix-checks.mjs browser-twos --seconds=300
```

| Check | Actual result |
|---|---|
| Final core, source unchanged | Passed in 114.392 seconds. Both contract generators, TypeScript, four adapter units, 36 Go rules test/subtest results, 16 Trix native service/records/access/command results, existing-game focused regression, production build and artifact scan passed. No missing/skipped tests reported by the core runner. |
| Final actual Go/browser, source unchanged | Both Basic Partners and Complex Partners passed. Browser tests took 19.475 seconds; build, isolated startup and verification together took 38.029 seconds. |
| Rule matrix | 2,048 cases: 256 original two-holder assignments × four opening owners × two Partners profiles. Covers every split and both orientations of the one-team exception. Additional tests cover normal adjacent-card play, forced passes, reveal timing, ownership, reset, played twos, corruption rejection, and open/replay at boundaries. |
| Native compatibility | Required sessions/contracts/records/service/command tests passed. Actual HTTP/PostgreSQL cases cover both Partners variants, restart, duplicate create/action receipts and stale-version rejection. Both historical Partners pins preserve saved presentation, policy and document bytes across resume. |
| Responsive fixture UI | Four adapter units and app/fixture typechecks passed. First expanded browser run: 29 passed, one existing off-turn test timed out waiting for initial mount, six did not run. The focused corrective run passed all eight cases in 16.846 seconds, including that case and the announcement cases. This is not reported as a clean pass of the entire expanded run. |

The native browser fixture exercises real request selection and card gestures with a private startup deal: owner plays J♣, next player passes, then 10♣ and Q♣ are played normally. At the owner's next turn, all four twos are revealed. The tests assert hidden counts before play, no other players' two IDs in the pre-reveal response, unchanged ownership, expected remaining-hand counts, no announcement dialog, and paused reload preservation both before and after reveal. Fixture injection is test-only; normal startup continues to shuffle privately.

Retained public evidence:

- [Basic Partners receipt](twos/basic-partners-native.json), [hidden table](twos/basic-partners-native-hidden.png), [revealed table](twos/basic-partners-native-revealed.png).
- [Complex Partners receipt](twos/complex-partners-native.json), [hidden table](twos/complex-partners-native-hidden.png), [revealed table](twos/complex-partners-native-revealed.png).
- Shared responsive fixture captures: [hidden desktop](shared-table/twos-hidden-1280.png), [hidden landscape](shared-table/twos-hidden-756.png), [revealed desktop](shared-table/twos-announcements-1280.png), [revealed landscape](shared-table/twos-announcements-756.png).

Full local runner receipts (ignored build evidence) are `.local/trix-checks/2026-10-08T22-47-23-090Z-core/report.json` and `.local/trix-checks/2026-10-08T22-46-29-360Z-browser-twos/report.json`. Fixture browser reports are `.local/trix-twos-ui-first-report.json` and `.local/trix-twos-ui-report.json`.

## Local handoff and limits

The existing Go/Vite development setup was rebuilt and restarted at **http://127.0.0.1:4174**, with native API on 4176. Health returned `ready`, identity `local-test`, payments `fixture`, provider `off`. The existing Partners resource option and native database were retained. `.local/go-ui-dev.json` records the fresh processes. **Start a new Partners game** for the announcement; old saved games intentionally keep their original behavior.

Only the pin compatibility needed by concurrently present coach-lab code was adjusted. Its narrow adapter/preparation checks passed in 3.15 seconds. An optional full collector schedule hit its 95-second Go timeout during Complex Partners after the first three variants; that full collector remains unverified. No feedback pipeline design or strategy changes are part of this amendment.

Supplemental native commands are retained here for reproduction; their stdout is in the implementation chat's tool results, without separate log files:

```powershell
# Passed: actual HTTP announcement/restart/fencing plus current preparation (7.126 seconds).
node scripts/bounded-native-run.mjs --seconds=75 -- node scripts/windows-env.mjs go test ./server/internal/service ./server/internal/evaluation/coachlab -run '^TestTrixAnnouncementNativeHTTPRestartAndFences$|^TestTrixNativeAdapterCollectsExactPreparation$' -count=1 -timeout=60s

# Historical records passed (0.745 seconds); this initial invocation exposed the coach selector defect, fixed before final checks.
node scripts/bounded-native-run.mjs --seconds=60 -- node scripts/windows-env.mjs go test ./server/internal/records ./server/internal/evaluation/coachlab -run '^TestTrixHistoricalPartnersResumeOriginalPinsAndBytes$|^TestTrixAdapterPreservesHistoricalSelector$' -count=1 -timeout=40s

# Required native packages passed; overall invocation failed on the optional collector timeout described above (100.394 seconds).
node scripts/bounded-native-run.mjs --seconds=120 -- node scripts/windows-env.mjs go test ./server/internal/sessions ./server/internal/contracts ./server/internal/records ./server/internal/service ./server/cmd/cardford ./server/internal/evaluation/coachlab -run '^TestTrix|^TestHistoricalInstallation|^TestActiveInstallation' -count=1 -timeout=95s

# After the selector fix, both narrow compatibility cases passed (3.152 seconds).
node scripts/bounded-native-run.mjs --seconds=45 -- node scripts/windows-env.mjs go test ./server/internal/evaluation/coachlab -run '^TestTrixNativeAdapterCollectsExactPreparation$|^TestTrixAdapterPreservesHistoricalSelector$' -count=1 -timeout=25s
```

The original [four-variant baseline report](status.md) retains its evidence and limits. The earlier combined full-session browser resource gate remains unpassed; this focused amendment does not establish an uninterrupted twenty-deal browser pass. No hosted, live-provider or strategy-strength acceptance is claimed.
