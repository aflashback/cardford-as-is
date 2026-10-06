# Exact-target access (MG-16)

`LaunchPolicy` has no offers. `LocalFixturePolicy` is an explicit fixture selection. Both load checked-in configuration, validate the frozen `AccessOfferPolicy` schema and then reject unimplemented tools, target combinations, calendars and units. Current installed adapters declare `hand` units; the sole installed delivery tool is `advice`. Public `period: grant` maps to the durable lifetime bucket; week, month and non-UTC calendars are rejected.

Server configuration is limited to 1 MiB, 64 offers and 64 enabled free target entries, matching bounded identity issuance. Identifiers must fit durable 256-byte limits. Unlimited offers keep `offer:<id>` buckets where they fit; longer IDs use `offer-sha256:<digest>` derived from the offer ID alone, preserving the same bucket across versions and targets.

Create a `Resolver` once with `NewResolver(policy)` to retain a private validated configuration snapshot. Resolve only server-read identity, exact target, grants, admissions, original unlocks, bucket usage and server time. `Generation` is the authoritative owner's current fence, not the configuration's presentation metadata. The resolver does not issue access or mutate storage.

The first eligible offer in configured precedence wins. Same-offer grants use stable grant-ID order; historical paid offers removed from configuration sort after configured offers. An exhausted winning allowance denies the request; it does not consume another free, trial, family or purchase allowance. Remaining allowance includes pending reservations and reflects the state before any new charge.

Purchased and family grant terms survive edited or removed offers. Disabling or removing a free/access-trial offer, target or permission blocks the corresponding future admissions, while an already admitted play unit and its original coaching unlock retain their recorded terms. Existing grants retain their original allowance terms and bucket. Expired access permits continuation only under `finish-admitted-unit` with a matching grant/session/unit admission recorded during validity. A module's boundary flag does not prove admission. Revoked identity, admission, unlock or selected grant fences the corresponding operation.

Existing unlocks pin original tools, grant, offer version, bucket and period; they cannot broaden through another grant. Saved reads require delivered, owned results within current-session or retention scope, independently of commercial expiry. Where a delivering grant is recorded, its security revocation still fences the read.

Integrators must:

- Read these inputs authoritatively; do not accept their JSON equivalents as client proof.
- Persist trial activation once per identity and stable trial key, independently of policy version or device.
- Use `Offer.Terms(target)` only for an enabled, exact-target future issuance; preserve existing grant terms. Apply `ValidatePolicyUpdate` to live configuration changes and compare persisted same-offer bucket/calendar metadata on restart issuance.
- Recheck selected grant/tool, identity/access generation, session revision/control and storage time under the existing transaction lock before admission, charge, or publication. A pure allow decision is not a reservation.
- Preserve separate play and coach grants, including their respective recorded admissions; neither grant inherits the other's scope or permission.
- Map `coach-advice` preparation purpose explicitly to public tool `advice`. Original deterministic human analysis remains internal regardless of delivered-tool allowance.

Validation: `node scripts/windows-env.mjs go test -race ./server/internal/access -count=1`. Tests cover exact scopes, independent permissions, strict configuration, expiry boundaries, original-unit continuation, revocation, no quota stacking, reservations/UTC rollover, original unlocks, preserved purchases, saved ownership and immutable resolver configuration. This package's tests do not establish database atomicity, hosted billing/identity, or client integration.
