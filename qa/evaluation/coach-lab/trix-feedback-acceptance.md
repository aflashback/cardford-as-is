# Trix feedback and policy-study acceptance — 9 October 2026

Status: implementation checks and all four bounded pilot studies passed. All 128 planned sessions completed; the candidate changed no choices in these studies and showed no paired score gain. Strategic strength remains unproved. This record extends the earlier [Trix gap acceptance](trix-gap-acceptance.md); that earlier task's feedback/strength deferrals describe its original scope, which the owner subsequently expanded for this work.

The authorized extension connects deterministic feedback evidence to gap hypotheses, adds a narrowly scoped history candidate, and supplies reproducible complete-session paired studies. Product UI changes, runtime model calls and automatic default-policy promotion are outside this work. `trix-deterministic-1.0.0` remains the live default. Bots and coach share the same selected action and saved deterministic reasoning; feedback imports do not silently change either.

## Implemented behavior

| Area | Delivered behavior | Evidence limit |
| --- | --- | --- |
| Feedback coverage | Reports distinguish independent human acceptable-action labels, offline model reason reviews, and completed numerical comparisons. Forced, unreviewed, incomplete and unsupported decisions remain visible. | Combined evidence coverage is a count, not an accuracy or expertise score. Blank forms and fixtures are not completed independent reviews. |
| Gap evidence | Human disagreements and conditional numerical alternatives create separate hypotheses with immutable references and actor-safe numerical summaries. Reviews bind to the saved presentation; evaluator configurations remain distinct. | A hypothesis does not change policy, establish a mistake, or prove that an earlier action caused a bad final outcome. |
| History candidate | `trix-history-1.0.0` extends the selectable `trix-reasoning-1.0.0`; original baseline/reasoning identities and historical replay remain available. | Local exact improvements do not establish stronger complete-session play. |
| Saved reasoning | Candidate traces retain eligibility, coverage, feasible-allocation comparisons, earlier reasoning choice, chosen dominant action when available, and actual choice-change status. | Allocation counts are not calibrated probabilities; behavioral signals receive no uncalibrated action weight. |
| Paired study protocol | Initialization freezes exact source/binary, policy/profile, family seeds, rotations, deployment modes, environments and practical thresholds. Fresh validation preserves its development parent's protocol and rejects reused seeds. | Fresh policy validation is separate from custodian-admitted formal confirmation; expert labels and promotion authority are not supplied. |
| Bounded collection | Native subruns contain at most two families. Completed subruns are skipped; checkpoints and recoverable journals can resume. Process-tree watchdogs cover native work and the study operator. | Censored/failed/missing outcomes stay counted; a small cap cannot turn an incomplete arm into a win. |
| Statistical reporting | Paired team margins, wins/ties/losses, completeness and saved tactic activation remain separate by variant, environment and deployment. Whole origin families supply uncertainty units across native shards. | Rotations, games and decision occurrences do not increase the independent-family sample size. |

The history rule applies at the fourth play of the penultimate penalty trick when the actor has two legal cards and each other player has one remaining card. It enumerates every remaining-card assignment compatible with the actor's own hand and public native history. Subsequent plays are forced. A replacement must never worsen the declared request-end objective in any feasible assignment and improve it in at least one. Native scoring includes applicable doubled-card effects and the team/individual objective. If coverage is incomplete, no feasible allocation is found, or neither action dominates, the earlier reasoning choice remains available with explicit coverage or ambiguity information.

This supplies the first narrow implementation of the [partnership case register](../../../planning/implementation/coach-lab/trix-partnership-cases.md), especially PH-05. It does not solve every doubled-king lead, layout-frontier preference or teammate-intent case. A public declaration proves the declared holding; withholding an ace or repeatedly choosing high cards does not prove absence of other cards. Forced choices must not become preference signals. Decision-time evidence stays separate from later revelations.

For a concrete tested example, the Basic Partners Queens fixture leaves the acting player with A♣ and K♦, playing fourth behind A♠, 5♠ and 10♠. The opponent already wins this trick. Public history leaves Q♦, 4♠ and 7♠ unplayed in the other hands, with four feasible assignments. The earlier reasoning policy discards A♣; the new rule discards K♦ and keeps A♣. If the opponent later leads Q♦, retaining K♦ would force our player to follow and capture that queen; retaining A♣ lets the opponent keep it. Across all four assignments the team-margin improvement is either zero or 50 points: two ties and two improvements. This is an exact request-ending comparison, not a 50% probability assertion. The complete native fixture, counterexamples and replay checks are in `server/internal/games/trix/reasoning_history_test.go`.

## Verification completed

| Check | Recorded result | Receipt or log |
| --- | --- | --- |
| Integrated `node scripts/coach-lab.mjs check` / `npm run lab:check` | Passed in **273,294 ms**: **55 Node tests**, all **seven selected native packages**, both TypeScript projects, public schema generation and lab schema/type checks. | `.local/evaluation/coach-lab/checks/2026-10-09T05-45-15.989Z.json` |
| Post-review affected checks | **56/56 Node tests passed**; server TypeScript and generated lab-schema/type checks passed. | `.local/evaluation/coach-lab/feedback-work/post-review-node.log` |
| Independent review follow-up | A study resume defect was reproduced RED and fixed GREEN. An existing journal directory without its first exported receipt now reaches native recovery under `--resume`, instead of failing first during archive binding. | Regression and follow-up evidence are included in the post-review checks above. |

These checks establish implementation behavior, exact evidence identities, bounded collection/recovery and contract compatibility. They do not substitute for actual study outcomes, independent human labels, calibrated behavioral beliefs, live-provider acceptance or learning evidence. The review also preserved the distinction between a presentation-specific reason review and an actor-only blind case, and between bounded numerical comparisons and strategic truth.

## Completed predeclared pilots

The comparison is `trix-history-1.0.0` versus frozen `trix-reasoning-1.0.0`. This is not a direct strength comparison against the older live default. Two environments use baseline players and reasoning players; these are existing deterministic populations, not broad unfamiliar-player coverage. Each study fixed two origin families, two rotations, one-seat/both-partner deployment and both environments before results were inspected. Fresh-validation seeds are distinct from development and retain the exact parent protocol.

All **128 full sessions**, **1,792 deals** and **103,664 decisions** completed. All 64 planned arm pairs completed, with zero missing/censored pairs and no invocation timeouts. Counts below are occurrences across repeated deployments/rotations, not independent samples. Each of the 16 statistical cohorts still has **n = 2 origin families**.

| Study | Sessions | Decisions | Eligible occurrences | Changed choices | Elapsed seconds |
| --- | ---: | ---: | ---: | ---: | ---: |
| Basic development | 32 | 36,516 | 72 | 0 | 869.076 |
| Complex development | 32 | 15,492 | 18 | 0 | 319.005 |
| Basic fresh-validation | 32 | 36,344 | 46 | 0 | 824.428 |
| Complex fresh-validation | 32 | 15,312 | 8 | 0 | 366.200 |

**Observed result: zero changed choices and zero paired score differences in every cohort.** When the new rule identified a dominant action, the frozen reasoning policy already selected it. Ambiguous cases retained that policy. This does not establish equivalence, optimal play, or an improvement over the live default. Positive and negative native fixtures establish local behavior, while these ordinary-game pilots establish bounded collection and expose limited activation. Every cohort reports `insufficient-evidence`, `strengthClaim: false` and no promotion eligibility.

The twenty-family minimum is an exploratory floor, not a power calculation. These pilots cannot meet it. The five-point useful-gain and zero-harm thresholds are exploratory screens. All observed paired margins and bootstrap intervals were zero; degenerate two-family intervals do not prove equivalence or override insufficient evidence. Original families, not games, rotations or decisions, remain the uncertainty unit.

| Study | Other-player environment | Changed seats | Mean paired team-margin gain | Candidate W/T/L | Reference W/T/L | Changed choices |
| --- | --- | ---: | ---: | --- | --- | ---: |
| Basic development | baseline | 1 | 0 | 2/0/2 | 2/0/2 | 0 |
| Basic development | baseline | 2 | 0 | 4/0/0 | 4/0/0 | 0 |
| Basic development | reasoning | 1 | 0 | 4/0/0 | 4/0/0 | 0 |
| Basic development | reasoning | 2 | 0 | 4/0/0 | 4/0/0 | 0 |
| Complex development | baseline | 1 | 0 | 2/0/2 | 2/0/2 | 0 |
| Complex development | baseline | 2 | 0 | 2/0/2 | 2/0/2 | 0 |
| Complex development | reasoning | 1 | 0 | 2/0/2 | 2/0/2 | 0 |
| Complex development | reasoning | 2 | 0 | 2/0/2 | 2/0/2 | 0 |
| Basic fresh-validation | baseline | 1 | 0 | 2/0/2 | 2/0/2 | 0 |
| Basic fresh-validation | baseline | 2 | 0 | 2/0/2 | 2/0/2 | 0 |
| Basic fresh-validation | reasoning | 1 | 0 | 2/0/2 | 2/0/2 | 0 |
| Basic fresh-validation | reasoning | 2 | 0 | 2/0/2 | 2/0/2 | 0 |
| Complex fresh-validation | baseline | 1 | 0 | 2/0/2 | 2/0/2 | 0 |
| Complex fresh-validation | baseline | 2 | 0 | 2/0/2 | 2/0/2 | 0 |
| Complex fresh-validation | reasoning | 1 | 0 | 0/0/4 | 0/0/4 | 0 |
| Complex fresh-validation | reasoning | 2 | 0 | 0/0/4 | 0/0/4 | 0 |

W/T/L counts each arm's four focal-team session results. A zero paired gain can accompany winning or losing both arms. These outcome counts are descriptive and remain separated by environment/deployment.

Immutable summary locations under `.local/evaluation/coach-lab/studies/`:

- `cfl-basic-development-20261009/summaries/90d6c4e32b05281f86380f2ce8b7bfa3e6109a084d3ac9cfd3894d83e576f899.json`
- `cfl-complex-development-20261009/summaries/41423a47a2f81a9e9ae97471931941dfdf8bf12884362ed1adfc21a34d3ba706.json`
- `cfl-basic-fresh-validation-20261009/summaries/c4368e06dc903a583cdfb9e6eb5c60389936fef0a0b27660ab99d470f82b2aa6.json`
- `cfl-complex-fresh-validation-20261009/summaries/c4c2d39568bb3daff5b23eabda376b7906ad025166f0d1506bc09db16e437185.json`

A consolidated local handoff copy is `.local/evaluation/coach-lab/feedback-work/pilot-results.json`. Full manifests, source/binary bundles, journals, exports, invocations and summaries remain retained. No model provider or browser was used, no human labels were invented, and no live policy was promoted.

## Remaining work

Use these pilots' variance, censoring and activation coverage to choose the next study. If a candidate never changes an action, increasing the ordinary-game sample size is not automatically the best next step. First reproduce positive and negative activation cases on additional legal histories, keep that targeted case population separate from natural-deal results, and estimate the work needed for a useful full-session comparison. Preserve fresh families, negative examples and subgroup-harm checks, and expand deterministic partner/opponent styles before making any robustness claim. Independent acceptable-action review, explanation review and human-learning evidence remain separate gates.

For layout interpretation, the next evidence requirement is chronological public ownership and board state at each action. The current actor observation does not retain who placed every jack/frontier card through time. A final board or a forced pass cannot supply the missing voluntary-choice history. Add and verify that public chronology before treating repeated upper-side play or delayed frontier openings as actionable preference evidence.

Behavioral calibration follows evidence capture: declare the assumed player policy, preserve all hard-feasible holdings, allow mistakes and alternative plans, and test signals on fresh examples and counterexamples. Later events may assess an earlier belief retrospectively; they cannot become facts available at the earlier decision. No model call or invented confidence percentage is needed to expose these limits. Use the [operator runbook](README.md) and [reviewer guide](reviewer-guide.md) for the current reproducible workflow.

## Real study-to-feedback round trip

The completed Complex development subrun `cell-b331aaa44576635353f8` was evaluated with the existing two-world smoke configuration, using its matching study manifest and run directory. Eight new comparisons completed; 3,868 original decisions remained pending. Its refreshed report counted 3,876 original decisions: 1,460 forced and 2,416 unforced. All original decisions passed available mechanical audit checks but remained partially checkable. Five unforced decisions received numerical coverage; human/model review counts remained zero and 2,411 unforced decisions still lacked numerical evidence. Forced decisions received no strategic-review credit.

Retained report: `.local/evaluation/coach-lab/studies/cfl-complex-development-20261009/runs/cell-b331aaa44576635353f8/reports/report-390b0a25c3849333d19595a98d13b05ab664e31f45a550bfe55fed3b31e2a7fb.json`. Evaluation configuration hash: `401caa20c75271535345ecce0c14274b66b03621500d74b8825bfe6595958f5d`. Command logs are `feedback-work/new-study-evaluation.log` and `feedback-work/new-study-report.log` under `.local/evaluation/coach-lab/`.

The report created two numerical hypotheses, including `case-bdf5b9cd6d1b3ecf9e46e2d154dd89bf`: playing `layout:S10` instead of the saved `layout:DJ` had a mean conditional difference of +150, with observed differences 0 and +300. This was an original-baseline decision by seat 3, not evidence that the new candidate failed. Two sampled worlds are not enough to label either action correct. Reproduce it, check the existing reasoning policy first, and compare alternatives over adequate actor-compatible worlds before proposing another rule. A request-selection hypothesis had observed differences −10 and +40, which explicitly demonstrates why a positive mean alone is not certainty. Neither hypothesis triggered automatic policy changes.
