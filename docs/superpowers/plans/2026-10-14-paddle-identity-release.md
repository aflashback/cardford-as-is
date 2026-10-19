# Paddle, identity and website release delivery plan

Status: original delivery plan, 14 October 2026. Updated owner direction on 16 October selects regional Keycloak and authorizes the [local-auth foundation](2026-10-16-keycloak-local-auth.md). Its [setup guide](../../development/local-auth.md) records the active workflow. Auth0/Supabase comparisons below are historical; Paddle and cloud deployment are later milestones.

**Deployment workstream, 18 October:** follow the [regional PostgreSQL and distributed Go guide](2026-10-18-regional-postgresql-architecture.md) and its [specification](../specs/2026-10-18-regional-postgresql-architecture-design.md) for SQL HA, Go recovery, stable-region routing and reporting. Coordinate M1's hosted entrypoint and forward migrations with that guide; do not build duplicate runtime/auth stacks. Whole-region failure leaves affected players waiting. Runtime implementation and live deployment remain separately authorized work; game-history/score retention stays deferred.

**Goal:** Release the existing Go game website with recoverable social/email accounts, a bounded Free tier and one Paddle monthly paid tier, with secure ownership, predictable access and operational privacy controls.

**Architecture:** Managed OIDC login through a Go backend, opaque app sessions, stable internal player IDs, PostgreSQL authorization and usage records, server-created Paddle transactions, signed durable webhook intake and asynchronous reconciliation into immutable access grants.

**Tech stack:** Existing root Go module (Go 1.26.8, pgx/PostgreSQL), React/Vite/TypeScript, existing JSON Schema contract generators; maintained OIDC and Paddle libraries selected and pinned during implementation. Auth0 is the recommended identity reference, not an approved vendor purchase. Keep the current deterministic runtime and seven installed game/variant adapters.

**Spec:** [source audit and design](C:/repos/test-jev/docs/superpowers/specs/2026-10-14-paddle-identity-release-design.md). **External dependencies:** [manual setup checklist](C:/repos/test-jev/planning/implementation/hosted-release/manual-setup-checklist.md).

**Global constraints:** No implementation until the owner requests it. Preserve unrelated working-tree changes, historic saves/grants and local test fixtures. No runtime AI integration. No credit-card/password/OTP storage in CardFord. No provider calls inside database transactions. Every public behavior gets a requirement ID, acceptance evidence and changelog entry. Existing local-only checks must not be loosened into implicit production permission.

**Review focus:** Missing-principal authorization, issuer/subject ownership, explicit social linking, MFA recovery bypass, duplicate external checkout, stale workers/webhooks, all-route quota enforcement, commercial versus security revocation, deleted-account resurrection and hosted restore/recovery.

## Delivery sequence and dependency gates

1. Approve the product/security defaults and prove the identity tenant can support them.
2. Build the hosted trust boundary and real accounts before accepting payments.
3. Implement consistent Free/paid entitlements and admission accounting.
4. Add Paddle checkout, durable reconciliation and customer self-service.
5. Complete account lifecycle, deployment and sandbox/hosted acceptance.
6. Release a bounded pilot, then increase capacity from measurements.

Manual verification of Paddle seller/domain eligibility, identity plan features and social-provider setup can run while engineering prepares the backend. An incomplete vendor gate disables that provider or paid launch; it is not bypassed with fixtures.

Each milestone is a reviewable increment. The checkboxes below describe future work and are intentionally unchecked. Paths marked new are proposed files. Use the next available forward migration numbers when implementation starts; this inspection found canonical migrations 001–012. Do not alter their contents or checksum pins.

## M0 — Freeze the release contract and vendor assumptions

Requirements: `WEB-REL-001`, `WEB-TIER-001`, `WEB-ID-001`.

Files: new `C:/repos/test-jev/planning/decisions/CR-HOST-001-paddle-and-identity.md`; update [decisions](C:/repos/test-jev/docs/11-decisions-risks.md), [deployment guide](C:/repos/test-jev/planning/DEPLOYMENT-GUIDE.md), [requirements](C:/repos/test-jev/planning/implementation/requirements-and-tests.md) and the project's changelog during implementation.

- [ ] Record the owner decisions from the design: exact Free quotas, paid name/price/currency, released game targets, renewal grace, refund/continuation policy, identity vendor, minimum age/markets, retention and hosting budget.
- [ ] Explicitly supersede the earlier multi-paid-tier/Stripe hosted direction for this release while preserving historical reference code and fixtures.
- [ ] Create a requirements-to-evidence matrix covering `WEB-ID-*`, `WEB-BILL-*`, `WEB-TIER-*`, `WEB-DATA-*` and `WEB-OPS-*`.
- [ ] In the selected identity sandbox, prove hosted Google/Facebook/email OTP, account linking with two proofs, MFA/recovery, deletion and admin controls. Treat Apple eligibility as a separate gate. Confirm costs/features for total Free+paid MAU, including 1k/10k/100k scenarios.
- [ ] Confirm Paddle accepts the actual game product and billing model. Check approved monthly price configuration and whether localized prices/currencies require additional allowlisted price IDs.

Acceptance: a concrete configuration/decision record, no unresolved assumption that changes account identity or billing ownership, and clear disabled-provider states where setup remains incomplete. No production credentials in the record.

## M1 — Explicit hosted runtime and fail-closed storage

Requirements: `WEB-REL-002`, `WEB-ID-002`, `WEB-OPS-001`.

Modify [store.go](C:/repos/test-jev/server/internal/records/store.go), [identity.go](C:/repos/test-jev/server/internal/records/identity.go), [service.go](C:/repos/test-jev/server/internal/service/service.go), [HTTP routing](C:/repos/test-jev/server/internal/http/local.go), [demo web wrapper](C:/repos/test-jev/server/internal/http/demo_web.go) and [migration reader](C:/repos/test-jev/server/internal/records/store_migrations.go). Add:

- `C:/repos/test-jev/server/cmd/cardford-hosted/main.go`
- `C:/repos/test-jev/server/cmd/cardford-migrate/main.go`
- `C:/repos/test-jev/server/internal/http/hosted.go` and `hosted_config.go`
- `C:/repos/test-jev/server/internal/records/hosted_store.go`
- Corresponding hosted configuration, transport and authorization tests.

- [ ] Separate connection/deployment mode from authorization mode. The hosted constructor requires authorization; a missing or expired principal always fails for private user operations. Confine credential-free test helpers to explicit test construction.
- [ ] Define narrow worker operations for billing/privacy jobs. A worker credential must not be accepted as an arbitrary user principal, and the worker must verify bound ownership and account status before applying effects.
- [ ] Reuse route/schema/body/time bounds but create a hosted route inventory. Disable `/api/local/session`, fixture billing changes, family fixtures and debug installation routes in hosted mode. Cover both existing account-delete routes so neither bypasses the new lifecycle.
- [ ] Add trusted proxy and exact HTTPS origin/host configuration, secure cookies, CSRF checks and denied-by-default CORS. Do not trust arbitrary forwarded headers from the Internet.
- [ ] Give OIDC callbacks and raw Paddle webhooks dedicated middleware; they do not receive a blanket exemption for ordinary API requests.
- [ ] Add a production database constructor using TLS verification, bounded connections/timeouts and least-privilege app role. Validate isolation from local/test databases and fail startup on fixture configuration or missing offer bindings.
- [ ] Restrict commercial billing/paid-grant writes to a separate worker role or constrained database functions; keep web-account Free issuance narrowly scoped. Test permissions, not just application-level checks.
- [ ] Run forward migrations as a release command with a separate role. Web startup checks expected schema version instead of performing DDL.
- [ ] Add liveness/readiness and graceful SIGTERM handling. Keep external identity/Paddle outage reporting separate from core DB readiness.

Acceptance: missing principal, forged owner, expired/revoked session, wrong origin and local bootstrap requests fail in hosted mode. Explicit test/local behavior still works. Worker operations cannot mutate another customer's subscription by passing a different owner ID. Private paths recheck revocation after async work. Database credentials cannot create/drop schemas in the web runtime.

## M2 — Accounts, hosted login and secure sessions

Requirements: `WEB-ID-003` through `WEB-ID-007`.

Add `C:/repos/test-jev/server/internal/identity/{oidc.go,login.go,linking.go,provider.go}` (separate files), `C:/repos/test-jev/server/internal/records/accounts.go`, `account_sessions.go`, `account_identities.go`, and a forward account/session migration under `C:/repos/test-jev/web/server/records/migrations/`. Extend [current principals](C:/repos/test-jev/server/internal/records/identity.go), [realtime authorization](C:/repos/test-jev/server/internal/service/realtime.go) and [client auth lifecycle](C:/repos/test-jev/web/src/api/client.ts).

Proposed internal interfaces:

- `IdentityProvider`: construct authorized login URL, exchange/verify callback, prove recent authentication, link/unlink identities with verified proofs, revoke/delete managed identity. Returned claims are typed, verified records, never client JSON.
- `AccountStore`: resolve verified issuer+subject, create account and configured Free grants atomically, issue/rotate/revoke app sessions, read current security generation and manage single-use linking intent.
- `SessionPrincipal`: stable owner, session binding, security generation and authentication time/assurance. Roles/entitlements come from server records, not user-editable provider metadata.

- [ ] Add immutable internal account IDs and unique verified issuer/subject mappings. Map new hosted accounts to the existing owner model. Keep historical local owners separate; do not claim them by email.
- [ ] Implement authorization code + PKCE S256/state/nonce and exact redirect handling; reject callback replay, unexpected issuer/audience/algorithm, stale auth attempt and open redirects.
- [ ] Issue hash-backed opaque Secure/HttpOnly host-only sessions. Enforce reviewed idle/absolute expiry, rotate on security changes, and clear browser/realtime state when ownership changes.
- [ ] Implement explicit linking: recent primary proof plus fresh secondary proof, account-bound single-use intent, broker operation and stable internal ID. Preserve aliases on primary-subject changes. Reject linking an identity already bound to a different populated account.
- [ ] Implement unlink safeguards, verified recovery contact, email change and logout/logout-all. Revoke all relevant app sessions and enforce security generation during asynchronous requests.
- [ ] Configure IdP-managed email OTP, optional player TOTP/recovery and mandatory administrator MFA. Prove every linked method and recovery route honors enrolled MFA, with no email-only fallback bypass.
- [ ] Queue verified IdP/provider events for disablement, deletion or credential compromise and apply session revocation. Poll/reconcile vendor state where event delivery is unavailable rather than claiming instantaneous revocation.
- [ ] Add a minimal audited operator interface/CLI for account lookup by internal ID, suspension and recovery escalation. No public admin signup, editable client roles, general-purpose impersonation or grant toggles in the customer API.

Acceptance: two different social identities with the same email remain separate unless explicitly linked; one explicitly linked player sees the same games/subscription from each method. Missing email and Apple relay email work. Concurrent signup creates one mapping. Wrong-state login, session fixation, lost-factor recovery bypass and stolen link intent are rejected. Suspension/logout-all disconnects realtime and blocks stale work commits.

## M3 — One hosted access policy and consistent Free quotas

Requirements: `WEB-TIER-002` through `WEB-TIER-006`.

Modify [access types](C:/repos/test-jev/server/internal/access/types.go), [resolver](C:/repos/test-jev/server/internal/access/policy.go), [configuration](C:/repos/test-jev/server/internal/access/config.go), [launch policy](C:/repos/test-jev/server/internal/access/launch.json), [access storage](C:/repos/test-jev/server/internal/records/access.go), [configured Free issuance](C:/repos/test-jev/server/internal/records/access_configured_free.go), [Coach panel storage](C:/repos/test-jev/server/internal/records/coach_ui.go), [access service](C:/repos/test-jev/server/internal/service/access.go), [mutations](C:/repos/test-jev/server/internal/service/mutations.go), [Coach service](C:/repos/test-jev/server/internal/service/platform_coach.go) and review/trial service paths. Add `C:/repos/test-jev/server/internal/records/hosted_usage.go`, `commercial_access.go` and forward quota/projection migrations.

- [ ] Define two public tier IDs with versioned server terms. Internally map supported hand/request targets without pretending all modules use hands. Use stable account-wide UTC buckets.
- [ ] Add atomic practice admission accounting at each adapter-declared new-unit boundary. Reserve/charge once with the durable command receipt and admission; reject racing exhaustion. New-game, next-hand, Trix request and playable-branch routes must share it.
- [ ] Add a common hosted coached-unit unlock ledger. Both older advice/notes/review routes and newer Coach session/item routes consume the same allowance and check their exact allowed tools. A route that cannot participate is explicitly disabled in hosted mode until adapted.
- [ ] Preserve already delivered records and original immutable grants/unlocks. New hosted terms do not reinterpret old two-session or historical hand-based allowances. Do not charge twice for retries or several actions on one unlocked unit.
- [ ] Distinguish active entitlement for new work, admitted-unit continuation, retained-result reads and security suspension. Lapse/cancellation returns to Free without deleting progress; security suspension denies immediately.
- [ ] Keep Free buckets stable through login/linking, policy reload, subscription renewal and downgrade. Use current server time, not browser timezone, for limits.
- [ ] Separate commercial exclusions/refund effects from security revocation so new paid work can stop while owned delivered results remain readable under retention policy.
- [ ] Enforce bounded compute/concurrency on every tier and charge before expensive generation where appropriate. Failure/refund of a reserved allowance is defined and idempotent; a client retry cannot mint free work.

Acceptance: exhaustion across multiple tabs/devices and all seven targets cannot overspend the pooled quota. A fourth unit fails under the proposed three-unit default; finishing a previously admitted unit succeeds. Two coached units can be revisited; a third requires paid access or the next day. No alternate coaching route bypasses the same budget. New payment and midnight races remain deterministic. Old saved results and game-version pins are unchanged.

## M4 — Bound Paddle customer and checkout operations

Requirements: `WEB-BILL-001` through `WEB-BILL-004`.

Add `C:/repos/test-jev/server/internal/billing/{provider.go,paddle.go,checkout.go,models.go}` and `C:/repos/test-jev/server/internal/records/{billing_customers.go,billing_operations.go}` plus a forward billing migration. Add narrow billing handlers to the hosted router/service. Use [legacy purchase logic](C:/repos/test-jev/web/server/billing/purchases.ts) for invariant review, not runtime reuse.

`BillingProvider` exposes typed create/retrieve transaction, customer, subscription, adjustment and portal operations. It returns definite rejection separately from an unknown outcome. HTTP timeouts or transport errors after submission do not authorize automatic create retries. Keep API version/environment, request deadlines and permitted fields explicit.

- [ ] Persist account/customer/environment/seller bindings with uniqueness constraints. Require an active authenticated account and verified recovery contact before checkout.
- [ ] Treat a provider customer-email conflict as a recovery/conflict case. Never reuse another account's customer merely because the email matches.
- [ ] Accept only public offer ID plus app command ID; derive all financial and ownership fields on the server. Price/product/currency/interval/quantity allowlists are configuration reviewed with M0.
- [ ] Serialize customer creation and checkout by account using durable fenced operations. Detect an existing eligible subscription or pending transaction before creating another.
- [ ] Persist the operation before the provider call, then persist the exact returned transaction before handing checkout to the browser. Metadata contains an opaque correlation reference, not trusted owner claims.
- [ ] Implement `ambiguous` operation state and reconciliation. Recover only through conclusive server/provider evidence; keep unprovable or multiple candidates quarantined for operator handling. No blind provider retry, including after worker restart or lease expiry.
- [ ] Provide pending-operation status scoped to the requesting account. A return URL can request reconciliation but cannot attach a transaction or grant access.
- [ ] Detect old checkout completion after another subscription was purchased; queue duplicate-charge resolution and prevent stacked grants.

Acceptance: account B cannot use account A's operation/customer/transaction; forged metadata and client price/owner fields cannot grant. Two checkout clicks create one normal operation. Network timeout, crash after remote create and webhook-before-response scenarios produce recoverable pending/ambiguous state without silently retrying the charge.

## M5 — Signed events, current billing state and immutable grants

Requirements: `WEB-BILL-005` through `WEB-BILL-010`.

Add `C:/repos/test-jev/server/internal/http/paddle_webhook.go`, `C:/repos/test-jev/server/internal/billing/{events.go,reconcile.go,entitlements.go}`, `C:/repos/test-jev/server/internal/records/{billing_events.go,billing_jobs.go,billing_subscriptions.go}` and forward inbox/period/adjustment migrations. Reuse [outbox](C:/repos/test-jev/server/internal/records/realtime_outbox.go) and access-generation notifications.

- [ ] Verify timestamped Paddle signatures on bounded untouched request bytes before parsing. Reject modified payload, wrong environment/secret and invalid/replayed signature timestamps. Accommodate provider retry semantics without confusing event age with signature age.
- [ ] Persist deduplicated event and job atomically, acknowledge only after commit and within the provider response window. Database outage returns retryable failure. Replays with a new notification ID still deduplicate by event ID.
- [ ] Reconcile from current provider entities outside DB transactions. Verify the full binding chain, eligible monthly price, actual completed payment, exact period and adjustment effects. Unknown events/bindings cannot create owners or access.
- [ ] Apply changes transactionally with account/billing locks and generation fences. Insert one immutable grant per verified paid period/target. Duplicate transaction completion cannot grant twice.
- [ ] Implement scheduled cancellation, renewal, bounded once-only grace, failed first payment, past due, actual cancellation/pause and refund/dispute/reversal behavior from the design. Never replace the calendar month with 30 days.
- [ ] Store negative adjustments explicitly. Do not implement paid-through as only a monotonic maximum or revocation as a single irreversible bit for every business condition.
- [ ] Notify active clients only after commit; enforce the changed entitlement in the backend even if the client misses notification.
- [ ] Add periodic repair for missed events, expiring coverage and pending operations, plus bounded retries, dead-letter visibility and operator replay. Respect deleting/deleted tombstones at every step.

Acceptance: reordered completed/canceled/past-due/refund events, webhook duplicates, concurrent workers, timeout recovery and stale snapshot writes produce the same final access as current verified provider facts. Approved full refund differs from pending, rejected, partial and tax-only adjustments. Deleted users never reappear. Provider outage preserves current unexpired paid coverage without issuing an unverified next period.

## M6 — Account contracts and the customer experience

Requirements: `WEB-ID-008`, `WEB-BILL-011`, `WEB-TIER-007`.

Modify [account schema](C:/repos/test-jev/web/shared/platform-account.schema.json), [local identity schema](C:/repos/test-jev/web/shared/local-service.schema.json), [Coach schema](C:/repos/test-jev/web/shared/platform-coach.schema.json), [schema generators](C:/repos/test-jev/web/scripts/generate-contracts.mjs), [Go generator](C:/repos/test-jev/scripts/m02a-contracts.mjs), [account service](C:/repos/test-jev/server/internal/service/platform_account.go), [AccountPage](C:/repos/test-jev/web/src/features/AccountPage.tsx), [session bootstrap](C:/repos/test-jev/web/src/api/useGoSession.ts) and [API client](C:/repos/test-jev/web/src/api/client.ts). Add hosted identity/billing schemas and generated outputs through those generators, plus small SignIn/Security/Checkout UI components.

Proposed routes (new unless noted):

| Route | Contract and authority |
| --- | --- |
| `GET /auth/login`, `GET /auth/callback` | Start/complete account-bound OIDC attempt; no arbitrary return URLs |
| `POST /auth/link`, `POST /auth/unlink`, `POST /auth/step-up` | Session + CSRF + recent-auth/second-identity proofs as applicable |
| `GET /api/account` (existing, new hosted variant) | Sanitized tier, allowances, dates, linked-method summaries and capabilities derived from server records |
| `GET /api/account/sessions`, `POST /api/account/sessions/revoke` | Current-account session summaries and revocation; never returns session tokens |
| `POST /api/billing/checkout` | Offer ID + command ID; returns own operation state and bound checkout reference |
| `GET /api/billing/operations/{id}` | Current-account operation only; no grant from query parameters |
| `POST /api/billing/portal` | Derives stored customer/subscription; returns short-lived portal URL after required step-up |
| `POST /webhooks/paddle` | Raw signature validation, durable event receipt; no app session |
| `POST /api/account/export` | Durable export request with current authentication; bounded private download/status |
| `POST /api/platform/account/delete` (existing, new hosted semantics) | Recent-auth durable lifecycle request; old direct-delete routes disabled/redirected internally |

- [ ] Keep local fixture account shape explicit; add a hosted discriminated shape instead of putting real billing into fixture fields. Generate Go and TypeScript validators from the same schemas.
- [ ] Remove automatic `/api/local/session` creation from hosted initialization. Show login, account recovery and neutral provider error states without account enumeration.
- [ ] Show only configured sign-in providers and two public tiers. Explain Free remaining units/reset time, pending confirmation, paid renewal/access-end date, grace, cancellation and downgrade.
- [ ] Use a server-bound Paddle transaction on a dedicated checkout surface with the minimum required CSP allowances. No card fields handled by the app.
- [ ] Launch fresh Paddle portal sessions for payment methods/invoices/subscription management. Browser success and return events refresh authoritative state only.
- [ ] Expose linked methods, verified recovery contact, sessions/logout-all, IdP factor management and export/deletion. Preserve auth-epoch cleanup so an old account's response cannot paint after logout or account switch.
- [ ] Keep historical owned results available according to policy, including when subscription access has expired. Hide family/annual/trial choices from the hosted catalog.

Acceptance: keyboard/mobile login and redirects work in supported browsers, including denied consent, blocked popup fallback if used, lost network, missing email and expiry while playing. UI tier always agrees with backend; manipulating client state cannot unlock play/coaching. No provider/implementation jargon is needed in the customer's normal flow.

## M7 — Privacy jobs, retention and support operations

Requirements: `WEB-DATA-001` through `WEB-DATA-006`, `WEB-OPS-002`.

Modify [erasure](C:/repos/test-jev/server/internal/records/erasure.go), [account export](C:/repos/test-jev/server/internal/records/platform_account_export.go) and account services. Add `C:/repos/test-jev/server/internal/privacy/{lifecycle.go,retention.go,export.go}`, `C:/repos/test-jev/server/internal/records/account_jobs.go` and forward lifecycle/audit migrations. Add operations runbooks under `C:/repos/test-jev/planning/implementation/hosted-release/`.

- [ ] Implement `active -> deleting -> deleted` with immediate session/security-generation revocation, checkout/grant suppression and durable cancellation/erasure jobs.
- [ ] Stop Paddle renewal and reconcile its result; retry/alert uncertain cancellations. Record whether refund review is separately required. Do not report deletion complete while billing cleanup silently failed.
- [ ] Revoke/delete IdP identities and required provider tokens through verified vendor APIs. Authenticate provider deauthorization/deletion callbacks. Distinguish disconnecting one login method from deleting the whole account.
- [ ] Delete nonrequired game/profile data, minimize financial evidence and retain purpose-limited tombstones only for the approved period. Old webhooks, admin replay and account recreation must not resurrect prior paid access.
- [ ] Build scheduled retention jobs with dry-run counts, bounded batches, referential checks, audit and safe retry. Preserve active games, pinned rule dependencies, legally required records and documented holds.
- [ ] Export only owned and seat-safe data, with private expiring delivery and download limits. Redact secret/internal/provider data.
- [ ] Add operator procedures for duplicate charges, linking conflicts, lost factors, suspended accounts, failed erasure and data requests. Use least-privilege roles and an audit trail; no manual database edits as the normal support workflow.

Acceptance: deletion during checkout, renewal, worker retry and provider outage is recoverable and prevents future access. Backups restored into isolation replay erasures before opening traffic. Retention removes expired data without breaking live references. Exports and deletion status cannot be accessed by another account.

## M8 — Hosted packaging, operations and acceptance

Requirements: `WEB-OPS-003` through `WEB-OPS-008`.

Add production packaging/CI and reviewed environment templates; adjust [.dockerignore](C:/repos/test-jev/.dockerignore), [package scripts](C:/repos/test-jev/package.json) and the deployment guide as needed. Keep [local Windows launcher](C:/repos/test-jev/scripts/start-go.mjs) for local use. Add an evidence report under `C:/repos/test-jev/qa/` for the exact release commit/artifact.

- [ ] Build a non-root long-running Go deployment with explicit asset and migration packaging. Exclude local credentials, fixture data, offline labs, debug routes and the Node reference server from runtime exposure.
- [ ] Provision TLS/DNS, private managed PostgreSQL, restricted ingress, secret injection, separate staging/live IdP and Paddle configuration, and encrypted backups with restore access controls.
- [ ] Add bounded background jobs, account/IP rate limits, CPU/concurrency limits and observability. Make limits compatible with total replica connection budgets.
- [ ] Test graceful deploy/restart, bot playback recovery, realtime reconnect, stale sessions, queue replay and provider outages. Avoid enabling multiple web replicas until shared state/fan-out behavior is verified.
- [ ] Run the acceptance matrix below in an isolated hosted staging deployment with real identity providers and Paddle sandbox; simulator tests alone are insufficient.
- [ ] Measure the agreed pilot concurrency and sustained game/coaching mix. Record p95/p99 latency, errors, CPU/memory, DB pool/lock contention and queue/outbox lag. Choose safe caps from results, not an estimated MAU number.
- [ ] Perform a backup restore and deletion-replay drill; document recovery time/data-loss objectives and measured results.
- [ ] Verify production seller/domain/provider approvals, policy pages, email deliverability, admin recovery and alert delivery. Conduct a controlled live purchase/refund check only under an approved spend/refund procedure.
- [ ] Provide rollback that stops new paid checkout while preserving existing paid users, signed webhook intake and cancellation/privacy jobs. Prefer forward migration fixes; do not drop paid records during rollback.

Acceptance: an evidence report names exact commands, artifact/commit, provider environments, passed/failed/not-run checks, unresolved risks and pilot limits. Staging success is not a claim of unlimited capacity or complete compliance.

## Focused verification plan

These are future checks, not results from this planning task. Run from `C:/repos/test-jev`. Existing PostgreSQL tests require an isolated `TEST_DATABASE_URL`; their skip output is not acceptance. Never point tests at production or the live local gameplay database.

Contract checks after intentional generation:

```powershell
npm run contracts:generate
node scripts/m02a-contracts.mjs
npm run contracts:check
node scripts/m02a-contracts.mjs --check
npm run typecheck
npm run build
```

Proposed focused Go packages after the new files exist:

```powershell
go test ./server/internal/http ./server/internal/identity ./server/internal/access ./server/internal/billing ./server/internal/privacy ./server/internal/contracts
go test ./server/internal/records ./server/internal/service -run 'TestHosted|TestIdentity|TestPaddle|TestBilling|TestAccountLifecycle|TestHostedQuota' -count=1
go build ./server/cmd/cardford-hosted ./server/cmd/cardford-migrate
```

Name new acceptance tests consistently with the second command and confirm the expected count ran. Run concurrency/race-focused cases on a supported CI host. Retain the relevant existing account/access/erasure/realtime and game-continuation tests as compatibility checks. Do not run unrelated long strategy campaigns for billing changes.

| Scenario group | Required observations |
| --- | --- |
| Authentication | State/nonce/PKCE/issuer/audience errors; session fixation; replay; forged owner; CSRF; open redirect; signup race; missing email; provider outage |
| Identity lifecycle | Two providers same email; explicit link; linking to populated account; final-method unlink; subject alias change; MFA bypass attempts; recovery; logout-all; signed provider deauthorization |
| Billing ownership | Two distinct test users; forged customer/price/metadata; shared/copied checkout link; stale checkout; wrong seller/environment; duplicate subscription; replayed checkout return |
| Provider reliability | Timeout after create; crash before storing transaction; webhook before create response; duplicate/out-of-order event; wrong signature/raw-body mutation; DB unavailable before ACK; stale worker fence |
| Commercial lifecycle | First payment/decline, calendar renewal, scheduled cancellation, cancel/recover, once-only grace, failed renewal, full/partial/tax refund, pending/rejected refund, chargeback/reversal |
| Access consistency | All seven targets; all play/coaching routes; concurrent tabs/devices; UTC boundary; no new-game/branch quota bypass; original grant pins; saved read after expiry/refund; security suspension |
| Privacy/operations | Delete during payment/renewal, vendor failure, webhook after deletion, recreated account, private export, retention batches, restored backup, secret rotation, capacity and reconnect storm |

## Completion boundary

The implementation is complete only when the approved requirements, manual gates and staging evidence are satisfied. The current task stops at these documents. No runtime code, subscription catalog, identity tenant, hosted database or production setting has been changed.
