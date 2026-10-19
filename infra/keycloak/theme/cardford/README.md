# CardFord local login and account themes

AUTH-LOCAL-008 implements the owner-selected option-one mock (18 October 2026). The theme inherits `keycloak.v2` and is selected by the local realm setup. `Local development` deliberately identifies this local environment.

## Sources and scope

- `login/template.ftl`, `register.ftl` and `login-username.ftl` start from the installed **Keycloak 26.8.1** theme JAR (upstream Apache-2.0). Changes are limited to branding, supporting copy, the registration footer, and a default-true `displayUsername` parameter so the OTP screen can show the recipient once. Other callers retain the upstream username/restart presentation.
- `login/otp-form.ftl` adapts **Phase Two keycloak-magic-link 0.91**. Preserve the native action URL, `otp` field and `submit`/`resend` names. The provider owns validation, expiry and resend policy; the current local policy is five minutes and sixty seconds respectively.
- `login/resources/img/cardford-symbol*.svg` are verbatim copies of the product's `web/public/brand/` assets. Update both copies together if branding changes. The watermark uses the original mono SVG, not a recreated logo.
- Existing locally bundled Manrope and DM Sans fonts remain in use. No external fonts or analytics are loaded by this customization.
- `resources/js/rally.js` adds only labels, input hints and accessible descriptions. It makes no requests and does not intercept submission or access credentials/storage.

Native user-profile macros, escaped translations, error handling, locale controls, conditional password/terms/CAPTCHA blocks, social/passkey integrations and session scripts remain inherited or retained. The selected design is light-only. Social login and other locales were not redesigned or verified by this change.

## Account console (AUTH-LOCAL-012)

`account/theme.properties` inherits the installed **Keycloak 26.8.1 `keycloak.v3`** account console. Its supported `styles`, `logo`, `logoUrl`, favicon and title properties load CardFord branding without copying the React bundle, `index.ftl`, navigation configuration or authentication logic. `darkMode=false` matches the approved local sign-in theme. The logo returns to the local app's account page; update `logoUrl` for any future deployment with another public origin.

`account/resources/css/cardford.css` styles native PatternFly 5 components, including lazy-loaded profile and credential lists. It uses the same product symbols and bundled fonts as the login theme. Header branding combines the original symbol with the same text wordmark as the app. Keep asset copies synchronized. Native profile validation, disabled fields, account menus, security actions and device/application management remain Keycloak-owned. No custom account JavaScript is added.

The local realm definition selects both `loginTheme` and `accountTheme` as `cardford`. See [account visual acceptance](../../../../qa/implementation/auth-local/account-theme-20261018/README.md). On upgrades, inspect the installed account theme's properties and rendered PatternFly classes, then repeat the responsive read-only checks before accepting the override. MFA enrollment and session revocation require separate functional acceptance.

Registration loads the upstream password-validator script only under the same `passwordRequired??` condition as its password fields. Otherwise the upstream script attaches a listener to a missing element in this passwordless realm. Server-side validation remains authoritative.

## Development and upgrades

Run `npm run dev:auth:status` before browser work. The owned development container mounts this directory and disables theme caching, so a normal page reload picks up changes. Open the app at `https://localhost:4443` to initiate a fresh flow; do not bookmark transient Keycloak action URLs.

When upgrading Keycloak or the extension, compare these copied templates with the exact new upstream versions before applying them. Preserve action fields and newly introduced security/session code. Check signup validation, sign-in, code rejection/acceptance, resend cooldown, restart, keyboard focus and narrow layouts against the [acceptance report](../../../../qa/implementation/auth-local/theme-20261018/README.md). Update helper copy if the local OTP policy changes.
