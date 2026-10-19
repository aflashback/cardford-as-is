# Renewable Player Sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Checkboxes below record completed work or explicitly pending operational acceptance; use the linked evidence when resuming.

**Goal:** Add activity-driven remembered login with fifteen-minute access, ninety-day refresh inactivity, one active login per account, and no game WebSocket while paused or logged out.

**Architecture:** Keep provider access/refresh tokens in Go and an opaque secure application cookie in the browser. A stable durable login family owns credentials, deadlines and game authority; an authentication application service coordinates refresh and revocation without changing gameplay identity. Open realtime only after authorized explicit Resume.

**Tech Stack:** Existing Go, strict TypeScript/React/Vite, native PostgreSQL and pinned Keycloak in Podman.

**Spec:** [Proposed session and connection design](../specs/2026-10-18-renewable-player-sessions-design.md).

Status: implementation authorized by the owner on 18 October 2026. Local implementation and focused acceptance are complete, with browser availability and hosted operational limits recorded in [the evidence](../../../qa/implementation/auth-local/STATUS.md).

## Global constraints

- Access lease at most 15 minutes; refresh inactivity 90 days, extended only by successful qualifying use. The owner approved a 180-day absolute limit from full sign-in and implementation on 18 October 2026; renewal cannot extend it.
- One active login family per account. Multiple tabs may share it; a different browser/profile is a replacement login. No silent resurrection by stale refresh.
- Keep provider credentials server-only and encrypted; no JWT/provider token storage in browser JavaScript.
- Refresh is not fresh login, game presence, control takeover or Resume. Preserve paused-game deadlines and immutable receipts/history.
- Game socket exists only for authenticated, foreground, authorized running play; pause/logout/expiry cancels it and its reconnect/fallback work immediately.
- Keep fixture mode, existing databases and unrelated owner changes intact. Do not rewrite applied migrations or use broad reset/stash/commit operations.
- This is a consumer remembered-login policy, not a NIST assurance/compliance claim.

## Review focus

1. A second login commits while an older provider refresh is in flight: old completion cannot restore authority or close the new provider session. Task 2.
2. Two tabs or a lost refresh response: one provider rotation, stable family/control, safe durable recovery without refresh replay. Tasks 2–3.
3. A refresh or Resume completes after Pause/logout/navigation: no late socket, replayed command or automatic gameplay. Tasks 3–4.
4. Passive timers/socket/presence traffic on an untouched page: zero game sockets/recurring idle requests and no ninety-day extension. Tasks 3–4.
5. Expired access plus valid remembered cookie, provider failure, or a stale logout event: distinguish renewable from terminal and preserve revocation. Tasks 2–3,5.

## Requirements map

| ID | Deliverable | Task |
| --- | --- | --- |
| AUTH-SESSION-001 | Fifteen-minute access, ninety-day qualifying refresh idle and 180-day absolute cap, enforced by server time | 1–2 |
| AUTH-SESSION-002 | Server-held provider tokens and safe opaque cookie/CSRF contracts | 1–3 |
| AUTH-SESSION-003 | Atomic one-family-per-account replacement and immediate server authority loss | 1–2,4 |
| AUTH-SESSION-004 | Serialized provider refresh, stable game identity and fenced ambiguous/stale outcomes | 2–3 |
| AUTH-SESSION-005 | Idempotent logout with expired access; verified provider-event revocation | 2,5 |
| AUTH-SESSION-006 | No recurring non-playing auth/game traffic; no background idle extension | 3–4 |
| AUTH-SESSION-007 | Socket only after accepted Resume; immediate closure on pause/logout/expiry | 4 |
| AUTH-SESSION-008 | Existing game retention, control, receipts and explicit Resume preserved | 2–4 |
| AUTH-SESSION-009 | Additive cutover/rollback, human/agent runbooks and honest acceptance evidence | 1,5–6 |

## Task 1: Freeze session contracts and durable authority

**Files:** extend `web/shared/auth.schema.json` and its generator; add `web/server/records/migrations/015-renewable-player-sessions.sql` if 015 remains free at execution; adapt `server/internal/records/auth.go`, `identity.go`, `service_commands.go`, `realtime_playback.go`, `erasure.go` and migration tests only where the family model requires it.

**Boundary:** records produce a stable family identity, account generation, access/idle/absolute/provider deadlines, revocation state and refresh operation fence. Controls and realtime bind to the family, not a changing provider token. Browser contracts expose typed authenticated/renewal-required/reauthentication-required/replaced outcomes and safe timestamps/generation/CSRF, never tokens. Keep the opaque application handle stable during ordinary provider renewal.

- [x] Encode the approved ninety-day idle and 180-day absolute limits and freeze the metadata/outcome contract before parallel implementation.
- [x] Add focused failing record/contract checks for strict expiry boundaries, one active family, preserved account/history/control ownership and absence of secret fields.
- [x] Add the forward migration and records operations; keep provider ciphertext and operation leases separate from token hashes/audit data. Design one-time legacy-session reauthentication and compatible fixture schema behavior.
- [x] Run generated-contract freshness and focused record checks; review migration/rollback ordering without resetting existing data.

## Task 2: Authentication application service and provider renewal

**Files:** create `server/internal/authsession/service.go` and focused tests; add records/vault/refresh-operation files under `server/internal/records/`; extend `server/internal/authn/oidc.go`; adapt `server/internal/http/auth.go`, `server/cmd/cardford-auth/main.go` and auth tests.

**Boundary:** HTTP consumes application-service operations for login/status/renew/logout; the service consumes provider and record/vault interfaces and publishes family-specific post-commit revocation. Provider calls are outside SQL transactions. Initial login verifies fresh proof; refresh validates the original identity/client without demanding a new `auth_time`.

- [x] Reproduce tests for fifteen-minute expiry, ninety-day refresh idle, passive requests, concurrent refresh, replacement/logout during provider call, lost browser response and uncertain provider outcome.
- [x] Implement encrypted provider-token custody, bounded refresh operation lease and generation-fenced completion; retain exact shorter provider limits. Ordinary refresh changes neither family nor control/playback generation.
- [x] Replace the twelve-hour-only issuance path; add protected refresh/bootstrap admission after access expiry; make logout idempotently revoke remembered authority. Reviewed adjustment: keep its inert cookie so a delayed response cannot erase a newer login.
- [x] Return typed renewable versus terminal failures, with no private mutation admitted before access renewal. Emit precise old-family cancellation and guard provider cleanup against a newer/shared provider session.
- [x] Run focused Go auth/session/HTTP tests. Confirm token-encryption failure, missing refresh material and provider rejection fail closed.

## Task 3: Demand-driven browser session coordinator

**Files:** `web/src/auth/session.ts`, `transport.ts`, `AuthGate.tsx`, `RealAccountPage.tsx`, `web/src/api/client.ts`, `authLifecycle.ts`, and focused auth/client/browser tests.

**Boundary:** one coordinator owns status, safe local deadlines, qualified activity and shared renewal. API callers receive a single renewable-expiry retry path; only terminal login replacement/revocation changes auth epoch. No token enters JS, browser storage or BroadcastChannel.

- [x] Add failing cases for expired-access return, coalesced tabs/requests, logout/public-demo navigation, passive status not extending idle and stable control after provider rotation.
- [x] Replace thirty-second blanket auth polling with local deadline handling and one-shot status/renewal on qualified return/action. Proactively renew near expiry only during current real use; do not send per-input activity traffic.
- [x] Ensure renewal-required/bootstrap mounts no private hooks; replay at most once with the identical command envelope after successful renewal, preserving receipt reconciliation for ambiguous outcomes.
- [x] Keep logout/terminal outcomes clearing pending private UI, leases, requests and sockets. Cross-tab messages carry invalidation/version hints only; durable server state remains authority.
- [x] Run focused Node, TypeScript and mocked browser checks, including zero recurring traffic for idle Account/login/paused screens.

## Task 4: Active-play-only realtime lifecycle

**Files:** `web/src/api/realtimeStream.ts`, `useGoSession.ts`, `web/src/table/useGamePause.ts`, `web/src/rally/useCoachExperience.ts` if it owns transport; `server/internal/service/realtime.go`, `server/internal/http/realtime.go`, relevant playback authorization and realtime tests.

**Boundary:** auth supplies family/generation/access deadline; game coordinator supplies accepted running-play eligibility. Realtime cannot extend either. A family renewal may update the existing connection deadline without opening another socket.

- [x] Add failing paused-start/no-socket, immediate-pause-close, failed/late Resume, stale reconnect, logout-mid-negotiation, exact-access-expiry and routine-refresh-no-control-loss tests.
- [x] Use one-shot HTTP snapshots for initial/paused recovery; remove the paused thirty-second socket grace; fence every recovery/retry/focus/fallback path. Do not enable transport before the Resume response.
- [x] Preserve open-socket-before-bound-snapshot buffering after accepted Resume. Keep one socket/coordinator; no hidden Coach/review transport or paused game polling.
- [x] Add server running-play admission, exact authorization-deadline cancellation and family-specific revocation wakeup. Re-read durable access lease at deadline when a renewal notification was lost; check authority before writes/work commits.
- [x] Verify game pause/hold/presence and pinned retention separately. Successful early renewal keeps play running; missed expiry pauses and requires explicit Resume. Demonstrate no recurring idle transport and no duplicate sockets.

## Task 5: Keycloak policy and external logout acceptance

**Files:** `scripts/auth-realm.mjs`, `auth-configure.mjs`, auth configuration/launcher documentation, `server/internal/authn/` provider-event verification and `server/internal/authsession/` revocation handling, focused provider tests.

**Boundary:** dedicated player realm/client; confidential code+PKCE stays. Use online provider refresh, no `offline_access`. Staff policy is separate. Backchannel events bind exact issuer/client/provider session: an old different `sid` leaves a new provider session alone; a valid event for a shared `sid` revokes all matching families, including a replacement. Never infer an app-family identifier that the provider event does not carry.

- [x] Provision a separate server-only token encryption key/key ID through the documented local setup; specify hosted key custody/rotation as an operational gate.
- [x] Reconcile fifteen-minute access, ninety-day online idle, approved absolute maximum and refresh rotation on pinned Keycloak. Verify exact version behavior, parent/client limit clipping and logout/reuse outcomes.
- [x] Accept verified backchannel logout/replay protection and provider rejection on renewal; test old/different `sid`, shared `sid`, duplicate event and provider downtime. App-managed disable/delete orchestration remains a release gate and must revoke locally first. Application-originated provider cleanup is conservatively skipped pending proven grant-specific safety.
- [x] Run one actual-provider lifecycle with accelerated test-only clocks/configuration where supported. Never claim immediate externally initiated disable/delete delivery without a tested event integration.

## Task 6: Integration, evidence and cutover runbook

**Files:** extend `web/e2e/keycloak-live.spec.ts`, `keycloak-auth.spec.ts`, Playwright auth configurations, `web/scripts/check-auth.mjs` only as needed; update `docs/development/local-auth.md`, `qa/implementation/auth-local/STATUS.md`, current-state identity/realtime documentation and `CHANGELOG.md` after implementation.

- [x] Prove A→B login replacement with A's active game socket, HTTP commands and refresh all rejected; same-owner game recovery retains the original deadline and explicit Resume.
- [x] Prove fifteen-minute renewal does not look like a new login or change game control; pause/logout closes sockets with no late reopen; no recurring traffic on untouched non-playing pages.
- [x] Run the focused suite: `npm run contracts:auth:check`, `npm run test:auth`, `npm run test:auth:browser`, `npm run test:auth:live`, and `npm run typecheck --workspace web`; add a bounded Chrome/Firefox/WebKit lifecycle check and record unavailable browsers honestly.
- [x] Verify additive migration interoperability, legacy-cookie reauthentication, actual server restart, provider failure and fail-closed vault key mismatch. Document deliberate local key replacement/rollback without reviving credentials or deleting game history; a hosted secret rotation/recovery drill is not claimed.
- [x] Update human/agent commands, new key/config/manual provider work, deadlines/load budgets, accepted evidence and remaining public-release gates. Review the final auth/game integration before enabling it by default.

## Acceptance status

The current local implementation passes focused Node/Go tests, mocked Chrome, a real Keycloak journey including refresh rotation and signed backchannel logout, contract/type checks and Go/Node migration interoperability. An independent focused review found callback-after-provider-logout and stale cookie-response races; both were repaired and re-reviewed. Forward migration 016 adds the provider-session logout fence without editing applied 015.

Reviewed decisions: retain inert cookies on real logout/refresh replies; skip unsafe app-originated provider cleanup; use one persistent local vault key with deliberate revoke-and-reauthenticate rotation. Physical ordering of concurrent callback cookie responses can still require another sign-in but cannot restore old server authority.

Firefox/WebKit execution is blocked by pinned browser downloads timing out; the available Chrome matrix passes. Hosted multi-key rotation/recovery drills, external disable/delete orchestration and production capacity remain release work. [Runbook and manual tasks](../../development/local-auth.md) · [Exact evidence and remaining gates](../../../qa/implementation/auth-local/STATUS.md).
