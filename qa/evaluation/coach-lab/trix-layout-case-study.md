# Saved Trix Jacks case: J♦ versus 10♠

Status: bounded native diagnostic completed against unchanged frozen source on 9 October 2026. All legal alternatives were compared. No policy weight or default changed, and no promotion or strategic strength claim follows.

The immutable case is `case-bdf5b9cd6d1b3ecf9e46e2d154dd89bf`, revision 4, actor 3 in Complex Partners. Its original policy is `trix-deterministic-1.0.0`; it chose `layout:DJ`. The exact historical profile remains module `2.1.0`, rules `trix-complex-partners-1.1.0`, public observation `1.1.0`. The named fixture is `server/internal/games/trix/testdata/layout-jacks-jd-s10.json`.

The actor held C4/C7/C10/CQ/CA, D6/D9/DJ, H6/HK, S3/S10/SK. The board contained HJ/HQ and SJ, with clubs and diamonds unopened. Hand counts were 12/12/12/13, no pass had occurred, and hidden twos counts were 0/2/2/0. The complete legal set was J♦, K♥ and 10♠. No actual opposing hand, deal seed, later outcome, or later layout chronology enters the study input.

## Protocol and reproducibility

`scripts/coach-lab-layout-case.mjs` binds the named fixture to the original export and matching manifest. It rejects altered actor packets, duplicate cases, changed action payloads, a different original choice/policy, and mismatched historical pins. The script creates a new private output directory, records archive hashes and source hashes, compiles a retained native test binary, and records its hash. Source changes during execution make the invocation unverified.

Run from `C:\repos\test-jev` after native sources are frozen:

```powershell
node scripts/coach-lab-layout-case.mjs --out .local/evaluation/coach-lab/layout-history-work/jacks-jd-s10-study-20261009
```

Use a fresh output directory for a repeat; the tool refuses to overwrite retained evidence. Defaults reference the original archive:

- Manifest: `.local/evaluation/coach-lab/studies/cfl-complex-development-20261009/manifests/cell-b331aaa44576635353f8.json`.
- Decisions: `.local/evaluation/coach-lab/studies/cfl-complex-development-20261009/runs/cell-b331aaa44576635353f8/exports/aae59bae98b96af3f8d55756/decisions.jsonl`.

The fixed work is **32 feasible synthetic worlds per stream**, for `comparison` and `layout-confirmation`. Every world is reused across all three legal roots and all four deterministic populations: all baseline, all reasoning, all history, and EW reasoning with NS baseline. The first stream retains the original observation-derived sampling stream. The second uses a separate deterministic stream derived from the same frozen observation. There are 64 sampled worlds, 256 population/world records and 768 root request-end continuations, plus a separate targeted nearby-state search. These are not independent origin families.

Sampling uses the existing native hard constraints and bounded history witness. Each future selector receives `Observe(branch, actor)` only. The harness rejects a historical continuation that silently gains public 1.2 chronology. All candidate values use native request-end team margin, EW points minus NS points, and record finish order and team totals. Differences are paired against the saved J♦ root within each identical world. Each population/stream reports mean, observed minimum/maximum and improved/tied/worsened counts for every legal alternative.

The aggregate sampler allowance is 16,000,000 operations; the native step allowance is 1,000,000. Binary compilation has a 300-second process-tree watchdog. The native study has a 900-second process-tree watchdog and a 15-minute Go deadline. Partial work retains an incomplete result and cannot establish a preference.

Nearby examples start from a sampled synthetic native witness, play K♥, then advance at most twelve native baseline turns. The search retains up to eight states where both debated cards remain legal and 10♠ gives a worse baseline continuation margin than J♦. Those states, paths, own observations, exact pins, finish orders and scores remain private in `study.json`; they are selected counterexamples and are not pooled into the frozen-root means.

## Verified reconstruction

All three existing policies select J♦ from the archived actor packet. The saved reasoning trace assigns heuristic values **5 to J♦, 0 to K♥ and 3 to 10♠**. J♦ opens no immediately adjacent own card: the heuristic rewards distant D9/D6, then subtracts one for opening a jack. The other two roots also immediately open no own card, and this early observation cannot prove a single external holder for the new frontier. The history policy adds no exact penalty-end tactic in a layout turn. The saved case is therefore **not already handled** by the reasoning/history candidate.

The original two-world smoke is reproduced exactly: semantic actor evaluation digest `b633a83217c675253bbe8a64744d857dbf41618678b8b9efcfb832894a9338a7`, root margins `[-100,-100,-100]` and `[-100,-100,200]` in J♦/K♥/10♠ order. Hence the original 10♠ differences remain 0 and +300. That is a reproducible hypothesis, not an action correctness label.

Focused verification completed:

```powershell
node --test --test-isolation=none web/tests/coach-lab-layout-case.test.ts
node scripts/bounded-native-run.mjs --seconds=180 -- node scripts/windows-env.mjs go test ./server/internal/games/trix -run '^TestLayoutCaseStudy(ArchivedSelection|PairedSignAccounting|ReproducesArchivedTwoWorldSmoke|NativeRootsMatchSavedScoring)$' -count=1 -timeout=120s
```

The three Node binding regressions and four focused native checks passed, including signed paired harm accounting, exact archive reproduction, and the study's own root loop matching the archived native scores while retaining all four finishers and both team totals. Broader integration verification is recorded in [chronology acceptance](trix-layout-history-acceptance.md).

## Expanded results

The run completed with **64 shared sampled worlds**, 256 population/world records and **768 root continuations**. It used 435,613 sampler operations, 63,621 native steps including the separate nearby search, and 936 allocation attempts. Native execution took 2,704.681 ms; compilation took 1,749.172 ms. Both watchdog receipts passed without timeout or censoring. Source hashes before and after are identical. The retained binary SHA-256 is `4a3d72ff5229c1e795e0014f2bb50d7f16edc4e8be826dd891f256abff82f7f3`.

Every table row compares its alternative with J♦ on the **same 32 worlds within that stream**. Positive/zero/negative counts describe paired margin differences; extrema are observed values, not confidence bounds. J♦ is the reference and has zero difference in all 32 worlds for every population/stream.

| Stream | Population | Alternative | Mean | Minimum | Maximum | Improved / tied / worsened |
| --- | --- | --- | ---: | ---: | ---: | --- |
| comparison | baseline | K♥ | 12.500 | −100 | +400 | 4 / 23 / 5 |
| comparison | baseline | 10♠ | 6.250 | −200 | +300 | 5 / 20 / 7 |
| comparison | reasoning | K♥ | 15.625 | −200 | +400 | 4 / 26 / 2 |
| comparison | reasoning | 10♠ | 37.500 | −200 | +300 | 7 / 23 / 2 |
| comparison | history | K♥ | 15.625 | −200 | +400 | 4 / 26 / 2 |
| comparison | history | 10♠ | 37.500 | −200 | +300 | 7 / 23 / 2 |
| comparison | mixed EW reasoning | K♥ | 18.750 | −200 | +400 | 5 / 23 / 4 |
| comparison | mixed EW reasoning | 10♠ | 18.750 | −200 | +300 | 6 / 21 / 5 |
| layout-confirmation | baseline | K♥ | 0.000 | −300 | +200 | 8 / 17 / 7 |
| layout-confirmation | baseline | 10♠ | 25.000 | −100 | +400 | 6 / 22 / 4 |
| layout-confirmation | reasoning | K♥ | 12.500 | −300 | +200 | 8 / 19 / 5 |
| layout-confirmation | reasoning | 10♠ | 25.000 | −200 | +400 | 8 / 21 / 3 |
| layout-confirmation | history | K♥ | 12.500 | −300 | +200 | 8 / 19 / 5 |
| layout-confirmation | history | 10♠ | 25.000 | −200 | +400 | 8 / 21 / 3 |
| layout-confirmation | mixed EW reasoning | K♥ | 9.375 | −300 | +300 | 8 / 17 / 7 |
| layout-confirmation | mixed EW reasoning | 10♠ | 37.500 | −100 | +400 | 7 / 24 / 1 |

The original two-world 10♠ mean of +150 falls to +6.25 on the expanded baseline comparison stream. There, 10♠ improves five worlds and worsens seven; the larger positive outcomes produce a positive mean despite more losing than improving worlds. K♥ has a higher mean in that cell. The reasoning continuation raises the comparison-stream 10♠ mean to +37.5, while the confirmation stream gives +25. History and reasoning rows are identical in this layout request, as expected from the narrow penalty-ending tactic's scope. The mixed population differs despite sharing every world. These observations expose population and stream sensitivity; four populations are not four independent strategy families.

## Legal counterexamples

There are harmful 10♠ worlds at the **unchanged frozen actor input**, so a different hand or public state is not required to refute universal superiority. For example, baseline `comparison` ordinal 18, world digest `162fcd7572f935ae54c8c72bf63fd76c5db227770b0eefc8f40da5a50e9a6438`, finishes as follows:

| Root | Finish order, seats first to last | EW total | NS total | EW − NS |
| --- | --- | ---: | ---: | ---: |
| J♦ | 3, 1, 2, 0 | 350 | 150 | +200 |
| K♥ | 3, 2, 1, 0 | 300 | 200 | +100 |
| 10♠ | 3, 2, 1, 0 | 300 | 200 | +100 |

That actor still finishes first after either debated root, but 10♠ costs 100 team-margin points because the teammate finishes later. This is a feasible synthetic world, never the archived actual hand supplied as a decision oracle.

The separate nearby search retained **eight native legal counterexamples**. Two illustrative entries are:

| Nearby ID | Public path from frozen root, seats 3 → 2 → 1 → 0 | Legal roots at actor 3's next turn | J♦ finish order; EW/NS totals | 10♠ finish order; EW/NS totals | Difference |
| --- | --- | --- | --- | --- | ---: |
| `nearby-54906966c825` | K♥, A♥, pass, 10♥ | J♦, 10♠ | 0,1,3,2; 250/250 | 0,3,2,1; 200/300 | −100 |
| `nearby-1271c8adad17` | K♥, A♥, J♣, 10♥ | 10♣, Q♣, J♦, 10♠ | 1,0,3,2; 300/200 | 3,2,0,1; 250/250 | −100 |

In the first nearby case, the actor finishes second with 10♠ instead of third with J♦, yet the team scores less. In the second, the actor finishes first instead of third, while the teammate falls from first to last. The second case's reasoning choice is 10♣; all four legal roots are retained, and 10♣/Q♣/J♦ each gives +100 margin under this particular baseline continuation while 10♠ gives zero. The examples remain module 2.1/public 1.1, with twos naturally revealed after the opening circuit. Their synthetic private states, exact own observations and complete paths are saved separately, and never pooled into the frozen-case means.

## Classification and next hypothesis

| Question | Finding |
| --- | --- |
| Already handled by the current reasoning/history candidate? | No: all three policies choose the saved J♦ root. |
| Reproducible disagreement with the current heuristic? | Yes: the bounded conditional 10♠ mean exceeds J♦ in every tested population/stream, with exact retained native outcomes. |
| Verified strategic weakness or a safe universal replacement? | Uncertain: all eight 10♠ cells contain harm, the ranking depends on continuations/stream, and baseline comparison even gives K♥ a larger mean. |
| Change strategy weights now? | No. One observation and an uncalibrated feasible-world sampler do not validate a general rule or its expected team benefit. |

Harmful worlds do not automatically disqualify a rule that improves expected team score. A useful probabilistic rule need not predict every hidden hand or win every scenario. It needs an explicit objective, justified assumptions about plausible hands and player behavior, fresh varied cases, and checks for costly failures. The present results justify that next experiment; they do not yet settle the tradeoff.

The next rule hypothesis to test is a **conditional frontier/bottleneck comparison**: assess how releasing a frontier changes reachable own-card paths and publicly constrained teammate openings, while considering which other seats can use the new frontier before the team finishes. Distant same-suit card counts alone may miss that timing. This is a feature/evaluation hypothesis, not an implemented weight or a claim that 10♠ should always precede a jack. Define a concrete versioned rule, test its triggers on fresh legal observations and include these harmful examples before changing selection. Newly captured chronology may support additional actor-safe conditional signals in its own profile; it supplies no missing ownership history for this archive.

Retained evidence is `.local/evaluation/coach-lab/layout-history-work/jacks-jd-s10-study-20261009/`: `study.json`, `invocation.json`, `actor-input.json`, `source-before.json`, `source-after.json`, `build.log`, `study.log`, and `layout-study.exe`. The receipt also saves the binary invocation and input/output environment paths for replay. Original study archives were not modified.

This conditional sampler is not a calibrated behavioral belief model. A positive sample mean cannot establish dominance over every feasible deal or prove stronger play. The nearby search is selected counterexample coverage, not a prevalence estimate. New chronological observations and behavioral signals belong to their separately versioned profile and cannot be backfilled into this archive. Independent human acceptable-action judgments, statistical strength validation and promotion remain separate work.
