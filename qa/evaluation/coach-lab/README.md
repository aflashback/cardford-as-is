# Running the coach feedback lab

The lab uses the native Go game engine locally. It needs no browser, running web app, PostgreSQL, API key or live model. Bots follow the one deterministic recommendation saved for each decision. The archive preserves the original analysis, advice and new contextual recommendation/reason bundle.

This is a development lab. Its reports do not certify stronger play, calibrated judging, human learning or a policy ready for promotion. Paid review is disabled. The `review` command exercises the review pipeline with explicitly labelled fixtures.

## First run on Windows

Use PowerShell in the delivery checkout, with the repository's Node 24 dependencies and local Go tools already installed:

```powershell
Set-Location C:\repos\test-jev
npm run lab:check
npm run lab:init -- --run-id partners-first --game spades-partners
npm run lab:run -- --manifest .local/evaluation/coach-lab/manifests/partners-first.json
node scripts/coach-lab.mjs audit --manifest .local/evaluation/coach-lab/manifests/partners-first.json
npm run lab:evaluate -- --manifest .local/evaluation/coach-lab/manifests/partners-first.json --config qa/evaluation/coach-lab/evaluation-smoke.json --max-decisions 8
npm run lab:review -- --manifest .local/evaluation/coach-lab/manifests/partners-first.json
npm run lab:report -- --manifest .local/evaluation/coach-lab/manifests/partners-first.json
```

Choose a fresh run ID when repeating the experiment. `init` builds the native worker and freezes actual source/binary hashes, one development family and two matched games: the reference arm and a candidate-at-seat-0 arm. Other seats retain their declared deterministic policy. Both arms receive the same family deal stream. Hearts/Spades start with dealer seat 3; additional rounds come from the native lifecycle. Trix uses its module's kingdom and owner schedule.

The initial Partners comparison uses the already installed partner-resource policy against frozen tactics. It does not introduce or activate a new policy. Solo/Hearts initially compare the same installed policy in both arms, which is a useful mechanics control.

`init` creates a private seed-bearing manifest under `.local/evaluation/coach-lab/manifests/`. `run` writes under `.local/evaluation/coach-lab/runs/<run-id>/`. The exact output paths appear in the terminal. Files in these directories are private research artifacts, not blind reviewer packets.

It also preserves the exact source files and native worker under `.local/evaluation/coach-lab/builds/<source-hash>/<binary-hash>/`. Identical builds are reused. Collection, resume and native evaluation verify and use that frozen bundle, so later working-tree changes do not replace an old run's policy. Keep the bundle with its manifests and archives; it contains source code and must not be sent as a reviewer packet.

The default collection work budget is ten minutes for the batch, with at most 100 rounds, 10,000 seat actions and 30,000 transitions per episode and a separate 10,000-decision batch cap. A limit produces an explicit incomplete/censored result. It never determines a winner or switches to an easier move. The process watchdog reserves another minute for startup and shutdown; the maximum admitted work budget is nineteen minutes, within the twenty-minute invocation ceiling.

`evaluate` is a separate bounded analysis step. The supplied Spades configuration deliberately uses only two plausible worlds to test the machinery; its intervals are not strength evidence. `--max-decisions 8` limits new attempts, while every unsupported or pending original decision remains counted. Repeating the same command verifies stored evidence and attempts the next pending decisions. It does not play the original game again or change its advice. A different evaluation configuration creates a separate evidence collection.

If a run has more than one evaluation configuration, add `--evaluation-config-hash <hash>` to `report`, `review` and other analysis phases. Use the `configurationHash` printed by `evaluate`. The lab refuses to blend results from different evaluators or choose one silently.

## Available game coverage

| `--game` | Native collection and replay | Offline comparison | Contextual coaching content |
| --- | --- | --- | --- |
| `spades-partners` | Full matches; reference and candidate policies | Public-information beliefs and legal alternatives | Recorded partnership/contract/Nil purposes where supported |
| `spades-solo` | Full matches | Public-information beliefs and legal alternatives | Recorded individual contract/Nil purposes where supported |
| `hearts-solo` | Full matches, including sealed passing | Play alternatives; use Hearts continuation policies | Exact last-seat penalty-avoidance case; other reasons recorded as gaps |
| `trix-basic-solo`, `trix-basic-partners` | Full 20-deal sessions; current rules and exact historical replay | All legal request, double, penalty and layout choices through request end | Reasoning candidate saves contextual cues and complete reasons; original baseline preserved |
| `trix-complex-solo`, `trix-complex-partners` | Full 8-deal sessions; current rules and exact historical replay | All legal request, double, penalty and layout choices through request end | Reasoning candidate saves contextual cues and complete reasons; original baseline preserved |
| Tarneeb | Unavailable: native engine required | Unavailable | Unavailable |

For Hearts evaluation, copy the sample configuration to a new private file, remove `beliefs`, and change all four `comparison.screening.policies` entries to `hearts-baseline-1.0.0`. Keep the original configuration immutable once used. Trix collection uses an explicit V2 manifest, preserving the original Hearts/Spades V1 format.

## Start with Trix Partners

After `npm run lab:check`, run the following with a fresh ID:

```powershell
npm run lab:init -- --run-id trix-partners-first --game trix-complex-partners
npm run lab:run -- --manifest .local/evaluation/coach-lab/manifests/trix-partners-first.json
node scripts/coach-lab.mjs audit --manifest .local/evaluation/coach-lab/manifests/trix-partners-first.json
npm run lab:evaluate -- --manifest .local/evaluation/coach-lab/manifests/trix-partners-first.json --config qa/evaluation/coach-lab/trix-evaluation-smoke.json --max-decisions 8
npm run lab:report -- --manifest .local/evaluation/coach-lab/manifests/trix-partners-first.json
```

New Trix runs compare `trix-reasoning-1.0.0` at candidate seat 0 with `trix-deterministic-1.0.0`; other seats use the reference policy. The six installed policies are `trix-deterministic-1.0.0`, `trix-reasoning-1.0.0`, `trix-history-1.0.0`, `trix-frontier-1.0.0`, `trix-ownership-1.0.0` and `trix-ownership-comparison-1.0.0`. All are deterministic; the app's live default is still the original baseline. Use `--candidate-policy trix-deterministic-1.0.0` at initialization for a baseline-versus-baseline mechanics control. `--reference-policy` accepts any of the six installed Trix policies. These choices are frozen in the manifest. The comparison policy preserves ownership policy choices and candidate values while adding explanation-only comparisons.

The explicitly selected frontier candidate tests one Partners Jacks change: credit contiguous own paths while removing inherited credit for own cards beyond a missing rank. Existing public partner/opponent checks remain in place. [The rule](../../../planning/implementation/coach-lab/trix-frontier-rule.md) separates exact path facts from the unvalidated preference; [the study runbook](trix-frontier-study.md) contains frozen control, fresh-family commands, measured results and limits. Use that paired study workflow to assess full-team outcomes before considering a policy promotion.

The separately selected ownership candidate starts from history policy and adds exact public twos deductions to its existing immediate opening terms. It preserves uncertainty under suppressed announcements and records original versus remaining ownership. It does not implement the later team opening/delay planner or establish stronger play. See [the ownership scope](../../../planning/implementation/coach-lab/trix-ownership.md), [focused checks and run commands](trix-ownership-acceptance.md), and [the frozen complete-session comparison](trix-ownership-study.md).

The [Jacks ending comparison operator](trix-jacks-endings-acceptance.md) compares all legal roots on exhaustive small-ending allocations under declared actor-only continuations. It records each seat's finish, team/individual points, passes and separate board-opening/placement times. Use it to diagnose partner releases and blockers before proposing another policy rule; it is an offline diagnostic, not a runtime decision model or strength verdict.

The [protected King of Hearts scenario operator](trix-king-scenarios.md) starts a finite authored pattern dataset: eight six-heart deals in Basic/Complex Solo and Partners, natural versus controlled doubling, ten legal escape/trap witnesses, and full native scores. Its runbook records exact cases, observed gaps and steps for turning one public-information pattern into a future shared bot/coach rule. Prepared witnesses are kept separate from policy-selected play.

The subsequent [King partner-return comparison](trix-king-return.md) tests all legal leads from the saved North observation on common feasible hands. It records full team points and South's actual response under four fixed policy environments. The first run exposed a lead/response coordination gap and Complex reversals; it does not promote a blanket low-diamond rule.

The [South King discard comparison](trix-king-discard.md) isolates the next decision using South's own knowledge. It compares all eleven discards through complete native finishes and preserves a deal with the same South observation where an immediate king release is harmful. Its facts-only allocation reference is separate from the next planned behavioral-inference stage: existing conditional partner/opponent signals do not yet weight sampled hands or action scores.

For the other variants, replace `--game` with `trix-basic-partners`, `trix-basic-solo` or `trix-complex-solo` and use a new ID. New runs use module `2.2.0` / public schema `1.2.0`, with chronological public Jacks history. Rules remain Partners `1.1.0` (including public twos announcements) and Solo `1.0.0`. Old runs keep their exact original rules and source bundle, including their original history availability.

The candidate reads played cards, suit voids, public declarations, layout passes and public twos information. It weighs team penalties and bonuses, whether a partner's winning card can still be overtaken, and known layout openings. It keeps possible ownership separate from certainty. It does not infer that a partner must hold a particular card merely because they chose a high card, and its preferences have not been strength validated.

The Trix sample evaluates every legal choice on two shared possible deals through the end of the current request. Each simulated player receives only its own observation. Partners compare own-team minus opposing-team points; Solo compares own points minus the other players' mean. Reported deltas are relative to the saved choice; lower/upper values are observed sample minima/maxima, **not confidence intervals**. Request selection excludes the value of saving a request for later in the kingdom. The configuration is a mechanics smoke test, not enough evidence to promote a tactic. First-eight archive batches need not reach every phase; focused tests cover the later layout and doubling cases.

See [Trix extension acceptance](trix-gap-acceptance.md) for the first five gap closures and retained examples. The subsequent [Trix feedback loop](../../../planning/implementation/coach-lab/trix-feedback-loop.md) connects human/model review capacity, numerical hypotheses, the history candidate and paired studies. No human labels or live provider results were obtained in this continuation; judging reliability and strategic strength remain unproved.

## What to inspect

1. **Receipt and report:** confirm which complete matches finished, which arms were incomplete/failed, and their native results. Check the unforced, forced, unreviewed and missing-reason denominators.
2. **Original decisions:** inspect the saved actor packet, complete legal set, selected action, original analysis and recommendation/reason bundle. `insufficient-reason` is an explanation gap, not proof the selected move was wrong.
3. **Exact audit:** check actor identity, legality, recommendation/action equality, replay, forced status and supported code-checkable facts. Missing typed claims remain partially checkable.
4. **Offline evaluations:** conditional comparisons depend on the stated plausible-world sampler, continuation policies, horizon and work budget. An unfinished comparison is not evidence against the untested action.
5. **Gap records:** use evidence links to reproduce the issue. Classify whether the problem belongs to game facts, inference assumptions, action preference, explanation or evaluator coverage.

Open `report.md` in the run directory for the readable result. `report.json` contains the complete counters and evidence references. `latest-export.json` points to the verified native snapshot; `latest-report.json` points to an immutable report version. The private journal is under `private/`. Evaluation configurations and batch receipts are under `evaluations/`; reviewer packets are separately exported.

The short recommendation and complete reason are saved together. A forced move is `only-option`; a score tie is `no-clear-preference`; absent support is `insufficient-reason`. The original production advice remains intact beside this new lab presentation. Headless inspection does not create a human exposure event or establish delivery of the application's planned one-click Why interface.

## Human and model review

Export blank human review packets after collecting a run:

```powershell
npm run lab:export-human -- --manifest .local/evaluation/coach-lab/manifests/partners-first.json
```

Follow [the reviewer guide](reviewer-guide.md). Give a reviewer only their assigned actor-safe packet, with at most one case per original family unless exposure isolation has been established. Do not give them the entire run directory, future tricks, other players' observations, policy identity or an answer key. Blank forms are pending; no labels are invented.

An explicit qualified human submission can be imported with its original packet:

```powershell
npm run lab:import-human -- --manifest .local/evaluation/coach-lab/manifests/partners-first.json --input PATH-TO-SUBMISSION.json --packet PATH-TO-ORIGINAL-PACKET.json
```

The pipeline separates blind action review (A), cue-only review (B-cue), complete-reason review (B-reason), and retrospective review (C). The fixture command processes eight new unforced contexts per invocation; repeat it to advance. These are abstentions that test the pipeline, not real LLM judgments. Separately obtained offline model responses can be imported through `import-model` with their frozen input packet and explicit model pin. C exports the completed game's public history and results in a separate context. This installation does not dispatch paid model calls. Model opinions cannot become independent human labels or change bot behavior.

## Repeat or recover

- For a new experiment, create a **new run ID**. Never edit an old frozen manifest or overwrite its output directory.
- For a time-checkpointed run, retain its frozen build, manifest and output directory and use `npm run lab:run -- --manifest ... --resume`. Saved preparations are replayed; they are not regenerated.
- A round/action/transition cap is a completed censoring decision, not permission to change the old cap. Investigate the receipt and create a new declared development run if needed.
- If frozen source or binary bytes changed or went missing, resume must fail. Preserve that evidence; do not replace the bundle with current files. Changes in the working checkout can be evaluated through a fresh `init` and new run ID, while older runs continue using their own bundle.
- If a process was forcibly killed, inspect the recorded PID in `private/owner.lock` before recovery. Never remove an active owner's lock. A torn journal is retained and rejected; do not trim it and call the run verified. See [the protocol](protocol.md).
- Generate a new report after importing reviews. Original decision, review and report snapshots remain immutable; a latest derived report may point to the new evidence.

## Improving the deterministic coach

Collect a small development run, audit it, obtain independent review where needed, reproduce a concrete gap and a counterexample, then make one versioned code/cue change. Test it on fresh families and unfamiliar deterministic players before considering promotion. Keep a wording improvement separate from a playing-strength improvement. A report finding **no justified change** is valid.

Use `node scripts/coach-lab.mjs help` for commands. The [implementation acceptance record](implementation.md) lists actual tests/runs and remaining scope; the [design plan](../../../docs/superpowers/plans/2026-10-07-coach-feedback-lab.md) remains the full roadmap.

## Trix feedback and paired improvement studies

For the latest larger Jacks release-timing comparison and explanation-only Ownership revision, use [CFL-11 results and running steps](trix-release-timing.md). Its fixed sampled-world diagnostic complements the exhaustive ending corpus; it does not promote a new bot rule.

The feedback report now keeps independent human review, offline model review and completed numerical comparison coverage separate. Its combined evidence count is not an accuracy score. Positive conditional comparisons and human acceptable-set disagreements create distinct hypotheses with immutable evidence references. `gap-evidence/` contains the actor-safe numerical summaries used by those hypotheses. Forced choices, incomplete comparisons, unsupported phases and unreviewed decisions remain visible. Importing an opinion or numerical result never changes a bot policy.

Implementation verification on 9 October passed the integrated lab check in 273.294 seconds: 55 Node tests, seven native packages, both TypeScript projects and schema checks. Independent review found a resume defect; after its fix, the affected follow-up passed 56 Node tests, server TypeScript and generated lab contract checks. Basic/Complex Partners development and fresh-validation pilots completed all 128 sessions (1,792 deals; 103,664 decisions), with no missing/censored pairs. Every cohort had zero changed choices and zero paired score gain against the reasoning control, with two origin families and insufficient evidence. See [the acceptance record and complete results](trix-feedback-acceptance.md).

`trix-history-1.0.0` is an explicitly selected candidate extending `trix-reasoning-1.0.0`. It uses complete feasible-card enumeration at the fourth play of the penultimate penalty trick; all subsequent plays are forced. A changed choice must be no worse in every feasible allocation and better in at least one. Its saved trace records the earlier choice, coverage, native score differences and whether the choice changed. Elsewhere it preserves the earlier action scores. Bots and coach use the same action; no model is involved. Behavioral signals remain conditional and receive no uncalibrated action weight. Historical baseline/reasoning policies remain available.

Start a fresh current-rule template after `npm run lab:check`:

```powershell
npm run lab:init -- --run-id my-trix-template --game trix-basic-partners --candidate-policy trix-history-1.0.0 --reference-policy trix-reasoning-1.0.0 --max-wall-ms 240000
```

Copy [the study configuration example](trix-strength-pilot.example.json) to a private file. Choose a new `studyId` and unique literal family seeds before any results are opened. The example compares one changed seat and both teammates in two registered deterministic player environments, with two seat rotations. It is a two-family operational pilot: its twenty-family floor is not a power calculation, and the example deliberately cannot establish playing strength. Useful-gain/harm settings are exploratory screens, not deployment authority.

```powershell
npm run lab:study -- init --manifest .local/evaluation/coach-lab/manifests/my-trix-template.json --config PATH-TO-MY-CONFIG.json --out .local/evaluation/coach-lab/studies/my-trix-development
npm run lab:study -- run --out .local/evaluation/coach-lab/studies/my-trix-development --max-cells 4 --max-wall-ms 1200000
npm run lab:study -- summary --out .local/evaluation/coach-lab/studies/my-trix-development
```

`init` freezes the source, policies, families, rotations, environments, deployment mode and thresholds. `run` executes at most the requested number of native subruns, within a process-tree watchdog. Repeating `run` skips completed subruns; use `--resume` for a cooperative checkpoint. Censored or failed pairs cannot become wins or disappear from the denominator. Subruns contain at most two families; summary cohorts combine their original-family means by environment/deployment without treating rotations, games or decisions as independent families. Subrun caps still matter: if a deliberately small cap censors a run, preserve that result and design a new experiment.

For fresh validation, retain the **same template and protocol**, copy the configuration with `stage: "fresh-validation"`, a new study ID and entirely new family IDs/seeds. Initialize a separate output directory with `--parent` pointing to the development study, then run/summary as above. Seed reservations reject reuse. This is fresh policy validation, not custodian-admitted formal confirmation; no command activates a runtime policy. Changing the policy, environment or thresholds requires a new development study rather than relabelling old evidence.

To feed a collected study cell into evaluation and feedback, pass its matching manifest **and** run directory. Replace `PATH-TO-STUDY` and `CELL` with the actual study path and cell name; omitting `--out` selects the ordinary run location instead of the study archive.

```powershell
npm run lab:evaluate -- --manifest PATH-TO-STUDY/manifests/CELL.json --out PATH-TO-STUDY/runs/CELL --config qa/evaluation/coach-lab/trix-evaluation-smoke.json --max-decisions 8
npm run lab:export-human -- --manifest PATH-TO-STUDY/manifests/CELL.json --out PATH-TO-STUDY/runs/CELL
node scripts/coach-lab.mjs gaps --manifest PATH-TO-STUDY/manifests/CELL.json --out PATH-TO-STUDY/runs/CELL
npm run lab:report -- --manifest PATH-TO-STUDY/manifests/CELL.json --out PATH-TO-STUDY/runs/CELL
```

Follow [the reviewer guide](reviewer-guide.md) for independent labels and separate model review. Exporting creates blank pending forms. Keep the same manifest/run pair for later review imports and refreshed reports; select `--evaluation-config-hash` if that cell has multiple evaluation configurations.

Use separate templates/studies for Basic Partners and Complex Partners. Their rule interactions and results must remain separate. The paired team study command currently targets Partners; Solo has native candidate/evaluator coverage but needs its own standing/score study objective. The two supplied environments test existing registered policies, not a claim of broad unfamiliar-player robustness.

The first preserved behavioral cases, limits and counterexamples are in [the partnership case register](../../../planning/implementation/coach-lab/trix-partnership-cases.md). New module `2.2.0` observations retain public chronological ownership of Jacks placements, passes, pre-action boards/counts and announcement timing. The history candidate records provable alternatives separately from unknown choice and conditional intention; these behavioral signals do not add action weights. Older archives still lack that chronology. See [the J♦/10♠ investigation](trix-layout-case-study.md) for the first named case, bounded reproduction commands and remaining strategy questions.
