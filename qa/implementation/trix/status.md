# Trix native implementation acceptance

**Local functional baseline delivered — 7 October 2026 (final receipts dated 8 October UTC).** Trix Basic Solo/Partners and Complex Solo/Partners are implemented and running. Core checks passed; full Complex browser sessions passed, and both full Basic sessions completed across a test-listener restart with final scoring, reload and saved review verified. The combined four-variant browser campaign did not pass its 30-minute resource gate; this limitation remains explicit below.

Rules and source reconciliation: [current rule specification](../../../docs/rules/trix.md). Execution scope and rulings: [delivery ledger](../../../planning/implementation/trix/delivery.md). Future additions: [new-game checklist](../../../docs/13-adding-a-game.md), [extension findings](../../../planning/implementation/trix/extension-findings.md).

## Implemented scope

| Requirements | Delivered behavior | Evidence |
|---|---|---|
| TRX-01–02 | Four pinned modes; H7 opening owner; rightward turns; four kingdoms; 20 Basic / 8 Complex fresh deals | Complete pure and bound-session tests; native catalog/service tests |
| TRX-03–05 | Follow suit without trump/Hearts restrictions; all penalty components; ordered public doubles; direct team credits; current/prior external-leader credit and withheld bonuses | Rule goldens, 256 recipient combinations, all 32 declaration subsets, earlier-giver legal history/restart test |
| TRX-06–07 | Jack layout, forced passes, finished-seat skipping, all four awards, request/kingdom/session totals and tied winners | Complete sessions, chronology/termination/conservation and tied-result cases |
| TRX-08–09 | Own-hand/public-only observations; deterministic baseline bots and original saved cues for every phase | Hidden-world invariance; candidate/policy binding and saved progressive-advice checks |
| TRX-10 | Generated strict contracts, compiled installation, PostgreSQL persistence/recovery, access units, old local identity grants, original review and private fixtures | Native record/HTTP/PostgreSQL/startup checks; strict corruption/replay tests |
| TRX-11 | Dedicated React Trix table, request/double/layout controls, pause/reload, scores and saved review | Focused adapters; actual native browser acceptance below |
| TRX-12 | Existing scenario packet plus reusable extension guide/findings and bounded four-variant functional runner | Strategy case expansion, lab adapters and strength/teaching studies remain deferred |

Each mode pins module `2.0.0`, rule `trix-<variant>-1.0.0`, state/observation/public/event schema `1.0.0`, and policy `trix-deterministic-1.0.0` with policy component version `1.0.0`. Work remains in the existing `codex/current-game-modules-m02` working tree; no commit, push or deployment is part of this handoff.

## Reproducible bounded checks

From `C:\repos\test-jev`, with the installed project-native tools and PostgreSQL:

```powershell
node scripts/windows-env.mjs pg:start
node scripts/trix-checks.mjs --list
npm run test:trix
node scripts/trix-checks.mjs browser-basic --seconds=1800
node scripts/trix-checks.mjs browser-complex --seconds=1800
```

The default `core` lane runs `contracts`, `ui-unit`, `rules`, `service`, `regression` and `build`, including the client artifact scan. Each can also run separately. Browser families are opt-in because a full Basic session contains twenty deals. `browser` selects all four variants; `all` combines core checks and the four-variant browser campaign. One shared deadline of at most 1,800 seconds covers all steps in an invocation. Logs/receipts are written under ignored `.local/trix-checks/`; deadline termination is exit 124 and unverified. The browser lane builds the actual Go app and client, uses a guarded native test database, creates fresh browser identities and shuts down its own listener. The combined campaign has not passed its resource gate; splitting families does not establish that result.

## Local running-app handoff

**8 October UI follow-up:** the current owner-review app uses `npm run dev:go` with a watched frontend at 4174 and native API at 4176. `.local/go-ui-dev.json` is the current process receipt. The [shared-table UI acceptance](shared-table-ui.md) records component reuse, Jack lanes, pass/doubling, collection/pause fixes, native smoke and Chrome/Lighthouse evidence. The fixed-build handoff and `.local/trix-live.json` described below are historical.

The native app is running at `http://127.0.0.1:4174` with normal random deals, the existing native database, local fixture access/payments and provider off. The existing Spades `partner-resources` startup selection is preserved; Trix uses its own pinned deterministic baseline. The old listener was replaced using its verified PID/path, without deleting records.

Verified in the in-app browser: the existing account retained its saved Spades hand, all seven catalog choices appeared, the tab control lease was reclaimed explicitly, Basic Solo was created, the bot selected Queens, the human doubling controls appeared, and reload returned to the same paused Trix position. The Trix tab remains open for the owner. The current process receipt is `.local/trix-live.json`; normal repeatable startup remains:

```powershell
npm run start:go -- --partner-resources
```

Stop the current app before starting another listener on the same port. The fixture identity and commercial offers remain local-only. Partner mode currently means one human plus three code players, with opposite seats on each team.

## Reproducible private deal sequences

The optional fixture launcher accepts a private JSON file with `{ "id": "your-fixture-id", "deals": [...] }`. Supply exactly twenty decks; each deck is an ordered array of all 52 unique card IDs. Slots 0–12 belong to South, 13–25 West, 26–38 North and 39–51 East. Basic consumes all twenty decks and Complex uses the first eight. Each request still applies the normal production rules. Choose requests and actions through the app; fixtures do not inject mid-game state.

```powershell
node scripts/windows-env.mjs node scripts/start-trix-fixture.mjs .local/trix-deals.json
```

The server accepts this only at explicit local/test startup. Normal creation requests cannot submit a deck. A fixture session retains its sequence privately across restart; public projections omit fixture identity, future decks and other hands. Omit the launcher/fixture variable for normal cryptographically shuffled deals.

## Evidence boundary

- Final default-core gate **passed in 77.7 seconds**, with unchanged source fingerprint: `.local/trix-checks/2026-10-08T03-28-53-881Z-core/report.json`. It passed both contract drift checks, full frontend/server TypeScript, four Trix UI tests, 23 engine test/subtest results, ten native record/service/startup results (including the complete twenty-request saved-review regression), the Go-targeted client build and browser artifact scan. Existing-game regression passed 1,159 test/subtest results across thirteen packages with zero skips; receipt `.local/m04-focused-checks/2026-10-08T03-29-35-572Z-fast/report.json`. No source changed during the run.
- Earlier implementation failures retained: initial full typecheck exposed legacy review-union accesses (fixed and rerun); an expanded repeated full-session codec replay exceeded its 160-second bound (unverified). Its default codec smoke is bounded to two requests; full sessions have separate pure/session engine coverage. Replay now avoids repeatedly copying accumulated state while retaining canonical reconstruction/corruption checks.
- Initial browser attempt was stopped after 600 seconds of its browser phase: continuous trace output lagged several minutes behind execution and timeout cleanup did not finish. Its failed receipt remains at `.local/trix-checks/2026-10-08T02-08-56-273Z-all/report.json`. The revised harness disables full-session traces, caches tab metadata, limits individual requests to 15 seconds, samples delivered cues by action/request and late kingdom, and persists public progress after each deal. Every action still uses the actual service and preparation path.
- The serial trace-free attempt reached 11 completed Basic Solo deals before its 420-second per-test deadline, with no rule/UI assertion failure. Receipt: `.local/trix-checks/2026-10-08T02-23-10-972Z-all/report.json`. The runner now executes independent identities in parallel. The latest configuration allows a browser phase up to 1,780 seconds, always subject to the remaining 1,800-second cumulative process-tree budget. Canonical replay/corruption checks are unchanged.
- A subsequent combined run stopped on a cold PostgreSQL `connectex` failure before SQL/schema work: `.local/trix-checks/2026-10-08T02-33-08-452Z-all/report.json`. The focused service rerun passed all nine results in 10.4 seconds at `.local/trix-checks/2026-10-08T02-34-50-344Z-service/report.json`. This matches the [previously investigated local startup limitation](../multi-game/m04f-followup/startup-connection-investigation.md); the underlying OS cause remains unproven. No stored data, timeouts or corruption checks were changed to obtain the rerun.
- First parallel browser run: Complex Partners passed its complete session/reload/review; Complex Solo completed eight deals but the test compared `0` with JavaScript `-0` using `Object.is`. The assertion was corrected to `0 - withheld`; scoring code was unchanged. The fail-fast setting interrupted both Basic sessions, so those were not counted as passes. Receipt and public progress/session files are preserved at `.local/trix-checks/2026-10-08T02-35-36-208Z-browser/`. The runner now collects all four independent results within its existing deadline.
- The final four-variant combined attempt failed after 28m19.2s, with unchanged source fingerprint: `.local/trix-checks/2026-10-08T02-44-06-129Z-all/report.json`. Complex Solo and Complex Partners each passed all eight deals, four kingdoms, final scoring, reload and saved original-hint review in approximately seven minutes. Both Basic sessions completed nineteen deals and part of deal twenty before the then-configured 1,620-second per-test deadline. No Basic rule/UI assertion failed in that run, but neither incomplete test is a pass. Late-session runtime increased; the combined resource gate remains unpassed and further optimization is deferred.
- Both original Basic games subsequently reached twenty completed deals. Their completion is explicitly **across restart**, not a fresh uninterrupted browser pass. A final bounded corrective probe passed in **18.4 seconds** against the corrected server: same game IDs, all twenty deals/four kingdoms, five distinct requests per kingdom, all four owners, authoritative winners/score conservation, paused reload, earliest original saved cue in the actual UI, and completion screenshots at 1280/390/844 widths. Public receipts are [Basic Solo](browser/trix-basic-solo-session.json) and [Basic Partners](browser/trix-basic-partners-session.json); private coordinator receipt `.local/trix-checks/2026-10-08T02-44-06-129Z-all/resumed-basic-receipt.json`. The original failed reports and pre-resume progress were preserved under `resumed-basic-originals/`. The corrective probe accepted no new actions because the earlier recovery attempt had already advanced both games to terminal state.
- Recovery uncovered and fixed a selected-review defect: the service projected later requests even after it had collected the selected request's frames. The collector now stops those projections at the request boundary and reads the selected actor packet once; full `PlatformReplay` still validates every archived command/checkpoint. A twenty-request regression preserves the original frame bytes and asserts the bounded projection work. The final actual browser probe retrieved each Basic game's earliest saved review with HTTP 200 and valid contracts (56 Solo / 58 Partners frames), then displayed the same original saved cue. This narrow service correction postdates the combined browser receipt and is covered by the final core gate and corrective probe.
- Earlier recovery attempts are retained in the Basic receipts: 142.1 seconds stopped on a helper-only `0`/`-0` assertion, 38.1 seconds exposed the selected-review timeout, and 8.5 seconds stopped before browser launch on a migration-commit deadline. Neither timeout was relabeled as a pass; the corrected probe passed with no page errors, no watchdog/shutdown error, and its temporary listener/browser closed. No production records or validation deadlines were changed.
- Browser evidence distinguishes complete sessions from actual per-phase DOM actions and screenshots. Four complete normal sessions are the opt-in full campaign; the originally proposed additional four fixture browser sessions remain a follow-up. Public progress, session receipts and desktop/phone/landscape screenshots are retained in `qa/implementation/trix/browser/`.
- The persistent running-app handoff uses the final server binary `.local/cardford-trix-20261007-final.exe` with ready health status, provider off and the preserved normal database. The in-app Trix position remains available after the final restart.
- Deferred by owner scope: future coach feedback-pipeline plan, code-review/optimization campaign, expanded strategy/evaluation lab, expert labels and teaching-benefit claims.
- No runtime model/provider is required. Local functional acceptance does not claim hosted, multiplayer, commercial or strategic readiness.
