import type { GateStatus, Interval } from './contracts.ts';

/**
 * SG-05: the ordered decision rule of CR-STRAT-009. The rows are read top to bottom and
 * the first match decides: Blocked, Unchanged, Worse, Improved, Non-inferior, Inconclusive.
 *
 * Reading of the last row, recorded because the table leaves it open: the evidence
 * minimums (seeds with a changed decision, changed decisions) are conditions of the two
 * favourable statuses. An interval that would read Improved or Non-inferior without them
 * is Inconclusive. A Worse finding is never softened by a low count.
 */
export const RULE_VERSION = 'ordered-rule-1.0.0';

export type SafetyCounts = {
  illegalActions: number;
  scoreMismatches: number;
  falseClaims: number;
  informationBreaches: number;
};

export type ChangeCounts = { seedsWithChange: number; changedDecisions: number };

export type RuleThresholds = { minSeedsWithChange: number; minChangedDecisions: number };

export type RuleInput = {
  /** Interval of the primary estimand, candidate minus reference. `null` when none could be formed. */
  interval: Interval | null;
  /** The bound written as a positive number of points. */
  nonInferiorityMargin: number;
  safety: SafetyCounts;
  /** Counts behind the evidence minimums, taken from the shadow comparison. */
  changed: ChangeCounts;
  thresholds: RuleThresholds;
  /**
   * Parity evidence over the whole mode. When absent, `changed` stands for the whole mode.
   * `divergentRounds` counts paired rounds whose action sequences differ between the arms.
   */
  parity?: { comparedDecisions: number; changedDecisions: number; divergentRounds?: number };
  guards?: {
    /** Interval of the competitor's own score difference at the nominal confidence. */
    ownScoreInterval?: Interval | null;
    /** One interval per style subgroup, already formed at the Bonferroni-adjusted confidence. */
    subgroups?: readonly { id: string; interval: Interval }[];
  };
};

export type GuardOutcome = 'met' | 'failed' | 'not-evaluated';

export type RuleDecision = {
  status: GateStatus;
  reasons: string[];
  guards: { ownScore: GuardOutcome; subgroups: GuardOutcome; failedSubgroups: string[] };
};

function assertCount(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer.`);
}

function assertInterval(interval: Interval, name: string): void {
  if (![interval.lower, interval.upper, interval.estimate].every(Number.isFinite) || interval.lower > interval.upper)
    throw new Error(`${name} must hold finite, ordered bounds.`);
}

const SAFETY_TEXT: Record<keyof SafetyCounts, string> = {
  illegalActions: 'illegal action(s)',
  scoreMismatches: 'score mismatch(es)',
  falseClaims: 'false fact claim(s)',
  informationBreaches: 'hidden-information breach(es)',
};

export function decideStatus(input: RuleInput): RuleDecision {
  const { interval, safety, changed, thresholds, parity } = input;
  if (!(Number.isFinite(input.nonInferiorityMargin) && input.nonInferiorityMargin > 0))
    throw new Error('nonInferiorityMargin must be a positive number.');
  for (const key of Object.keys(SAFETY_TEXT) as (keyof SafetyCounts)[]) assertCount(safety[key], `safety.${key}`);
  assertCount(changed.seedsWithChange, 'changed.seedsWithChange');
  assertCount(changed.changedDecisions, 'changed.changedDecisions');
  assertCount(thresholds.minSeedsWithChange, 'thresholds.minSeedsWithChange');
  assertCount(thresholds.minChangedDecisions, 'thresholds.minChangedDecisions');
  if (parity) {
    assertCount(parity.comparedDecisions, 'parity.comparedDecisions');
    assertCount(parity.changedDecisions, 'parity.changedDecisions');
    assertCount(parity.divergentRounds ?? 0, 'parity.divergentRounds');
  }
  if (interval) assertInterval(interval, 'interval');

  const own = input.guards?.ownScoreInterval ?? null;
  if (own) assertInterval(own, 'guards.ownScoreInterval');
  const subgroups = input.guards?.subgroups ?? null;
  for (const subgroup of subgroups ?? []) assertInterval(subgroup.interval, `guards.subgroups.${subgroup.id}`);
  const failedSubgroups = (subgroups ?? []).filter((entry) => entry.interval.upper < 0).map((entry) => entry.id);
  const guards: RuleDecision['guards'] = {
    ownScore: own ? (own.upper < 0 ? 'failed' : 'met') : 'not-evaluated',
    subgroups: subgroups ? (failedSubgroups.length > 0 ? 'failed' : 'met') : 'not-evaluated',
    failedSubgroups,
  };
  const decided = (status: GateStatus, reasons: string[]): RuleDecision => ({ status, reasons, guards });

  // 1. Blocked.
  const breaches = (Object.keys(SAFETY_TEXT) as (keyof SafetyCounts)[])
    .filter((key) => safety[key] > 0)
    .map((key) => `${safety[key]} ${SAFETY_TEXT[key]}`);
  if (breaches.length > 0) return decided('blocked', breaches);

  // 2. Unchanged, proven by decision parity.
  const reasons: string[] = [];
  if (parity) {
    const divergent = parity.divergentRounds ?? 0;
    if (parity.changedDecisions === 0 && divergent === 0 && parity.comparedDecisions > 0)
      return decided('unchanged', [`0 of ${parity.comparedDecisions} compared decisions changed`]);
    if (parity.changedDecisions === 0 && parity.comparedDecisions === 0)
      reasons.push('no decision was compared, so parity is not proven');
    else if (parity.changedDecisions === 0)
      reasons.push(`no compared decision changed, yet ${divergent} paired round(s) differ in their actions`);
  } else if (changed.changedDecisions === 0 && changed.seedsWithChange === 0) {
    return decided('unchanged', ['no decision changed']);
  }

  if (!interval) return decided('inconclusive', [...reasons, 'no interval could be formed']);

  const shortfalls: string[] = [];
  if (changed.seedsWithChange < thresholds.minSeedsWithChange)
    shortfalls.push(
      `${changed.seedsWithChange} seed(s) with a changed decision, fewer than ${thresholds.minSeedsWithChange}`,
    );
  if (changed.changedDecisions < thresholds.minChangedDecisions)
    shortfalls.push(`${changed.changedDecisions} changed decision(s), fewer than ${thresholds.minChangedDecisions}`);

  // 3. Worse.
  if (interval.upper < 0) return decided('worse', [...reasons, 'interval upper bound below 0']);

  // 4. Improved.
  if (interval.lower > 0) {
    const held: string[] = [...shortfalls];
    if (guards.ownScore === 'failed') held.push('own score interval upper bound below 0');
    if (guards.subgroups === 'failed')
      held.push(`subgroup interval below 0 after adjustment: ${failedSubgroups.join(', ')}`);
    if (held.length > 0)
      return decided('inconclusive', [...reasons, 'interval lower bound above 0, withheld', ...held]);
    return decided('improved', [...reasons, 'interval lower bound above 0']);
  }

  // 5. Non-inferior.
  if (interval.lower > -input.nonInferiorityMargin && interval.lower <= 0 && interval.upper >= 0) {
    if (shortfalls.length > 0)
      return decided('inconclusive', [
        ...reasons,
        `interval contains 0 with its lower bound above -${input.nonInferiorityMargin}, withheld`,
        ...shortfalls,
      ]);
    return decided('non-inferior', [
      ...reasons,
      `interval contains 0 with its lower bound above -${input.nonInferiorityMargin}`,
    ]);
  }

  // 6. Inconclusive.
  return decided('inconclusive', [
    ...reasons,
    `interval lower bound at or below -${input.nonInferiorityMargin}`,
    ...shortfalls,
  ]);
}

export type PromotionInput = {
  targetMode: string;
  modes: Record<string, { status: GateStatus; guards: RuleDecision['guards'] }>;
  falseClaims: number;
  /** Whether seat views were checked for concealed data in this run. */
  informationChecked: boolean;
  /** Whether the figures come from a confirmation run on a sealed range. */
  confirmation: boolean;
  /** Reference to recorded labels from a competent human reviewer. Agent reviews never count. */
  humanLabels: string | null;
  /** Reference to a written owner waiver of those labels. */
  ownerWaiver: string | null;
  /** Reference to the recorded owner approval. */
  ownerApproval: string | null;
};

export type PromotionDecision = { status: 'blocked' | 'eligible'; reasons: string[] };

const present = (reference: string | null) => typeof reference === 'string' && reference.trim().length > 0;

/**
 * Promotion of a live default. `eligible` only says that every recorded condition holds;
 * the decision stays with the owner. Absent labels or approval always give `blocked`.
 */
export function promotionStatus(input: PromotionInput): PromotionDecision {
  assertCount(input.falseClaims, 'falseClaims');
  const reasons: string[] = [];
  if (!present(input.humanLabels) && !present(input.ownerWaiver))
    reasons.push('no labels from a competent human reviewer and no written owner waiver');
  if (!present(input.ownerApproval)) reasons.push('no recorded owner approval');
  if (!input.confirmation) reasons.push('figures come from a development run, not a confirmation run');
  const target = input.modes[input.targetMode];
  if (!target) reasons.push(`no result for the targeted mode ${input.targetMode}`);
  else if (target.status !== 'improved') reasons.push(`targeted mode ${input.targetMode} is ${target.status}`);
  for (const mode of Object.keys(input.modes).sort()) {
    const { status, guards } = input.modes[mode];
    if (mode !== input.targetMode && status !== 'improved' && status !== 'non-inferior' && status !== 'unchanged')
      reasons.push(`mode ${mode} is ${status}`);
    if (status === 'unchanged') continue;
    if (guards.ownScore !== 'met') reasons.push(`own score guard ${guards.ownScore} in mode ${mode}`);
    if (guards.subgroups !== 'met') reasons.push(`subgroup guard ${guards.subgroups} in mode ${mode}`);
  }
  if (input.falseClaims > 0) reasons.push(`${input.falseClaims} false fact claim(s)`);
  if (!input.informationChecked) reasons.push('seat views were not checked for concealed data');
  return { status: reasons.length > 0 ? 'blocked' : 'eligible', reasons };
}
