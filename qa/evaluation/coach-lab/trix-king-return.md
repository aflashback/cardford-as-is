# CFL-13: King partner-return comparison

10 October 2026. The fixed comparison completed successfully: **two actor positions, 64 sampled allocations, 2,816 complete continuations and 123,904 native continuation plays**. Each variant has 32 distinct sampled allocations; all eleven legal roots and four fixed policy environments use each same allocation. The source and actor input remained unchanged.

The proposed blanket lead change is **not supported**. Results depend strongly on the partner's response, and some Complex outcomes reverse despite successful king escape. No runtime policy, rule profile, historical advice or live default was changed.

[Protocol](../../../planning/implementation/coach-lab/trix-king-return.md), [original scenario family](trix-king-scenarios.md), [operator](../../../scripts/coach-lab-king-return.mjs), [native comparison](../../../server/internal/games/trix/king_return_test.go).

## What the comparison asks

North is about to lead the third trick. It holds 3♦/7♦/9♦/10♦/J♦/Q♦, 8♥/9♥/10♥ and 2♠/3♠. South has publicly doubled K♥. The first two tricks show South and West are diamond-void. North's own cards and the public history place the outside 5♦/6♦ with East, so 3♦ must lose to East.

All four profiles choose 2♠ at this root before intervention. The lab compares 3♦, 2♠ and every other legal card. Later moves follow the declared policy from each acting seat's observation; South is never instructed to discard K♥.

The sampled hands preserve North's knowledge, not South's authored six-heart shape. Basic and Complex are separate samples. These are two variants of one consumed development position, not 64 independent games, exhaustive coverage or a behavioral probability model.

## Results by stream and environment

Values below are mean changes in **complete NS request points** for 3♦ versus 2♠. Negative is worse. P and C are the two separately seeded streams; each contains sixteen worlds.

| Variant | NS policy / EW policy | P delta | C delta | South releases K♥ immediately, P / C |
| --- | --- | ---: | ---: | --- |
| Basic | Baseline / Baseline | +14.0625 | 0 | 16/16 / 16/16 |
| Basic | Comparison / Comparison | −84.375 | −28.125 | 0/16 / 0/16 |
| Basic | Comparison / Baseline | −84.375 | −70.3125 | 0/16 / 0/16 |
| Basic | Baseline / Comparison | +14.0625 | 0 | 16/16 / 16/16 |
| Complex | Baseline / Baseline | +60 | +86.5625 | 16/16 / 16/16 |
| Complex | Comparison / Comparison | −38.4375 | −22.5 | 0/16 / 0/16 |
| Complex | Comparison / Baseline | +4.375 | −32.5 | 0/16 / 0/16 |
| Complex | Baseline / Comparison | +64.6875 | +93.75 | 16/16 / 16/16 |

“Comparison” means the unchanged `trix-ownership-comparison-1.0.0` experimental policy, not a claim that it is stronger. The same worlds repeat across environments; do not count those repeats as independent evidence or pool the environments into one accuracy rate. Both policies selected 2♠ here, so comparison with each profile's current root yields the same deltas in this study.

**Basic, Baseline partner:** 3♦ always obtains +75 for NS. It is better than 2♠ on one of the sixteen primary worlds and tied on the other fifteen; all sixteen confirmation worlds tie. Given this specific public position and Baseline's guaranteed off-suit K♥ discard, +75 is the king request's maximum NS score. That conditional bound does not establish strict improvement on most worlds or transfer to another partner's response.

**Comparison partner:** South withholds K♥ on every immediate 3♦ opportunity in both variants and both streams. The reasoning policy sees its teammate currently winning the trick and penalizes feeding that teammate the doubled king. North can prove East will overtake using North's private diamonds, but South cannot inherit those cards as knowledge. A lead-only change leaves this coordination gap unresolved.

The environments also change later decisions. Their full-score differences cannot be attributed solely to South's immediate discard, and withholding is not established as a mistake from South's information. The next experiment must hold continuations fixed while comparing South's legal choices.

**Complex:** Better average scores with a Baseline partner still include harmful outcomes. Both leads can release K♥ to opponents, yet change later diamond/trick costs. The all-Comparison environment is worse on average in both streams; the mixed NS-Comparison environment reverses direction between streams. This fails the protocol's condition for adopting a general action-changing rule.

**A higher diamond is an essential counterexample:** Baseline South also discards K♥ after 7♦, but 7♦ stays above East's 5♦/6♦ and North takes the king. Every sampled Basic continuation with a Baseline NS pair then scores −150 instead of the +75 secured by 3♦. “Return diamonds” and “discard the king whenever void” are each inadequate rules on their own.

## Preserved adverse examples

All references are within `.local/evaluation/coach-lab/king-return-work/return-20261010-v1/study.json`. Identify case, stream, ordinal and profile; roots are `play:D3` and `play:S2`. These are simulated continuation outcomes, not facts available at the original decision.

| Case and reference | Observed consequence |
| --- | --- |
| Basic, primary world 3, `all-comparison` | After 3♦, West plays A♥, South A♣, East 5♦. South retains K♥ and later captures it on trick 8: NS −150. The 2♠ branch eventually gives K♥ to West: NS +75. Paired loss −225. |
| Basic, primary world 3, `ns-comparison` | Same initial missed release, K♥ eventually self-captured on trick 13. NS −150 versus +75; paired loss −225. |
| Complex, primary world 3, `all-baseline` | Both roots escape K♥. 3♦ yields NS −115 versus −65 for 2♠: −20 extra diamond points and −30 extra trick points. Paired loss −50. |
| Complex, primary world 3, `ns-baseline` | Same −50 consequence under the other declared opponent policy. |

Basic primary world 3 allocation digest: `6032c66a363cbc298faab3995da1c69d352cce21514fc32b3a6fbc7e4aba97e2`.

Complex primary world 3 allocation digest: `2c9d485dcd105b05ee5612976e8b5fce87ed03982bc5586855fc219e38ac6f66`.

## What should change next

Keep the lead-only hypothesis unimplemented. The next experiment should isolate **South's discard decision** after a low partner return, using South's own observation and separate plausible worlds. Compare releasing K♥ with the current discard, then test a coupled lead/response candidate if justified. Reconstruct the exact recorded world/prefix with the retained sampler and build; never feed North's private hand into South's input.

Retain these guard cases before considering a new shared bot/coach rule:

1. Partner's low lead can be overtaken, but that is not always proof that an opponent must overtake.
2. Partner's higher lead, such as 7♦ here, stays winning and makes a king dump harmful.
3. Public evidence proves an opponent must win from the **acting player's** information.
4. Ownership remains uncertain; use explicit conditional inference and full-outcome comparison rather than certainty or a fabricated percentage.
5. Full Complex costs can outweigh an earlier king release.

If a deterministic candidate emerges, its bot action and coach explanation must share the same saved evidence. The cue can recommend a concrete move; the optional reason must distinguish known voids/played cards from a conditional reading of the partner's plan. No language model selects an action. Fresh variations and complete-session validation remain required before a live change.

One fresh counterexample proposed by the tactical review is to exchange East's 5♦/6♦ with North's 8♥/9♥ in the original authored deal, retaining the same first eight plays and then North 3♦/West 6♠. South's own cards and visible history stay the same, while East becomes diamond-void and North's diamond stays winning. Add this as a native actor-observation twin test in the next milestone before creating unconditional discard advice. This proposed extension was not part of the frozen two-case campaign and has not been executed as a new native case here.

## Run it locally

No browser, server, database, API key or model is required. From PowerShell:

```powershell
Set-Location C:\repos\test-jev
node scripts/windows-env.mjs go test ./server/internal/games/trix -run '^TestKing(Return|Scenario)' -count=1 -timeout=90s
node --test --test-isolation=none web/tests/coach-lab-king-return.test.ts
node scripts/coach-lab-king-return.mjs --out .local/evaluation/coach-lab/king-return-work/my-first-return-study
```

Use a fresh output name every time. The default source is the retained CFL-12 `king-20261010-v3` archive. The operator verifies its exact study hash and retained build before extracting only the two scoped North observations. To use an identical regenerated CFL-12 archive, supply `--source .local/evaluation/coach-lab/king-scenario-work/NEW-SOURCE`; changed study bytes are deliberately rejected by this fixed protocol. If the archive is missing, reproduce it with the [CFL-12 operator](trix-king-scenarios.md) first. New cases or a changed protocol need an explicitly versioned extension.

Inspect `invocation.json` first: `passed` and `sourceUnchanged: true` are required. Open `report.md` for the proposed-return table, `summary.json` for all legal roots and separate stream results, and `study.json` for public first-trick plays, king timing and native ledgers. `actor-input.json` contains only North's two original observations; `protocol.json` and `builds/` retain the exact experiment and executable sources. Output stays private and old runs cannot be overwritten.

Run `npm run lab:check` after implementation changes. The opt-in campaign is not automatically rerun by that gate.

## Evidence and checks

- Accepted campaign: `.local/evaluation/coach-lab/king-return-work/return-20261010-v1/`; build 2.984 s, native study 8.919 s; 32/32 complete sampled worlds per variant, 61,952 continuation plays per variant; no repeated allocation within either variant. Native output 29,839,458 bytes.
- Actor input digest: `3e662f2951df395f7e51135dda397c24d5fd9981df185f0a805e034918e1d9a9`.
- Source digest: `3057ffcd2d576c272b89b0e5c608c828b8486864a56f00c66ff6619a04fd79fc`.
- Study digest: `eb74aba0a4c3bad6df13e28ed1c35a18481ebe60a76b07fa1a34884f8ed12475`.
- Focused native `TestKing(Return|Scenario)` passed, 1.829 s; strict input, full native replay, common worlds, semantic identity/JSON roundtrip, literal team/king arithmetic, and incomplete paired-world retention covered.
- Five Node binder/reporting tests passed, 0.141 s; server TypeScript check passed. Binder was also exercised against the actual frozen archive before the campaign.
- Independent tactical and implementation reviews found no concrete defects. The saved-evidence audit verified archive/input/study hashes, all 438 retained comparison source files, the 436-file original archive bundle, both retained binaries, all 2,816 continuation ledgers and every summary statistic.
- Integrated `npm run lab:check` passed: 103 Node tests, seven native packages, both generated-contract checks and both TypeScript projects. Receipt: `.local/evaluation/coach-lab/checks/2026-10-10T22-08-04.921Z.json`; unchanged source during the gate. The native lab package took 331.452 s. Forty-two local document links and `git diff --check` also passed.

This milestone is an offline diagnostic and a rejected general lead-rule hypothesis. It contains no AI integration, automatic correctness labels, fresh strength validation or live promotion.
