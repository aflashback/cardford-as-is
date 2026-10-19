# Trix frontier study: execution and acceptance

Status: the fixed campaign completed on 9 October 2026: 128 full sessions, 1,792 deals and all 64 paired comparisons. Sixteen separate cohorts each have two origin families, below the twenty-family floor; every cohort is insufficient evidence and strength/promotion remain false. Fresh-validation results do not support promoting this candidate. The [fixed protocol](../../../planning/implementation/coach-lab/trix-frontier-study.md) defines the objective, populations, sample units and limitations.

The private root is `.local/evaluation/coach-lab/frontier-work/`. The active `predeclaration-v2.json` fixes four config hashes and eight independent seed commitments. The first v1 declaration remains retained unused; root chose the tighter budget and history control before any initialization or outcome. Study IDs use the `cff-` prefix; earlier `cfl-` studies and the saved J♦/10♠ investigation remain retained. Seeds were reserved before frontier outcomes were viewed. The existing `lab:study init` command bound them to the immutable source/binary and shared seed registry before episodes began.

## Read existing evidence or collect new evidence

To verify the current implementation and inspect this retained study, run from `C:\repos\test-jev`:

```powershell
npm run lab:check
node scripts/coach-lab-study.mjs summary --out .local/evaluation/coach-lab/frontier-work/studies/cff-basic-development-20261009-v2
```

Substitute any of the four existing study directories to inspect its own cohorts. Summary reads saved native outcomes; it does not recollect games, add families or promote a policy. Retained private frontier-analysis reports add actor-safe behavior counts and exact changed-decision references. Keep the recorded old source/binary identity when interpreting this campaign even if later infrastructure checks run on a newer source graph.

To collect another experiment, choose new study/run IDs and unused literal family seeds before viewing outcomes, copy a private strength config following the [protocol](../../../planning/implementation/coach-lab/trix-frontier-study.md), and initialize new immutable templates/descriptors. Freeze a new versioned candidate before initialization if its rule changes. Bind fresh validation to the new development parent with the same rule/source/binary and protocol. The old output paths and seed reservations are already occupied: the recorded initialization commands below document this campaign and must not be pasted again as a new study. Never overwrite or relabel these retained outcomes.

## Recorded initialization after source freeze

These commands were run from `C:\repos\test-jev` after the candidate source settled; all four descriptors were initialized before collection. They are historical provenance, with already occupied immutable output paths. The template-only seed never becomes a study origin.

```powershell
node scripts/coach-lab.mjs init --run-id cff-basic-template-20261009-v2 --game trix-basic-partners --candidate-policy trix-frontier-1.0.0 --reference-policy trix-history-1.0.0 --seed cff-template-unused-basic-20261009-v2 --max-wall-ms 600000 --max-actions 10000 --max-rounds 100 --manifest .local/evaluation/coach-lab/frontier-work/templates/basic.json
node scripts/coach-lab.mjs init --run-id cff-complex-template-20261009-v2 --game trix-complex-partners --candidate-policy trix-frontier-1.0.0 --reference-policy trix-history-1.0.0 --seed cff-template-unused-complex-20261009-v2 --max-wall-ms 600000 --max-actions 10000 --max-rounds 100 --manifest .local/evaluation/coach-lab/frontier-work/templates/complex.json

node scripts/coach-lab-study.mjs init --manifest .local/evaluation/coach-lab/frontier-work/templates/basic.json --config .local/evaluation/coach-lab/frontier-work/configs/v2/basic-development.json --out .local/evaluation/coach-lab/frontier-work/studies/cff-basic-development-20261009-v2
node scripts/coach-lab-study.mjs init --manifest .local/evaluation/coach-lab/frontier-work/templates/complex.json --config .local/evaluation/coach-lab/frontier-work/configs/v2/complex-development.json --out .local/evaluation/coach-lab/frontier-work/studies/cff-complex-development-20261009-v2
node scripts/coach-lab-study.mjs init --manifest .local/evaluation/coach-lab/frontier-work/templates/basic.json --config .local/evaluation/coach-lab/frontier-work/configs/v2/basic-fresh-validation.json --parent .local/evaluation/coach-lab/frontier-work/studies/cff-basic-development-20261009-v2 --out .local/evaluation/coach-lab/frontier-work/studies/cff-basic-fresh-validation-20261009-v2
node scripts/coach-lab-study.mjs init --manifest .local/evaluation/coach-lab/frontier-work/templates/complex.json --config .local/evaluation/coach-lab/frontier-work/configs/v2/complex-fresh-validation.json --parent .local/evaluation/coach-lab/frontier-work/studies/cff-complex-development-20261009-v2 --out .local/evaluation/coach-lab/frontier-work/studies/cff-complex-fresh-validation-20261009-v2
```

Each study has four native cells (four cohorts, one two-family shard each). The following commands document the collection workflow while cells were incomplete; all cells are now complete. Collection invoked one cell at a time, in development-first order. Before launching each additional cell, measure new-work retained bytes and cumulative operator wall time against the 16 GiB/90 minute ceilings. Keep existing evidence after failures. Completed cells are skipped; `--resume` resumes an incomplete cell with the original manifest.

```powershell
node scripts/coach-lab-study.mjs run --out .local/evaluation/coach-lab/frontier-work/studies/cff-basic-development-20261009-v2 --max-cells 1 --max-wall-ms 1200000 --resume
node scripts/coach-lab-study.mjs run --out .local/evaluation/coach-lab/frontier-work/studies/cff-complex-development-20261009-v2 --max-cells 1 --max-wall-ms 1200000 --resume
node scripts/coach-lab-study.mjs summary --out .local/evaluation/coach-lab/frontier-work/studies/cff-basic-development-20261009-v2
node scripts/coach-lab-study.mjs summary --out .local/evaluation/coach-lab/frontier-work/studies/cff-complex-development-20261009-v2
```

Repeat the one-cell `run` command for each study's remaining cells under the ceilings; do not blindly rerun complete studies. After both development studies complete without changing frozen source/protocol, use the same commands with each `cff-*-fresh-validation-20261009-v2` output directory, then retain its summary. Descriptor, manifest, receipt, source digest, binary digest, invocation and export hashes must be available before treating a row as completed evidence.

Operational memory amendment after initialization: the original study operator's automatic summary retained all prior cell decision arrays simultaneously. Current Basic exports project about 1.2 GB serialized across four cells before string/object copies, creating a 4 GiB heap risk. The root authorized validation/fallback collection through the existing isolated cell operator, with the identical frozen manifest, worker, source and caps. `operator-memory-amendment.json` records that rationale and retains the first runner's source bytes; no statistical protocol or strategy changed. The first development invocations remain the original study CLI route, with every pass/failure retained. The private runner used after this amendment executes:

```powershell
node scripts/coach-lab.mjs run --manifest .local/evaluation/coach-lab/frontier-work/studies/cff-basic-development-20261009-v2/manifests/cell-19898c44a5e30313a4a0.json --out .local/evaluation/coach-lab/frontier-work/studies/cff-basic-development-20261009-v2/runs/cell-19898c44a5e30313a4a0 --resume
node .local/evaluation/coach-lab/frontier-work/run-frontier.mjs --stage fresh-validation
```

The first line illustrates the exact immutable per-cell route; substitute the matching descriptor's remaining cell, and skip completed native receipts. Do not rerun an already complete cell merely because automatic summary failed. The second line drives the two independent validation variants with compact thirty-second progress and retained full command logs. Before each launch it reserves the predeclared work/byte allowance; cumulative work counts all runner watchdog time, including failed operators without a study invocation receipt. Final paired summary is recomputed from native receipts, and activation binds one export at a time. This amendment does not claim that the original study CLI passed after a failed summary.

The first two direct validation startup attempts failed before native journal creation or any episodes: the private runner supplied `--resume` for a fresh, nonexistent output directory. Both native wrappers reported the missing `private/owner.lock` path and their invocation logs remain under `runner-logs/` plus native invocation sidecars. The private runner was corrected to create new cells without resume, and cold restarts require an existing native journal marker before using resume. No stale lock was removed and no episode was replayed or replaced. These are orchestrator startup failures; they do not become missing native outcomes or disappear from the work-time accounting.

The private analysis reads one bound export at a time, verifies the v2 predeclaration, records export/source/binary hashes, and writes immutable descriptive reports with per-family activation and full-session paired results. It caps an individual export at 480 MiB (or the runtime maximum string length minus 16 MiB, whichever is smaller) and the analysis process heap at 4 GiB. An over-cap activation report remains pending with the archive retained; journal byte size is inspected without decoding the seed-bearing journal. Run it sequentially once for each study after collection:

```powershell
node scripts/bounded-native-run.mjs --seconds=180 -- node --max-old-space-size=4096 .local/evaluation/coach-lab/frontier-work/analyze-frontier.mjs --out .local/evaluation/coach-lab/frontier-work/studies/cff-basic-development-20261009-v2
```

Replace only the study output path for the other three. A rerun verifies hashes and reproduces the same content-addressed report; it does not recollect or rewrite episodes. The script's own source hash travels with each private report. Its syntax and all four strength config schemas were checked before source freeze. All four final reports passed bound-export, expected episode/family/arm/rotated-seat policy, trace arithmetic, committed-change category and complete-pair assertions. Saved native receipts and final report byte hashes were then rebound in the completion receipt without rereading journals.

## Completed acceptance record

| Item | Current evidence |
| --- | --- |
| New IDs/seeds predeclared and disjoint from earlier reservations | Eight fixed families across four active v2 private configs; byte hashes and seed commitments in `predeclaration-v2.json`. |
| Candidate trigger/positive/negative tests | Root's focused RED→GREEN unit/native/invariance checks passed; independent review found no remaining issue. Integrated full gate passed below. |
| Saved harmful-case diagnostics | Eight selected cases rerun with the candidate in a separate retained diagnostic; results below are never pooled into natural sessions. |
| Source/binary freeze; matching current profile | Four initialized descriptors share source `bf325d7638960505fc56cd75b0344ccda54dd1693af9f9b33b3fcebe0dbe833b` and worker `8e7368469861303be2071ad3d58dd2acffb4e06ed0206cf28bdf460de7b8b0b4`. |
| Development collection | All 64 sessions/32 pairs complete; 896 deals and four independent origins across variants. |
| Fresh-validation collection | All 64 sessions/32 pairs complete; 896 deals and four additional origins across variants. |
| Complete origin-pair accounting and activation | All 64 planned pairs complete, zero missing/censored. Full frontier trace coverage for 19,406 policy decisions, 2,912 eligible comparisons and 918 committed changes. |
| Mechanical evidence | All 103,446 native decisions committed; 32,766 forced. Zero failed execution/audit checks; 2,552,962 saved mechanical checks passed. Every native audit remains partially checkable; 71,068 heuristic-strategic-quality checks are pending. |
| Strength/promotion | Insufficient by design: two families per cohort versus the twenty-family floor; no automatic promotion. |
| Human/model review and learning benefit | Not obtained by this study. |

Each of the sixteen variant/stage/environment/deployment cohorts below has four planned/complete pairs, zero missing/censored pairs and two origin families. The retained reports preserve every signed rotation pair, exact family identity, actor-safe per-family counts and all 918 changed-decision references. The existing summary's `historyEvidence` fields do not measure frontier activation. Choice changes, sampled preferences and native arithmetic are distinct from human correctness labels.

## Paired full-session outcomes

Score values are candidate-minus-history focal-team margin points. Family means are listed in reserved family-1/family-2 order; worst is the minimum signed rotation pair. Candidate/reference W/T/L records each arm's focal-team result against its environment, not whether the candidate improved over history. Each row contains four complete pairs and two families; all sixteen rows are `insufficient-evidence`, with `strengthClaim: false` and `promotionEligible: false`.

| Stage / variant | Environment | Deployment | Mean gain | Family means | Worst pair | Candidate W/T/L / reference W/T/L | Changed / eligible |
| --- | --- | --- | ---: | --- | ---: | --- | ---: |
| Development Basic | Baseline | One seat | 0 | -100, +100 | -100 | 4/0/0 / 4/0/0 | 36/122 |
| Development Basic | Baseline | Both teammates | +100 | +100, +100 | +100 | 4/0/0 / 4/0/0 | 70/240 |
| Development Basic | Reasoning | One seat | 0 | -100, +100 | -100 | 4/0/0 / 4/0/0 | 36/130 |
| Development Basic | Reasoning | Both teammates | +50 | 0, +100 | 0 | 4/0/0 / 4/0/0 | 68/240 |
| Development Complex | Baseline | One seat | -200 | 0, -400 | -400 | 0/0/4 / 0/0/4 | 36/122 |
| Development Complex | Baseline | Both teammates | -50 | 0, -100 | -100 | 0/0/4 / 0/0/4 | 70/238 |
| Development Complex | Reasoning | One seat | -50 | 0, -100 | -100 | 0/0/4 / 0/0/4 | 34/116 |
| Development Complex | Reasoning | Both teammates | +100 | +100, +100 | +100 | 0/0/4 / 0/0/4 | 66/218 |
| Fresh Basic | Baseline | One seat | +50 | -100, +200 | -100 | 4/0/0 / 4/0/0 | 24/124 |
| Fresh Basic | Baseline | Both teammates | -200 | -500, +100 | -500 | 2/0/2 / 4/0/0 | 88/266 |
| Fresh Basic | Reasoning | One seat | 0 | 0, 0 | 0 | 4/0/0 / 4/0/0 | 26/134 |
| Fresh Basic | Reasoning | Both teammates | -150 | -400, +100 | -400 | 2/0/2 / 4/0/0 | 88/268 |
| Fresh Complex | Baseline | One seat | -100 | 0, -200 | -200 | 4/0/0 / 4/0/0 | 32/114 |
| Fresh Complex | Baseline | Both teammates | -250 | -200, -300 | -300 | 2/0/2 / 4/0/0 | 102/232 |
| Fresh Complex | Reasoning | One seat | -100 | 0, -200 | -200 | 4/0/0 / 4/0/0 | 34/112 |
| Fresh Complex | Reasoning | Both teammates | -200 | -100, -300 | -300 | 2/0/2 / 4/0/0 | 108/236 |

The two rotations produced the same paired value within each family in this campaign. They remain repeated observations of one origin. Retained reports include every rotation pair and the predeclared deterministic 4,000-resample family bootstrap (cohort alpha 0.0125). With two families, even a positive or degenerate interval has no established power and does not support an equivalence/strength claim.

Fresh Complex means were negative in all four cohorts. Both-teammate Basic means changed from positive development values to −200/−150 in fresh validation, with observed worst paired losses −500/−400. Fresh Basic one-seat means were +50/0. These observations do not support promoting this fixed candidate; they are not a population-level estimate of inferiority. A changed choice cannot by itself be assigned as the cause of a whole-session loss.

## Frontier behavior and retained reports

All candidate-policy decisions have matching actor-safe traces and were committed. There are zero prepared/failed frontier choices and zero missing frontier traces. Eligible equals compared in this scope. Forced decisions below include every phase; forced layout and outside scope are the distinct frontier trace coverage categories.

| Stage / variant | Policy decisions / traces | Forced | Eligible compared | Committed changes | Forced layout | Outside scope |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Development Basic | 6770 | 1950 | 732 | 210 | 734 | 5304 |
| Development Complex | 2938 | 1188 | 694 | 206 | 852 | 1392 |
| Fresh Basic | 6768 | 1916 | 792 | 226 | 672 | 5304 |
| Fresh Complex | 2930 | 1162 | 694 | 276 | 844 | 1392 |

Totals are 19,406 policy decisions, 2,912 eligible comparisons and 918 committed selected-choice changes. These totals measure activation; repeated decisions do not increase the origin-family count. Each report preserves per-family/cohort activation, source/binary/export/receipt digests and all changed-decision references with episode, actor, revision and prior/selected candidate IDs. Private analysis source SHA256 is `c91527523a44c3985662bf03871e721739bff831697571d2cd8693275912348d`.

| Study | Final report ID (link) | Report file-byte SHA256 |
| --- | --- | --- |
| Development Basic | [f95e4b68549f](../../../.local/evaluation/coach-lab/frontier-work/studies/cff-basic-development-20261009-v2/frontier-analysis/f95e4b68549f80c0bc5bc403d28487559d6c3b8089656dd9a13d504198dc5567.json) | `fdd5e5542bfa3d2fd7049477710762e3ebf5c64034a05bea203005f48d2e2c0a` |
| Development Complex | [b67f16802247](../../../.local/evaluation/coach-lab/frontier-work/studies/cff-complex-development-20261009-v2/frontier-analysis/b67f16802247e4cb365f4719a10a9b086c1b0d2b98ad968f44dc4689f27659cc.json) | `6f6d0eeb5c40bd9e5df0bdf9f3f6b252ff0d689daa327fb8aaec01d05ca1a42f` |
| Fresh Basic | [1af870347a28](../../../.local/evaluation/coach-lab/frontier-work/studies/cff-basic-fresh-validation-20261009-v2/frontier-analysis/1af870347a28c8b42ad79f31b8835f9f22e7448d25407ef01dc7fa0056ccb156.json) | `435e6d03d38357ef3348da01074713cb701ec61887bc58488d53d4415d6960ad` |
| Fresh Complex | [8deff350c1c2](../../../.local/evaluation/coach-lab/frontier-work/studies/cff-complex-fresh-validation-20261009-v2/frontier-analysis/8deff350c1c2bfe642a8d08120ea2bf217d86363f53e6a79fd5875b381ecb6e7.json) | `05cd92ad08309dac86534d8fcf772dc262411f8243552d500edd6549e1bd3078` |

[Completion receipt](../../../.local/evaluation/coach-lab/frontier-work/completion-receipt.json), file-byte SHA256 `d785e36c19bb7acff37d0c11123117d265079186dfeaf5b9681b3c9167a45fcf`, rebinds all sixteen native receipts and four final report files. Report IDs are the producing analyzer's content addresses; the byte digests above independently bind the serialized saved files. Earlier private report versions remain retained.

## Verified freeze and full gate

The unchanged-source full `node scripts/coach-lab.mjs check` passed in 273,672.619 ms: 69 Node checks, seven native packages, schema checks and both TypeScript projects. Receipt `.local/evaluation/coach-lab/checks/2026-10-09T13-44-10.872Z.json` retains source and final source digest `bf325d7638960505fc56cd75b0344ccda54dd1693af9f9b33b3fcebe0dbe833b`. `frontier-work/freeze-receipt.json` records all templates, descriptors, parent hashes and source/binary identities before episodes began. `campaign-authorization.json` binds that gate receipt and the root's explicit GO for the complete fixed experiment.

After all 128 native sessions and four final private reports completed, the root independently verified the live campaign source digest and wrote `summary-memory-fix/pre-apply-freeze.json`. Only then was the generic summary-memory fix applied, producing source graph `1455799d7527fd596a0e92b23dc2fff5b829b41f70cb3bc6de97dd696c04616e`. The completion receipt binds that pre-apply proof and separately records the observed later graph; it does not claim the later graph collected these games.

Saved full-development summary parity passed for both Basic and Complex after that fix. `summary-memory-fix/actual-study-parity.json` records deep-equal summaries and unchanged original summary file bytes (Basic `640501c95e24285a8af45b7cf9eea3ed4f6723fbaaaf14f69b6f3a3f37ed3d29`; Complex `9885fe8ae84b8ee216191fe9fdcfc9fa8ad48f48bba0ad9e59733ca9a1a43ae7`). The separate final integrated gate passed in 272,132.099 ms: 72 Node checks, seven native packages, both TypeScript projects, schema/generated checks and no timeout. Receipt `.local/evaluation/coach-lab/checks/2026-10-09T14-28-37.563Z.json` records the later source graph unchanged through that check. Candidate rule, old worker and all campaign outcomes remain bound to the original freeze.

## Selected harmful-case diagnostic

The completed diagnostic under `frontier-work/counterexamples/retained-20261009-02/` retained eight synthetic nearby cases, 27 legal roots, five deterministic populations and 135 request-end continuations (7,358 native steps). Archive input, original fixture and source hashes were unchanged. The earlier `retained-20261009-01/` invocation remains incomplete: its private runner used the wrong working directory for a relative fixture lookup and completed zero continuations. Only that private working-directory invocation was corrected; the rule/source and old baseline roots remained unchanged.

The candidate changed four saved history choices from J♦ to 10♠ and kept the other four 10♣ choices. On the four changed cases, selected-root differences against history were respectively −100, −200, −200 and −100 under baseline continuations, and −100, −300, 0 and +200 under all-frontier continuations. These are deliberately selected harmful examples, not a prevalence estimate or natural-family strength result. The different continuation populations matter even on the same synthetic input.

One retained actor-visible failure category is “no contiguous own follow-up in any legal option; inherited jack cost decides the remaining comparison.” In `nearby-162fcd7572f9`, neither J♦ nor 10♠ opens an owned chain. J♦ removes six old heuristic points to score −1; 10♠ removes three to score 0, so the unchanged jack cost selects 10♠. Under all-frontier continuation, J♦ yields team margin +200 and 10♠ yields −100. This diagnoses a possible future guard and teammate-timing uncertainty; it does not prove a universal J♦ preference. No rule was tuned from this result, and it stays outside natural-deal means and uncertainty.

The root subsequently requested a separate posthoc description of that pattern on natural sessions. Among committed changed choices, the private report classifies three mutually exclusive actor-visible categories: no legal root opens an owned chain; the selected root opens an owned chain; or the selected root opens none while another legal root does. Each existing changed-decision reference is annotated, with per-family/cohort counts kept outside the predeclared score/strength analysis. These descriptive categories are not accuracy labels, independent origin families, evidence that a particular choice caused a session loss, or a reason to tune the frozen policy during validation.

The separate natural-session posthoc counts are:

| Stage / variant | No legal root has an owned follow-up | Selected root has an owned follow-up | Selected has none; another root has one |
| --- | ---: | ---: | ---: |
| Development Basic | 202 | 8 | 0 |
| Development Complex | 194 | 12 | 0 |
| Fresh Basic | 206 | 20 | 0 |
| Fresh Complex | 256 | 20 | 0 |

Thus 858 of the 918 changed choices had no legal owned-chain follow-up, 60 selected a root with one, and zero selected none when another root had one. All exact changed references are annotated; no correctness/prevalence-of-human-error claim follows. These correlated choice counts are not pooled into strength. The next material gap is a guarded hypothesis for choices with no immediate own follow-up, together with public teammate timing uncertainty. That work requires a new frozen candidate/development study and fresh validation origins; it is not implemented or tuned here.

Measured collection operator work was 2,810,231.474 ms (46.84 aggregate minutes), including both failed zero-episode startup attempts. All sixteen real collection calls passed; there were zero native data failures/incomplete cells. The pre-completion-receipt retention snapshot was 9,310,428,500 bytes (8.67 GiB), including preserved diagnostics, private logs and earlier report versions. Setup, full checks and private analysis are separate costs. The fixed 90-minute/16-GiB ceilings were respected; each native shard kept the 600,000 ms wall cap and each operator the 1,200,000 ms allowance. At most two independent variants ran concurrently. No episode, journal or export was pruned, replaced or recollected. Earlier estimates (39.6 minutes and 8.53 GiB) remain recorded in the protocol as estimates, not final measurements.
