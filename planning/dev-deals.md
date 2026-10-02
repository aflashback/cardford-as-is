# Selected deals in local CardFord

The local engine can start Hearts Solo, Spades Solo and Spades Partners from explicitly selected opening cards. This feature is disabled unless the server opts in. [CR-DEV-001](decisions/CR-DEV-001-selected-deals.md) defines RD-01–RD-04.

## Run

Use the existing server-only `.env.local` and PostgreSQL setup. From `C:\repos\test-jev`:

```powershell
npm run build
npm run start:scenarios
```

Open the configured `APP_ORIGIN` (normally `http://127.0.0.1:4173`). Choose game → Choose game → **Practice deal**, select a deal, then click its game card. The table shows **Selected deal**. Completing the hand offers **Replay this deal**, which creates a new game with the saved original cards and dealer and fresh decisions. Closing setup discards a staged choice. Reopening it defaults to **Random deal**.

The command uses [examples/dev-deals.json](../examples/dev-deals.json) by default and serves the rebuilt browser assets. Ordinary `npm start` keeps random dealing unless `DEV_SCENARIOS_FILE` is explicitly set. This local testing command uses the ordinary server entry point; restart it after backend or fixture changes and rebuild after UI changes.

For your own file, set a server environment variable before starting:

```powershell
$env:DEV_SCENARIOS_FILE = 'C:\repos\test-jev\examples\my-deals.json'
npm run start:scenarios
```

Remove that process variable when you want ordinary starts again. `APP_ENV` must be `local` or `test`; staging and production reject this override. Hosted staging is not enabled by this feature.

## Author a deal

Copy the example file and replace the literal cards. Its shape is:

```text
schemaVersion: "1.0.0"
scenarios: [
  id: stable lowercase name, up to 64 characters
  version: "1.0.0" (increment when the cards/context change)
  label: short display name
  mode: "hearts" | "spades-solo" | "spades-partners"
  dealer: 0 | 1 | 2 | 3
  hands:
    south: 13 explicit card IDs
    west:  13 explicit card IDs
    north: 13 explicit card IDs
    east:  13 explicit card IDs
]
```

Seats are 0 South/You, 1 West/Leo, 2 North/Maya and 3 East/Theo. Cards are `C2`…`CA`, `D2`…`DA`, `H2`…`HA`, `S2`…`SA`; use `10`, not `T`. All 52 cards must occur exactly once. A file holds 1–100 scenarios and at most 1 MiB. Unknown fields and invalid entries reject the entire catalog at startup.

These are complete **opening** deals. Hearts starts with its normal left pass. Scores/bags start at zero and bids/plays proceed normally. The selected mode's rules, permissions and legal-action checks still apply. The loader reads the file once at server startup; restart after changing it. Do not put this private file under `web/public`, `web/dist` or a browser import.

The actual deck and dealer are saved privately with the scenario ID/version. Replaying the current selected hand uses that saved material, even if the catalog has changed. Selecting a catalog entry again uses its currently loaded version. Ordinary `/api/session/next-hand` generates a random deal and removes the selected marker from the current view.

## Automated regression/evaluation use

The authenticated catalog is `GET /api/dev/scenarios`. It returns ID, version, label and mode only. Create with the existing command envelope:

```json
{
  "commandId": "unique-command-id",
  "mode": "spades-partners",
  "expectedActiveGameId": "current-owned-game-id",
  "scenarioId": "spades-partners-opening-a"
}
```

Send it to `POST /api/sessions` with the normal session cookie, tab and same-origin marker. To repeat the current selected opening setup, use `"replayScenario": true` instead of `scenarioId`. The selectors are mutually exclusive. A retry reuses the same command ID/body; a new run uses a new command ID and the returned current game ID. Disabled, missing or wrong-mode selections fail rather than creating a random game.

For offline tests, import `loadDevScenarios` / `parseDevScenarios` from `web/server/dev-scenarios.ts`, then call the existing `createGame({id, mode: scenario.metadata.mode, dealer: scenario.dealer}, scenario.deck)`. The loader performs the same validation and clockwise materialization as the app. Preserve the fixture ID/version and rule/policy versions with results; preserve actions when you need an exact original replay.

```powershell
node --test --test-isolation=none web/server/tests/dev-scenarios.test.ts
node --env-file=.env.local --test --test-isolation=none web/server/tests/dev-scenarios-integration.test.ts
```

For the live browser checks against rebuilt assets, start a separate instance, then run the test in a second terminal:

```powershell
# Terminal 1, after npm run build
$env:PORT = '4184'
$env:APP_ORIGIN = 'http://127.0.0.1:4184'
npm run start:scenarios

# Terminal 2
$env:TRICKS_LIVE_URL = 'http://127.0.0.1:4184'
npm exec -- playwright test -c web/e2e/scenarios.config.ts
```

These checks use the shipped example file and the installed Chrome browser. The three mode journeys verify exact starting cards, reload and fresh selection; a fourth completes a legal hand and uses the UI's saved-deal replay. `npm run test:all` includes the loader and HTTP tests, and `npm run test:ui` includes the picker and replay control regressions.

The HTTP tests require the existing distinct `_test` database. These scenarios exercise deterministic correctness and repeatable practice; use independently held-out, grouped deals for a formal strategy-strength claim. The examples are authored inputs, not calibrated lessons. No live model call is required or enabled.
