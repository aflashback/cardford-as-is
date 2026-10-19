# Rally native scenario inventory — draft, 14 October 2026

Source inspection only. No server, browser, game or test was started for this inventory. Existing E2E descriptions are reusable mechanics, not current Rally passes. Preserve the owner app on 4174 and its records; use fresh authenticated identities on an isolated test listener for fixture work.

**Subsequent authorized setup:** `start-native-fixture.mjs` launched the existing binary at **http://localhost:4191/**, initially PID **60768**, with the guarded test database and private `.local/rally-review/trix-qa-deals.json`. Both this listener and the untouched owner app on 127.0.0.1:4174 returned HTTP 200/ready. Current PID/health receipt: `.local/rally-review/fixture-server.json` (supersedes this initial PID after authorized restarts). The initial launcher readiness wait falsely expired because its harness called the Boolean `Response.ok` as a function; independent raw health checks succeeded. The helper now checks `response.ok` correctly and retains a 60-second bound. This was a harness bug, not evidence of slow or failed server readiness. No browser or API state driver was run by this setup agent. These startup/HTTP checks are not phase or rendering acceptance.

## Native mode and phase matrix

The CardFord executable installs all seven modes (`server/cmd/cardford/main.go`, `server/internal/sessions/registry.go`, `server/internal/games/trix/engine.go`). The original default registry alone has three modes; Trix is added by the executable.

| Public mode ID | Native game / variant | Immediate normal UI checkpoint | Additional checkpoints |
|---|---|---|---|
| `hearts` | hearts / solo | First-hand `pass`: select 0–3, clear, confirm, received cards | `play`, held completed trick, scores, hand-end, match-end |
| `spades-solo` | spades / solo | `bid`: bid controls/Nil; wait for actor zero | `play`, individual scores/bags, hand-end, match-end |
| `spades-partners` | spades / partners | `bid`: bid controls/Nil; wait for actor zero | `play`, partnership scores/bags, hand-end, match-end |
| `trix-basic-solo` | trix / basic-solo | `choose-request` when human owns the kingdom | Diamonds/Lutoosh → `playing`; Queens/King → `declare-doubles` then `playing`; Trix Jacks → `layout`; request/session completion |
| `trix-basic-partners` | trix / basic-partners | Same requests, partner display | Same phases plus public declarations, concealed/revealed two announcements, team totals |
| `trix-complex-solo` | trix / complex-solo | All combined or Trix Jacks | Combined → `declare-doubles`/`playing`; Jacks → `layout`; request/session completion |
| `trix-complex-partners` | trix / complex-partners | Same two requests, partner display | Same phases plus announcements, team totals |

Native Trix phase names are `choose-request`, `declare-doubles`, `playing`, `layout`, `round-complete`, `session-complete`. Rally layout aliases are request/double/play/jacks/results. Basic sessions have 20 deals; Complex sessions have 8. Both contain four kingdoms. Request choice is the actual owner’s action; an arbitrary random opening need not make the human owner.

## Fast, real-state setup

**Hearts / Spades:** normal fresh games already expose pass or bid. Use the actual wizard’s pace and game cards. Verify `/api/platform/session` through the authenticated UI’s tab before taking a screenshot. Use legal hand actions and normal bot playback to reach a four-card public trick, last trick and first scored hand. Pause before resizing; retain the game ID and revision. No private deck fixture UI exists for these native modes.

**Trix:** trusted startup fixtures are implemented by `scripts/start-trix-fixture.mjs` and `server/cmd/cardford/trix_fixture.go`. A private JSON file must contain an identifier and **20 complete, unique 52-card decks**. Each deck is four consecutive 13-card seat hands, not round-robin. The first hand containing H7 owns the first kingdom. Basic consumes 20 fixture deals; Complex consumes the first 8. New sessions persist their private sequence; changing startup does not change existing saves.

For direct request/Jacks/double coverage, privately author a valid deal with H7, all four Jacks, Queens and HK in the human seat-zero hand, then fill every hand uniquely to 13. This ensures a human request choice, Jacks opening choices and eligible Queen/King/combined declarations. Create a **new actual game** for each requested opening; never patch the presentation or DOM into a phase. Do not include the complete concealed decks or remaining fixture sequence in public screenshot receipts.

Existing repeatable recipes:

- `scripts/profile-hand-response.mjs`: human H7 + four Jacks; complete server-side deal sequence; normal UI picks Basic Solo then Trix Jacks. Its profiling/browser launch is unnecessary for scenario preparation.
- `scripts/trix-browser.mjs` family `twos`: one two per seat, human H7/CJ and a reachable CJ → pass/C10/CQ first circuit. This reaches concealed and then revealed twos through the real reducer. `web/e2e/trix-twos.spec.ts` records the public expected first-circuit states for Basic Partners and Complex Partners.

The existing fixture launcher is convenient **only when it owns startup**:

```powershell
$env:PORT = '4191'
$env:APP_ORIGIN = 'http://127.0.0.1:4191'
node scripts/windows-env.mjs node scripts/start-trix-fixture.mjs .local/rally-qa/trix-deals.json
```

It calls `start-go.mjs`, which rebuilds the shared `.local/cardford.exe` and `web/dist`. Therefore do not run it alongside the current 4174 binary or another build. It also uses the wrapper’s normal database, so this command is not the isolated-test recommendation.

To reuse the already-built binary without rebuilding, launch a separately owned loopback listener under `windows-env`, overriding the child’s database to the wrapper’s existing test database **inside** the child launcher. Example preparation command, not executed here:

```powershell
node scripts/windows-env.mjs node -e 'const {spawn}=require("node:child_process"); const env={...process.env,DATABASE_URL:process.env.TEST_DATABASE_URL,PORT:"4191",APP_ORIGIN:"http://127.0.0.1:4191",CARDFORD_TRIX_FIXTURE_FILE:require("node:path").resolve(".local/rally-qa/trix-deals.json")}; const child=spawn(require("node:path").resolve(".local/cardford.exe"),["--migrations","web/server/records/migrations","--web","web/dist"],{env,windowsHide:true,stdio:"inherit"}); process.on("SIGINT",()=>child.kill("SIGINT")); child.on("error",e=>{console.error(e.code);process.exitCode=1;}); child.on("close",code=>{process.exitCode=code??1;});'
```

Confirm the port is free first; record the owned PID, origin and health. The test database must be the existing guarded loopback `cardford_windows_test`, never a hosted database. Do not print connection credentials. The fixed listener does not support switching fixtures through a public API. The UI uses ordinary `/api/sessions` selectors; fixture IDs/decks remain server-side. Use a fresh browser identity to avoid changing the owner’s 4174 session.

## Reaching scored and dense states without full campaigns

`web/e2e/trix.spec.ts` contains a real HTTP driver: read the public session; prepare/poll human analysis or bot work; submit an issued candidate or advance the named automatic transition; continue a completed request through `/api/session/next-hand`. Each action uses current revision, tab and retained lease. A bounded adaptation can stop at a requested phase, first public trick, Jacks board with at least 32 visible cards, or one completed request. Keep the server paused while a driver runs and reload/resume normally before UI inspection. Do not feed concealed cards or invented candidates to the UI. Driver-reached states are real backend states, but only subsequent DOM interaction checks prove the UI action.

The full four-variant `trix-checks browser` / `trix-browser all` campaign can take around 30 minutes, creates many actions, builds shared output and uses old UI selectors. Do not run it for this bounded visual pass. Existing selectors such as “Play card”, “Place card”, legacy cue/unlock labels and exact pause headings need reconciliation with today’s icon-led Rally UI. Prefer stable current accessible names and `data-hand-card` controls; do not mock successful API responses.

For **Hearts/Spades terminal results only**, `server/internal/records/platform_terminal_fixture_test.go::TestM04ETerminalFixtureInstall` is a test-binary-only importer, used by `web/e2e/platform-go.spec.ts`. It:

- requires exact loopback `cardford_windows_test` on 54331 and existing `cardford_go_local` schema;
- requires a real authenticated owner and untouched revision-zero game, with 48-hex owner/game IDs;
- validates legal lifecycle replay/checkpoints, then installs a reachable preterminal archive into that owner’s isolated test game;
- exposes an allowlisted terminal receipt, not hidden decks; never imports coaching assessments.

Build its test executable once if needed: `node scripts/windows-env.mjs go test -c -o .local/m04e-terminal-fixture.exe ./server/internal/records`. Installation then needs `M04E_FIXTURE_GAME`, `M04E_FIXTURE_OWNER`, `M04E_FIXTURE_MODE` and `M04E_FIXTURE_ROOT` plus the wrapper’s test database. It mutates an isolated **test** game; it is not a normal-UI achievement or normal-policy full-match pass. The ordinary UI still executes the final authoritative transition and displays the real terminal result. There is no equivalent ready-made Trix terminal importer in the inspected tools; use request completion first, then a bounded legal continuation if full-session results are required.

`scripts/dev-scenarios.mjs` / `web/e2e/dev-scenarios.live.ts` launch the retained **Node** selected-deal service, not native Go. `web/e2e/trix-ui-fixture.tsx` is a public-observation component fixture with fake controllers, not a native game. Neither is evidence for actual native Rally state/scoring/Coach persistence. Native Go still rejects browser-supplied selected deals.

## Viewport and surface checklist

Draft CSS viewport rows: **568×320, 667×375, 844×390, 915×412, 1024×768, 1180×820, 1366×1024, 1440×900, 1920×1080**. Add phone portrait **390×844** and tablet portrait **768×1024**. These are exact CSS viewport simulations, not physical iPhone/iPad/Safari acceptance. The pin threshold uses the unshrunk available table-screen width; at phone widths below 760 pin is unavailable while its preference persists.

For every native mode, mark actual evidence separately for each applicable phase and viewport; do not call a sampled pairwise set the full cross-product. Record source game/revision/phase, viewport, theme, Coach state and screenshot path. Test each of light/dark/warm where colors can affect legibility.

| Surface | Required checks |
|---|---|
| Full and reduced hand | Rank/suit visibility, fan scrolling, legal/disabled/selected/queued cards, selected lift, no neighbor obscuring; live play and saved hand |
| Table | Four player badges; current trick/winner/collection; upper-right last trick; declarations/two announcements; opening and dense/full Jacks; native scores |
| Prompts | Bid/Nil; Hearts 0/1/2/3-card pass; Trix request list and selected doubles/Skip; 44px controls and keyboard focus |
| Overlays | Scores, completed requests, results, pause, reconnect, control owned elsewhere, settings/menu; no trapped/covered hand controls |
| Coach | Waiting/whistle PNG, open overlay, allowed pin, width shrink/restoration, Cue/Review/Rating preview labels, selected and confirmed comments with exact cards |
| Why/history | Real saved frames; previous/next/seek/play; stop on close/portrait/visibility/feedback/end; same live hand on return; replay hand clearance |
| Persistence | Feedback vote/reason/note/revision; reload saved items; finite two-per-UTC-day and exhausted read access; clearly labelled fixture unlimited |
| Rotation | Portrait gate, native playback blocked, controls inactive; landscape return preserves game/hand and pin preference without a new session |

## Focused source-test extensions, if UI inspection finds defects

- `web/tests/rally-responsive.test.ts`: measured pin/off budgets, smallest Jacks opening/dense board and hand/rank clearance using actual fit geometry.
- `web/tests/rally-phase-prompts.test.ts`: narrow bid/pass/double/request corridor and 44px action bounds.
- `web/tests/rally-coach-presentation.test.ts`: actual measurement effect for initial ancestor-null, moved hand top, replay, hidden zero rect, safe bottom and cleanup.
- `web/tests/rally-coach-client.test.ts`, `rally-coach-auth-cleanup.test.ts`: exact request recovery, owner/logout/erasure and finite allowance labels.
- `server/cmd/cardford/trix_fixture_test.go::TestTrixFixtureStartupIsolation` and `server/internal/games/trix/engine_test.go::TestTrixFixtureSequencePrivateAndRestartable`: fixture startup/secret isolation and persisted sequence, without a browser campaign.
- `server/internal/service/platform_coach_test.go`: actor-owned selection/clearing/confirmed proof in native pass, double and card phases; immutable Why/feedback. Do not fabricate strategy or real-player ratings.

None of these source/numerical tests substitute for the requested rendered UI and touch/drag checks. This inventory records available mechanisms and gaps; all new scenario rows remain **not run** until the owning browser task supplies evidence.

The root browser task can use normal UI moves for the first dense Jacks/request-end checkpoints. A larger driver was deferred after the owner task's steering. If later needed, adapt the existing public-session E2E driver to explicit browser-supplied context from its authenticated test tab; never read a browser profile/storage through shell tooling, never create an inaccessible replacement API identity, and reject any origin other than the isolated QA listener. Log its checkpoints as prepared backend states separately from DOM actions.
