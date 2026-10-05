import type { ReviewCase } from './review.ts';

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

export type HumanLabelSummary = {
  cases: number;
  pending: number;
  supported: number;
  unknown: number;
  contested: number;
  reviewerIds: string[];
  independentAgreementEvaluated: false;
};

/** Checks a submitted file; it never creates a human verdict or establishes reviewer competence. */
export function validateHumanLabels(cases: readonly ReviewCase[], value: unknown): HumanLabelSummary {
  if (!record(value) || value.schemaVersion !== 'spades-review-human-labels-1.0.0' || !Array.isArray(value.cases))
    throw new Error('Unknown human-label schema.');
  const expected = new Map(cases.map(reviewCase => [reviewCase.id, reviewCase]));
  if (expected.size !== cases.length || value.cases.length !== cases.length) throw new Error('Case set differs.');
  const seen = new Set<string>();
  const reviewers = new Set<string>();
  const summary: HumanLabelSummary = { cases: cases.length, pending: 0, supported: 0, unknown: 0,
    contested: 0, reviewerIds: [], independentAgreementEvaluated: false };
  for (const label of value.cases) {
    if (!record(label) || !text(label.id) || seen.has(label.id)) throw new Error('Duplicate or missing case ID.');
    seen.add(label.id);
    const reviewCase = expected.get(label.id);
    if (!reviewCase || label.packetHash !== reviewCase.packetHash) throw new Error('Unknown or changed packet.');
    if (!['supported', 'unknown', 'contested'].includes(String(label.status))) throw new Error('Unknown label status.');
    for (const field of ['acceptableActions', 'unacceptableActions', 'alternatives'] as const) {
      const actions = label[field];
      if (!Array.isArray(actions) || actions.some(action => !text(action) || !reviewCase.packet.legalActions.includes(action)) ||
        new Set(actions).size !== actions.length) throw new Error(`Invalid action IDs in ${field}.`);
    }
    const acceptable = label.acceptableActions as string[];
    const unacceptable = label.unacceptableActions as string[];
    if (acceptable.some(action => unacceptable.includes(action))) throw new Error('Conflicting action labels.');
    const reviewed = text(label.reviewerId);
    if (reviewed) {
      if (!text(label.reviewedAt) || !Number.isFinite(Date.parse(label.reviewedAt)) || !text(label.rationale))
        throw new Error('Reviewed labels need a reviewer, date and rationale.');
      reviewers.add(label.reviewerId as string);
    } else {
      if (label.reviewerId !== null || label.reviewedAt !== null || label.status !== 'unknown' || acceptable.length ||
        unacceptable.length || (label.alternatives as string[]).length || label.rationale !== null)
        throw new Error('Unreviewed entries must remain blank and unknown.');
      summary.pending++;
    }
    if (label.status === 'supported') {
      if (!reviewed || acceptable.length === 0) throw new Error('Supported labels require acceptable actions.');
      summary.supported++;
    } else if (label.status === 'contested') summary.contested++;
    else summary.unknown++;
  }
  summary.reviewerIds = [...reviewers].sort();
  return summary;
}
