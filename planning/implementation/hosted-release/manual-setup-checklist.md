# Manual setup for CardFord accounts, Paddle and website release

Prepared 14 October 2026; updated 16 October for the owner's Keycloak selection and authorized local foundation. Follow the [human/agent local setup guide](../../../docs/development/local-auth.md) for local commands and actual evidence. Hosted dashboard, legal and payment work remains gated. Checked decisions record owner choices, not completed cloud configuration.

Read with the [architecture and code audit](C:/repos/test-jev/docs/superpowers/specs/2026-10-14-paddle-identity-release-design.md) and [backend delivery plan](C:/repos/test-jev/docs/superpowers/plans/2026-10-14-paddle-identity-release.md).

The [18 October distributed implementation guide](../../../docs/superpowers/plans/2026-10-18-regional-postgresql-architecture.md) covers the planned regional SQL/Go topology and deployment inputs. Stable home regions and waiting during whole-region outage are decided; hosting/provider choices, measured recovery targets and reporting scope remain setup inputs. Game-history and score-retention policy remains deferred; the unchecked retention item below is not an approved deletion schedule.

## 1. Decisions the owner needs to make

- [ ] Choose the public name of the paid tier, monthly price and base currency. The plan currently uses **Free** and **Paid monthly** as working names.
- [ ] Approve or adjust the proposed Free limits: **3 practice units/day and coaching on 2 units/day**, pooled across released games, reset at UTC midnight. A unit is a Hearts/Spades hand or a Trix request. These are not existing production terms.
- [ ] Approve paid inclusion: one person, monthly recurring billing, included supported practice/coaching, with normal operational rate limits. No family, annual, paid trial or add-on products at launch.
- [ ] Confirm which installed games/variants will be public. The code supports seven targets; installation alone does not mean every target is release-approved.
- [ ] Approve cancellation at period end, the proposed once-only 72-hour renewal-failure grace, admitted-unit continuation and how refunds/disputes affect new access.
- [x] Select the identity vendor: regional Keycloak. Keep staff identity separate. Local Go/Vite/PostgreSQL stay native; Keycloak runs in Podman. Real social-provider setup and regional hosted acceptance remain outstanding.
- [ ] Set a budget using **all active players**, not just subscribers: identity MAU, email delivery, database, hosting, monitoring and Paddle fees. Check 1k/10k/100k MAU scenarios without treating them as game-capacity promises.
- [ ] Confirm launch markets, seller country/legal entity, minimum user age, support address and privacy contact.
- [ ] Approve the retention schedule in the design, including history length, inactivity deletion, logs, backups and legally required financial evidence.
- [ ] Choose hosting region, pilot concurrency target, cost ceiling, recovery objectives and who responds to billing/security incidents.

These decisions can be recorded without sharing any credentials.

## 2. Company, domain and public website material

Owner, with legal/accounting input where needed:

- [ ] Confirm the legal seller name, registered address, business/individual status and authorized signatory. Use the same truthful details across vendor accounts.
- [ ] Control the production domain and identify staging, application and authentication hostnames. Keep staging separate from production data and payment credentials.
- [ ] Publish a product description, working support contact, pricing and renewal terms, cancellation/refund policy, Terms of Service and Privacy Policy on accessible URLs.
- [ ] Describe the actual card game accurately for Paddle review, including whether it has any wagering, prizes or cash-out. Obtain acceptance of the actual product under Paddle's rules rather than assuming eligibility.
- [ ] Explain account providers, Paddle billing responsibilities, international processing, retention/deletion, support requests and marketing consent in the applicable notices. Marketing opt-in should be separate from essential account/service messages.
- [ ] Confirm minimum-age and launch-market obligations. Do not infer that a casual game is exempt from children's privacy or consumer subscription requirements.
- [ ] Make self-service cancellation and deletion easy to locate and describe any retained invoice/financial records accurately.

Paddle's [setup checklist](https://developer.paddle.com/build/set-up-checklist/) and [account verification guidance](https://www.paddle.com/help/start/account-verification/what-is-account-verification) describe onboarding gates. Start these early; approval is external to our code work.

## 3. Identity provider tenant and account security

Owner creates/administers the vendor organization; engineer records nonsecret configuration and tests it:

- [ ] Create separate staging and production tenants/projects, with appropriate region/data-processing terms. Restrict administrator membership and require strong MFA; store emergency recovery material securely.
- [ ] Confirm the selected plan includes the exact intended combination: social connections, email OTP, explicit account linking, optional player MFA, mandatory admin MFA, recovery, custom domain, audit export, account deletion and needed event delivery. Do not rely on a free-tier headline or an early-access feature.
- [ ] For the Auth0 reference, create a **Regular Web Application** for the Go backend. Configure authorization-code login with PKCE and exact callback/logout URLs. Configure the authentication custom domain if selected.
- [ ] Enable hosted login and email OTP using a production email service. Do not implement an embedded password or OTP form in the game as a shortcut around the hosted flow.
- [ ] Disable custom rules/actions/extensions that automatically merge users by email. Enable only the reviewed explicit linking workflow with both identity proofs.
- [ ] Configure authenticator MFA and recovery codes for players, plus stronger required admin factors. Verify that email OTP or another linked provider cannot bypass enrolled MFA.
- [ ] Set reviewed session/reauthentication, rate-limit, brute-force/bot protection and abuse alert settings. Coordinate IdP sessions with app logout/logout-all behavior.
- [ ] Grant the backend only the Management API scopes needed for linking, deletion/revocation and operational sync. Store that credential in the hosting secret manager and plan rotation.
- [ ] Configure signed/reliable identity events where supported. Record how account disablement and security events reach CardFord and how delivery failure is detected.
- [ ] Document IdP outage/recovery behavior and account export/migration options. Keep the app's account IDs independent of tenant-specific IDs.

Evidence to retain: tenant/region/client identifiers, enabled features, callback inventory, capability-test outcomes and cost estimate. Do not include client secrets, OTPs, recovery codes or private keys.

## 4. Social-provider setup

The managed broker still needs provider-specific developer accounts and production credentials. A login method appears in the game only after its setup and acceptance test pass.

| Provider | Manual actions | Release check |
| --- | --- | --- |
| Google | Create the OAuth project/client; configure branding/consent, required domain ownership, privacy/terms links and exact broker redirect URL. Use only identity/profile/email scopes needed for sign-in. Complete required publishing/verification for the chosen scopes and audience. | Test a non-developer user and denied consent; verify stable subject mapping and missing/changed email behavior. [Google OIDC](https://developers.google.com/identity/openid-connect/reference). |
| Facebook / Meta | Create the appropriate Facebook Login app, connect production app ID/secret to the broker, configure valid redirect URIs and public policy/deletion/deauthorization endpoints, and complete the current dashboard's required review/verification/live-mode steps. | Test a normal user outside app roles, declined/missing email, unlink and provider deletion. Confirm current Meta requirements in the developer dashboard; its data-deletion documentation could not be fetched during this research because it returned HTTP 429. Do not assume Instagram/WhatsApp accounts are interchangeable login methods. |
| Apple | Confirm program and app eligibility first. Set up the required primary App ID, associated Services ID, approved return URLs, signing key and relay email domains if eligible. Track credential/key expiry and renewal ownership. | Confirm web availability for this project, test Hide My Email and repeated login, and handle revocation/deletion. Apple documents web association with a primary app; keep the button disabled until eligibility is established. [Apple setup](https://developer.apple.com/help/account/capabilities/configure-sign-in-with-apple-for-the-web/). |
| Microsoft / Discord / others | Defer unless target-player demand justifies them. Register the provider app and add a reviewed broker connection when selected. | Reuse the same internal account and explicit-linking contract; adding a network must not create a new billing ownership rule. |

- [ ] Use production-owned OAuth credentials rather than vendor demo keys.
- [ ] Keep staging and production callbacks/credentials unambiguous; register exact URLs, never wildcard redirects.
- [ ] Verify Facebook data-deletion/deauthorization request signatures and required confirmation/status response with the implemented endpoint before going live.
- [ ] Verify Apple relay deliverability for every sender used for essential app mail. Check how Paddle receipts reach users with relay addresses; allow a separately verified recovery/contact address without using it as the subscription ownership key.
- [ ] Keep minimum scopes. Do not request friends, contacts, posting, photos or social activity merely to authenticate.
- [ ] Assign an owner for annual/provider reviews, secret/key rotation and changes to social-login requirements.

## 5. Account email and recovery

- [ ] Choose a transactional email provider for OTP and security/service notifications.
- [ ] Verify sending domains and configure SPF, DKIM and DMARC. Register Apple private-relay sender domains where applicable. [Apple relay setup](https://developer.apple.com/help/account/capabilities/configure-private-email-relay-service/).
- [ ] Customize accessible, localized-as-needed OTP, account-link, changed-email, suspicious-sign-in and deletion messages. Avoid including sensitive game or billing details.
- [ ] Configure sending limits, resend/attempt controls, bounce handling and alerting. Keep marketing infrastructure and consent separate.
- [ ] Test delivery on common mail providers, spam handling, expired/reused codes and rapid resend. The app must not reveal whether a particular email has an account.
- [ ] Define a support recovery process that uses verified identity/IdP controls. A matching email, invoice screenshot or Paddle customer ID alone must not transfer an account or subscription.
- [ ] Test recovery after losing the social provider and after losing a second factor. Confirm recovery does not silently disable MFA.

## 6. Paddle setup

Owner handles seller and payout approval; engineer configures/test-integrates within the approved environments:

- [ ] Create the Paddle seller account, enable administrator MFA, restrict team roles and complete business/identity/domain verification required for the actual seller type.
- [ ] Submit the real website/product for review and resolve any card-game eligibility questions. Configure payout/bank details directly in Paddle and confirm fees, settlement currencies, payout timing and seller-country availability.
- [ ] Create a sandbox product and **one recurring monthly price**, quantity 1, no trial for launch. Keep Free entirely in CardFord. Product/price IDs differ between sandbox and live.
- [ ] Decide base price, tax-inclusive/exclusive display, supported/localized currencies and any regional price overrides. Avoid additional selectable products just to represent Free. Record all approved IDs/currencies for backend allowlisting.
- [ ] Configure the approved default payment-link/checkout page on the website and Paddle.js client-side token for that environment. The page must open the exact transaction created by our backend.
- [ ] Create least-privilege server API credentials and webhook endpoint secrets. Put secrets directly in the hosting secret manager; never send them in chat or commit them. The separate client-side token is public configuration and must not be treated as proof of payment.
- [ ] Register the HTTPS webhook endpoint and the transaction, subscription and adjustment event types used by the implementation. Verify the exact event list against the pinned API/SDK version.
- [ ] Test the endpoint through the deployment proxy/WAF. It must preserve raw body bytes, allow Paddle's callback without an app session, verify signatures and durably acknowledge quickly. Do not disable protection on unrelated APIs.
- [ ] Configure the customer portal and permitted management actions: invoices/payment methods/cancellation and supported recovery/resumption. Keep unsupported plan switches or pause behavior out of launch UI.
- [ ] Review failed-payment retries/dunning, cancellation emails, invoices, support branding and refund permissions. Align them with CardFord's grace/access policy.
- [ ] Define the operator process for an ambiguous checkout and duplicate payment. Reconcile before retrying any create operation; do not assume Stripe-style idempotency headers work with Paddle.
- [ ] Run the complete sandbox lifecycle using real checkout and provider records, not only simulated webhooks. Keep test identities and data separate from live.
- [ ] After approval, recreate or provision the live catalog/configuration and independently verify every ID, secret, endpoint and origin. Run the approved controlled live payment/refund check before public promotion.

References: [Paddle default payment link](https://developer.paddle.com/build/transactions/default-payment-link/), [webhook verification](https://developer.paddle.com/webhooks/about/signature-verification/), [API retry/idempotency guidance](https://developer.paddle.com/sdks/libraries/), [customer portal](https://developer.paddle.com/api-reference/customer-portals/create-customer-portal-session/).

## 7. Hosting and operational access

- [ ] Select a long-running Go hosting service and managed PostgreSQL region suitable for the initial audience and policy. Agree on the first pilot's load/cost limit.
- [ ] Provision separate staging and production databases, identity tenants, Paddle environments and secrets. Do not reuse local fixture databases as production.
- [ ] Configure DNS and TLS, trusted reverse proxy settings, database private networking, TLS certificate verification and restricted outbound access where practical.
- [ ] Create separate app and migration DB roles and restricted billing-worker write authority. Restrict production console/database access; require MFA and audit privileged access.
- [ ] Configure deployment secrets for database, IdP and Paddle. Keep a secret inventory with rotation owners; logs and build artifacts must contain no secrets.
- [ ] Configure backups, retention, encryption, restore permissions and a scheduled restore drill. Decide recovery time and data-loss objectives and then measure them.
- [ ] Configure alert destinations and ownership for auth anomalies, webhook/worker failures, duplicate payments, expired credentials, failed deletions, DB saturation and backup failure.
- [ ] Configure transactional email monitoring and production support inbox access.
- [ ] Document deployment rollback and the ability to disable new checkout independently of ongoing gameplay, renewal reconciliation and cancellation/deletion jobs.
- [ ] Complete browser/device and capacity checks before widening access. Multiple replicas need the engineering checks in the delivery plan; changing replica count is not the entire scaling plan.

## 8. Retention, privacy and support sign-off

- [ ] Approve a data inventory and purpose for each retained field/system, including IdP logs, Paddle financial records, database backups and support tickets.
- [ ] Have the appropriate legal/accounting reviewer set jurisdiction-specific financial retention and any incident/legal-hold rules. Do not substitute a guessed number of years.
- [ ] Confirm proposed operational periods: detailed game history 12 months, inactive Free review at 24 months with notice, general logs 30 days, minimized security audit 90 days and rolling backups 35 days, or record replacements before implementation.
- [ ] Define who handles access/export/deletion requests and within which applicable deadlines. The engineering seven-day deletion target does not replace legal requirements.
- [ ] Review vendor DPAs, regions, subprocessors, international-transfer terms and actual deletion behavior. Paddle may retain records it must keep; CardFord must disclose that accurately.
- [ ] Approve deletion behavior for active subscribers: immediate app blocking, stop future renewal, durable external cleanup and a separate refund policy.
- [ ] Approve limited tombstone retention to finish billing cleanup and prevent delayed events from recreating access; delete/minimize it when the documented purpose ends.
- [ ] Test private exports and the full erasure path, including a provider outage and a restored backup. Keep completion evidence without retaining the erased payload itself.
- [ ] Assign support ownership for linking conflicts, recovery, refunds/duplicate charges, abuse suspension and incident notifications.

## 9. Final launch evidence

- [ ] All public providers work for non-developer users; unready providers are hidden. Login/linking/MFA/recovery and logout-all were tested on staging.
- [ ] Free quotas hold across devices and every play/coaching route; paid access depends only on verified backend billing state.
- [ ] New purchase, decline, renewal, cancellation, recovery/grace, refund/chargeback and duplicate/out-of-order webhook cases passed.
- [ ] Two-account isolation tests passed for games, subscriptions, portal sessions, exports and deletion.
- [ ] Ambiguous checkout recovery, IdP/Paddle outage, DB failure, job retries and deleted-account events passed.
- [ ] A backup was restored and deletion records reapplied before exposure; graceful deploy and realtime/playback recovery passed.
- [ ] The exact release artifact was checked for fixture/debug routes, secrets, unwanted labs/reference servers and private source maps.
- [ ] Pilot load results, known limits, alerts, support procedures and vendor approvals are recorded.
- [ ] Owner approves release based on that evidence. This planning task has not requested or performed deployment.

## Nonsecret handoff inventory

Before engineering enables each environment, record the following in its protected configuration/runbook: app/auth domains, allowed callbacks, IdP issuer/client/connection IDs, provider readiness, Paddle environment/seller/product/price IDs and public client token reference, webhook endpoint, approved tier/retention values, secret-manager entry names, hosting/database region, email sender and alert/support owners.

Keep actual server secrets, private keys, backup keys, passwords and recovery codes in their designated vaults. The code plan can proceed with placeholders in examples; external acceptance cannot be marked complete until the real protected configuration exists and its tests run.
