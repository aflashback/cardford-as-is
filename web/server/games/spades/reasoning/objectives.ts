import type { Seat } from '../../../game/kernel/types.ts';
import type { SeatObservation } from '../../../observations/index.ts';
import { SEATS } from '../../../game/kernel/types.ts';
import { matchWinner } from '../../../game/index.ts';
import { scoreCompetitor } from '../../../game/spades/score.ts';

export type CompetitorOutcome = {
  seats: Seat[];
  bids: number[];
  tricks: number[];
  oldScore: number;
  oldBags: number;
  delta: number;
  score: number;
  bags: number;
};

export type OutcomeAssessment = {
  id?: string;
  competitors: CompetitorOutcome[];
  focal: CompetitorOutcome;
  matchWinner: Seat | null;
  matchStatus: 'focal-win' | 'focal-loss' | 'continuing';
  evidence: 'exact-given-projection';
  /** Ordinal within compareOutcomes only; never a probability or calibrated strength. */
  preferenceRank?: number;
  limitations: string[];
};

/** GR-04/S12/S14: exact arithmetic conditional on a complete hypothetical trick total. */
export function evaluateOutcome(obs: SeatObservation, projectedTricks: readonly number[]): OutcomeAssessment {
  if (obs.mode !== 'spades-solo' && obs.mode !== 'spades-partners')
    throw new Error('Spades objective requires a Spades observation.');
  if (obs.bids.length !== 4 || obs.bids.some((bid) => bid === null))
    throw new Error('All public bids must be complete before projecting an outcome.');
  if (projectedTricks.length !== 4 || projectedTricks.some((n) => !Number.isInteger(n) || n < 0 || n > 13))
    throw new Error('Projected tricks must be four nonnegative integers at most thirteen.');
  if (projectedTricks.reduce((sum, n) => sum + n, 0) !== 13)
    throw new Error('A complete hand has exactly thirteen tricks.');
  if (SEATS.some((seat) => projectedTricks[seat] < obs.tricks[seat]))
    throw new Error('A projection cannot erase a completed trick.');
  const groups: Seat[][] = obs.mode === 'spades-partners' ? [[0, 2], [1, 3]] : SEATS.map((seat) => [seat]);
  const competitors = groups.map((seats): CompetitorOutcome => {
    const bids = seats.map((seat) => obs.bids[seat]!);
    const tricks = seats.map((seat) => projectedTricks[seat]);
    const oldScore = obs.scores[seats[0]];
    const oldBags = obs.bags[seats[0]];
    const scored = scoreCompetitor({ bids, tricks, oldBags });
    return {
      seats, bids, tricks, oldScore, oldBags,
      delta: scored.delta,
      score: oldScore + scored.delta,
      bags: scored.bags,
    };
  });
  const focal = competitors.find((entry) => entry.seats.includes(obs.seat))!;
  const scores = SEATS.map((seat) => competitors.find((entry) => entry.seats.includes(seat))!.score);
  const matchWinnerSeat = matchWinner(obs.mode, scores) ?? null;
  return {
    competitors,
    focal,
    matchWinner: matchWinnerSeat,
    matchStatus: matchWinnerSeat === null ? 'continuing' : focal.seats.includes(matchWinnerSeat) ? 'focal-win' : 'focal-loss',
    evidence: 'exact-given-projection',
    limitations: ['The complete trick projection is a stated assumption, not a forecast of hidden cards or future play.'],
  };
}

export function compareOutcomes(
  obs: SeatObservation,
  plans: readonly { id: string; tricks: readonly number[] }[],
): OutcomeAssessment[] {
  if (!plans.length) throw new Error('At least one projected outcome is required.');
  if (new Set(plans.map((plan) => plan.id)).size !== plans.length) throw new Error('Duplicate projection ID.');
  const outcomes = plans.map((plan) => ({ ...evaluateOutcome(obs, plan.tricks), id: plan.id }));
  const tier = (result: OutcomeAssessment) => result.matchStatus === 'focal-win' ? 2 : result.matchStatus === 'continuing' ? 1 : 0;
  const margin = (result: OutcomeAssessment) =>
    result.focal.score - Math.max(...result.competitors.filter((entry) => entry !== result.focal).map((entry) => entry.score));
  const sorted = outcomes.toSorted((a, b) =>
    tier(b) - tier(a) || margin(b) - margin(a) || b.focal.score - a.focal.score || plans.findIndex((p) => p.id === a.id) - plans.findIndex((p) => p.id === b.id));
  sorted.forEach((outcome, index) => { outcome.preferenceRank = index + 1; });
  return outcomes;
}
