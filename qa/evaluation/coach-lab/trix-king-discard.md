# CFL-14: South's King discard comparison

10 October 2026. The bounded comparison completed **2,816 full continuations and 118,272 native plays** from two South observations: Basic Partners and Complex Partners. Each observation has 32 distinct sampled allocations, eleven legal roots and four fixed continuation environments. Input and source bytes remained unchanged during execution.

**K♥ has the highest sampled mean full-team score among all eleven roots in every variant, stream and environment.** This supports a conditional escape hypothesis. It does not establish an unconditional rule: a native counterexample with the identical South observation reverses the result by 225 points. No runtime selector, live default, game rule or coach UI changed.

[Predeclared protocol](../../../planning/implementation/coach-lab/trix-king-discard.md), [operator](../../../scripts/coach-lab-king-discard.mjs), [native comparison and counterexamples](../../../server/internal/games/trix/king_discard_test.go), [previous North lead comparison](trix-king-return.md).

## What was compared

North leads 3♦, West discards 6♠, and South must choose. South's remaining cards are A♣/3♣/4♣/5♣/6♣ and K♥/2♥/3♥/4♥/5♥/6♥. South has publicly doubled K♥. The earlier tricks prove South and West are diamond-void. South does not see North's remaining diamonds and cannot know for certain that East will overtake.

The operator extracts only South's original observation at CFL-12 actor-record ordinal 16. It generates fresh South-compatible allocations, rather than reusing North's private-information-conditioned worlds. Compare all eleven legal roots on each same allocation, then let every acting seat use its own observation and the fixed deterministic policy through all thirteen tricks. Full team points include the already-completed tricks and all later penalties/bonuses.

Baseline selects K♥ at this root; Ownership Comparison selects A♣. These are unchanged policies, and their names do not imply a strength ranking. Basic and Complex use separate samples. The two streams are independent seed streams from one consumed position, not new scenario families or a strength-validation set.

This is the original authored South position, **not** the CFL-13 adverse sampled world where West played A♥. North's 3♦ was an imposed witness choice; both policies selected 2♠ at the earlier North root. Therefore the example is useful for “if my partner made this return” reasoning, but supplies no empirical proof that a natural bot intended a king escape. Later behavioral calibration must include naturally selected actions.

## Results

Mean full NS request-point changes for **K♥ versus A♣**; positive favors releasing the king now. P and C each contain sixteen worlds. Other roots are retained in `summary.json`.

| Variant | NS / EW continuation policy | P gain | C gain | Better worlds P / C |
| --- | --- | ---: | ---: | --- |
| Basic | Baseline / Baseline | +28.125 | +42.1875 | 2/16 / 3/16 |
| Basic | Comparison / Comparison | +84.375 | +84.375 | 6/16 / 6/16 |
| Basic | Comparison / Baseline | +70.3125 | +84.375 | 5/16 / 6/16 |
| Basic | Baseline / Comparison | +28.125 | +42.1875 | 2/16 / 3/16 |
| Complex | Baseline / Baseline | +70.3125 | +42.1875 | 5/16 / 3/16 |
| Complex | Comparison / Comparison | +70.3125 | +56.25 | 5/16 / 4/16 |
| Complex | Comparison / Baseline | +70.3125 | +56.25 | 5/16 / 4/16 |
| Complex | Baseline / Comparison | +70.3125 | +56.25 | 5/16 / 4/16 |

Every remaining comparison against A♣ ties; none of these sampled worlds is worse. East wins the immediate K♥ in all 32 sampled allocations per variant. Basic then gives NS +75. Complex king net points are also +75, while other penalties still determine the final team total. In this experiment the positive K♥−A♣ differences are exactly 225 points; the non-king component totals match within each of those paired comparisons. This does not generalize to different leads or hands.

An improvement over A♣ is an improvement over the Comparison policy's selected root here. Baseline already selects K♥, so that comparison produces **zero action change or root gain for Baseline**. Future continuation policies still affect outcomes; compare roots within one environment before attributing a difference to the immediate decision.

Examples in `study.json`, both under `all-comparison`:

- Basic, primary world 2: K♥ is captured by East on trick 3, NS +75. A♣ retains K♥ until North captures it on trick 6, NS −150. Allocation digest `d6cd5eec05e2e5249d2c1680d88131700fd986fe1eb36ff81aced25eea523bcd`.
- Complex, primary world 1: K♥ now gives NS +10 overall, versus −215 after A♣ and North's later king capture on trick 5. Both roots incur −20 diamond and −45 trick points; the 225-point difference is entirely the king and bonus. Allocation digest `c80a0d5193926cb19f112296ec8f1a3f3b756fe83c8001cdcb57cd634b1c6fb7`.

## Why this is still uncertain

The new twin exchanges East's 5♦/6♦ with North's 8♥/9♥ in the authored deal and legally replays the same prefix. South's complete observation, legal actions, semantic digest, selected action and saved explanation stay equal.

- Original: East must follow diamonds and captures an immediately discarded K♥.
- Twin: East is diamond-void; North must capture that K♥. Under all four fixed continuations, playing A♣ instead lets West capture K♥ on trick 4. Basic gives +75 instead of −150; Complex gives −10 instead of −235. The 225-point reversal is asserted by native tests.

The twin is not an equally weighted extra sampled world. From South's constraints, the exact uniform-allocation count is 211,373,057,896; 327,202,876 leave East diamond-void: **1/646**, about 0.155%. This calculation includes East's publicly implied H7 from the opening-owner rule. Native counting and an independent combinatorial calculation agree.

That fraction describes the declared uniform feasible-allocation measure, not real-player calibrated odds or North's intent. The exact king-component mean for immediate K♥ under that measure is about +74.6517, rather than the sampled +75. Keeping K♥ also needs outcome comparison; the positive immediate expectation alone does not prove it is the better discard. The current sample missed the rare adverse class, which is why a separate counterexample and later stratified comparison matter.

## How inferred hints fit the next step

The owner correctly identified a remaining gap. Existing history code records conditional signals such as a king double, voluntary heart leads and voluntary/repeated Jacks placements, but **those signals do not yet weight action scores or hidden-card allocations**. The current sampler uses known cards, public chronology, declarations, counts and proven voids. Continuations are policy-dependent, but there is no implemented likelihood that North chose 3♦ specifically to help South.

Use this completed comparison as the reference for the next deterministic inference experiment:

1. Reconstruct North's choice from North's hypothetical move-time information in each feasible world. Compare a cooperative king-release interpretation with self-protection, other Complex objectives and imperfect play. Keep assumptions visible; do not use the actual private hand. Cards revealed by South's current turn may constrain the hypothetical earlier holdings, but those later events must not appear in North's reconstructed earlier observation.
2. Give forced choices no extra preference evidence. Give every feasible legal choice positive likelihood so a different plan or mistake never becomes impossible. Freeze the likelihood assumptions and test sensitivity; current bot choices are hypotheses, not expert labels.
3. Preserve both East-void and East-has-diamonds classes with correct allocation weights. Compare all legal discards and full team scores against this reference. A small sample with no adverse worlds cannot validate the rare class.
4. If the improvement survives those checks, build a separately versioned coordinated lead/response candidate with one deterministic action and evidence record for both bot and coach. Validate on fresh natural lead/response sequences and other distributions before any live default change.

This milestone completes the actor-only discard comparison. Behavioral weighting, a coordinated candidate and broader strength validation remain unfinished; no LLM or learned decision model has been added.

## Run it locally

No browser, application server, database, API key or model is required. From PowerShell:

```powershell
Set-Location C:\repos\test-jev
node scripts/windows-env.mjs go test ./server/internal/games/trix -run '^TestKing(Discard|Return|Scenario)' -count=1 -timeout=120s
node --test --test-isolation=none web/tests/coach-lab-king-discard.test.ts
node scripts/coach-lab-king-discard.mjs --out .local/evaluation/coach-lab/king-discard-work/my-first-discard-study
```

Use a fresh output name. The operator verifies the frozen CFL-12 `king-20261010-v3` study hash, source receipt and retained executable before extracting the two South observations. For an identical regenerated archive use `--source .local/evaluation/coach-lab/king-scenario-work/NEW-SOURCE`; different study bytes are rejected. If that archive is absent, follow the [CFL-12 reproduction instructions](trix-king-scenarios.md) first.

Read `invocation.json` first: `status: passed` and `sourceUnchanged: true` are required. `report.md` compares K♥/A♣; `summary.json` includes all eleven cards; `study.json` contains full ledgers and hypothetical first-trick outcomes. `actor-input.json`, `protocol.json` and `builds/` preserve the exact inputs, limits and code. Outputs remain private and cannot overwrite older evidence.

After implementation changes run `npm run lab:check`. This checks integration; it does not automatically execute the opt-in campaign.

## Evidence and checks

- Accepted final campaign: `.local/evaluation/coach-lab/king-discard-work/discard-20261010-v2/`; build 1.802 s, study invocation 6.735 s. Both cases completed 32/32 worlds, 59,136 plays each. Output is 29,822,221 bytes; 441 source files and the exact executable are retained.
- Actor input digest: `b408202b9faf0748974aefda56c1af3820cb2f8db8ba07ef995e8284ab56494c`.
- Source digest: `1f03cd33259afbadf46f619213e3c79ac448354849662ef0f99baf3c9ce12a2b`.
- Binary digest: `a16cfafd63d777de7647bcc123561c565bc0a63d1889fa60d7f15487afd7df4f`.
- Study digest: `3d14b8ebbd064b81aa511e0ddd799f3782386ee5e66384473c7da041e5a802ce`.
- The earlier `discard-20261010-v1` run is retained. Review tightened reported king timing against both native ledger entries before V2. V1 and V2 have byte-identical actor inputs, native binaries and study output; the change affects report validation, not outcomes. They are repeated execution evidence, not additional sampled families or trials.
- Focused native `TestKing(Discard|Return|Scenario)` passed in 2.900 s, including strict input, actor/trace equality, full native reconstruction, all-response twin captures, the 225-point adverse continuation, paired incomplete work and exact allocation counts.
- Seven focused Node tests passed, covering archive binding, full accounting, partial-trick chronology, malformed timing, incomplete reports and source receipts. CLI `--help` passed.
- Independent implementation review found and corrected the captor-order label and deferred king-timing validation. The final read-only audit verified both retained build graphs, every continuation ledger, all summaries, all 256 HK/A♣ pairs, input/result repeatability and the report's table/examples. No remaining concrete defect was found.
- Integrated `npm run lab:check` passed in 273.003 s: 110 Node tests, seven native packages, both generated-contract checks and both TypeScript projects. Source digests before/after match. Receipt: `.local/evaluation/coach-lab/checks/2026-10-10T22-37-36.021Z.json`; the native lab package took 258.580 s and Trix took 49.299 s.
- Thirty-three local documentation links and `git diff --check` passed. No live model, UI, runtime-policy promotion or fresh-family strength experiment was run.
