# Ownership session comparison: operation and evidence

Status: **CFL-10 implemented, verified and collected in full** under [the frozen protocol](../../../planning/implementation/coach-lab/trix-ownership-study.md). All 256 sessions completed. No complete-session score gain was observed; one Basic development origin lost 50 team points. Ownership remains experimental, with no runtime default promotion. The candidate, control, sample units, populations and original resource ceiling were fixed before collection. A later timing-based amendment increased only the cumulative collection-and-analysis time allowance from 120 to 150 minutes, including earlier invocations.

## Completed comparison

Each row contains four separate cohorts: baseline/reasoning opponents, each with one-seat/both-partner treatment. Within each row, all four cohorts happened to have the same score summary below. Each cohort has four original seed families and eight paired comparisons; rotations and repeated settings do not create independent origins.

| Variant and stage | Mean team-point change per cohort | Worst paired change | Improved / tied / harmed pairs per cohort | Changed decision records across study |
| --- | ---: | ---: | --- | ---: |
| Basic development | −12.5 | −50 | 0 / 6 / 2 | 8 |
| Basic fresh validation | 0 | 0 | 0 / 8 / 0 | 8 |
| Complex development | 0 | 0 | 0 / 8 / 0 | 4 |
| Complex fresh validation | 0 | 0 | 0 / 8 / 0 | 0 |

The 20 changed records come from **three distinct original seed families**, not 20 independent cases. All sixteen cohorts remain `insufficient-evidence`. No observed gain and tied scores do not establish equivalence; the natural sample contains few changed-choice cases and only four family units per cohort.

## Read or reproduce

The private campaign root is `.local/evaluation/coach-lab/ownership-strength-work/`. Existing evidence must remain immutable. The source/binary pins identify the actual tested build, including uncommitted source.

Read the saved results without running games:

```powershell
Set-Location C:\repos\test-jev
$campaignPath = '.local/evaluation/coach-lab/ownership-strength-work'
$campaignResult = Get-Content -LiteralPath "$campaignPath/completion-receipt.json" -Raw | ConvertFrom-Json
$campaignResult.totals
$campaignResult.activation
$campaignResult.resources
foreach ($studyResult in $campaignResult.studies) {
    $studyResult.id
    $studyResult.teamResults | ConvertTo-Json -Depth 12
}
Get-Content -LiteralPath "$campaignPath/explanation-gap.json" -Raw
Get-Content -LiteralPath "$campaignPath/adverse-case.json" -Raw
```

The four `studies/*/campaign-report.json` files retain cohort summaries, paired native team scores and changed-decision references. They separate Basic from Complex, development from fresh validation, opponent styles and one-seat from both-partner deployment. Private exports remain local; do not publish raw game journals as coach explanations.

From `C:\repos\test-jev`, run `npm run lab:check` to verify the installed lab. The generic operators are:

```powershell
node scripts/coach-lab.mjs init --run-id YOUR-UNUSED-ID --game trix-basic-partners --candidate-policy trix-ownership-1.0.0 --reference-policy trix-history-1.0.0 --seed YOUR-UNUSED-TEMPLATE-SEED --max-wall-ms 600000 --manifest YOUR-NEW-TEMPLATE.json
node scripts/coach-lab-study.mjs init --manifest YOUR-NEW-TEMPLATE.json --config YOUR-NEW-CONFIG.json --out YOUR-NEW-STUDY
node scripts/coach-lab-study.mjs run --out YOUR-NEW-STUDY --max-cells 1 --max-wall-ms 1200000
node scripts/coach-lab-study.mjs summary --out YOUR-NEW-STUDY
```

Create the config from `qa/evaluation/coach-lab/trix-strength-pilot.example.json`, following the fixed protocol: fresh literal origins, seat 2 History, seats 1/3 baseline or reasoning, and separate one-seat/both-partner cohorts. A fresh-validation config must be initialized with `--parent DEVELOPMENT-STUDY` and identical protocol/source before collection. Use new IDs and paths for a new experiment; repeating a summary reads existing outcomes. `--resume` is only for a preserved incomplete run under the same manifest.

## Evidence

The completed campaign has **256 sessions, 128 complete pairs and 3,584 deals**, with zero missing or censored pairs. There are 207,380 committed decisions and zero failed mechanical audit checks. All 38,810 executed Ownership decisions have present, well-formed traces; 12,026 are eligible, including 5,958 unforced choices and 1,688 suppressed-announcement eligible records. Twenty choices differ from inherited History. These are repeated decision records, not independent strategy labels. The twenty-origin reporting floor is not a power calculation and was not met by this pilot. Strategic-quality checks remain pending on 155,548 decision records; completed mechanical checks do not certify good play.

Private `completion-receipt.json` binds the four report hashes, 32 native collection receipts, four analysis invocations, source/binary/gate identities and retained findings. SHA256: `4a7c0475af98cfecbdb6afe12dd2b61afc40cb291488e9b8f23309980ed85bd8`. The source snapshot remained unchanged. All 36 collection/analysis invocations passed without a retry. Their summed operator time was **109.727 minutes**, within both the original 120-minute and amended 150-minute ceilings. Concurrent operators count separately; setup, the full gate and separate reviews are excluded. Retained campaign data measured **19,996,179,232 bytes (18.623 GiB)** immediately before writing the completion receipt; the separate source snapshot and linked dependencies are excluded. The preserved amendment remains part of the record even though final use fit the original time cap.

A second offline assistant independently reconciled all four report hashes, 32 native receipt hashes and policy/source identities, both validation parents, all 128 paired native team-score calculations, all 64 reference-deployment parity comparisons and all sixteen cohort statuses. The 36 invocation hashes/watchdogs and aggregate counts agree with the completion receipt. This is an evidence-integrity review, not independent human strategic-quality labelling. Changes remain local; no commit or policy promotion was made in this continuation.

The narrow reporting patch passed 26 targeted strength tests (including five new Ownership tests), preserving the old History summary hashes, and `npm run typecheck`. The full isolated `npm run lab:check` then passed both generated-contract checks, all 84 JavaScript tests, all seven selected native packages and both TypeScript projects in **355.914 seconds**, with unchanged source and no skipped/timed-out step. The receipt is `.local/evaluation/coach-lab/ownership-strength-source-v1/.local/evaluation/coach-lab/checks/2026-10-10T01-45-14.664Z.json`.

The targeted commands were `node --test --test-isolation=none web/server/tests/coach-lab-strength.test.ts` and `npm run typecheck`, from the repository root. The final full gate ran `npm run lab:check` from the isolated source snapshot. Those are completed checks; rerunning against a later checkout tests that later code, not the retained campaign build.

The initial restricted gate launch failed with `spawn EPERM` before checks. The next shared-checkout attempt passed its behavioral checks but failed the unchanged-source gate while another task edited server/contracts code. Both receipts and logs remain retained; neither is represented as a passed gate. The isolated source was copied and byte-checked before its successful gate. Early shared-checkout templates remain unused; no campaign origins were collected under them.

- Frozen source digest: `7fb64ff0a9d15959dd02e5af12476164637f65183d7cd35343b24fdad5c92f39`.
- Native worker digest: `00270f9e5f83557690a92328291b6af6b83481f1ce582b1a25a6117374a7c57b`.
- Seed/config predeclaration digest: `e1331cf5c08f919513be195cc89f330fe564a5763a3bbae69ae7e461bca3914e`.
- Private `campaign-ready.json` binds all four initialized descriptors, both development parents, the gate and the source/runner/analyzer identities before collection.

The worker, operator and report modules run from the isolated source tree; the exact worker/source bundle is also preserved under the ordinary lab `builds/` directory. Other tasks may continue changing the shared checkout. This gate verifies the tested snapshot, not later unrelated edits. The runtime policy defaults have not changed.

## Development finding: Basic Partners

All **64 sessions, 1,280 deals and 32 pairs** completed. In each of the four cohorts, the candidate gained team points in zero pairs, tied in six, and lost 50 points in two. The mean paired team-point difference is −12.5; the four origin-family means are 0, 0, 0, −50. The score-margin mean is −25, a different unit. The two losses per cohort repeat the same origin under the two rotations; across settings there is **one adverse origin**, not eight independent examples.

All eight changed decision records repeat origin 4, deal 3, revision 152. Unrotated actor 0 holds C2, CK, H10 and S3; public remaining counts are 4, 6, 8, 6. Suppression plus the actor's C2 proves that partner 2 holds D2, H2 and S2. Both legal actions immediately open zero actor-held cards. History chooses H10 with heuristic score 0; Ownership gives S3 the existing +8 immediate partner-two release term and chooses it. The saved Why describes this input accurately. In the representative baseline-opponent pair, final team points are 130 for Ownership and 180 for History.

This provides a concrete **partner-release timing hypothesis**: making a partner's two available immediately may need to be compared with progress in other suits and the team's finishing order. It does not establish that H10 is optimal or that a partner-hand-count cutoff is warranted. The measured 50-point policy difference is not a prediction for other compatible holdings or player strategies. Private `adverse-case.json` preserves all eight source references and paired outcomes as an unlabelled proposal. A second offline assistant independently checked native receipt hashes, arithmetic, reference parity and actor-safe evidence. No policy weight or threshold changed before validation.

Later public completed-deal ledgers show the concrete consequence in the representative pair: the actor finishes second for 150 points in both arms, while partner 2 finishes third for 100 under History and fourth for 50 under Ownership. Deal team points are 250 versus 200. The partner finishes on S2 in both. Private `retrospective-outcome.json` binds those later public records; they are outcome evidence, excluded from the earlier decision input. This identifies the observed finishing-order difference without proving which action was best across other compatible hidden deals and continuations.

A further public-archive comparison confirms 148 preceding committed actor/action decisions match, and H10 versus S3 is the first divergence, at decision 149. Both actor packets match except their episode-specific observation ID, including legal alternatives and permitted information. The reference is `case-2cb98ecf4c653e01107eddb5d929a0b5` (export line 4745); the candidate is `case-893f468f1bf088ab27ae58754b1fc6a4` (line 5879). This supports the controlled policy contrast beginning at that choice. It remains a result under these holdings and continuations, rather than an optimal-action label over every compatible world.

## Development finding: Complex Partners

The Complex development report completed and passed its archive checks: **64 sessions, 512 deals and 32 pairs**. Every paired final team-point difference is zero across both opponent environments and both deployment modes. Direct native team scores, zero-sum margin arithmetic and identical reference outcomes between deployment modes were independently checked. Four-family cohorts remain insufficient evidence; identical observed scores do not establish policy equivalence.

There are four changed Ownership records from **one original tactical position**, repeated over two rotations and two opponent environments with both teammates changed. In the unrotated case, actor 2 has H3/S5, the hearts row ends at 4 and the spades row at 6. Suppression, public twos and remaining counts identify opponent 3 as the H2 holder. H3 receives the existing −8 immediate-opponent-release heuristic term; S5 remains 0 and is selected. Those are heuristic values, not predicted game points. Neither legal move immediately opens another actor-held card. This is an exact decision-input explanation, not an optimal-play proof; the complete-session scores tie.

The saved main cue says to open a path through the player's hand. The distinguishing reason—avoiding the opponent's H2 release—appears in the alternative explanation instead. Preserve this as a **comparative explanation gap**, with action quality unlabelled. Private `explanation-gap.json` binds the report and four original decision references. No runtime rule or cue was tuned while validation was reserved. An offline assistant reviewed the actor-safe records; this is not an independent human acceptable-action label.

The report's `missingReasons: 0` only verifies that reason text exists. It does not establish strategic explanation completeness: original baseline messages can explicitly say `insufficient-reason`, and contextual strategic-quality checks remain pending.

## Fresh-validation finding: Complex Partners

All **64 sessions, 512 deals and 32 pairs** completed against the reserved development parent and identical source/policy pins. All four cohorts have zero paired team-point difference, with eight ties each. There are **5,816 committed Ownership decisions**, 3,032 eligible records (1,468 unforced), and 208 suppressed-announcement eligible records. All expected Ownership traces are present and well formed; none changes the inherited History action. This fresh sample therefore shows no score gain and contains no changed-choice test of the candidate. Four-family cohorts remain insufficient evidence; the ties do not establish policy equivalence.

## Fresh-validation finding: Basic Partners

All **64 sessions, 1,280 deals and 32 pairs** completed. All four cohorts have zero paired team-point difference. Eight changed records come from one original family, origin 4 in deal 9, across settings and rotations. Ownership changes D6 to C3 after proving that the partner holds C2. The partner-release term brings C3 into a leading heuristic tie; the fixed legal order chooses it. The saved cue explicitly says the heuristic scores tie and the reason denies a unique tactical advantage. This differs from both the adverse development case and the Complex explanation gap. It is a neutral observed score outcome, not an acceptable-action or equivalence label.

## How to use this result next

1. Keep the Ownership policy experimental and preserve all frozen policies and reports. This pilot does not justify promotion to the shared bot/coach default. No lab provider calls or independent human labels were used; offline assistants reviewed the saved evidence. No runtime policy was changed.
2. Use [PH-07](../../../planning/implementation/coach-lab/trix-partnership-cases.md) and the retained CFL-09 benefit/counterexamples to investigate a narrow partner-release timing rule. Compare legal alternatives on the same decision-time compatible worlds with observation-restricted continuations and total team finish points. Do not derive a hand-count cutoff or bonus from one losing origin.
3. Separately improve the comparative explanation for the Complex case: the selected action avoids releasing an opponent's H2. Any later plain-English rendering must use the recorded rule evidence and cannot choose the action.
4. If the investigation supports a new deterministic candidate, version its rule and explanation together, protect the old positive and new adverse cases, then declare a new development study and untouched validation origins. All origins used here are now consumed evidence, not fresh validation for a later revision. Solo and other games require their own objective and coverage studies.

The completed private orchestration commands were `node .local/evaluation/coach-lab/ownership-strength-work/run-campaign.mjs --stage development`, then `node .local/evaluation/coach-lab/ownership-strength-work/run-campaign-resource-v2.mjs --stage fresh-validation`, followed by `node .local/evaluation/coach-lab/ownership-strength-work/finalize.mjs`. They used the bound source snapshot and immutable study paths. Read the existing receipt; do not overwrite it or rerun finalization. Use the new-ID workflow above for another experiment.
