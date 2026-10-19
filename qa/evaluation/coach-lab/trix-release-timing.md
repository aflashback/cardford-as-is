# CFL-11: partner-release timing and comparative advice

Implemented and exercised on 2026-10-10 in `C:\repos\test-jev`. [Predeclared scope](../../../planning/implementation/coach-lab/trix-release-timing.md), [fixed archive references](../../../planning/implementation/coach-lab/trix-release-timing-cases.json).

## Result and decision

The lab can now compare larger Jacks positions without a browser, using only the player's saved information. The new diagnostic measures the difference between making a card available, its eventual placement, and final team points. A separate opt-in explanation revision fixes the observed Complex cue while keeping every action and heuristic score unchanged.

**Do not change the partner-release action rule from this iteration.** The actual PH-07 session lost 50 team points, but its saved decision-time information admits other deals where the same release helps. The bounded sampled comparison does not support automatically replacing S3 with H10. It also does not establish that S3 is optimal or that Ownership is stronger overall.

| Case | Verified diagnostic finding | What it supports |
| --- | --- | --- |
| PH-07: S3 versus H10 | 32 distinct sampled worlds. In seven of eight continuation profiles S3 is better in 7, tied in 21 and worse in 4; mean +9.375 team request points. All-Ownership is better in 8, tied in 20 and worse in 4; mean +10.9375. | Mixed risk; the actual loss alone does not establish a bad choice. No new timing threshold. |
| Consumed neutral: C3 versus D6 | Same final team points in all 32 sampled worlds under all eight profiles. | Releasing the partner earlier need not improve finishing awards. |
| The neutral case's third legal move, S5 | Mean −56.25 to −62.5 team points by stream/profile; some worlds tie or favor it. | Keep all legal alternatives in the comparison; this remains conditional diagnostic evidence. |
| Protected all-four-twos ending | Existing exact corpus still gives team 250 under Ownership versus 150 under History after common C3, across all three feasible allocations. Actor remains at 100. | Preserve the later D3/H3/S3-before-CK sequence, not merely the initial C3. |
| Actual Complex S5/H3 explanation | S5 stays selected at 0 versus H3 at −8; opponent H2 ownership is proved, and neither action opens another own card. | Correct the reason without changing selection. |

PH-07 stream results are reported separately in the private report. Primary: S3 versus H10 gives 4 better / 10 tied / 2 worse in seven profiles, and 5 / 9 / 2 under all-Ownership. Second stream: 3 / 11 / 2 in every profile. Each stream has 16 worlds. The second stream checks sampling sensitivity; it is not a new independent game-origin validation sample. Eight profiles reuse the same worlds and are not independent repetitions.

For the baseline-opponents/History-continuation profile, S3 makes S2 available earlier in all 32 worlds, but S2 is actually played earlier in only seven. In the neutral case, C3 makes C2 available earlier in all 32 and played earlier in 31, while the team award still ties in every world. These are hypothetical continuation timings, not extra facts the original player knew.

In the four harmed PH-07 samples under that profile, the actor loses one finishing place and the partner's award stays unchanged. The original observed session instead lost a partner finishing place. The samples therefore show possible risks, but do not reproduce the actual concealed deal or establish the cause of its loss. In another sampled pair the partner loses 50 while the actor gains 150, for a net team gain of 100; individual speed remains an insufficient objective.

The sampler uses public hard constraints, not a calibrated likelihood model of player intentions. Means describe these sampled allocations and fixed continuations. No action has received an independent human acceptable-action label, and there is no new strength or promotion claim. The former fresh-validation neutral origin is now consumed development evidence.

## Implementation

- `EvaluateJacksTiming` is an additive offline API. Two fixed, versioned streams share each sampled world across every legal root and declared profile. Future policies receive only their own observations. Fully paired worlds commit atomically; incomplete runs suppress aggregate ranking. Native awards retain separate own, partner, team and margin units.
- Full available current chronology is required. Historical records cannot acquire missing history. The old exhaustive small-ending evaluator is unchanged.
- The operator pins manifest and exact decision-record bytes before extracting the actor packet. Archive outcomes, private journals and full deals are excluded from the native input. It retains source/binary bytes, protocol, input/output digests and invocation receipts. Timing summaries check every placement against public availability events and native turn offsets.
- `trix-ownership-comparison-1.0.0` inherits Ownership's candidates, scores, selected action and tie order exactly. Trace `1.4.0`, cue `trix-ownership-comparison-cues-1.0.0` and typed comparison evidence preserve the new presentation separately. All legacy trace/message/advice bytes remain unchanged.
- Actual archived cue: **Play 5 of spades - avoid opening the opponent's 2 of hearts.** Its reason includes the H3→H2 alternative support and states that the heuristic difference does not prove a better final team finish. Forced moves, ties and mixed contributions retain qualified explanations.
- Bots and the coach continue sharing deterministic selection. No model, UI or live-default change was made.

## Recorded execution

New sampled diagnostic: `.local/evaluation/coach-lab/release-timing-work/timing-20261010-v1/`.

- Completed both cases: 64 sampled worlds, all distinct within their case; 1,280 legal-root/profile continuations (512 PH-07 and 768 neutral). No retries, incomplete worlds or adaptive extension.
- PH-07: 144,052 sampler operations, 16,147 native steps. Neutral: 41,045 sampler operations, 20,449 native steps.
- Native invocation 14.207 seconds; build 3.083 seconds. Both below their separately declared 300-second caps. Source unchanged.
- Source digest: `5952096982177f29fb16528e2ad0189e1cdfd67234279cd429c936651976021f`.
- Binary digest: `de32627829d5fdb352ef4f4787276b5a1c1fba59253cae29f47fb6c989746f01`.
- Native input digest: `443d5073abe939c3a4b699bf1caf8d37607826136200342aa401da2c0b897b4a`.
- Study digest: `ddd240a40236bad3345c4a69b8ceba7f05a8799eb8d3b28362d16975b73f1d35`.

Protected exact-ending rerun: `.local/evaluation/coach-lab/tempo-work/endings-20261010-cfl11/`. Seven case entries completed. Native invocation 5.073 seconds; build 3.329 seconds. Source unchanged. Study digest `bdafe4aea1479631c7877a6c20b3e42570a5b0c49bed4ab8740dbe924a8f874c`. Reachable no-twos, forced and Solo cases remain separate.

Independent read-only audit recomputed archive byte pins, retained source/binary/study hashes, semantic input identities, all paired awards and sampled summaries. The exact-ending study is byte-identical to the retained CFL-09 result: seven case entries and 106 allocation rows. These include repeated semantic counterexample observations; this is regression evidence, not 106 new independent situations.

Focused checks passed: seven operator tests; native timing pairing/replay/privacy/budget/Solo/positive-sequence checks; actual archived explanation and legacy byte regressions; all-variant/current/historical policy admission and action/value parity.

Final `npm run lab:check` passed in **321.794 seconds**: 92 Node tests, all seven selected native packages, both generated-contract checks and both TypeScript projects. No source drift. Receipt: `.local/evaluation/coach-lab/checks/2026-10-10T05-10-24.578Z.json`; gate source digest `6f01889649a7bab90d5d2f687d81dc6c76d6ab683fcb9fadb0060532cc39448f`. The diagnostic source graph additionally pins its operator/tests/protocol, so its aggregate digest differs; common source-file bytes agree. `git diff --check` passed. The private timing directory also retains `review-disposition.json` and `completion-receipt.json` tying the result to this verification.

## Run it again

From `C:\repos\test-jev` in PowerShell:

```powershell
npm run lab:check
node scripts/coach-lab-jacks-timing.mjs --out .local/evaluation/coach-lab/release-timing-work/YOUR-UNUSED-RUN
node scripts/coach-lab-jacks-endings.mjs --out .local/evaluation/coach-lab/tempo-work/YOUR-UNUSED-ENDING-RUN
```

The first diagnostic requires the retained CFL-10 archives referenced by the fixed cases file. Existing outputs are never overwritten. No browser, database, model API key or paid judge is needed. These are fixed-case reruns, not extra independent validation samples. Inspect `invocation.json` first: only `passed` with unchanged source and complete sampling supports the accompanying summary. Then read `report.md` and `summary.json`; use `study.json` for per-world turn/finish detail. Partial runs retain evidence and do not publish a ranking.

To inspect the explanation revision in a new small headless lab run:

```powershell
node scripts/coach-lab.mjs init --run-id YOUR-UNUSED-ID --game trix-complex-partners --candidate-policy trix-ownership-comparison-1.0.0 --reference-policy trix-ownership-1.0.0 --seed YOUR-UNUSED-SEED
```

Use the manifest path printed by initialization with the normal `run`, `audit` and `report` commands in the [lab runbook](README.md). This creates an opt-in comparison; it does not install a new app default. Since the two policies choose identical actions, this is explanation/mechanics inspection, not a strength experiment.

## Next useful iteration

Expand a predeclared development corpus of distinct release-versus-suit-progress situations, with both benefits and counterexamples. Measure whether a known partner endpoint can be used soon, which intermediate cards still block another path, and whether blocking opponents changes final team awards. Treat behavioral priorities as uncertain unless supported by public facts. Do not turn sample outcomes or hidden hypothetical allocations into runtime features. Propose one action-changing deterministic rule only when its decision-time distinction survives this comparison and the protected endings; then freeze it for fresh full-session validation.
