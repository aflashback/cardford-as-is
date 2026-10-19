# Keycloak local authentication implementation

Owner authorized implementation on 16 October 2026. Deliver the local foundation first: Keycloak in Podman; Go, Vite, PostgreSQL and the HTTPS development gateway native. Paddle and cloud provisioning remain later milestones.

## Delivery requirements

- AUTH-LOCAL-001: Repeatable setup/start/status/stop, persistent local identities, isolated database roles/data, pinned Keycloak and community extension artifacts. Never reset the existing native game database.
- AUTH-LOCAL-002: Real OIDC authorization-code login with PKCE, state, nonce and signature/issuer/audience validation, opaque application cookies and CSRF protection. Fixture development remains available separately.
- AUTH-LOCAL-003: Stable issuer/subject account ownership; one atomic successful fresh login invalidates older sessions and game control. Reconnect is not a new login; preserve explicit Resume and 300/3600-second retention.
- AUTH-LOCAL-004: Rally login gate before private game hooks, secure account management/logout and no fixture self-grant routes in the real-auth profile.
- AUTH-LOCAL-005: Focused tests for setup safety, callback/session security and browser/login recovery. Report real-runtime and mocked evidence separately.
- AUTH-LOCAL-006: Human and agent runbooks covering prerequisites, commands, generated configuration, ownership boundaries, debugging, certificate trust, testing, safe reset and remaining regional/cloud gates.
- AUTH-LOCAL-007 (owner-authorized review follow-up): Detect app-session replacement/expiry even on idle Account or suspended paused screens; recheck visible authenticated pages every thirty seconds after the preceding check completes, and immediately on focus/pageshow/visibility return. Coalesce concurrent checks, stop listeners/timers on unmount, and bootstrap again before private hooks mount after a public-demo visit. Preserve explicit Resume and pinned retention.

## Boundaries

AUTH-LOCAL-012 (owner request, 18 October 2026): Extend the approved CardFord light theme to the local Keycloak account/security console using native theme inheritance. Reuse product branding, palette and fonts, preserve all native profile/security actions, and verify responsive Personal info, Signing in, Device activity and Applications views. [Acceptance evidence](../../../qa/implementation/auth-local/account-theme-20261018/README.md).

AUTH-LOCAL-011 (owner browser annotations, 18 October 2026): Remove the custom club decoration and Appearance accordion from the welcome/authentication surface. Use the existing CardFord brand assets and approved cream/terracotta layout, one primary action and compact secondary links. Appearance belongs only in existing game settings, including fixture and real-auth account paths. Preserve Continue renewal, logout and server-owned game lifecycle. [Acceptance evidence](../../../qa/implementation/auth-local/welcome-layout-20261018/README.md).

AUTH-LOCAL-010 (owner-reported security-settings failure, 18 October 2026): The app's Manage sign-in and security link must open the local account console. Reconcile its exact public issuer origin and the normal default roles of existing named seed identities, without replacing users or broadening client scope. Verify real console token/account requests and the Signing in view. [Acceptance evidence](../../../qa/implementation/auth-local/account-console-20261018/README.md).

AUTH-LOCAL-009 (owner-reported callback error, 18 October 2026): Failed browser callbacks must show a readable CardFord recovery page with an explicit action creating a fresh browser-bound login attempt. Preserve authentication checks and failure statuses; do not expose callback values or change API JSON error contracts. [Acceptance evidence](../../../qa/implementation/auth-local/callback-recovery-20261018/README.md).

AUTH-LOCAL-008 (owner-selected option one, 18 October 2026): Apply CardFord branding to local Keycloak signup, sign-in and email-code forms: existing vector logo and faint watermark, cream/terracotta Rally palette, bundled fonts, email-code guidance and optional display-name labeling. Keep native form actions, server validation, OTP policy and OIDC/session behavior. Support narrow and desktop layouts with visible focus states. [Acceptance evidence](../../../qa/implementation/auth-local/theme-20261018/README.md).

Use adapters around the existing service and records layers. Keep provider requests outside database transactions. The default fixture entrypoint retains its loopback/local guards. A distinct real-auth entrypoint requires authenticated principals. PostgreSQL migrations remain canonical and additive.

The initial local cell uses https://localhost:4443 for app/API and https://localhost:8443 for Keycloak, with an explicit native TLS proxy and no Origin rewriting. Ports simulate separate origins; they do not prove cross-host regional cookie isolation. Regional discovery, provider acceptance, multi-host scaling and live billing require their documented later gates.

## Work allocation

1. Infrastructure agent: Podman Keycloak and extension, local configuration, native launchers, setup safety tests.
2. Backend agent: OIDC adapter, real-auth transport/store boundary, stable accounts and session replacement, focused Go tests.
3. Browser agent: bootstrap gate, API credentials/CSRF, account/logout UX and focused browser tests.
4. Coordinator: generated auth contract, package commands, documentation, live setup/integration and final review.

No Git reset/stash or bulk commit: this checkout contains substantial owner work required by the running game. Preserve it and report only this task's additions.
