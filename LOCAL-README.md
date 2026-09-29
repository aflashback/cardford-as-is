# CardFord — local V1

Open **http://127.0.0.1:4173**. The application runs on Node and PostgreSQL. The existing table now uses server-owned state; the browser receives only your hand and public information.

Hearts, Spades Solo and Spades Partners are playable. Local coaching, table notes, score recaps, current-game replay and isolated sample continuations work without Jev. Account screens include subscription previews, cancel/resume, family invitations, export and local deletion.

Identity and subscription coverage are explicitly **local test fixtures**. No payment is collected. Stripe has a server adapter and fixture tests; real managed login, Stripe sandbox/live configuration and public launch remain separate gates. Strategy grades and model promotion remain disabled without independent evidence.

## Start and stop

Requirements: Node 24, npm, and a running Podman service. Run from this repository root:

```powershell
npm ci
npm run db:up
npm run db:migrate
npm run build
npm start
```

`npm start` stays in the terminal; Ctrl+C stops the application. On Windows, `./scripts/start-local.ps1` starts it in the background and `./scripts/stop-local.ps1` stops that recorded process. Application logs and the PID are in ignored `.local/`. PostgreSQL remains in the named `tricks-coach-data` volume; restarting the app/container preserves games.

For editing, `npm run dev` runs the API on 4173 and Vite on 5173, proxying `/api`. Stop the existing background application first to avoid a port conflict. All local services bind to loopback. `db:up` creates ignored credentials and separate `tricks_coach` / `tricks_coach_test` databases; it never resets game data.

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

## Configuration and secrets

Use [`.env.local.example`](.env.local.example). `APP_ENV=local`, `IDENTITY_MODE=local-test`, `BILLING_MODE=fixture`, `JEV_MODE=off` and `JEV_MAX_REQUESTS=0` are deliberate. Hosted startup rejects local fixtures and remains disabled until managed identity is configured. Do not use `VITE_` names for secrets.

The existing OpenRouter file is read only by an explicitly enabled server-side smoke runner. It is ignored by Git and container contexts. Normal play does not open it. The single live smoke reached Jev but its response failed validation; no result was applied and runtime remains off. See [Jev interface evidence](web/server/evaluation/evidence/jev-interface.md) for the observed model, cost and next investigation. Do not reset its durable attempt ledger to bypass the exhausted cap.

## Agent handoff

Read [implementation entry point](planning/IMPLEMENTATION-START-HERE.md), [local build cycle](planning/LOCAL-V1-BUILD-CYCLE.md), [status](qa/implementation/status.md) and [acceptance report](qa/implementation/LOCAL-V1-REPORT.md). The root integration branch is `v1/local`; separate worktree branches preserve domain, UI, contracts and billing work. No Git remote/push or pipeline was added.

Keep domain reducers pure, observations allowlisted, DTOs generated, jobs bounded, external calls outside transactions, commands idempotent and permissions rechecked at publication. Preserve this B2C table experience. The next environment follows [the generic deployment guide](planning/DEPLOYMENT-GUIDE.md); hosting is not selected by this local build.
