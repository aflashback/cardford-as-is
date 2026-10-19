# CardFord account theme acceptance — 18 October 2026

Requirement: **AUTH-LOCAL-012**, authorized by the owner to match the account/security pages to the existing CardFord theme.

## Implementation

- Added `infra/keycloak/theme/cardford/account/`, inheriting the installed Keycloak 26.8.1 `keycloak.v3` account UI. Inspected its packaged `theme.properties`, `index.ftl` and supported logo configuration before implementation.
- Reused the original product symbol/watermark and bundled DM Sans/Manrope. Applied the approved cream, ink and terracotta palette, heading hierarchy, form/button styling and compact responsive masthead. Retained all native routes and actions; no account JavaScript or copied React bundles.
- Persisted `accountTheme: cardford` alongside the login theme in `scripts/auth-realm.mjs`. Applied only this realm property to the existing live local realm (HTTP 204). The logo returns to the local app account page.

## Verification performed

- `npm run dev:auth:status`: app and issuer ready. Podman status reports false in the restricted shell; the real HTTPS realm and account UI are reachable and were used below.
- `node --check scripts/auth-realm.mjs`: passed.
- `node --test --test-isolation=none scripts/auth-account-console.test.mjs`: **4 passed**, covering the existing origin/default-role reconciliation. These are configuration unit checks, not new MFA functional tests.
- Asset checks: every CSS URL resolves locally; copied symbols exactly match `web/public/brand/` originals.
- Built-in browser, authenticated seeded local identity: Personal info, Signing in, Device activity and Applications rendered successfully. Browser title is CardFord account, original symbol and text wordmark appear, and the account document has no dark-mode class.
- Checked desktop 1280×800, narrow 475×532 and 320×640 layouts. The 320px application/security views have no horizontal main-content overflow. Opened native mobile navigation and application detail disclosure. Focus moved from Display name to Save with a visible outline; no profile edit was submitted.
- Opened the native mobile security menu and verified that Set up Authenticator application remains available, then closed it without starting enrollment. Final security menu targets measure 44px high. No credentials, MFA enrollment, sessions or permissions were changed by the visual checks.

## Evidence and limits

`signing-in-desktop.jpg` and `signing-in-mobile.jpg` show the finished security page; `signing-in-320.jpg` records the smallest layout. Other screenshots record the profile keyboard focus, device page and narrow application list during the review. Minor later refinements made list separators thin and menu targets at least 44px tall across pages.

This is local visual acceptance of the inherited account console. Full signup/login regression, MFA enrollment/recovery, profile save, session revocation, other locales, screen-reader audit and cross-browser coverage were not rerun for this presentation-only change. Keycloak's native markup currently leaves some overflow-menu buttons without an accessible name; this theme does not alter that upstream behavior. The local app origin in `logoUrl` must be changed before using this theme in another environment. No commit was created.
