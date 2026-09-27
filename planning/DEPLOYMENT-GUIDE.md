# Deployment guide: local → staging → production

**Status:** implementation runbook, 27 September 2026. Hosting and identity vendors/region are undecided. No deployment, real payment or live model call is claimed. The owner authorized local implementation only; no pipeline or GitHub push is part of this cycle. [CR-IMPL-003](decisions/CR-IMPL-003-local-build.md) controls scope.

## One application, three environments

| Environment | Identity/payment/provider | Data and exposure |
|---|---|---|
| Local | Explicit development identity and fixture BillingPort; Jev off by default | Local PostgreSQL and separate disposable test database. API loopback by default; optional LAN UI only for authorized device checks. |
| Staging | Real test identity tenant, Stripe sandbox and verified test webhooks; Jev off unless running a bounded experiment | Separate PostgreSQL, secrets, cookies, webhook endpoint and test accounts. Restricted audience; no production data or live charges. |
| Production | Real production identity and Stripe live configuration; only promoted optional Jev modes | Private PostgreSQL, approved offers/markets, HTTPS and measured release/recovery gates. Reject every development identity, fixture payment or fixture grant configuration. |

Promote one reviewed source revision and immutable build. Static web and Node API/worker roles come from the same monorepo; `/api` should be same-origin. Durable jobs can run beside the API locally; preserve a separate worker entrypoint without provisioning a fleet. A static frontend host alone does not supply the API, durable workers, private database or restore plan. The domain's presence in Vercel does not settle hosting or prove DNS/TLS setup.

Select a host only after checking supported Node runtime, long-lived/bounded workers, database connectivity and pooling, HTTPS/cookies, secrets, logs, backups/restore and the existing paid-launch availability requirements. No vendor-specific infrastructure commands are provided before that choice.

## Configuration contract to implement

These names are the local build's configuration convention. They must be validated at server startup and documented in a secret-free example file; they are not evidence that a loader already exists. Register any naming adjustment in the implementation report so commands and tests agree.

| Name | Meaning and safe default |
|---|---|
| `APP_ENV` | Required explicit `local`, `test`, `staging` or `production`; unknown/missing value fails startup. Do not infer deployment trust from `NODE_ENV`. |
| `NODE_ENV` | Build/runtime convention only. Hosted artifact uses production mode. |
| `HOST`, `PORT`, `APP_ORIGIN` | Local API binds loopback; canonical origin is an allowlist input for cookies/CSRF/redirects. Hosted values are explicit. |
| `DATABASE_URL` | Server-only connection string for the current environment. Never reuse it as the destructive test target. |
| `TEST_DATABASE_URL` | Dedicated integration database. Test harness rejects the development/hosted database before setup/reset. |
| `IDENTITY_MODE` | Explicit `local-test` locally or `managed` hosted. Hosted startup rejects local-test mode regardless of other flags. |
| `BILLING_MODE` | Explicit `fixture`, `stripe-test` or `stripe-live`. Staging requires stripe-test; production requires stripe-live. Test/live resource IDs cannot cross environments. |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Server secrets. Test and live credentials/endpoints are separate. Reconciliation verifies environment/customer/offer/beneficiary. |
| `JEV_MODE`, `JEV_MODEL`, `JEV_MAX_REQUESTS` | Defaults off, configured release ID and zero attempts. Follow W17 for the model allowlist, durable experiment caps and cost budget. |
| `OPENROUTER_API_KEY` | Optional server secret supplied by environment/secret manager; never needed for local code-only acceptance. |
| `OPENROUTER_API_KEY_FILE` | Optional local absolute path used only by the server loader. Configure exactly one credential source; conflicting sources fail startup. |

Vendor-specific identity issuer/audience/client/session configuration belongs in server config after vendor selection. Put the exact names and secret/public classification in the example and startup tests. Do not invent an insecure hosted identity fallback while the vendor is undecided.

No secret, database URL, payment key, private game state or OpenRouter key may use a `VITE_` variable or enter browser configuration. Prefer same-origin `/api` so a public API URL is unnecessary. Environment/example files contain names and empty placeholders only. Runtime secret files and local environment files must be ignored and excluded from Docker/build contexts before use; never stage a whole directory that could include them. Inspect staged filenames before committing.

## Existing OpenRouter credential file

The owner-provisioned file is `C:\repos\test-jev\jev-token-openrouter.txt`. Its contents must never be inspected, printed, copied into a worktree, committed or included in documentation/evidence. A server-only loader may read the configured path at runtime for an authorized bounded experiment; it must not expose the value to tooling output or the browser.

Set only the path in the local server process:

```powershell
$env:OPENROUTER_API_KEY_FILE = 'C:\repos\test-jev\jev-token-openrouter.txt'
$env:JEV_MODE = 'off'
$env:JEV_MAX_REQUESTS = '0'
```

The loader should reject missing/empty/unreadable input when a live experiment is explicitly enabled, keep the value only in server memory, and redact authorization headers and provider errors. Off/zero-cap startup must not require opening a credential file. Unit tests use a temporary fake token, never the existing file. Production uses its own secret store or mounted server secret; the developer's Windows path is not a deployment dependency. Secret rotation is a controlled replacement followed by a redacted health check, never a value pasted into chat.

## Local build and run

Use the command contract and evidence rules in the [local build cycle](LOCAL-V1-BUILD-CYCLE.md). W00 must provide a pinned PostgreSQL compose service, health check, named development volume, root scripts and separate test database. Podman is allowed; `db:up` should report missing Podman/compose prerequisites clearly rather than falling back to an in-memory database. Keep database and API ports on loopback by default. Container restarts must preserve the development volume; test cleanup can delete only validated test resources.

After those scripts exist, run from the repository root:

```powershell
npm ci
npm run db:up
npm run db:migrate
npm run contracts:check
npm run typecheck
npm run test:all
npm run test:integration
npm run build
npm run check:artifacts
npm run dev
```

Run browser checks against this real API/database, then test restart/resume. Record the URL and shutdown command in the implementation README when the launcher is built. A missing script or unavailable container runtime is a recorded blocker; this guide alone does not implement it.

## Staging procedure

1. Choose hosting/identity vendors and region, provision isolated services and approve deployment separately from the local build. Save non-secret environment configuration and the source/build revision.
2. Provision real test identity and Stripe sandbox secrets directly in the server secret store. Configure exact allowed origins/redirects and test offer IDs. Never allow fixture grants to survive hosted startup.
3. Build from the locked revision, run schema/type/boundary/unit/integration/browser/artifact checks and store redacted results. Do not rebuild from a different unreviewed tree after approval.
4. Back up the staging database and rehearse restore; run versioned migrations once using the designated migration role. Deploy compatible API/worker and static assets, then check readiness without exposing secrets or private data.
5. Configure the Stripe sandbox webhook against the deployed endpoint; verify signatures over raw bodies. Test Checkout, required authentication, declines, duplicate/out-of-order events, reconciliation, upgrade/downgrade/cancel/resume and preserved paid-through coverage. A success redirect must never grant access.
6. Verify real login/logout/revocation/recovery, player ownership, family payer separation, coached-hand races and current-game recovery. Capture sandbox IDs and timestamps in redacted evidence; fixture output cannot satisfy this step.
7. Test browser/device/accessibility, pilot and load/recovery gates according to W18. Missing physical devices, people, provisioned services or capacity evidence remain individually blocked/not-run. Keep Jev off unless its separate experiment is approved and bounded.

## Migration, backup and rollback

Use ordered, immutable migrations with a stored schema version/checksum and one migration runner protected against concurrent execution. App and worker startup verify schema compatibility. Prefer expand/backfill/switch/contract changes: add compatible columns/tables, migrate in bounded batches, deploy consumers, then remove obsolete data only after the rollback window and separate review. Do not silently reinterpret historical rules, events or advice under a newer version.

Before a migration, record current app/schema versions and take an encrypted database backup with restricted access. Include rules/events, accepted commands, idempotency records, coverage/usage, payment inbox/purchases, job leases and experiment budgets. Define retention and recovery objectives at hosting selection; do not invent an achieved RPO/RTO. W18/W19 must measure them by restoring into a separate database and exercising replay, access and subscription reconciliation.

Backups do not replace a tested restore. Use the database vendor's supported logical/physical backup tools and exact version-compatible commands in the selected-host runbook. Never restore over the active database to test a backup, and never point test cleanup at a backup or production URL.

For a bad application deployment, stop new admissions or risky mutations and preserve durable webhook ingestion where safe. Fence/drain workers and rollback to the prior immutable artifact only if it supports the current schema and data semantics. Otherwise keep writes paused and roll forward a repair. Never rollback by restoring browser authority, deleting accepted records or blindly running down migrations.

For database recovery, restore to an isolated instance first, verify integrity and explicit recovery point, reconcile external Stripe truth and duplicate-safe events, then perform a controlled cutover. Restoring older access or usage can resurrect revoked coverage or reset allowances: block admissions until reconciliation resolves this. Recheck durable provider budgets before any experiment resumes. Invalidate stale sessions/worker leases as required by the incident and replay committed commands without provider calls.

## Production activation gate

Production is a separate owner-authorized action after reviewable evidence. Complete CG1/CG2 and W19: final identity/hosting/region, seller/payment readiness, approved prices/currency/country/tax display, family policy, retention/deletion/support notices, verified domain/TLS, real Stripe lifecycle readiness, measured recovery and the inherited minimum 1,000-active-table capacity gate. Verify required availability/failover rather than treating local Podman as that evidence. No CI pipeline is required by this local cycle; production automation can be designed when authorized.

Release report: source/build/schema revisions; implemented requirements; exact commands/results; passed/failed/blocked/not-run gates; identity/payment/provider modes; requested/observed model IDs; evidence locations; rollback compatibility; known defects; next unfinished milestone. Never describe fixture-only runs as a full working Jev or paid production service.
