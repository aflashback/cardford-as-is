# CR-IMPL-004 — Online demo, flexible launch access and client reuse

**Recorded:** 4 October 2026. **Authority:** owner's notes after reviewing the multi-game implementation plan. **Status:** approved planning requirements; application changes remain future tasks.

## Decision and reason

1. The demo requires a reachable application server for every frame, choice and replay. Replace the shipped local demo graph with a finite server-owned authored example; no dynamic game engine or Jev work is added to it.
2. Plan configurable free/access-trial/paid offers with exact game/variant eligibility and separate play/coaching permissions and limits. Final launch offers, prices, durations and quotas remain undecided. No free entitlement is activated by writing this record.
3. Keep React DOM, TypeScript, Vite and existing visual assets. Recommend a later Capacitor shell to reuse the frontend for Android/iOS; validate transport, authentication and lifecycle on devices before selecting a native release. Packaging does not provide offline gameplay.
4. First deliver the functioning web app with basic reliability, information protection, recovery, usability and bounded work. Larger capacity experiments, native distribution and advanced optimization follow that milestone. Strategy/learning claims retain their independent evidence gates.

## Supersession and compatibility

This supersedes the offline-demo permission in A01/A07, categorical no-access-trial/paid-only launch statements in P02/P05 and the original plan, and CR-FUTURE-001's planning prohibition on preparing free grants. Human multiplayer, new prices and broad free access remain unapproved. The current fixture implementation is unchanged.

Rules, hidden-information policy, Jev-only model boundary, original advice and default policy pins are unchanged. A server-issued free/access-trial grant is verified authority for its declared scope, not permission inferred from signing in. Existing purchased coverage, saved-result access, usage identity and revocation rules survive configuration changes. Access trials and replay alternative trials remain distinct.

For the first working app, existing multi-instance race checks may use the current test harness; they do not require a distributed deployment. The 1,000/10,000/100,000-table design remains a later capacity track, not a gate on implementing core play. Existing paid-hosted release safeguards still apply when that release is requested.

## Alternatives and affected evidence

- Keep a local authored graph plus a connectivity flag: rejected; it can still advance without a successful server response.
- Hardcode launch offers or build a full administration backend: rejected; use validated, versioned server configuration first.
- Rewrite the DOM/CSS UI in React Native: more UI adaptation than the owner's reuse goal requires; retain as an alternative only if a measured native limitation justifies it.
- Ship native shells immediately: deferred until a complete stable web journey and hosted-session prerequisites exist.

Affected requirements: MG-15–18 in the [requirement map](../implementation/multi-game/compatibility-and-requirements.md). Execution files/tests and mobile sources are in the [launch/client packet](../implementation/multi-game/launch-access-and-client.md). Documentation-only review; no application, provider, store, device or capacity test is claimed.
