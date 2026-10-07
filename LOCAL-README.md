# CardFord — local application and V1 reference

**Go platform path (M04E):** run `node scripts/windows-env.mjs pg:start`, then `npm run start:go`, and open **http://127.0.0.1:4174**. This builds the preserved React interface and serves the local table, coach, review and fixture account experience from Go/PostgreSQL. Node supplies build tooling. [M04E verification and limits](qa/implementation/multi-game/m04e/status.md) track scoped functional acceptance and the remaining normal Spades match, cumulative-history resource and native-database gates before switching default startup. `npm run start:go -- --configured` uses the deliberately empty configured offer policy. Use a separate browser session for each identity mode.

**Experimental Partners bot and coach:** `npm run start:go -- --partner-resources` selects `spades-partner-resource-5.0.0` for newly created Spades Partners games. Both bots and coach use the same public-information checks for offering partner a safe ruff or preserving partner's secure trick. Unsafe and unnecessary help is excluded. This is a human-testing option; strategic improvement is unproven. Choose a new game after changing the startup option: saved games retain their original policy and advice. Restarting without the option still supports already saved experimental games. Hearts and Spades Solo keep their existing policy under this option.

[Hands-on test instructions](qa/implementation/multi-game/m12/try-app.md) and [current verification report](qa/implementation/multi-game/m12/status.md) cover the experimental local build and its remaining gates.

All validation commands should use the native process-tree watchdog, for example `node scripts/bounded-native-run.mjs -- node scripts/windows-env.mjs npm run typecheck`. Its whole-run ceiling is 30 minutes. Exit 124 means unfinished checks remain unverified.

`npm run start:go -- --actor-rollout` is a separate experimental planner for all three current variants. It compares every legal choice across two possible deals, using only each simulated player's own information. Bot and coach share the saved comparison. Hearts passing has 286 choices and can take tens of seconds; the service uses a bounded background queue and the UI waits for the same durable work. This mode has not demonstrated stronger play. Use one experimental startup option at a time. Both experimental readers remain installed across restarts, and saved games keep their pins.

The instructions below describe the original V1 Node reference, including its historical records and selected-deal developer tooling. `start`/`dev` retain that path until full M04 activation; `start:reference` names it explicitly. Stop either app with Ctrl+C. Never run competing backend authorities for the same browser origin.

When switching from Go back to the production Node reference, rebuild the shared `web/dist` with `$env:VITE_BACKEND = 'node'` and `node scripts/windows-env.mjs npm run build` before starting Node. `start:go` always rebuilds its own Go-targeted client. Backend selection is fixed at build time.

Open **http://127.0.0.1:4173**. The application runs on Node and PostgreSQL. The existing table now uses server-owned state; the browser receives only your hand and public information.

Hearts, Spades Solo and Spades Partners are playable. Local coaching, end-game trick results, score recaps, current-game replay and isolated sample continuations work without Jev. Account screens include subscription previews, cancel/resume, family invitations, export and local deletion.

Identity and subscription coverage are explicitly **local test fixtures**. No payment is collected. Stripe has a server adapter and fixture tests; real managed login, Stripe sandbox/live configuration and public launch remain separate gates. Strategy grades and model promotion remain disabled without independent evidence.

## Start and stop

**Current native Windows setup:** [Windows development instructions](planning/implementation/multi-game/windows-development.md) run Node, Go and PostgreSQL directly on Windows with pinned project-local tools. Use `node scripts/windows-env.mjs setup`, then `node scripts/windows-env.mjs pg:start`; prefix Node/npm commands with that wrapper. This creates separate native databases and leaves existing Podman data and `.env.local` untouched. For the current app: `node scripts/windows-env.mjs npm run db:migrate`, `node scripts/windows-env.mjs npm run build`, then `node scripts/windows-env.mjs npm start`. Stop that app with Ctrl+C and the native database with `node scripts/windows-env.mjs pg:stop`. The original container workflow below remains available for existing saved games; do not mix it into native performance comparisons.

**Default native Windows commands**, from this repository root:

```powershell
npm ci
node scripts/windows-env.mjs setup
node scripts/windows-env.mjs pg:start
node scripts/windows-env.mjs npm run db:migrate
node scripts/windows-env.mjs npm run build
node scripts/windows-env.mjs npm start
```

The application stays in the terminal; Ctrl+C stops it. Stop the native database with `node scripts/windows-env.mjs pg:stop`. Restarting preserves the native databases under ignored `.local/windows-postgres/`.

For editing, `node scripts/windows-env.mjs npm run dev` runs the API on 4173 and Vite on 5173, proxying `/api`. Stop an existing app first to avoid a port conflict. All local services bind to loopback. Prefix local Node/npm commands below with the native wrapper to select the native database and fixture settings.

The historical Podman path (`npm run db:up`, unwrapped npm commands and `scripts/start-local.ps1`/`stop-local.ps1`) remains available only when deliberately accessing older saved games in the `tricks-coach-data` volume. Those records and `.env.local` are unchanged; they are separate from the native databases. Do not start both application paths on the same port.

## Try the product

1. Open the table and select Resume. Default mode is Spades Partners, with coaching When I ask.
2. Choose a bid or pass three cards in Hearts. A single card click selects; double click or Enter plays on your turn. Selecting while waiting never auto-plays.
3. Open a cue, more context, or a suggestion. Help never plays a card. Limited fixture plans require explicit hand unlock; unlimited help unlocks on request.
4. Open Review to inspect decisions in the current game. Possible continuation uses a separate sampled deal and stops after one trick. It does not change your table.
5. Account works in portrait. Plan changes show server previews and confirmation. A downgrade schedules at the fixture period end; cancellation keeps access until that date. All screens state that no payment is taken.
6. Family testing uses separate browser profiles/incognito contexts. Copy the invitee's Local account ID, select the Family fixture plan, create a family, then invite that existing ID. Accept the issued token in the invitee's account. Each player keeps private games and separate usage.
7. `#demo` opens the finite authored example without creating a game or calling a model.

Reload starts paused. Another tab sees a read-only table until it explicitly takes control. A network error preserves the last confirmed view and retries the same command ID.

## Verification commands

```powershell
npm run contracts:check
npm run typecheck
npm run lint:boundaries
npm run test:all
npm run test:integration
npm run test:ui
npm run build
npm run check:artifacts
npm run db:backup:verify
```

Database tests require the separate `_test` database. Browser checks use installed Chrome and the actual local server; fixture cases are labelled separately. `test:stripe` tests signed fixtures and database reconciliation, not a real Stripe sandbox. `evaluate:local` runs a frozen synthetic strategy smoke, not evidence of expert skill.

The backup rehearsal writes a private ignored `.local/local-backup.dump`, restores to a uniquely named disposable database, verifies counts and drops only that disposable database. Production backup encryption, retention and recovery objectives are still hosting decisions.

## Spades policy profiles and the strength gate

The default Spades policy is `spades-tactics-2.1.0`. It is also frozen as comparison baseline D0. Plan profiles `spades-plan-3.0.0` to `spades-plan-3.4.0` are selectable for a local trial and for evaluation; none is the default. See [CR-STRAT-009](planning/decisions/CR-STRAT-009-game-plan-and-strength-gate.md).

Run the app with a named profile:

```powershell
$env:SPADES_POLICY='spades-plan-3.4.0'
npm start
```

The startup line prints the active policy. Remove the variable to return to the default. Saved analyses keep the policy version that produced them.

Strength gate and evidence:

```powershell
node web/server/evaluation/gate/index.ts <manifest.json> --workers 12 --out .local/gate/<run-id>
```

Per-hand rows stay in ignored `.local/gate/`. Summaries and reports are committed under `qa/evaluation/`. A confirmation seed range can be read once.

## Working from a git worktree

A worktree has no `.env.local` and port 4173 usually belongs to the main checkout.

```powershell
npm ci
podman start tricks-coach-postgres          # never run db:up in a worktree
node --env-file=C:epos	est-jev.env.local web/server/records/migrate.ts
node --env-file=C:epos	est-jev.env.local --test --test-isolation=none web/tests/*.test.ts web/server/tests/*.test.ts
npm run build
$env:PORT='4187'; $env:APP_ORIGIN='http://127.0.0.1:4187'
node --env-file=C:epos	est-jev.env.local web/server/index.ts
$env:TRICKS_LIVE_URL='http://127.0.0.1:4187'
npm exec -- playwright test -c web/e2e/worktree.config.ts
```

`web/e2e/worktree.config.ts` refuses port 4173 and never starts a server, so it cannot test another checkout by accident.

## Configuration and secrets

Use [`.env.local.example`](.env.local.example). `APP_ENV=local`, `IDENTITY_MODE=local-test`, `BILLING_MODE=fixture`, `JEV_MODE=off` and `JEV_MAX_REQUESTS=0` are deliberate. Hosted startup rejects local fixtures and remains disabled until managed identity is configured. Do not use `VITE_` names for secrets.

The existing OpenRouter file is read only by an explicitly enabled server-side smoke runner. It is ignored by Git and container contexts. Normal play does not open it. The single live smoke reached Jev but its response failed validation; no result was applied and runtime remains off. See [Jev interface evidence](web/server/evaluation/evidence/jev-interface.md) for the observed model, cost and next investigation. Do not reset its durable attempt ledger to bypass the exhausted cap.

## Agent handoff

Read [implementation entry point](planning/IMPLEMENTATION-START-HERE.md), [local build cycle](planning/LOCAL-V1-BUILD-CYCLE.md), [status](qa/implementation/status.md) and [acceptance report](qa/implementation/LOCAL-V1-REPORT.md). The root integration branch is `v1/local`; separate worktree branches preserve domain, UI, contracts and billing work. No Git remote/push or pipeline was added.

Keep domain reducers pure, observations allowlisted, DTOs generated, jobs bounded, external calls outside transactions, commands idempotent and permissions rechecked at publication. Preserve this B2C table experience. The next environment follows [the generic deployment guide](planning/DEPLOYMENT-GUIDE.md); hosting is not selected by this local build.
