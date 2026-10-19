# AUTH-LOCAL-010 — local account-console access

18 October 2026. Owner reported `Something went wrong` after opening Manage sign-in and security.

## Observed causes

1. The built-in browser account console failed its code-to-token request with HTTP 403. A direct invalid-code diagnostic returned `Invalid origin` when sent with `Origin: https://localhost:8443`, while the same request without Origin reached normal code validation. The built-in `account-console` client had an empty `webOrigins` list.
2. After allowing the exact local issuer origin, the token exchange returned 200 but account API reads returned 401. Safe inspection showed an unexpired account-console token with a subject, but no account audience or account roles. The two imported seed identities had no role mappings. Newly registered local users had the normal realm-default role.

## Fix

`scripts/auth-configure.mjs` now reconciles the exact public issuer origin on the unique `account-console` client, preserving any existing origins and all other client settings. It also adds `default-roles-cardford` only when missing on existing named seed identities from `realmDefinition`. Deleted seeds are not recreated; ambiguous identities fail instead of being guessed. New registrations already receive this role. This is ordinary self-service account access, not administration or commercial Paid entitlement.

Both focused repairs were applied to the running local realm. Future normal startup calls the same reconciliation. No server restart, database reset, user recreation, credential change, wildcard origin or full-scope change was used.

## Passed

- Before/after origin diagnostic: 403 `Invalid origin` becomes 400 `invalid_grant` for a deliberately invalid code, proving origin checking now permits the correct origin while invalid code rejection remains.
- Built-in browser: token exchange, account info and supported-locales requests all return 200 after both repairs.
- Personal info renders for the existing seed account; Account security → Signing in renders optional authenticator and recovery-code controls. [Screenshot](signing-in.jpg).
- `node --test --test-isolation=none scripts/auth-account-console.test.mjs scripts/auth-common.test.mjs`: **12 tests passed**. The existing child-process reset guard needs the approved execution context on Windows; its first sandboxed run was blocked by process spawning, then the unchanged test passed outside the sandbox.
- `node --check scripts/auth-configure.mjs` and focused `git diff --check` passed.

New regression coverage checks the exact-origin-only partial client update, idempotence, ambiguous-client rejection and named-seed-only default-role repair. It is included in `npm run test:auth` for future full runs.

## Scope

No MFA or recovery-code enrollment was performed. Full automated authentication suite, newly created registration, external browsers and production configuration were not retested. The account console keeps its upstream Keycloak appearance; the CardFord login theme does not yet style it. No commit created. Tokens/cookies/codes and private account data are omitted from this evidence.
