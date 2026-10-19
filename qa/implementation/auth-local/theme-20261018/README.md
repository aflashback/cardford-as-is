# AUTH-LOCAL-008 acceptance evidence

18 October 2026. Owner approved option one. Implemented in the existing local `cardford` Keycloak theme; no deployment or commit made. The working tree includes unrelated owner work.

## Passed: actual local runtime

Verified in the built-in browser against the running Keycloak 26.8.1 / Phase Two 0.91 stack, using the existing synthetic `player@cardford.test` account and local mail capture.

- Signup renders the logo, watermark, optional display name and email-code guidance. Native empty-email and malformed-email submissions return `Please specify email.` and `Invalid email address.` respectively.
- Sign-in and signup links work in both directions.
- Fixed the upstream password-validator script loading without a password field; fresh signup, invalid-email submission and sign-in/signup navigation produced **zero new console errors** after the guard was added.
- Email-code screen renders without template errors. Resend during cooldown returns `Please wait 60 seconds before requesting another code.` A deliberately invalid code is rejected. A valid locally captured code returns to the real app and the paused game still requires **Resume game**. No game was resumed by this check.
- `Use a different email` returns to the email-entry screen.
- Signup has no horizontal overflow at 320, 390, 536 and 1280 CSS pixels. Inputs and primary actions measure at least 44px high. Fonts load; native labels, linked email hints and visible input focus are retained.
- Side-by-side visual comparison against the approved source completed after correcting inherited header color, blue divider and desktop container padding. See [design QA](../../../../design-qa.md).

## Evidence

- [Approved mock](approved-option-one.png), [normalized comparison](comparison.png).
- Signup: [536x532](signup-536.jpg), [320x640](signup-320.jpg), [390x844](signup-390.jpg), [1280x800](signup-desktop.jpg).
- [Sign-in](signin-536.jpg), [email-code entry](email-code.jpg), [invalid code](email-code-error.jpg), [signup validation](signup-error.jpg).

Screenshots contain synthetic test identifiers only; no code, credential, cookie or callback URL is included. Error screenshots show the earlier layout before the final six-pixel OTP helper spacing adjustment; the final normal OTP capture includes it. Screenshots are JPEG; the mock/comparison are PNG.

## Command checks

Passed (exit 0):

```powershell
node --check infra/keycloak/theme/cardford/login/resources/js/rally.js
node --check web/e2e/keycloak-live.spec.ts
git diff --check -- CHANGELOG.md docs/development/local-auth.md docs/superpowers/plans/2026-10-16-keycloak-local-auth.md infra/keycloak/theme/cardford web/e2e/keycloak-live.spec.ts
```

`git diff --check` covers tracked changes only; new theme files were reviewed separately. Node checks are syntax checks, not TypeScript typechecks or automated authentication tests.

## Not run / limitations

The existing `web/e2e/keycloak-live.spec.ts` labels now match the new UI; its full automated registration/browser-replacement/game/socket suite was **not rerun** for this visual change. A new user was not registered in this pass. Existing-account email-code login was completed. Alternate browsers, social providers, RTL/localization, account console and production SMTP are not covered. This is focused visual/interaction evidence, not a full accessibility or security audit. No AI provider was involved in authentication or gameplay; the approved mock was a design input only.
