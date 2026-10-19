# AUTH-LOCAL-009 callback recovery

18 October 2026. Owner reported JSON `UNAUTHENTICATED` after an email code in another browser, then explicitly requested a branded error background/page.

## Diagnosis

Reproduced the exact JSON response using the old Keycloak design-review flow and a newly generated valid code. Keycloak accepted the code but returned the old app state; the app's five-minute, browser-bound login attempt was no longer valid. A copied Keycloak URL in another browser can also lack the binding cookie. The user's other browser was not inspected, so its exact expired-versus-missing-cookie cause is not asserted.

The old handler correctly rejected the callback but rendered an API JSON response as the browser document. The fix changes this presentation and provides a fresh login path, without accepting old callbacks or extending deadlines.

## Implemented

- HTML-accepting callback requests get a cream CardFord recovery page with existing logo, faint watermark, explanation, `Start sign-in again` and home links.
- Malformed callback, missing/expired binding, provider-verification failure and login-storage failure branches use the recovery presentation.
- Original HTTP failure statuses and no-store/no-referrer headers remain. A restrictive content policy permits only same-origin images and inline styles; no JavaScript is required. Callback query data is never interpolated into the document.
- Non-HTML callers and ordinary API failures retain JSON responses. Retry is explicit and targets `/auth/login`, which creates a new state, nonce, PKCE verifier and binding.

## Verification

Passed in the built-in browser against the rebuilt local runtime:

1. Reloaded the reproduced failed callback and observed the branded recovery screen, loaded logo and no desktop overflow.
2. Clicked `Start sign-in again`, entered the latest code for the existing synthetic test player and returned successfully to the app. The previously paused game had expired; its deadline was not reset and no game was resumed.
3. Opened a parameter-free callback URL for a safe design preview; checked narrow layout and retry control sizing. Captures: [desktop](recovery.jpg), [narrow](recovery-390.jpg).

Regression test `TestAuthCallbackRecovery` failed first for missing browser recovery HTML, then passed after implementation. It checks HTML recovery, unchanged JSON behavior, rejected status, no secret reflection/automatic redirect, cache/referrer headers, no app-session cookie on failure, and no unauthorized backend calls. The fake provider panics if an invalid callback reaches verification.

Command: `.local/windows-tools/go1.26.8/go/bin/go.exe test ./server/internal/http -run '^TestAuth' -count=1` with the existing project Go caches and `CGO_ENABLED=0`: **passed**. Full automated Keycloak/browser-replacement suite and the user's external browser: **not run**. No payment or model provider involved. No commit created.

The owned local auth launcher was restarted to load the rebuilt Go handler. Identity/database data remained intact. A recovery preview is left in the built-in browser; each real sign-in should start from the app or the recovery button, never an old Keycloak action URL.
