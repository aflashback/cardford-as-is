# Case maintenance and evaluation packet

Execution specification for M07/M10–M12 of [the main plan](../../../docs/superpowers/plans/2026-10-04-multi-game-reasoning-implementation.md). All tasks/tests below are **planned**. Source paragraphs and agent judgments are development hypotheses, not expert labels.

## Typed cases are the maintained source

Create `web/server/strategy/cases/types.ts` with these names; `O`/`A`/`Claim` belong to a concrete game registration:

```ts
interface CaseDefinition<O, A, Claim> {
  id: string; version: string; family: string;
  variants: readonly string[]; phases: readonly string[];
  summary: string; prerequisites: readonly string[];
  trigger(input: O): boolean;
  excluded(input: O): readonly string[];
  priority: number; conflictsWith: readonly string[];
  assess(input: O): {
    preferred: readonly A[]; reasonable: readonly A[];
    evidence: 'exact' | 'heuristic' | 'unsupported';
    claims: readonly Claim[]; limitations: readonly string[];
  };
  cue: { id: string; version: string };
  fixtures: readonly string[]; counterexamples: readonly string[];
  sources: readonly string[];
  review: 'hypothesis' | 'independently-reviewed' | 'contested';
}
```

`resolveCases(input, cases)` is defined in `strategy/cases/resolve.ts`. First evaluate prerequisites/exclusions, then exact legality/proof constraints, then the declared objective. Conflicting heuristic preferences are retained as alternatives unless a named versioned conflict rule resolves them. Equal priority does not silently make file order authoritative. Return matched IDs, exclusions, alternatives, applied rule and selected-action claims. A matched trigger alone never proves a tactic.

Add `games/spades/cases/catalog.ts`, `families/resources.ts`, `families/nil.ts`, `families/bidding.ts` and `families/score-pressure.ts`. Wrap CASE-01–04 from existing `proofs.ts`/`cues.ts` first; retain existing IDs/versions and independent checkers. Future Tarneeb/Trix families use their own typed inputs. Do not port all 66 authored recipes as enabled preferences. `web/scripts/render-case-catalog.ts` writes `docs/generated/game-cases.md`; `--check` verifies deterministic output. The generated report includes triggers, exceptions, effects, cue and separate recognition/proof/action/label/occurrence/confirmation status.

## Research ledger and data split

Create `qa/research/multi-game/ledger.schema.json`, `decision-ledger.jsonl` and `web/scripts/build-research-ledger.ts`. A row contains:

```ts
type ResearchRow = {
  id: string; sourceKind: 'text-discovery' | 'browser';
  sourcePath: string; sourceHash: string; packetHash: string | null;
  packetProvenance: 'original' | 'reconstructed-for-audit' | 'unavailable';
  game: string; variant: string; phase: string; actor: number; revision: number;
  chosenId: string; legalIds: string[]; forced: boolean;
  completeness: 'complete' | 'partial'; policyVersion: string | null;
  originFamilyId: string; episodeId: string; duplicatePacketGroup: string;
  hypotheses: string[]; explanationPath: string | null;
  labels: 'unreviewed' | 'acceptable-set' | 'contested' | 'unknown';
  labelRefs: readonly { id: string; version: string; hash: string }[];
};
```

Inputs are the existing source audit/14 recorded text episodes and the 12 measured browser episode records, original safe packets and private committed-decision audits. Reconcile **706 text + 672 browser choices**; account for two unstarted text setups and two unused browser starts in a separate episode inventory. Keep 336 legacy browser choices' typed-claim absence explicit. Preserve source files/hashes; output references, not newly reconstructed agent explanations.

Group by original deal family before assigning splits. Matched modes/arms, suit/seat rotations, counterworlds and identical actor packets remain in the same family. Discovery records may be reused for regression, never confirmation. Importer does not guess labels or independence from filenames: create `families.json` with explicit ancestry and reject an unassigned origin. Incomplete episodes contribute decision discovery but not completed-hand/match outcomes.

Blind review files are `qa/evaluation/multi-game/labels.schema.json` and `labels.jsonl`: immutable label ID/version/hash, original packet hash/legal candidate set, rule profile, horizon/objective, review-protocol version, acceptable IDs, contested/unknown status, reviewer qualification/provenance and reasoning. Validate accepted IDs against that pinned legal set. Reviewers see no policy answer or hidden hands. Labels are absent until collected; neither importing an LLM paragraph nor Jev agreement supplies them. An audit reconstruction remains separately attributed and cannot pretend to be an unavailable original packet.

Reuse [the existing Spades review pack](../../../qa/experiments/2026-10-04-spades-evaluation-pack/review/README.md) and `web/server/evaluation/spades-pack/labels.ts`, added concurrently in `7aee013`. Its 32 cases and blank entries remain development sources, not another 32 independent game samples or collected human labels. Preserve original reviewer copies. The multi-game `labels.jsonl` is a derived, hashed index of frozen submissions/adjudications, not a second editable answer file; its own schema validates normalized snapshots and source references. Map `supported` to an acceptable set and distinguish blank pending entries from reviewed `unknown`. The existing validator establishes packet/action integrity, not reviewer competence or independent agreement. Keep one actor trajectory chronological; withhold other-seat packets, later play and related mode/deal twins until original labels freeze. Record exposure and exclude compromised reviews from independent acceptance. Human review remains deferred until the owner resumes that work.

## Behavioral tests to write

| Test / fixture | Assertions |
|---|---|
| `research-ledger.test.ts` | Exact source counts/hashes; packet reuse grouped; partial outcomes excluded; original text unchanged |
| `case-catalog.test.ts` | Stable IDs; unknown cue/predicate rejected; contradictory priorities reported; generated catalog matches source |
| `case-counterexamples.test.ts` | Reachable positive/opposite/rotated cases; absent prerequisite suppresses preference; changing objective can reverse an otherwise reasonable tactic |
| `coach-selected-action.test.ts` | Replacing the selected card removes its old reason; bot/coach use the same analysis; no exact claim from heuristic weights |
| `coach-analysis-visibility.test.ts` | Hints shown/hidden and late review return the same original analysis; access affects only exposure |

Use existing CASE fixtures/checkers for Spades. Add the standard-game counterexamples through legal engine replay in M08/M09/M10: queen-free actor still captures a queen; highest remaining side-suit card loses to trump; safe partner ace makes spending the king unnecessary; highest losing card can shed future liability; layout pass establishes no legal extension, not a suit void. Record outcomes and independently reviewed acceptable alternatives separately.

## Evaluation must be frozen before confirmation

Create `web/server/evaluation/multi-game/manifest.ts`, `run.ts` and `report.ts`. Reuse existing gate arithmetic/worker components through versioned adapters; never change old Spades gate interpretation. Add per-variant manifest files under `qa/evaluation/multi-game/`: `spades-solo.manifest.json`, `spades-partners.manifest.json`, `tarneeb-partners.manifest.json`, `trix-solo.manifest.json`, `trix-complex-partners.manifest.json`.

`freezeManifest(candidate)` refuses to produce a confirming manifest unless every field is supplied and validated: exact rule/policy/source hashes; objective/horizon; independent labels with corpus version/hash; family split and sealed seeds; rotations; candidate/reference seat assignments; unfamiliar teammate/opponent styles; primary estimand; practically useful gain and maximum tolerated harm; power/sample-size rationale; multiplicity adjustment; fixed sample/stopping rule; truncation/missing-run handling; compute/latency limits and promotion authority. Defaults are forbidden for these study decisions. A development manifest is explicitly non-promoting. Label corrections create a new corpus version; a consumed run retains its original corpus hash and never sees overwritten labels.

Initial comparisons: existing tactical baseline versus one changed case family; then tactical versus information-only flat rollout. For isolated strength, change one tested seat with other policies fixed; separately evaluate team-wide deployment and robustness with unfamiliar partners. Use complete matches/kingdoms when claimed, not hand scores masquerading as session value. Independent family is the statistical unit; paired rotations are repeated measurements. Sample size comes from a documented development pilot and chosen effect/harm bounds, not an invented universal number.

Reuse the existing `web/server/evaluation/spades-pack/pilot.ts`, `report.ts` and their four `spades-*-*.test.ts` files for Spades adapters. Retain the original pilot's eight development families, one-seat placement, source hash graph, checkpoint/censoring semantics and 20-minute invocation cap. No automatic resume or rerun is part of the migration. It measures single-seat full matches; the old SG per-hand/both-teammates thresholds cannot be transferred to it. Modified adapters require a fresh manifest/run identity, not editing its frozen manifest. Pilot verification/results are reported by that separate work, not as checks run while writing this plan.

Report legal/scoring/information breaches, factual cue errors, coverage/missed scenarios, chosen versus forced actions, contract/Nil/bag or penalty/finish outcomes, score margin at the declared horizon, regret against tractable exact small positions where valid, reasonable-action disagreement, abstention and compute/latency. Keep model assumptions and cutoff coverage alongside estimates. Forecast calibration, playing strength, usability and learning are separate gates.

Executable future commands, after creating the named files:

```powershell
node web/scripts/build-research-ledger.ts --check
node web/scripts/render-case-catalog.ts --check
node --test --test-isolation=none web/server/tests/research-ledger.test.ts web/server/tests/case-catalog.test.ts web/server/tests/case-counterexamples.test.ts
node web/server/evaluation/multi-game/run.ts --manifest qa/evaluation/multi-game/spades-solo.manifest.json --mode development --out .local/evaluation/spades-solo
```

The new `run.ts` must implement exactly `--manifest`, `--mode development|confirmation`, `--out`; confirmation obtains recorded commit/time itself, refuses unsealed/missing labels and reserves a durable run ledger before reading held-out seeds. No confirming manifest is fabricated by this plan. Run other variants with their corresponding named manifest files.

## Jev and human evidence

M11 first improves `web/server/providers/openrouter.ts` and `openrouter.test.ts`: sanitized field-category diagnostics, strict invalid-response fixtures, unsupported-candidate checks and zero-cap no-call tests. Preserve the exhausted original smoke ledger. A follow-up requires a new explicit manifest/ledger with finite request/cost caps and owner-authorized dispatch; never infer authorization from a fixture pass. Resolve availability/snapshot at that time rather than claiming a current model ID from the historical rejected response.

Offline packet arms stay explicit: J0 rules/own history/legal choices; J1 adds exact game facts. Local preferences, case rankings and cue text stay out of a direct-Jev comparison. Both arms retain complete legal choices and original outputs. Report disagreements with independent acceptable sets, order sensitivity, failure, latency and actual usage; there is no confidence-driven runtime model cascade.

M12 creates `qa/evaluation/multi-game/human-study.md` before recruitment. First test whether people understand short cues; then compare immediate and delayed unaided choices on unfamiliar families under a predeclared comparison condition. Record consent, actual/uncertain assistance, exposure, forced-choice exclusions, misleading cues, accepted sets and missing visits. No messages/recruitment are sent by this plan. Default promotion remains blocked until the existing applicable strength gate and explicit owner decision are recorded; claimed learning requires its own study evidence.
