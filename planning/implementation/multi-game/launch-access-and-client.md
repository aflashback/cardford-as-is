# Launch access, client reuse and basic quality

Amendment to M00–M04/M06/M12 of [the main plan](../../../docs/superpowers/plans/2026-10-04-multi-game-reasoning-implementation.md), authorized by [CR-IMPL-004](../../decisions/CR-IMPL-004-online-demo-and-launch-readiness.md). **M04D passed scoped MG-15 demo and MG-16 backend acceptance; see [evidence](../../../qa/implementation/multi-game/m04d/status.md). Complete account/client integration, MG-17 and the remaining MG-18 journey are planned.**

**Current execution:** [M04D](m04d-execution.md) implements the authored online demo and exact-target access resolver in Go (`server/internal/demo`, `server/internal/access`, existing HTTP/service/records boundaries and forward migration 009). React's demo is connected through server-confirmed frames; normal gameplay and account controls still use the original Node service. M04E completes the platform/client envelope and preserved three-mode journeys. TypeScript server paths below are historical source mappings, not another permanent backend. The optional `--access-policy` flag selects validated configuration; the checked-in `launch.json` has no offers. `local-fixture.json` is an explicit demonstration configuration. Without the flag, the separate M04C fixture constructor remains available. Persisted identity modes prevent silent cross-mode regranting; neither path is hosted identity.

## Online example: MG-15

`web/src/features/DemoPage.tsx` now requests each open/choice/replay from the finite Go-authored graph and validates the frozen response DTO. Losing connectivity retains an inert last-confirmed frame and offers reconnect; stale responses cannot advance a newer request. The offline graph and authored advice are absent from the client bundle. On the original Node service, the component accurately reports that the online example is unavailable. Optional `--web web/dist` serves the same React build alongside Go for the `#demo` journey; normal game/account journeys are not connected by that flag.

The implementation uses [Go demo content/service](../../../server/internal/demo/demo.go), [Go HTTP routes](../../../server/internal/http/local.go), [the optional bounded static-build handler](../../../server/internal/http/demo_web.go), [React DemoPage](../../../web/src/features/DemoPage.tsx) and [demo-online tests](../../../web/e2e/demo-online.spec.ts). The initially proposed `web/server/http/demo-service.ts`/`web/server/demo/content.ts` paths remain source-mapping history. Keep the graph on the server; bundle visual assets without the authored transitions/advice.

Define `getDemoFrame(contentVersion, nodeId, choiceId?)` over a closed installed graph, returning the current/selected finite frame and allowed choice IDs. Public read-only content may be anonymous and repeatable. Stateless validated node/choice requests need no game aggregate, purchased grant, database demo journal or personalized analysis. Reject arbitrary positions, seeds, unknown nodes/choices and mixed live commands. Responses are `no-store`; no offline demo response/graph cache. Fence out-of-order responses in the UI. Previously loaded text is not a trusted game or quota record.

Passed MG-15 acceptance: traverse all branches online; lose connection before open/choice/replay and confirm zero advancement; reconnect and retry safely; reject invented content/positions; assert zero engine, provider and coached-allowance work. The [M04D report](../../../qa/implementation/multi-game/m04d/status.md) includes 9/9 real Go/React browser tests. Demo use remains excluded from training progress/rating.

## Configurable offers: MG-16

The original Node `http/views.ts::coachAccess` still derives its legacy named-plan access and fixed allowance. M04D adds a separate [pure Go resolver](../../../server/internal/access/policy.go) over versioned configuration and authoritative records. The Go service keeps verified billing-source terms separate from permission, with no live billing activation in this slice. It independently resolves play, requested coaching tools and saved reads for the requested exact game/variant.

Implementation locations are `server/internal/access`, `server/internal/service`, `server/internal/records` and the registered `web/shared/local-service.schema.json` fragment. [Migration 009](../../../web/server/records/migrations/009-configured-access.sql) adds configured identity/unit-unlock metadata and backfills original reservations; prior migrations remain unchanged. Pure policy, service and PostgreSQL regressions cover this backend boundary. The earlier TypeScript resolver/billing/account file list is the source mapping for later preserved-client integration. `AccountView.offers` retains its V1 named-plan shape; complete account availability/limits and access-offers browser journeys remain M04E work.

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

M04D's passed MG-16 backend acceptance covers selected-game free, play-only, capped coaching/access trials, disabled/expired offers, wrong target/tool, recorded admitted-unit finish and next-unit rejection, security revocation, concurrent last-unit/retry/restart, no stacking/reset and purchased/saved access. A valid independent coaching grant may serve an owned unit after play expires; it cannot advance the game. Source security revocation overrides saved-result reads. All commands retain current lease/revision/idempotency and prepared-work fences, and receipts retain original unlock/trial terms. Final counts/results are recorded in the [M04D report](../../../qa/implementation/multi-game/m04d/status.md). Account UI availability/limits must match the server in M04E; that client acceptance is not claimed here.

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
