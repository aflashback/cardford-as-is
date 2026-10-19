# Local Keycloak authentication evidence

## Renewable sessions — 18 October 2026

Requirements AUTH-SESSION-001 through AUTH-SESSION-009. This section supersedes the twelve-hour cookie, periodic foreground polling and paused socket behavior in the historical foundation evidence below. Local implementation is complete; it is not a hosted release or social/Paddle integration.

Implemented: fifteen-minute maximum access, ninety-day inactivity extended only by successful qualifying refresh, a fixed 180-day full-login cap, server-only encrypted provider bundles, one active stable family, durable refresh/replacement/logout fences, typed renewal-required bootstrap and exact-body retry, and no blanket idle auth poll. Paused/reopened recovery uses HTTP; accepted Resume precedes game socket opening. Pause, hold, logout and actual access expiry close sockets immediately. Routine early renewal retains control and socket identity.

Migrations 015/016 are additive. Revocation wipes old token ciphertext; one bounded worker clears expired ciphertext and prunes attempts/events. Setup preserves a key outside PostgreSQL and injects it only into Go. Real signed provider logout reaches a source/path-restricted private HTTPS bridge; SID locking/tombstones prevent an already-verified callback reinstalling logged-out authority.

### P2 recovery review follow-up — 18 October 2026

AUTH-SESSION-004/006: fixed both recovery findings with two production-line changes. Shared Go admission now preserves the records error for the existing typed error mapper. GET/HEAD API reads cannot initiate refresh, including automatic Coach reloads. Explicit Continue and qualifying mutation retry retain their existing behavior; no new component or migration was added.

Both new regressions failed before the fix for the expected reasons: renewable admission returned terminal `UNAUTHENTICATED`, and a background GET refreshed and made two requests. After the fix, `npm run test:auth` passes all 50 Node checks and all six Go packages with disposable PostgreSQL schemas. The regressions cover preflight-to-admission expiry, terminal rejection after revocation, and GET/HEAD expiry without refresh, replay, auth-epoch invalidation or lost pending actions. `npm run typecheck --workspace web` and `git diff --check` pass. Live provider/browser journeys below are earlier evidence and were not rerun for this patch.

| Current evidence | Result |
| --- | --- |
| `npm run test:auth` | Pass: 50 focused Node checks and six Go packages (`authn`, `authsession`, HTTP, records, service, auth entrypoint), using isolated disposable test schemas. Covers strict deadlines, passive reads, overlap/uncertain/lost refresh, replacement/logout races, stable family, late pause, secret custody and the P2 recovery regressions above. |
| `npm run test:auth:browser` | Pass: eight mocked Chrome journeys, 16.7s final run. Includes zero recurring idle requests, local expiry, explicit Continue, status-only focus, private-hook gating and CSRF logout. |
| `npm run test:auth:live` | Pass: one actual Keycloak journey, 12.2s final run. Email-only signup/OTP policy, no pre-OTP app session, no paused socket, accepted Resume plus real frames, immediate pause closure, actual provider refresh rotation after synthetic lease acceleration, unchanged family/hard cap, Paid operator grant, browser replacement preserving account/game/deadline, zero idle Account polling, old-browser rejection, signed provider backchannel logout over verified TLS, fresh sign-in and explicit app logout. |
| Focused Go realtime: `go test ./server/internal/http ./server/internal/service -run '^(TestAuthRealtime\|TestRealtime)' -count=1 -timeout=90s` | Pass: HTTP 0.621s, service 30.327s final run. Covers paused admission, quiet/in-flight socket cancellation, exact deadline, lost refresh notification, ownership and immediate post-commit revocation. |
| `go test ./server/internal/records -run '^TestM03CanonicalMigration(CrossRuntimeLedger\|Pins)$' -count=1 -timeout=60s` with the documented CA/native environment | Pass, 3.621s. Go/Node apply/read the same additive checksum ledger; drift remains rejected. Existing applied 015 checksum also matched the development database. |
| `npm run contracts:check`, auth contract freshness, `npm run typecheck --workspace web` | Pass. Public error contract preserves mid-request renewable expiry instead of converting it to 503/terminal logout. |
| `node scripts/auth-browser-matrix.mjs --project=chrome` | Pass: four bounded mocked critical journeys, 9.5s. This overlaps the Chrome suite; it is not four extra provider journeys. |
| `node scripts/auth-browser-matrix.mjs` | Exit 1: four Chrome passes and eight browser-launch failures. Pinned Firefox/WebKit executables were unavailable after all official download mirrors timed out. Those cases are blocked/unverified, not passing. |
| Setup, owned native stop/rebuild/start, actual issuer and app readiness | Pass. Native Go/Vite/PostgreSQL and owned Podman Keycloak retain configuration/account/game data. No persistent database reset or broad container cleanup. |
| Independent focused source review and re-review | Callback-after-provider-logout and stale refresh/logout cookie races repaired; no remaining actionable blockers in that review. This is not a broad repository/third-party audit. |

Earlier runs caught a wrong live Pause selector and a missing search path in the synthetic lease-update helper; both were corrected before the final green provider run. One realtime Hearts fixture hit its existing five-second timeout during overlapping database work; the final full focused realtime run passed without weakening the timeout. The initial cross-runtime migration test lacked Node CA trust; the final run passes with `NODE_EXTRA_CA_CERTS`, without a TLS bypass.

Reviewed implementation decisions: real logout/refresh replies do not expire the shared cookie, because a delayed response could erase a newer login. Server authority/private UI end immediately; the revoked opaque handle remains inert until overwritten or expired. App-originated provider cleanup is skipped until grant-specific revocation safety is established. Concurrent callback response ordering can still leave an invalid cookie and require another full sign-in, but cannot restore old server authority.

Remaining acceptance: unavailable Firefox/WebKit cases; hosted secret-manager/multi-key rotation and recovery drills; safe provider cleanup; external disable/delete propagation; social login/linking; cross-host isolation; production capacity. Ninety/180-day boundaries are accelerated database fixtures, not calendar-duration observations. A single active app login does not mean the provider has only one historical SSO session. No production or NIST assurance claim is made.

[Human/agent setup and manual operations](../../../docs/development/local-auth.md) · [Design](../../../docs/superpowers/specs/2026-10-18-renewable-player-sessions-design.md) · [Completed plan](../../../docs/superpowers/plans/2026-10-18-renewable-player-sessions.md).

## Historical foundation evidence

Date: 16 October 2026. Requirements: AUTH-LOCAL-001 through AUTH-LOCAL-007. This is the local foundation, not a hosted release or a Paddle integration.

## Implemented

- Keycloak 26.8.1, image and community email-OTP artifact pinned by digest/hash. A small source-pinned wrapper enforces absolute code expiry, attempt limits and resend cooldown.
- Native Go, Vite, PostgreSQL, HTTPS proxy and local email inbox; separate PostgreSQL cluster/roles/databases. No changes to existing game-cluster contents.
- Stable issuer/subject ownership, one-use browser-bound OIDC state, PKCE/nonce/signature checks, opaque secure cookies, Origin/CSRF checks and account/session fencing.
- Rally auth/account UI; private game hooks cannot enroll a fixture account before sign-in. Real-auth transport denies fixture billing/family/identity creation and incomplete account-deletion workflows.
- Configured Free bootstrap and audited expiring `operator-test` Paid grants. Synthetic grants are not purchase/payment evidence.
- Human/agent setup guide, root AGENTS pointer, canonical auth schema and generated TypeScript/runtime validation.
- Foreground auth verification independent of game transport; coalesced checks, hidden-page suspension and immediate visibility-return checking. Public-demo return requires a fresh bootstrap, including an in-flight logout round trip.

## Verification

| Evidence | Result |
| --- | --- |
| `node web/scripts/check-auth.mjs` | 39 focused Node checks pass; focused Go identity, HTTP, records, service and entrypoint checks pass using isolated temporary schemas in the auth test database. |
| `node node_modules/@playwright/test/cli.js test -c web/playwright.keycloak-auth.config.ts` | Seven mocked browser tests pass: portrait auth gating/public demo, bootstrap error/retry, safe account/logout, stale-session cleanup, automatic idle-page revocation, hidden/visible transitions and gated return from the public demo. |
| `node node_modules/@playwright/test/cli.js test -c web/playwright.keycloak-live.config.ts` | One actual-provider workflow passes: email-only signup, no app session before OTP, resend throttling, wrong-code rejection, real game creation, socket delivery, operator Paid grant, stable account/game in browser B, unchanged original paused deadline, browser A automatically clearing its private UI without focus/manual fetch, old-browser API rejection, CSRF rejection and logout. |
| `npm run typecheck --workspace web` | Pass. |
| Real-auth Vite production build into `.local/auth/web-dist` | Pass; existing bundle-size warning remains. Existing `web/dist` was not replaced by this verification. |
| Missing add-on and absent runtime-container rebuild | Pass. The independent pinned dependency/build containers reproduced the reviewed JAR SHA-256. Databases, identities and certificates were retained. |
| OTP wrapper executable policy checks | Twelve focused time/attempt/resend boundary assertions pass. |
| Setup/reconciliation repetition and owned stop/start | Pass. Runtime restarts and configuration reconciliation retain identity/database state. |
| Native PostgreSQL inspection | Keycloak connections use TLS 1.3; SCRAM rules restrict the Keycloak role/database to the exact WSL VM address; app roles use loopback. |
| Rejected WebSocket upgrade through TLS gateway | HTTP 401 returned promptly with connection closure; original hanging rejection fixed and verified. |
| Security review | Reviewed findings repaired: Free first-login bootstrap, Paid precedence, public demo CSRF exception, proxy rejection cleanup, fresh build dependency ordering and OTP absolute expiry. No confirmed findings remained in the reviewed source. |

Screenshots from the live workflow and mocked browser checks stay under ignored `test-results/keycloak-live/` and `test-results/keycloak-auth/`. They contain synthetic test identities only. Generated configuration, captured emails and credentials remain private under ignored `.local/auth/`.

Earlier runs caught test-selector/profile issues and the coordinated stopped-database window; the final results above refer to completed runs after fixes/restart. No skipped/mock result is described as live-provider acceptance.

## Security and recovery review follow-up

Owner requested review of the actual implementation before social login. Codex Security scan `04ab75b6-1540-4d16-96b8-2b878319b037` used independent Go, architecture, browser and infrastructure source reviews plus parent validation. No confirmed critical/high security flaw or server authorization bypass was found in the scoped auth implementation. The sealed source-review report predates the following repair; this section records its final implementation evidence. This was not a repository-wide audit or a full audit of the third-party provider.

AUTH-LOCAL-007 repaired a concrete recovery defect: an idle Account page or a paused table with a suspended socket could display a revoked app session indefinitely. A Chrome reproduction changed status to signed-out and advanced ninety seconds; no status check occurred and the private heading remained. Both new visible-page and visibility-return regressions failed before the fix. The coordinator now owns the thirty-second foreground verification timer and browser lifecycle listeners; the gate owns rendering only. Checks coalesce and stop on unmount; they never renew game presence, acquire control or Resume.

Stop also discards cached display authorization/CSRF, so returning from the public demo cannot mount private hooks before verification. Independent patch review caught a pending-logout/navigation race that otherwise left the restarted gate loading indefinitely. Its focused regression failed first, then passed after logout completion was made to bootstrap a restarted loading gate. The final eleven coordinator tests and seven browser tests pass; typecheck passes.

The first live rerun exposed an overly specific test assumption that the pause deadline always arrives in a socket frame. The UI already showed a valid paused deadline. The test now separately proves socket delivery and reads the authoritative deadline through an authenticated snapshot for the created game; the final actual-provider workflow passes. No retention or playback implementation change was made.

Component review confirms that provider proof, stable application ownership, application-session validity, tab control, realtime connectivity, foreground presence and explicit Resume remain separate. The local auth HTTP adapter's direct record orchestration is documented in the runbook; database reauthorization is the enforcing stream-revocation control. No broad architecture refactor or social-provider integration was introduced.

## Explicit limits and actions not performed

- Interactive Windows certificate trust was not installed automatically. Use `npm run dev:auth:setup -- --trust` to opt in for the current user.
- Destructive reset and an actual WSL route change were not executed. Their guards/configuration paths are tested; running reset is never required by normal startup or tests.
- Only the local single-cell topology is implemented. `dev:auth:regional` fails explicitly rather than claiming ports prove regional isolation.
- Browser acceptance uses Chrome with separate browser contexts; Firefox/WebKit, actual BFcache restoration, different-account UI transitions and live uncertain-command recovery are not established by this workflow. Focused source tests cover different-owner pending-envelope rejection.
- The community provider's full privileged-endpoint authorization and aggregate email/lockout behavior across authentication sessions require dependency/provider acceptance before public hosting. No bypass was established in this offline source review.
- Real Google/Facebook/Apple, optional MFA/recovery acceptance, account linking across providers, provider backchannel revocation/deletion, retention/erasure operations, multi-instance game operation, cloud deployment and Paddle remain gated.
- App sessions have a local twelve-hour absolute lifetime. External Keycloak disable/deletion does not immediately revoke an existing app session; application logout does. New app login forces fresh provider authentication.
- Free practice is not metered yet; local coaching limits are development policy. Public commercial quotas and pricing remain undecided.

## Runbook

See [human and agent setup](../../../docs/development/local-auth.md) and [requirements/implementation plan](../../../docs/superpowers/plans/2026-10-16-keycloak-local-auth.md). Runtime: `https://localhost:4443`; local inbox: `http://127.0.0.1:8026`.
