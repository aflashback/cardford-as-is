# Local authentication development

Requirement sets: AUTH-LOCAL-001 through AUTH-LOCAL-012 and AUTH-SESSION-001 through AUTH-SESSION-009. See [the initial implementation plan](../superpowers/plans/2026-10-16-keycloak-local-auth.md), [renewable sessions](../superpowers/plans/2026-10-18-renewable-player-sessions.md) and [verification evidence and remaining gates](../../qa/implementation/auth-local/STATUS.md).

## Architecture

Go, Vite, PostgreSQL and the HTTPS development gateway run natively on Windows. Only Keycloak runs in Podman. The launcher owns the development processes it starts; stopping authentication development must not stop the existing game database or unrelated containers.

The regular `npm run dev:go` fixture workflow remains useful for gameplay, coaching and presentation work without an identity server. Use real authentication whenever a change concerns login, account ownership, permissions, session replacement, logout, cookies or browser recovery. Fixture evidence does not establish authentication security.

| Component | Development address / responsibility |
| --- | --- |
| App and API HTTPS gateway | `https://localhost:4443` |
| Keycloak HTTPS gateway | `https://localhost:8443` |
| Native Vite | `127.0.0.1:4178`, reached through the gateway |
| Native Go auth/game API | `127.0.0.1:4179`, reached through the gateway |
| Keycloak container HTTP | `127.0.0.1:8180`, reached through its HTTPS gateway |
| Authentication-development PostgreSQL | Separate native cluster on port 54332 |
| Signed provider logout bridge | HTTPS 4444 on the verified WSL virtual interface; accepts only the owned VM and logout route |

The two public HTTPS ports test distinct origins. They share a hostname and therefore do not establish cross-host regional cookie isolation. Regional deployments require the later regional-discovery and isolation gates from the plan.

## Prerequisites and setup

Use the project's pinned native Node/Go/PostgreSQL tools and the installed Podman machine. Run native tool setup if the project tools have not been installed:

```powershell
node scripts/windows-env.mjs setup
npm ci
npm run dev:auth:setup
```

Setup is currently Windows-specific and uses the existing project's pinned native tool locations, the installed Podman WSL machine and Git for Windows OpenSSL. It checks the Windows WSL virtual interface before allowing Keycloak to reach the dedicated PostgreSQL cluster. A missing prerequisite fails with a setup message rather than falling back to a containerized game/database.

For normal interactive browsers, opt in to trusting this development CA for the current Windows user:

```powershell
npm run dev:auth:setup -- --trust
```

This is not required by the automated live test: that Chromium invocation explicitly trusts only the generated development certificate's public-key fingerprint. The native Go OIDC client verifies its issuer against the generated CA.

Setup generates private configuration beneath ignored `.local/auth/`. It also provisions `keys/provider-tokens-v1.key` once, independently of PostgreSQL. Keep that key across restarts: an existing configuration referencing a missing key fails rather than silently replacing it. The directory inherits the setup's restricted Windows ACL. Never paste generated secrets into chat, commit this directory, or reuse development credentials in a hosted environment. Version-controlled realm configuration describes behaviour and contains no live credentials.

Only the native Go process receives `CARDFORD_AUTH_TOKEN_KEY` and `CARDFORD_AUTH_TOKEN_KEY_ID`; Vite does not receive those injected values. The database holds authenticated encrypted provider credentials and the key ID, never the encryption key. Hosted operation needs a separate secret manager, backup and rotation procedure. To rotate this initial local single-key profile, first revoke affected login families, stop the launcher, preserve the old key for any necessary recovery, deliberately provision a replacement with a new key ID, then restart and require full sign-in. Do not overwrite a key in a running environment or expect existing ciphertext to decrypt with a replacement key.

Certificate generation and trust are separate operations. A local certificate authority is a development trust decision: use the setup command's documented trust option for the current Windows user, or follow its manual trust instructions. Do not disable TLS certificate validation in the Go OIDC client to hide a trust failure. Do not install the development CA as a machine-wide production trust anchor.

The Keycloak image and extension must be pinned to tested versions and checksums. Community extensions are not supplied or security-audited by the Keycloak project. The selected Phase Two email-OTP extension uses the Elastic License 2.0; keep its license and provenance with the infrastructure configuration and review its terms before a hosted offering. Use its browser-flow email OTP authenticator. Do not use its privileged magic-link/login-token endpoints as application sign-in shortcuts.

The community provider has no absolute per-code timestamp. The small `infra/keycloak/otp-policy` wrapper supplies a five-minute absolute lifetime, five attempts per code and a sixty-second resend interval, while reusing the provider's delivery and verification. Refreshing a challenge cannot extend an old code. Setup builds this add-on with a digest-pinned, temporary JDK container and verifies its source/artifact manifest; Java is build tooling, not a new native prerequisite. Its dependency-free policy test runs during the build. Ordinary starts reuse the verified compiled artifact.

The local Keycloak administrator password can be changed independently of generated service secrets. When rotating it in Keycloak, update `keycloak.adminPassword` in ignored `.local/auth/config.json` to the same value before the next launcher start; startup uses it to reconcile the realm. Generated database, client and control secrets retain their existing format checks. Never store the chosen password in version-controlled files.

## Daily workflow

```powershell
npm run dev:auth
```

Open the app URL printed by the launcher. Use the local email inbox printed at startup for registration/login messages. Ordinary starts preserve accounts and games; there is no need to recreate a realm for each editing session. Frontend changes use Vite hot reload. Backend changes require a native Go rebuild/restart; they must not reset the database or Keycloak.

Registration requires email only; display name is optional and a surname is not collected through the player form. This local profile uses email OTP. Google/Facebook/Apple require separate provider app configuration and acceptance; their buttons are not simulated as working connections.

```powershell
npm run dev:auth:status
npm run dev:auth:stop
```

After a Windows/WSL network-address change, stop the auth environment and run `npm run dev:auth:setup -- --refresh-network`. This updates only the owned runtime mapping and native auth cluster access rules, retaining identities and database contents.

To work on features unrelated to identity, use the existing fixture workflow:

```powershell
npm run pg:start
npm run dev:go
```

Never point the real-auth profile at the existing fixture database or expose the fixture identity/billing endpoints through its HTTPS gateway.

## Identity and browser boundaries

- The Go server starts authorization-code login with PKCE, state and nonce, validates the Keycloak response and creates an opaque application session. Browser code never stores provider access/refresh tokens.
- Keycloak authenticates the player. The application owns the immutable account identifier, authorization, game records and usage/access grants. Match issuer and subject; do not match accounts by email.
- A fresh successful login replaces older application sessions. Browser refresh and WebSocket reconnect do not create fresh login events. A second tab within the same login still requires explicit control takeover.
- The authentication coordinator uses the server's short access deadline and one-shot verification on focus, page restoration and visibility return. It does not poll every thirty seconds. Untouched Account/login/paused pages make no recurring auth/game requests. A local access-expiry timer removes private content; a disconnected/replaced browser discovers revocation on its next return/action or local deadline. Server authority is revoked immediately regardless of what a disconnected screen still displays.
- Leaving the auth gate for the public demo discards cached display authorization and CSRF. Returning must finish a fresh bootstrap before private game hooks mount, including when an earlier logout is still completing.
- Reconnect reconciles state; Resume remains explicit. Existing Free 300-second and Paid 3600-second pause deadlines are not extended by login or reconnect.
- Free/Paid are access plans, not administrator roles. Paddle is not connected in this milestone; no browser setting can create commercial Paid access.
- Player access lasts at most fifteen minutes, clipped by the actual provider deadline. Successful renewal driven by real use extends refresh eligibility by ninety days, capped at 180 days from full sign-in. Status, presence, socket traffic, bot playback and an untouched open tab do not extend it. The opaque browser cookie and stable login family survive routine provider refresh; access-expired users explicitly Continue before private hooks mount. No provider token enters JavaScript. Provider rejection or an uncertain rotation requires fresh sign-in rather than replaying a refresh credential.
- Keycloak online player idle/max limits match ninety/180 days; refresh-token rotation is enabled and `offline_access` is not requested. Signed OIDC backchannel logout revokes matching provider sessions. A reused/shared provider `sid` deliberately revokes every matching app family, including a replacement; a different old `sid` cannot revoke the new family. Externally initiated account-disable/delete events still require explicit provider acceptance: backchannel logout alone is not proof that every such event is delivered.
- A game WebSocket exists only during foreground, authorized running play. Initial/reopened/paused recovery uses a one-shot HTTP snapshot. Accepted explicit Resume precedes negotiation; pause, temporary hold, logout, access expiry and replacement close the socket and cancel pending reconnect work. Early successful refresh retains the existing game/control/socket identity. If access actually expires, later renewal does not Resume gameplay automatically.
- Logout revokes the current family, wipes its encrypted provider credentials and clears private UI immediately, including after short access expires. Refresh/logout responses deliberately do not expire the shared cookie: a delayed old response must not delete a newer same-profile login cookie. The revoked opaque handle remains inert until replacement or natural browser expiry. Concurrent callback responses can still arrive in a different order from database commits; an invalid older cookie can require another sign-in, but cannot restore revoked authority.
- The real-auth profile keeps request Origin validation intact. The existing fixture proxy's Origin rewriting is not used to establish auth-profile security.

The local Free test policy allows practice with three coached units per UTC day in each of the existing hand/request buckets. The Coach interface additionally retains its separate two-session Free daily allowance. These are development terms, not finalized public practice/coaching quotas.

To exercise Paid behaviour, first read the authenticated internal account ID from `/api/auth/status` using the normal signed-in browser. An operator can issue a synthetic grant locally:

```powershell
.local/auth/cardford-auth.exe -config .local/auth/config.json -grant-account ACCOUNT_ID -grant-duration 1h -grant-reason "Local Paid access check"
```

This records an `operator-test` grant and audit reason, caps validity at seven days, and never records a Paddle payment. Refresh the account page to see current access. An existing paused game keeps its pinned deadline; a later explicit Resume applies the current valid retention policy.

## Tests and evidence

The local `cardford` login theme lives in `infra/keycloak/theme/cardford/`. It uses the owner-selected cream CardFord design for signup, sign-in and email-code verification. The existing launcher mounts the theme with theme caching disabled; reload the page after edits. Start a fresh sign-in from the app if an old authentication action has expired. See the [theme maintenance notes](../../infra/keycloak/theme/cardford/README.md) and [visual and live-flow evidence](../../qa/implementation/auth-local/theme-20261018/README.md). This theme changes presentation only; the server still enforces validation, code expiry and resend limits.

The sibling `account/` theme extends Keycloak's native `keycloak.v3` console with the same light CardFord branding for Personal info, Signing in, Device activity and Applications. Setup/reconciliation persists `accountTheme: cardford`. Its logo links back to `https://localhost:4443/#account`; this is deliberately a local theme. See [account theme evidence](../../qa/implementation/auth-local/account-theme-20261018/README.md).

```powershell
npm run contracts:auth:check
npm run test:auth
npm run test:auth:browser
npm run test:auth:live
npm run test:auth:otp-policy
```

`test:auth` requires the separate native auth cluster from setup and uses disposable schemas in its test database; it does not require a running Keycloak login session. `test:auth:browser` uses mocked authentication and its own Vite listener on 4198. `test:auth:live` requires the actual `dev:auth` stack and creates synthetic `auth-check-…@cardford.test` accounts. It never resets a developer account and leaves its synthetic records available for debugging.

`test:auth:otp-policy` recompiles the small Java wrapper in its pinned, network-disabled build container, runs its twelve boundary assertions and verifies the resulting artifact against the reviewed manifest. It does not update the manifest. Source/pin changes require an explicit reviewed rebuild.

For the bounded mocked browser matrix, install only the lockfile-pinned Firefox/WebKit runtimes under ignored `.local/auth/playwright-browsers`, then run:

```powershell
node scripts/auth-browser-matrix.mjs --install
node scripts/auth-browser-matrix.mjs
node scripts/auth-browser-matrix.mjs --project=chrome
```

The matrix covers the authentication coordinator and private-hook gate; it is not real-provider/TLS or game-socket evidence. Chrome uses the installed native browser. The 18 October run passed Chrome; Firefox/WebKit downloads timed out on every official mirror, so those eight cases remain unverified. Re-run after the pinned runtime downloads succeed. Do not substitute a missing browser launch for a passing test.

The real-provider journey creates synthetic accounts and accelerates only their application access lease through a parameterized database update. It still redeems the actual Keycloak refresh credential over verified TLS. It also exercises real signed backchannel logout through the private bridge, then fresh sign-in. Long ninety/180-day boundaries use disposable database timestamp fixtures rather than wall-clock waiting. Node helpers receive the generated CA through `NODE_EXTRA_CA_CERTS`; do not disable verification for migration cross-runtime checks.

## Manual checks and operations

1. Run setup once after upgrading. Existing twelve-hour cookies cannot acquire refresh proof silently: sign in again. Accounts, entitlements, games and receipts are preserved by forward migrations 015/016.
2. Keep the encryption key and configuration in private backups alongside database recovery material, with separate hosted secret custody. Setup never silently replaces a missing referenced key. Trust the local development CA only when needed for your interactive browser.
3. In browser A, Resume and confirm one game socket in Network; Pause and confirm it closes immediately. On Account or a paused table, confirm no recurring auth/game requests. Temporary foreground holds may retain bounded HTTP presence separately.
4. Sign in as the same player in browser B. A's server access is revoked; an active socket closes. An untouched disconnected/paused A clears private UI on its next return/action or local access deadline. B recovers the same retained game and deadline, with explicit Resume.
5. Confirm access-expired Continue and Sign out; renewal does not automatically Resume a game. Full login is required after ninety days without qualifying renewal or 180 days from the original full sign-in.
6. Before a hosted release, configure distinct app/issuer cookie hosts, secret-manager custody/rotation, real email abuse controls and verified external disable/delete workflows. Configure and test social providers and Paddle in their own milestones.

Application-originated provider logout/revoke is conservatively skipped until grant-specific cleanup is proven safe for shared provider sessions. Local authority ends immediately; a subsequent login forces fresh provider proof. Signed provider logout and rejection on refresh are supported. The private bridge is restricted by VM source, Host, method, path and body size; Go independently verifies signature, issuer, audience, event, time and replay/SID fences. Keycloak trusts the generated CA using [its documented truststore setting](https://www.keycloak.org/server/keycloak-truststore), not a hostname/TLS bypass.

Critical checks cover contract validation, bootstrap before gameplay enrollment, callback/state/token validation, stable account identity, old-session rejection, CSRF logout and setup/reset safety. Live acceptance additionally proves signup cannot enter the app before email OTP, logout rejects the old cookie, the same player recovers after restart, and browser B invalidates browser A.

Use disposable test data for automated tests. Never reset the persistent development account merely to run a test. Record exact commands and distinguish passed, failed, blocked and not-run checks. Mock OIDC and local email evidence do not establish Google/Facebook/Apple acceptance or regional cloud readiness.

## Agent instructions

1. Read `AGENTS.md`, this guide and the requirement plan before changing auth infrastructure.
2. Check the launcher status before starting another listener. Reuse a healthy existing auth environment.
3. Keep changes in the appropriate layer: infrastructure/configuration, OIDC adapter, HTTP transport, account/session storage, or browser coordinator. Provider calls must occur outside database transactions.
4. Preserve native game database credentials/data and unrelated containers. Never use blanket Podman cleanup, recursive workspace cleanup, or a broad SQL schema/database drop.
5. Do not print `.local/auth/config.json`, raw cookies, OTP codes, provider tokens, passwords, private game state or unredacted callback URLs in reports. Describe secret file locations instead.
6. Run focused tests for changed security paths. Use the existing fast game tests for unrelated rules/UI changes instead of requiring a full identity stack for every test.
7. Stop only processes owned by the launcher. Respect the pause/recovery lifecycle during backend restarts.
8. Report runtime evidence and remaining gates explicitly; do not label a local foundation a hosted or production release.

Go code separates provider verification (`authn`), HTTP/cookie/CSRF handling, application services and durable records. Browser code separates the transport/URL allowlist, authentication state coordinator and React gate/account views. `web/shared/auth.schema.json` is the bootstrap contract source; regenerate its TypeScript and standalone validators with `contracts:auth:generate`, and check freshness with `contracts:auth:check`.

The `authsession` application service coordinates full login, renewal, status, logout and verified provider events. Provider calls occur outside SQL transactions; a durable operation lease and account/family generation fence serialize refresh and reject stale completion after logout/replacement. Records hold deadlines and encrypted credentials. HTTP owns exact-origin/cookie/CSRF contracts; gameplay consumes a verified principal. Post-commit invalidation wakes active realtime bindings, with durable authorization and exact access-deadline checks as safety fences. Local acceptance does not establish multi-instance hosted capacity.

In a restricted agent sandbox, native executable launches or Podman metadata locks may require the approved execution context. Preserve the security and database guards; do not work around a sandbox failure by disabling authentication or substituting fixture test evidence.

## Troubleshooting

| Symptom | Action |
| --- | --- |
| Browser reports an untrusted certificate | Run the explicit CurrentUser trust command above, or use the certificate fingerprint supplied by the automated test. Never disable the OIDC client's TLS checks. |
| A local port is occupied | Run `dev:auth:status`; reuse or stop the owning launcher. Do not kill arbitrary processes found by port alone. |
| Podman machine is stopped | Start the existing Podman machine, then repeat setup. The launcher does not create a second VM silently. |
| WSL address changed after restart | Stop the auth environment, then run setup with `--refresh-network`. |
| Native auth PostgreSQL is stopped | Repeat setup before running `test:auth`. The ordinary game cluster is a separate service. |
| OTP is expired or exhausted | Request a new code after the resend interval; do not reuse an old email. |
| Account console shows Something went wrong | Local reconciliation adds the exact issuer origin to `account-console.webOrigins` and restores the realm-default role on the existing `player`/`second` seed identities. Start the app normally or run `node scripts/auth-configure.mjs` against the healthy local stack, then reload the console. Do not use wildcard origins or enable full scope as a workaround. See AUTH-LOCAL-010 evidence. |
| Correct OTP returns to sign-in recovery | The app login attempt is independently browser-bound and expires after five minutes. Start sign-in again from the recovery page or the app in the same browser. Do not copy transient Keycloak URLs between browsers. Failed browser callbacks keep their error status and show recovery actions; API callers still receive JSON. |
| Synthetic Paid grant does not change an existing countdown | Expected: the paused game's deadline is pinned. Explicit Resume establishes the current valid policy. |
| A source/artifact checksum differs | Inspect the intended source/dependency change and rebuild/update the pinned manifest deliberately; never bypass the checksum. |

The generated leaf certificate lasts ninety days and the development CA lasts one year. Automatic renewal/rotation is not implemented. Inspect expiry with OpenSSL; stop the auth environment and deliberately regenerate the development certificate files when due. A replacement CA must be explicitly trusted again. Never delete or recreate database data to fix a certificate-expiry problem.

The destructive development reset, when intentionally needed, is `npm run dev:auth:reset -- --confirm=cardford-local-auth`. It clears only the three named auth databases, preserving the original native game cluster. This command is not part of startup or tests.

## Remaining release gates

Automatic global account discovery/provisioning, cross-host regional isolation, real social-provider configuration, optional MFA/recovery journeys, retention/deletion operations, multi-instance game correctness, measured capacity and Azure deployment require their own acceptance evidence. Paddle checkout, webhooks and subscription management are a later integration milestone.

`npm run dev:auth:regional` explicitly reports that the multi-region profile is not implemented; it does not simulate regional security with ports and call it complete.

The authentication-development cluster is isolated. Reset is an explicit destructive operation limited to its named resources; read the command's safety checks before use. Ordinary stop/start never performs reset.
