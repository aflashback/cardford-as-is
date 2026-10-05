# Targeted partnership resource cases

Built 5 October 2026 alongside M00–M01. The selectable successor is `spades-partner-resource-4.1.0`; current defaults, frozen 2.1 and retained 3.0/4.0 remain installed and unchanged. Human reviews remain deferred.

Ten authored reachable situations cover the original trigger, an additional side suit, unsafe overruff, uncertain ownership, own/partner/opponent Nil, a made contract with carried bags, no retained entry, and a secure partner winner. The useful two-suit fixture changes the retained `SJ` lead to `H5`, offering the partner an optional ruff while preserving the actor's master trump. Bot and coach use that same selected analysis. Exact public resource eligibility is checked separately from the conditional strategic preference.

| Situation | Rule outcome | Bot and coach |
|---|---|---|
| Useful: partner can safely ruff a second side suit | Trigger; partner may still decline to trump | Lead `H5`, retain `SJ` as a later entry |
| Unsafe: a legal opposing overruff remains possible | Do not trigger | Lead the unbeatable `SQ` in this fixture |
| Unnecessary: partner already owns a secure winner | Conserve an extra winner | Play `H5`, leave partner in control |

Nil, a completed contract, missing entry and uncertain trump ownership each have separate non-trigger cases. A blocked trigger does not dictate the fallback action: the retained policy still decides from the actor's legal choices.

The source-stable [fresh development run](fresh/results.json) completed in 16,412 ms, under its 60-second bound. It used 64 independent deal seeds, four related evaluated-seat placements, and both retained reference policies. Every selector received its own observation from the production reducer.

| Reference | Unforced shadow decisions | Ruff offers | Secure-partner cases | Changed actions | Paired comparisons | Changed paired streams | Sum of margin differences |
|---|---:|---:|---:|---:|---:|---:|---:|
| `spades-plan-3.0.0` | 2,890 | 0 | 42 | 0 | 256 | 0 | 0 |
| `spades-cases-4.0.0` | 2,890 | 0 | 42 | 0 | 256 | 0 | 0 |

The reference comparisons and rotations reuse those same 64 deals. They are not 512 independent deals. All newly checked claims passed; no illegal actions or uncheckable claims occurred. This establishes observed parity in this sample, not policy equivalence, playing strength or teaching benefit. Ruff-offer usefulness remains supported only by targeted correctness cases and conditional reasoning; natural occurrence and human acceptable-action judgments remain unproved.

The requested Jev step is gated on a changed fresh decision. There was no first-difference packet, so **zero live requests were made**, observed model **none**, new spend **zero**. The cap-one J0 shadow harness is prepared, with source/reducer replay verification, a dedicated durable ledger, eight-second deadline, USD 0.01 admission budget, local dispatch guard and fixed redacted response categories. It does not reset the earlier exhausted smoke experiment. Synthetic tests are labeled test evidence and never saved as model results. No runtime Jev or policy promotion occurred.

Run the targeted tests:

```powershell
node --test --test-isolation=none web/server/tests/spades-partner-resource.test.ts web/server/tests/spades-observed-cases.test.ts web/server/tests/partner-jev.test.ts
# Dry-run Jev readiness; no packet/DB/credential/network access:
node web/server/evaluation/partner-jev.ts
```

The fresh archive is immutable: [manifest](fresh/manifest.json), [fixture report](fresh/fixture-report.json), [results](fresh/results.json), and `fresh/pairs.private.jsonl`. Full decks and action archives are private administrator evaluation material; player/provider paths accept only validated actor observations. Existing output directories reject reuse. The [requirements](requirements.md) explain the separate correctness, measurement and human-quality gates.

The run's source hashes describe the checkout at measurement time. Subsequent review repairs to the M01 registry and document decoder are recorded in the foundation evidence; the partnership policy and this archive remain unchanged. The Jev harness rejects a stale source manifest. Any later comparison therefore needs a new declared run and output directory.

Next implementation: M02 game-owned module adapters, M03 validated storage and M04 production integration. The next strategy experiment needs a separately declared fresh seed range and a measured change before bounded Jev comparison. Human label and learning studies remain deferred.
