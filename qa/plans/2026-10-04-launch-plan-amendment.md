# Launch/client plan amendment review

4 October 2026 · source `a1158dc` on main · documentation only.

**Owner requirements:** online demo; flexible launch game/coaching access; reuse frontend for Android/iOS; basic nonfunctional requirements and first working app.

[CR-IMPL-004](../../planning/decisions/CR-IMPL-004-online-demo-and-launch-readiness.md), [execution packet](../../planning/implementation/multi-game/launch-access-and-client.md) and the [main plan](../../docs/superpowers/plans/2026-10-04-multi-game-reasoning-implementation.md) contain the decisions, compatibility, files and proposed tests. MG-15–18 are planned requirements, not fulfilled runtime behavior.

## Review

- Astra architecture review inspected embedded demo graph, paid-only/hardcoded quota resolution, requested-target authorization, access/replay trial distinction and basic quality scope.
- Sol 6.1 mobile review inspected the React DOM/Vite assets, relative same-origin API, hosted startup/cookie restrictions and official Capacitor/React Native guidance. Added explicit native CSP and process-death command recovery acceptance.
- Final access review required operation-specific context: tool ID, start/continue distinction, recorded admission and owned saved-result metadata. Added tool denial, post-expiry unit boundary and security-revocation cases.
- Selected approach: stateless online authored frames, pure versioned server offer resolver/stable quota identity, shared React UI with a deferred native spike. No administration subsystem or native dependency added.
- Existing paid-hosted security/capacity gates remain later release work. Core functional completion precedes strategy claims, human studies, native publication and large-load campaigns.

## Verification scope

| Actual check | Result |
|---|---|
| `git diff --check` | Passed, exit 0 |
| Ad hoc here-string piped to `node --input-type=module` | Passed, exit 0; 17 documents, 189 local links, zero missing targets |
| Requirement/source-path inventory, same Node check | 18 total MG requirements including MG-15–18; all 10 inspected implementation paths exist |
| Search for superseded offline-demo/paid-only categorical wording in amended active pages | No matches; `rg` exit 1 as expected |

The first validator attempt could not spawn Git from Node (`EPERM`). The final read-only validator used the explicit changed-file inventory and passed. Planned product tests remain not-run.

Application demo/access code is unchanged and still needs M04. No tests, provider requests, native builds, dependency installs, database migrations or deployments ran in this amendment pass. Official mobile documentation was browsed; the artifact links those sources.
