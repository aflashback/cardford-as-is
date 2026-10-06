# Launch access, client reuse and basic quality

Amendment to M00–M04/M06/M12 of [the main plan](../../../docs/superpowers/plans/2026-10-04-multi-game-reasoning-implementation.md), authorized by [CR-IMPL-004](../../decisions/CR-IMPL-004-online-demo-and-launch-readiness.md). **Planned, not implemented.**

**Current execution target:** after [M04C](../../../qa/implementation/multi-game/m04c/status.md), M04D implements the authored online demo and exact-target access resolver in the Go service (`server/internal/demo`, `server/internal/access` and its existing HTTP/records boundaries). The TypeScript server paths below identify the original behavior and source material to port; they do not prescribe another permanent backend. Preserve the React components and connect them only through the later complete platform/client acceptance gate. Local fixture grants from M04C are not configurable offers or hosted identity.

## Online example: MG-15

Current `web/src/features/DemoPage.tsx` embeds every example/edge and advances with local React state. Replace it with a finite server-authored frame endpoint; every open/choice/replay gets a validated server response before advancing. Losing connectivity retains an inert last-confirmed frame and offers reconnect. A connectivity flag or startup ping is insufficient. Rendered text can remain visible; the official client cannot continue the demo offline.

Create `web/server/http/demo-service.ts`, `web/server/demo/content.ts`, `web/server/tests/demo-service.test.ts` and `web/e2e/demo-online.spec.ts`. Modify `DemoPage.tsx`, `http/app.ts`, `api/client.ts` and the generated public schema. Keep the graph on the server; bundle visual assets, not all authored transitions/advice.

Define `getDemoFrame(contentVersion, nodeId, choiceId?)` over a closed installed graph, returning the current/selected finite frame and allowed choice IDs. Public read-only content may be anonymous and repeatable. Stateless validated node/choice requests need no game aggregate, purchased grant, database demo journal or personalized analysis. Reject arbitrary positions, seeds, unknown nodes/choices and mixed live commands. Responses are `no-store`; no offline demo response/graph cache. Fence out-of-order responses in the UI. Previously loaded text is not a trusted game or quota record.

Acceptance: traverse all branches online; lose connection before open/choice/replay and confirm zero advancement; reconnect and retry safely; reject invented content/positions; assert zero engine, provider and coached-allowance work. Demo use remains excluded from training progress/rating.

## Configurable offers: MG-16

Current `http/views.ts::coachAccess` derives play access from individual/family paid coverage and hardcodes four coached hands per UTC day. Extract a pure policy resolver and keep billing evidence separate from access permission.

Create `web/server/access/policy.ts`, `offers.ts`, `web/server/tests/access-policy.test.ts`, `access-offers.test.ts` and `web/e2e/access-offers.spec.ts`. Integrate `http/views.ts`, `game-service.ts`, `trial-service.ts`, `records/types.ts`, `billing/service.ts`, `access/family.ts`, the account UI and active schemas. Add a forward SQL migration only for required persisted grant/usage metadata; never edit an old checksummed migration.

Proposed resolver:

```ts
resolveAccess(policy, grants, target, operation, usage, now): AccessDecision
```

M01 defines strict types/codecs for these parameters: versioned offer policy; verified beneficiary/source/validity grants; exact registered game/variant target; recorded bucket usage; explicit server time. The operation/context is discriminated:

- `play`: start versus continue, session/unit identity and authoritative recorded admission where applicable;
- `coach`: requested tool ID and session/unit identity, including any existing unlock;
- `read-saved`: an owned saved-result reference with its original delivered status and current-game/retention scope, independently of current grant expiry.

Admission and owned-result context come from authoritative records, never client claims; an `AccessUnit` boundary flag does not establish prior admission. Output is a discriminated allow/deny result with reason, applied offer/grant references, remaining allowance, admission/expiry rule and access generation. It never returns authority from a client-supplied plan.

| Configured field | Required meaning |
|---|---|
| Offer ID/version and enabled status | Free, access-trial and paid configurations; unconfigured/disabled offers issue no grant |
| Exact game/variant selectors | May allow selected games only; reject uninstalled or unsupported selectors |
| Play and coach permissions | Independent; play-only grants cannot expose dynamic guidance |
| Coaching tools and quota | Explicit supported tool IDs, unit, finite limit or explicit unlimited, period/timezone and stable bucket ID |
| Activation and validity | Access-trial start/expiry and eligibility recorded against server identity; no reset through reload/device/account-plan switching |
| Admission/continuation | Explicit pause-at-expiry or finish-admitted-unit rule; security revocation always fences subsequent operations |

For new sessions, evaluate the **requested target**, not the currently open game's variant. Resolve applicable grants per operation/target; one grant's game scope cannot broaden another. Define allowance precedence without silently adding free/trial/family/individual quotas. Bucket identity survives offer-version changes; pin reservations to their original offer/period and preserve purchased terms. Restart/concurrent retry cannot activate a trial or spend its last unit twice. Offer edits affect future admissions according to declared rules, not historical advice or usage.

Use the module's declared coached-unit/admission boundary rather than assuming every game has a 13-trick hand. Retain original current-game unlocks/read permissions. Always retain the human's safe deterministic analysis internally; offer limits govern delivered tools and optional provider work, not whether the engine notices a scenario. No quota-based bot weakening or misleading advice. Paid Stripe trials and access trials are independent decisions; do not create a Stripe trial automatically.

Launch values remain unset until selected. Start with checked-in validated server configuration; an administration editor is later optional work. `TrialService` continues to mean a replay alternative, not the commercial trial ledger.

Acceptance: selected-game free offer; play-only offer; capped coaching/access trial; disabled/expired offer; wrong target/tool; finish only the recorded admitted unit after expiry and reject its next unit; security revocation overrides continuation; concurrent last-unit/retry/restart; cross-grant no-stacking; policy-change no-reset; preserved purchased/saved access. UI availability/limits must match server decisions. All access changes retain current lease/revision/idempotency and prepared-work fences.

## Keep one frontend: MG-17

Recommendation: retain React DOM/Vite/TypeScript, cards, SVGs, CSS and generated public contracts; assess a Capacitor shell after a stable web journey. Capacitor supports adding native projects to an existing web build. React Native uses native components, so current DOM/CSS screens need adaptation. This is a source-backed feasibility recommendation, not a verified reuse percentage. [Capacitor installation](https://capacitorjs.com/docs/getting-started), [React Native components](https://reactnative.dev/docs/intro-react-native-components).

M04 creates `web/src/platform/runtime.ts` and `web.ts` and keeps `api/client.ts` as the shared transport entry. A small platform port supplies API origin, foreground/resume events and external navigation; native implementations/plugins are deferred. Components do not import Capacitor directly. Preserve validated responses, authentication, command IDs, revisions and reconciliation in both clients. Use only deployment-allowlisted HTTPS API origins for hosted clients; browser defaults remain same-origin.

The current client uses relative URLs and `credentials:'same-origin'`; local server cookies/origin restrictions and `config.ts` block hosted startup. Native bundled assets have a separate origin. The later spike must validate managed sign-in, native-origin session transport, cookie/CSRF or equivalent session protection, authentication return, Android Back, suspend/process death/reconnect and refreshed authoritative state before inputs resume. Changing `fetch` credentials alone is not a verified solution. Keep privileged code/state on the server. [Capacitor configuration](https://capacitorjs.com/docs/config), [HTTP](https://capacitorjs.com/docs/apis/http), [App lifecycle](https://capacitorjs.com/docs/apis/app).

Create future `web/server/tests/client-platform-boundary.test.ts` and `web/e2e/client-resume.spec.ts` for the web port/URL validation and interrupted-command reconciliation. No native dependency/install/project is part of the current engine migration. Later bundle the web build with `webDir`; do not use development `server.url` as a production shortcut. Native build/test needs Android SDK tooling and macOS/Xcode access for iOS. Store purchase/restore and release requirements need their own validation; existing web Stripe checkout is not assumed to work unchanged in both stores. [Workflow](https://capacitorjs.com/docs/basics/workflow), [environment](https://capacitorjs.com/docs/getting-started/environment-setup).

Native spike acceptance must distinguish foregrounding from process death: retain an ambiguous command's original ID/body for an authorized retry, or reconcile against committed state before creating another command. React refs alone do not survive relaunch. Packaged HTML also needs its own verified CSP for approved API/resources; server response headers do not automatically protect that local document, and native-origin allowlisting does not authenticate a caller. [Capacitor security guidance](https://capacitorjs.com/docs/guides/security).

## First working-app quality: MG-18

| Basic requirement | First evidence |
|---|---|
| Correct/private play | Existing rules, safe observations, strict APIs and authorized single-revision transitions |
| Durable recovery | Reload/restart/reconnect returns the last committed table and original analysis; ambiguous command retries do not duplicate moves/spend |
| Bounded work | Existing work caps, bounded polling and request deadlines; connection/provider failure reaches a recoverable state, not permanent loading |
| Usable table | Readable cards, keyboard/touch actions, accessible control labels, no lost controls on small screens, safe areas/rotation and usable review/settings |
| Useful diagnostics | Sanitized request/error/version records and actual single-table timings; no keys/private hands in general logs |

Use existing unit/service/UI suites plus `demo-online`, `access-offers` and `client-resume`. M04/M06 produce the first complete playable web slice using existing code policies; do not wait for M11/M12 strength/human studies to prove functional completion. Keep those studies as gates on their own claims/promotions.

Defer mandatory large-load campaigns, new replicas/queues, sharding, advanced observability and native publication from this milestone. Existing higher-load and paid-hosted release gates remain later work; first-app success makes no capacity or device-build claim. Fix measured blocking delays before adding optimization machinery.
