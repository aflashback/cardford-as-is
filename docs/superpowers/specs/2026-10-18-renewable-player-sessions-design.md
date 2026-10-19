# Renewable player sessions and active-play connections

Date: 18 October 2026. Status: owner authorized implementation; local implementation and focused acceptance completed with the limits recorded below. Read with the [implementation plan](../plans/2026-10-18-renewable-player-sessions.md) and [current evidence](../../../qa/implementation/auth-local/STATUS.md).

## Intent and owner decisions

Keep a returning player signed in without exposing provider credentials to browser JavaScript, while retaining only one valid login per account. Expiring short access must renew transparently during real use; a forgotten tab must not preserve the login indefinitely or consume game connections.

Owner requirements:

- Plan before implementation, with high-level engineering detail and a standards check.
- Require full sign-in after ninety days without qualifying use of the refresh capability.
- The owner explicitly chose **real app use**, rather than an untouched open tab, to extend that window.
- The owner approved a **180-day absolute limit from full sign-in** alongside the ninety-day inactivity limit on 18 October 2026. Renewal cannot extend that absolute limit.
- A new successful login replaces the previous login, including on another machine. Refresh and reconnect are not new logins.
- A game WebSocket exists only during authorized active play. Pause and logout close it; login/account/paused screens must not keep game sockets alive.

The owner approved implementation with fifteen-minute access, ninety-day inactivity and a fixed 180-day remembered-login cap. Recent full authentication remains the policy for future security-sensitive account actions. A seven-day access token is not used.

## Recommended architecture

Keep the first-party browser/Go cookie architecture and add server-side provider refresh. Keycloak remains the OIDC provider in the current local profile. Go owns the confidential client, provider token set, application login family and authorization. React receives an opaque HttpOnly session cookie and safe session metadata; it never receives an OAuth access/refresh token.

The cookie references one durable login family. A family has a short **access-valid-until** deadline and a much longer remembered-login eligibility deadline. The provider issues actual access and refresh tokens; Go retains them encrypted. The short deadline is enforced at private HTTP, work and stream authorization boundaries, not just in a React timer. A valid remembered cookie alone cannot bypass an expired access deadline: the refresh operation must succeed first.

Do not add a browser JWT issuer or a second browser OAuth protocol. The opaque browser cookie is itself a valuable bearer credential; a short provider access lifetime does not make that cookie short-lived or immune to theft. Secure cookie handling, server-side deadlines/revocation, limited privileges, step-up and the absolute cap protect that separate boundary.

This recommendation follows the first-party/session and server-held-token patterns in [RFC 10017, sections 6.1 and 7.1](https://www.rfc-editor.org/rfc/rfc10017.html#section-7.1). The application still owns game permissions and Free/Paid grants; provider tokens are not purchase or entitlement evidence.

## Policy and terminology

| Concern | Implemented local policy / explicit future requirements |
| --- | --- |
| Provider access / application access lease | At most 15 minutes; use the shorter actual provider expiry when necessary. Access expiry prevents private operations until renewal succeeds. |
| Remembered refresh inactivity | 90 days from the last successful refresh driven by qualifying real use; initially measured from full login. Rejected requests and passive traffic never extend it. |
| Absolute family lifetime | Owner-approved 180 days from full authentication; refresh cannot move it. Require full sign-in at the deadline even with continuous use. |
| Effective eligibility | The earliest of local idle deadline, approved absolute deadline, provider/client session limit and revocation. No local cookie may extend provider eligibility. |
| Proactive renewal | At most one coalesced renewal when access has no more than 60 seconds remaining and there is current qualifying use. Otherwise renew on the next explicit return/action before private work. |
| Sensitive account actions | Require full provider authentication within the preceding 5 minutes; ordinary refresh is not recent authentication. Apply when account linking/recovery/deletion/security features are introduced. |
| Game inactivity / retention | Preserve existing 120-second inactivity warning plus 30 seconds to pause, and Free 5-minute / Paid 60-minute resumability. These are not login deadlines. |

These durations are application policy. OAuth does not prescribe a universal fifteen-minute or ninety-day value. RFC 9700 recommends bounded inactive refresh credentials and replay defenses; we choose the durations for this consumer product. [RFC 9700, section 4.14.2](https://www.rfc-editor.org/rfc/rfc9700.html#section-4.14.2)

Long remembered login is an explicit convenience/security tradeoff, not a claim of universal standards compliance. NIST SP 800-63B-4 recommends overall reauthentication within 30 days at AAL1 and substantially shorter limits at higher assurance. The proposed ninety-day/180-day experience must not be represented as meeting those reauthentication profiles. Staff administration retains its separate identity/MFA/session policy. [NIST assurance levels](https://pages.nist.gov/800-63-4/sp800-63b/aal/)

The ninety-day window is an upper bound on remembered access, not a guarantee that a browser will retain cookies: user clearing, private browsing, storage policies, security events or provider revocation may require earlier sign-in. Explicit logout always ends refresh eligibility immediately.

## What counts as real use

Qualifying use is an explicit foreground app return/Continue/Resume action or an authenticated player action accepted by the server, such as starting/playing a game, requesting coaching, or saving an account preference. For proactive renewal, use recent trusted foreground interaction plus existing accepted activity; coalesce activity locally instead of sending a request for every pointer/key event.

The recorded renewal time uses database time after successful provider refresh. It is not a browser-supplied timestamp. Ordinary calls while the access lease is valid do not need to write a rolling deadline or refresh provider tokens on every request. A successful qualifying renewal starts a new ninety-day window, clipped by the absolute/provider limits.

Do not count `/api/auth/status`, WebSocket ping/pong or frames, presence heartbeats, bot playback, retries, analytics, an open tab or browser focus alone as renewal activity. Focus/visibility can request one non-renewing status check; an explicit foreground return or interaction is needed before renewal. A client activity signal is a UX/load input, not cryptographic proof of a human: a stolen credential or same-origin compromise can simulate activity. Idle expiry does not replace revocation and XSS defenses.

## Identity, cookies and component boundaries

- **OIDC adapter (`authn`)**: authorization code + PKCE/state/nonce and initial identity verification; separate provider refresh/revoke operations. Refresh keeps the original issuer/subject/client binding. A refreshed ID token, if supplied, is checked under OIDC refresh rules; do not apply the initial login's five-minute `auth_time` freshness requirement to ordinary refresh.
- **New authentication application service (`authsession`)**: full-login, status, renewal, logout, provider-event processing and post-commit invalidation. Provider network calls happen outside database transactions. HTTP no longer orchestrates lifecycle directly through concrete record methods.
- **Records/PostgreSQL**: active family, account generation, server deadlines, hashed opaque cookie lookup, encrypted provider token bundle, refresh-operation lease and audit/outbox. One atomic active-family reference per owner is authoritative across processes.
- **HTTP transport**: cookies, exact Host/Origin, CSRF, input limits, and mapping typed session outcomes to contracts. Gameplay services consume a verified principal, not raw tokens.
- **Browser `AuthSession`**: one shared bootstrap/renewal operation, safe expiry metadata and stable login generation. `AuthGate` renders only; game transport has its own play eligibility.

Keep a stable family identifier across provider refresh. Current control and realtime bindings use the application session hash, and the browser treats CSRF rotation as replacement login. Do not replace those with provider access-token hashes. A routine provider rotation must not revoke control, clear command receipts, increment the browser auth epoch, pause a running game or create another login.

Use one opaque `__Host-` application cookie: Secure, HttpOnly, Path `/`, no Domain, SameSite=Strict after login. The short-lived OIDC binding cookie may remain Lax for the cross-site callback. After callback, an explicit same-origin bootstrap must work with Strict cookies; test real external navigation. Rotate the app cookie on full login and security-driven reauthentication. Provider refresh rotates provider credentials; it does not require a new browser login cookie on every refresh. Hash application handles; encrypt retrievable provider secrets with a separately provisioned key and key ID, bound to the family. Never put provider tokens in JSON DTOs, URLs, logs, WebSocket messages or browser storage. [OWASP session guidance](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)

Long-lived local cookies remain a development-only boundary on today's same-hostname/different-port setup. Hosted app and issuer must have distinct cookie hosts, with the browser and its Go API served through one app origin. Do not claim port separation provides cookie isolation.

## Lifecycle

### Full login and replacement

Verify fresh provider proof first. Under the owner lock, revoke the old family and all refresh/access eligibility; advance the login generation; delete old control; materialize and pause old gameplay without extending an existing retention deadline; install the new family and token bundle atomically. Concurrent callbacks have one transaction-order winner, never two active families.

After commit, publish family-specific revocation to the realtime/worker layer and send the new cookie. An old provider cleanup job may revoke only the captured old provider session; it must not revoke the new one, including when the provider reused an SSO `sid`. Never perform a user-wide provider logout as stale asynchronous cleanup.

All HTTP/mutation/work admission and outbound stream delivery check the active family/generation. A self-contained JWT signature alone cannot satisfy last-login-wins. A response already admitted before replacement cannot be recalled; old writes must be fenced at commit. A paused/offline device cannot be remotely erased without communication: its server authority ends at replacement commit, and its UI clears on its next interaction/status check/return or local access deadline. Active play receives immediate connection cancellation. Multiple tabs share one browser-cookie login; a different browser/profile is a new login even on the same physical machine. Copied cookies are not distinguishable physical machines without additional device-binding technology; do not substitute fingerprinting for the session rule.

### Status, access expiry and renewal

Safe bootstrap states distinguish authenticated, renewal-required, reauthentication-required and signed-out/replaced. Return only safe metadata such as family/login generation, server/access/idle/absolute times, display data when fully authenticated, and a CSRF value. Status is a read: it never renews access or extends idle time, and a renewal-required bootstrap mounts no private game hooks.

An expired access lease is a typed, nonterminal result; an expired/revoked family is terminal. Only an explicit typed renewal-required response triggers one shared renewal and at most one retry of the original operation. Preserve mutation UUID, body and expected revision. Ambiguous network outcomes still use command receipt reconciliation; never generate a replacement command or assume timeout meant rollback.

`POST /auth/refresh` requires the opaque cookie, exact Origin and a family-bound anti-CSRF value that still works after access expires. A same-origin, non-renewing bootstrap can obtain that value using the live remembered cookie; the value reveals no provider token and cannot grant gameplay by itself. Rate-limit bootstrap/refresh per family and source without trusting CORS alone.

Claim one durable refresh-operation lease under the account/family fence; release SQL before contacting the provider. Other requests/tabs coalesce or wait for that operation's committed result. Persist a successful rotated provider bundle and new access/idle deadline only if the operation lease, current family and account generation still match. Refresh never calls fresh-login/session-replacement fencing. If another login or logout wins while the provider call is in flight, discard the stale result and preserve revocation.

Provider rotation is serialized server-side, so multiple browser tabs never redeem the same provider refresh credential concurrently. A committed refresh whose browser response is lost is recoverable by a subsequent status call: the browser cookie/family did not change. Do not blindly retry an ambiguous provider refresh after a timeout/crash; retain an uncertain state, close private authority at its existing access deadline, and require full sign-in if the provider result cannot be recovered safely. Invalid/reused provider refresh credentials revoke the family and clear private UI; they do not emit a potentially stale cookie-deletion header. No generic token-reuse grace period.

### Logout and external events

Client logout clears private state, timers, pending access attempts and game socket immediately, then submits CSRF-protected revocation. Server revokes family/access/refresh, wipes provider ciphertext, removes control/work authority and pauses gameplay in its transaction, even after access expires. Repeated logout is idempotent. Refresh/logout responses retain the inert HttpOnly cookie: a delayed old deletion header could otherwise erase a newer login in the same browser profile. This reviewed implementation decision replaces the original physical-cookie-clearing requirement. A full login overwrites the old cookie; natural browser expiry also removes it. An unconfirmed logout network result must be described honestly and checked on retry.

Use provider `sid`/issuer binding for verified OIDC backchannel logout; validate signature, issuer, audience, event, issued time and replay ID. Revoke every applicable local family mapped to that provider session. An event for a different old provider `sid` cannot terminate a new provider session. However, when the provider reuses the same `sid`, a standard logout token does not identify the individual application login family: a valid first-delivery logout for that `sid` revokes the current family too. Do not guess a family from token issuance time or ignore legitimate provider logout to preserve a newer app login. Require `sid` in the configured client; a valid subject-wide event, if supported, is account-wide revocation rather than a family-specific hint. [OIDC Back-Channel Logout](https://openid.net/specs/openid-connect-backchannel-1_0.html)

Keep this provider-event policy distinct from application-originated stale cleanup: an old app cleanup operation checks that the captured provider session is no longer referenced by the current family before making a provider logout/revoke call. If a grant-specific cleanup cannot be proven safe for a shared `sid`, skip that provider call and retain local old-family revocation. Replay IDs prevent processing the same logout token twice; they do not establish which app family a newly received provider event meant.

Local implementation conservatively skips application-originated provider cleanup until grant-specific safety is proven. Local logout/replacement is independent of provider availability. Signed provider logout is implemented and tested. A ten-minute issuer/`sid` logout tombstone, serialized with login installation under the same provider-session lock, also rejects a callback whose proof was verified before provider logout. The bounded callback and accepted logout-token age are shorter than this fence. Concurrent callback response delivery can still leave an older invalid cookie in the browser; server authority remains single-family and the player may need to sign in again.

Backchannel logout does not prove every provider account-disable/delete event is delivered. On renewal, rejected provider credentials fail closed. For immediate administrative disable/delete, the application-managed operation must revoke local family authority first and then perform provider cleanup; externally initiated changes need a tested provider event integration. Do not promise immediate external disable propagation without that acceptance evidence.

## Game WebSocket and load contract

| Browser/game condition | Game transport policy |
| --- | --- |
| Login/signup, signed out, renewal/reauthentication required | No socket, game negotiation, game polling or presence renewal. |
| Account, public demo, hidden/offline page, idle/paused/held game | No game socket or reconnect/fallback loop. One-shot HTTP only for an explicit supported action. |
| Player requests Resume | Verify/renew auth; reconcile pending receipts and stop intent; submit authorized Resume. Open no socket until Resume is accepted. |
| Authorized running foreground game | At most one receive-only socket per owning game coordinator; bind to current family/generation and access deadline. Existing admission limits still apply. |
| Pause intent, logout, replacement, access expiry | Client closes immediately and cancels pending reconnect/negotiation. Server enforces matching cancellation/admission/deadline as well. |

Replace today's paused thirty-second socket grace with immediate suspension. `eligible()` and every negotiate/open/retry/focus/fallback path must require running play, current auth, foreground/layout eligibility and current coordinator generation. Initial/reopened/paused game recovery is an authenticated one-shot HTTP snapshot. After accepted Resume, preserve the existing **socket open, then socket-bound snapshot, then buffered events** ordering to avoid a missed-event gap.

Temporary review/Why holds have no game socket under this rule. Preserve their existing foreground lease and pause/retention semantics separately; any bounded HTTP presence required by a foreground hold is not auth renewal, bot playback or a license to restart paused transport. Review UI must not acquire a second hidden transport.

A successful provider refresh updates the existing family's access lease, not its game identity. An authenticated HTTP renewal can extend an active connection's authorization deadline through a family/generation-fenced server event; the connection rechecks durable state at its old deadline if that event is lost. It cannot extend its own authority with a ping or client frame. There is no new OAuth token in the WebSocket URL or receive-only message protocol. If access actually expires before renewal commits, stop/close and pause; a later renewal does not automatically Resume.

Use post-commit revocation notification to cancel old active sockets immediately. PostgreSQL remains authority; durable outbox plus a bounded process notification mechanism can wake connected instances, with per-write checks and exact access-deadline timers as safety fences. Do not claim instantaneous remote UI updates for disconnected devices or introduce an idle auth WebSocket to simulate them.

Remove the blanket thirty-second visible-page auth poll when this new design is implemented. Replace it with server-provided local expiry timers and one-shot checks on explicit return/action. Non-playing untouched pages make zero recurring auth/provider/game requests and maintain zero game sockets. During play, coalesce renewal near expiry (roughly four to five renewals/hour at these settings), piggyback safe status metadata on normal responses, and retain only existing bounded active-game transport/presence traffic. Avoid per-pointer activity writes and per-session ninety-day goroutines; expiry cleanup uses indexed deadlines and bounded sweeps. These are acceptance budgets, not measured current performance.

## Provider configuration and operational setup

The previous Keycloak baseline used five-minute access, thirty-minute SSO idle and an eight-hour maximum. The dedicated **player** realm/client now uses fifteen-minute access, ninety-day online idle and a 180-day maximum, with refresh rotation enabled. Request no `offline_access`: this product does not need refresh credentials that intentionally survive provider logout. Keycloak documents separate parent/client idle/max limits and rotation. Pinned Keycloak 26.8.1 refresh and signed backchannel logout were exercised in the actual-provider journey; strict ninety/180-day local boundaries use accelerated fixtures. [Keycloak session/token configuration](https://www.keycloak.org/docs/latest/server_admin/index.html#_timeouts)

Go enforces the strict local deadline even if provider idle expiry includes grace. Preserve the provider's actual expiry/limit metadata and never stretch it with cookie Max-Age. Failed provider validation does not issue a new cookie deadline. Configure a server-only token-encryption key outside PostgreSQL, rotation/key-ID policy, redacted audit fields and minimal expiry/refresh/replacement metrics. No per-player Keycloak timer, provider admin request or introspection on every game message.

Migration is additive. Existing twelve-hour sessions have no stored provider refresh bundle, so they cannot be promoted silently: require one full sign-in after cutover. Preserve accounts, entitlements, games, history and receipts. Keep fixture auth/billing isolated. Disable the new profile or revoke its families for rollback; never revive revoked credentials or turn its cookies into fixture identity. Hosted key custody, distinct app/issuer hosts and provider event delivery need their own acceptance.

## Critical acceptance and remaining decisions

Required focused proof covers: fifteen-minute boundary and recovery; ninety-day idle boundary; absolute cap; passive traffic not extending eligibility; refresh overlap/lost browser response/ambiguous provider result; new-login versus refresh/logout race; old-machine HTTP/work/socket rejection; duplicate tabs; explicit Resume and retained deadlines; immediate zero-socket pause; no recurring traffic on non-playing pages; expired-access logout; provider revocation, old/different-`sid` events and shared-`sid` logout; browser restart and Strict-cookie callback behavior.

Use injected clocks for long deadlines rather than waiting ninety days. Add one actual Keycloak/provider journey, a two-browser replacement test, and a small Chrome/Firefox/WebKit lifecycle matrix. Runtime/production/capacity results remain unproven until executed. Preserve user's preference for focused critical-path tests, not an exhaustive unit suite.

Implementation was authorized and the local critical path is verified. Public release still needs real email abuse controls, external disable/delete acceptance, safe provider cleanup, hosted secret custody/rotation and the unavailable Firefox/WebKit runs. Social-provider setup, linking implementation, Paddle and staff identity are outside this change. See the current evidence for passed, blocked and not-run checks; no production capacity or NIST assurance claim is made.
